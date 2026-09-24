import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { BotAutomationError, playNextBotChainStep } from '../game/bot'
import { createSeededRandom } from '../game/cards/shuffle'
import { startMatch, type MatchState } from '../game/match'
import { MATCH_SAVE_STORAGE_KEY } from '../shell/matchPersistence'
import { createSetupRoundFactory, type MatchSetup } from '../shell/matchSetup'
import { createMemoryStorage } from '../tests/memoryStorage'
import { BOT_AUTOMATION_FAILURE_MESSAGE, BOT_PLAYBACK_DELAYS_MS, GameTable } from './GameTable'

/**
 * Pass-through spy on the chain-step primitive that can make a chosen call (1-based,
 * counted from the last reset) throw instead of committing a step.
 */
const failure = vi.hoisted(() => ({
  onCall: null as number | null,
  error: null as Error | null,
  calls: 0,
}))

vi.mock('../game/bot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../game/bot')>()
  return {
    ...actual,
    playNextBotChainStep: vi.fn((...args: Parameters<typeof actual.playNextBotChainStep>) => {
      failure.calls += 1
      if (failure.error && failure.onCall !== null && failure.calls >= failure.onCall) throw failure.error
      return actual.playNextBotChainStep(...args)
    }),
  }
})

const chainStepSpy = vi.mocked(playNextBotChainStep)

const failOnCall = (onCall: number, error: Error = new BotAutomationError('Bot player-3 exceeded the 12-action safety limit.')) => {
  failure.calls = 0
  failure.onCall = onCall
  failure.error = error
}

const seededFactory = (setup: MatchSetup) => createSetupRoundFactory(setup, createSeededRandom(25))
const seededMatch = (): MatchState => startMatch(seededFactory({ humanPlayerName: 'Lorenzo' }))

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Flushes only jsdom's 0 ms focus `selectionchange` timer, never a bot playback timer. */
const flushFocusSelectionChange = () => advance(0)

const timelineItems = () =>
  within(screen.getByRole('region', { name: 'Cronologia bot' })).queryAllByRole('listitem')
const turnBanner = () => screen.getByText('Turno di').parentElement!
const drawPileButton = () => screen.getByRole('button', { name: /^Pesca dal tallone/ })
const completeNowButton = () => screen.queryByRole('button', { name: 'Completa subito' })
const automationAlert = () => screen.queryByRole('alert')

/** The human draws from the tallone and discards the first card of the sorted hand. */
const humanDrawAndDiscard = () => {
  fireEvent.click(drawPileButton())
  fireEvent.click(within(screen.getByLabelText('Carte di Lorenzo')).getAllByRole('button')[0]!)
  fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
}

const expectAutomationFailureShown = () => {
  const alert = automationAlert()
  expect(alert).toHaveTextContent('Gioco automatico interrotto')
  expect(alert).toHaveTextContent(BOT_AUTOMATION_FAILURE_MESSAGE)
  // No internal diagnostic is shown to the player.
  expect(document.body).not.toHaveTextContent(/safety limit|BotAutomationError|player-\d/)
  expect(completeNowButton()).not.toBeInTheDocument()
  expect(screen.getByText('Bot fermi')).toBeInTheDocument()
}

describe('GameTable bot automation failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    failure.onCall = null
    failure.error = null
    failure.calls = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('keeps the last committed step and timeline and stops delayed playback on a BotAutomationError', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialMatch={seededMatch()} onMatchChange={onMatchChange} onLeaveMatch={() => {}} />)
    humanDrawAndDiscard()
    failOnCall(2)

    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expect(timelineItems()).toHaveLength(1)
    const committed = onMatchChange.mock.calls.at(-1)![0] as MatchState
    const tallone = drawPileButton().getAttribute('aria-label')
    const activeName = turnBanner().querySelector('strong')!.textContent

    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectAutomationFailureShown()
    expect(timelineItems()).toHaveLength(1)
    expect(drawPileButton()).toHaveAttribute('aria-label', tallone)
    expect(turnBanner().querySelector('strong')).toHaveTextContent(activeName!)
    // The failure is presentation state only: no domain progress is reported.
    expect(onMatchChange.mock.calls.at(-1)![0]).toBe(committed)
    expect(screen.getByRole('button', { name: 'Nuova partita' })).toBeEnabled()

    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)
    const callsAfterFailure = chainStepSpy.mock.calls.length
    advance(BOT_PLAYBACK_DELAYS_MS.normal * 5)
    expect(chainStepSpy.mock.calls.length).toBe(callsAfterFailure)
  })

  it('does not notify a match change when the very first bot step fails', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialMatch={seededMatch()} onMatchChange={onMatchChange} />)
    humanDrawAndDiscard()
    const notifications = onMatchChange.mock.calls.length
    failOnCall(1)

    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectAutomationFailureShown()
    expect(timelineItems()).toHaveLength(0)
    expect(onMatchChange.mock.calls.length).toBe(notifications)
  })

  it('handles the same failure from Completa subito without leaving a retry control', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialMatch={seededMatch()} onMatchChange={onMatchChange} />)
    humanDrawAndDiscard()
    failOnCall(3)

    fireEvent.click(completeNowButton()!)
    expectAutomationFailureShown()
    // The two steps committed before the failure stay, exactly as delayed playback would keep them.
    expect(timelineItems()).toHaveLength(2)
    expect(chainStepSpy).toHaveBeenCalledTimes(3)

    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_PLAYBACK_DELAYS_MS.normal * 5)
    expect(chainStepSpy).toHaveBeenCalledTimes(3)
    expect(timelineItems()).toHaveLength(2)
  })

  it('does not report error-only state when Completa subito fails on its first step', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialMatch={seededMatch()} onMatchChange={onMatchChange} />)
    humanDrawAndDiscard()
    const notifications = onMatchChange.mock.calls.length
    failOnCall(1)

    fireEvent.click(completeNowButton()!)
    expectAutomationFailureShown()
    expect(onMatchChange.mock.calls.length).toBe(notifications)
  })

  it('never revives a failed chain when the playback speed changes', () => {
    render(<GameTable initialMatch={seededMatch()} />)
    humanDrawAndDiscard()
    failOnCall(1)
    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectAutomationFailureShown()
    const callsAfterFailure = chainStepSpy.mock.calls.length

    fireEvent.click(screen.getByRole('radio', { name: 'Veloce' }))
    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_PLAYBACK_DELAYS_MS.fast * 5)
    fireEvent.click(screen.getByRole('radio', { name: 'Normale' }))
    advance(BOT_PLAYBACK_DELAYS_MS.normal * 5)

    expect(chainStepSpy.mock.calls.length).toBe(callsAfterFailure)
    expectAutomationFailureShown()
  })

  it('leaves no pending step when the failed table unmounts', () => {
    const { unmount } = render(<GameTable initialMatch={seededMatch()} />)
    humanDrawAndDiscard()
    failOnCall(1)
    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectAutomationFailureShown()

    unmount()
    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['delayed playback', () => advance(BOT_PLAYBACK_DELAYS_MS.normal)],
    ['Completa subito', () => fireEvent.click(completeNowButton()!)],
  ] as const)('does not convert a non-automation defect from %s into the bot error', (_, run) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<GameTable initialMatch={seededMatch()} />)
    humanDrawAndDiscard()
    failOnCall(1, new TypeError('unexpected defect'))

    expect(run).toThrow(new TypeError('unexpected defect'))
    expect(screen.queryByText('Gioco automatico interrotto')).not.toBeInTheDocument()
  })
})

describe('App recovery after a bot automation failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    failure.onCall = null
    failure.error = null
    failure.calls = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('keeps the committed save without failure state and starts the next match without the error', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const storage = createMemoryStorage()
    render(<App storage={storage} createRoundFactory={seededFactory} />)
    fireEvent.change(screen.getByLabelText('Il tuo nome'), { target: { value: 'Lorenzo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inizia partita' }))
    humanDrawAndDiscard()
    const savedAfterDiscard = storage.getItem(MATCH_SAVE_STORAGE_KEY)
    failOnCall(1)

    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectAutomationFailureShown()
    // The error neither discards nor rewrites the active save.
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(savedAfterDiscard)
    expect(savedAfterDiscard).not.toMatch(/automation|failed/i)

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Burraco' })).toBeInTheDocument()
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBeNull()

    failure.error = null
    fireEvent.click(screen.getByRole('button', { name: 'Inizia partita' }))
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(automationAlert()).not.toBeInTheDocument()
    humanDrawAndDiscard()
    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expect(timelineItems()).toHaveLength(1)
    expect(automationAlert()).not.toBeInTheDocument()
  })
})
