import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createBurracoDeck } from './game/cards/deck'
import { dealInitialState } from './game/engine/startGame'
import type { MatchState, RoundFactory } from './game/match'
import type { InProgressGameState } from './game/state/types'
import { BOT_STEP_DELAY_MS, LEAVE_MATCH_CONFIRMATION } from './components/GameTable'
import { MATCH_SAVE_STORAGE_KEY, saveMatch } from './shell/matchPersistence'
import type { MatchSetup } from './shell/matchSetup'
import { createMemoryStorage } from './tests/memoryStorage'
import { leaveDialog, requestLeave, settingsDialog } from './tests/shellDialogs'

const deck = createBurracoDeck()

/** A dealt round whose next move belongs to North, so bot playback is pending. */
const pendingBotRound = (name = 'Ada'): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, name } : player),
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-2', phase: 'mustDraw' } },
  }
}

const humanTurnRound = (setup: MatchSetup): InProgressGameState => ({
  ...pendingBotRound(setup.humanPlayerName),
  round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
})

const humanFactory = (setup: MatchSetup): RoundFactory => () => humanTurnRound(setup)

const savedStorage = (match: MatchState = {
  status: 'in-progress',
  currentRoundNumber: 1,
  currentRound: pendingBotRound(),
  roundResults: [],
}) => {
  const storage = createMemoryStorage()
  expect(saveMatch({ humanPlayerName: 'Ada' }, match, storage)).toBe(true)
  return storage
}

const flushFocusTimers = () => act(() => {
  vi.advanceTimersByTime(0)
})
const pressEscape = (element: Element) => {
  fireEvent.keyDown(element, { key: 'Escape' })
  flushFocusTimers()
}
const helpDialog = () => screen.queryByRole('dialog', { name: 'Come si gioca' })
const button = (name: string) => screen.getByRole('button', { name })
const timelineItems = () =>
  within(screen.getByRole('region', { name: 'Cronologia bot' })).queryAllByRole('listitem')
const startAs = (name: string) => {
  fireEvent.change(screen.getByLabelText('Il tuo nome'), { target: { value: name } })
  fireEvent.click(button('Inizia partita'))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('App M32 shared Settings', () => {
  it('opens from onboarding, controls speed and sound, and returns focus on Escape', () => {
    const storage = createMemoryStorage()
    render(<App storage={storage} createRoundFactory={humanFactory} />)
    const invoker = button('Impostazioni')
    invoker.focus()

    fireEvent.click(invoker)
    flushFocusTimers()

    const dialog = settingsDialog()!
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByRole('group', { name: 'Velocità bot' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Normale' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Disattiva suoni' })).toBeInTheDocument()
    expect(within(dialog).getByRole('slider', { name: 'Volume' })).toBeInTheDocument()
    // The background stays mounted but cannot be operated.
    expect(document.querySelector('.app-content')).toHaveAttribute('inert')

    pressEscape(dialog)

    expect(settingsDialog()).not.toBeInTheDocument()
    expect(document.querySelector('.app-content')).not.toHaveAttribute('inert')
    expect(invoker).toHaveFocus()
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBeNull()
  })

  it('opens during a match without changing game state or the save', () => {
    const storage = savedStorage()
    render(<App storage={storage} />)
    const saved = storage.getItem(MATCH_SAVE_STORAGE_KEY)
    const setItem = vi.spyOn(storage, 'setItem')

    fireEvent.click(button('Impostazioni'))
    fireEvent.click(within(settingsDialog()!).getByRole('radio', { name: 'Veloce' }))
    fireEvent.click(within(settingsDialog()!).getByRole('button', { name: 'Chiudi' }))

    expect(setItem).not.toHaveBeenCalledWith(MATCH_SAVE_STORAGE_KEY, expect.anything())
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(saved)
    expect(screen.getAllByRole('button', { name: 'Impostazioni' })).toHaveLength(1)
    // The provisional header speed radios are gone: Settings is the only surface.
    expect(screen.queryByRole('radio', { name: 'Veloce' })).not.toBeInTheDocument()
  })
})

describe('App M32 Help', () => {
  it('describes only the implemented flow from onboarding and the match, and closes on Escape', () => {
    render(<App storage={createMemoryStorage()} createRoundFactory={humanFactory} />)
    const onboardingHelp = button('Come si gioca')
    onboardingHelp.focus()
    fireEvent.click(onboardingHelp)
    flushFocusTimers()

    const help = helpDialog()!
    for (const anchor of [
      /tallone/, /monte degli scarti/, /«Cala»/, /«Aggiungi alla calata»/, /«Scarta e passa»/,
      /trascinare/, /Pulsanti e tastiera/, /pozzetto/, /Burraco/, /«Completa subito»/,
      /quattro\s+smazzate/, /salvata in questo browser/,
    ]) {
      expect(help).toHaveTextContent(anchor)
    }
    pressEscape(help)
    expect(helpDialog()).not.toBeInTheDocument()
    expect(onboardingHelp).toHaveFocus()

    startAs('Ada')
    fireEvent.click(button('Come si gioca'))
    expect(helpDialog()).toBeInTheDocument()
    fireEvent.click(within(helpDialog()!).getByRole('button', { name: 'Chiudi' }))
    expect(helpDialog()).not.toBeInTheDocument()
  })
})

describe('App M32 abandonment confirmation', () => {
  it('cancels on Escape without leaving, never confirms, and pauses bot playback while open', () => {
    const storage = savedStorage()
    render(<App storage={storage} />)
    const saved = storage.getItem(MATCH_SAVE_STORAGE_KEY)

    requestLeave()
    const dialog = leaveDialog()!
    expect(dialog).toHaveTextContent(LEAVE_MATCH_CONFIRMATION)
    expect(within(dialog).getByRole('button', { name: 'Annulla' })).toHaveFocus()
    expect(document.querySelector('.game-shell')).toHaveAttribute('inert')
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS * 4)
    })
    expect(timelineItems()).toHaveLength(0)

    pressEscape(dialog)

    expect(leaveDialog()).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tavolo di Burraco' })).toBeInTheDocument()
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(saved)
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })
    expect(timelineItems()).toHaveLength(1)
  })

  it('abandons exactly once and returns to onboarding with the save cleared', () => {
    const storage = savedStorage()
    const removeItem = vi.spyOn(storage, 'removeItem')
    render(<App storage={storage} />)

    requestLeave()
    const abandon = within(leaveDialog()!).getByRole('button', { name: 'Abbandona partita' })
    fireEvent.click(abandon)
    fireEvent.click(abandon)

    expect(screen.getByRole('heading', { level: 1, name: 'Burraco' })).toHaveFocus()
    expect(removeItem).toHaveBeenCalledOnce()
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBeNull()
    expect(screen.getByLabelText('Il tuo nome')).toHaveValue('Ada')
  })
})

describe('App M32 resume status', () => {
  it('shows a concise non-blocking status without moving focus or writing again', () => {
    const storage = savedStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    render(<App storage={storage} />)
    const writesOnMount = setItem.mock.calls.length

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Partita ripresa · Smazzata 1/4')
    expect(status).not.toHaveTextContent(/version|match|card/i)
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(within(status).getByRole('button', { name: 'Chiudi avviso di ripresa' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(setItem).toHaveBeenCalledTimes(writesOnMount)
    expect(document.activeElement).toBe(document.body)
  })

  it('does not appear for a fresh match or after the corrupt-save fallback', () => {
    const storage = createMemoryStorage()
    storage.setItem(MATCH_SAVE_STORAGE_KEY, '{broken')
    render(<App storage={storage} createRoundFactory={humanFactory} />)
    expect(screen.getByRole('status')).not.toHaveTextContent('Partita ripresa')
    startAs('Ada')
    expect(screen.queryByText(/Partita ripresa/)).not.toBeInTheDocument()
  })
})

describe('App M32 onboarding', () => {
  it('keeps the single name → start flow and adds help, settings and the local-save note', () => {
    render(<App storage={createMemoryStorage()} createRoundFactory={humanFactory} />)
    const start = button('Inizia partita')
    expect(start).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Il tuo nome'), { target: { value: '   ' } })
    expect(start).toBeDisabled()
    expect(screen.getByText(/salvata solo in questo browser/)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Aiuto e impostazioni' })).toContainElement(button('Impostazioni'))
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)

    startAs('  Ada  ')

    expect(screen.getByRole('heading', { level: 1, name: 'Ada' })).toBeInTheDocument()
  })
})
