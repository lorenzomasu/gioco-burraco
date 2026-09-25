import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { playBotTurn, playNextBotChainStep, type BotDifficulty } from './game/bot'
import { createSeededRandom } from './game/cards/shuffle'
import { startMatch, updateCurrentRound, type MatchState, type RoundFactory } from './game/match'
import type { GameState, InProgressGameState } from './game/state/types'
import { MATCH_SAVE_STORAGE_KEY, saveMatch, type MatchSaveEnvelope } from './shell/matchPersistence'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'
import { createMemoryStorage } from './tests/memoryStorage'
import { cancelLeave, leaveConfirmed, requestLeave } from './tests/shellDialogs'

/** Pass-through spy on the one chain-step primitive, recording the profile of every bot step. */
vi.mock('./game/bot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./game/bot')>()
  return { ...actual, playNextBotChainStep: vi.fn(actual.playNextBotChainStep) }
})

const chainStepSpy = vi.mocked(playNextBotChainStep)
const difficultiesUsed = () => new Set(chainStepSpy.mock.calls.map((call) => call[4]))

const difficultyGroup = () => screen.getByRole('group', { name: 'Difficoltà dei bot' })
const difficultyRadio = (label: 'Facile' | 'Normale') => within(difficultyGroup()).getByRole('radio', { name: label })
const lengthRadio = (roundCount: number) =>
  within(screen.getByRole('group', { name: 'Durata della partita' })).getByRole('radio', { name: `${roundCount} smazzate` })
const nameInput = () => screen.getByLabelText('Il tuo nome')

const startWith = (name: string) => {
  fireEvent.change(nameInput(), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Inizia partita' }))
}

const seededFactory = (setup: MatchSetup): RoundFactory => createSetupRoundFactory(setup, createSeededRandom(21))

const storedSave = (storage: Storage): MatchSaveEnvelope => JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!)

/** Lets every pending delayed bot step commit. */
const playPendingBots = () => {
  for (let step = 0; step < 200 && screen.queryByRole('button', { name: 'Completa subito' }); step += 1) {
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
  }
}

const playTurns = (state: GameState, turns: number): GameState => {
  let current = state
  for (let turn = 0; turn < turns && current.round.status === 'in-progress'; turn += 1) {
    current = playBotTurn(current, current.round.turn.currentPlayerId)
  }
  return current
}

/** A real match whose human seat has already played, so a bot is pending on reload. */
const pendingBotMatch = (setup: MatchSetup): MatchState => {
  const match = startMatch(seededFactory(setup), setup.roundCount)
  return updateCurrentRound(match, playTurns(match.currentRound, 1))
}

/** Round 1 settled by draw-pile exhaustion (full deck kept, short stock). */
const betweenRoundMatch = (setup: MatchSetup): MatchState => {
  const match = startMatch(seededFactory(setup), setup.roundCount)
  const state = match.currentRound as InProgressGameState
  const cut = state.drawPile.slice(3)
  const half = Math.ceil(cut.length / 2)
  const short: InProgressGameState = {
    ...state,
    drawPile: state.drawPile.slice(0, 3),
    pozzetti: [[...state.pozzetti[0], ...cut.slice(0, half)], [...state.pozzetti[1], ...cut.slice(half)]],
  }
  const completed = playTurns(short, 20)
  if (completed.round.status !== 'completed') throw new Error('Fixture round did not end.')
  return updateCurrentRound(match, completed)
}

describe('App bot difficulty', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    chainStepSpy.mockClear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('offers exactly Facile and Normale with Normale selected by default', () => {
    render(<App storage={createMemoryStorage()} />)

    expect(within(difficultyGroup()).getAllByRole('radio').map((radio) => radio.getAttribute('value')))
      .toEqual(['easy', 'normal'])
    expect(difficultyRadio('Normale')).toBeChecked()
    expect(difficultyRadio('Facile')).not.toBeChecked()
    expect(difficultyRadio('Facile')).toHaveAccessibleDescription('Scelte più semplici e meno strategiche.')
    expect(difficultyRadio('Normale')).toHaveAccessibleDescription('Strategia completa, difficoltà predefinita.')
    expect(screen.queryByText(/Difficile/)).not.toBeInTheDocument()
  })

  it.each([['Facile', 'easy'], ['Normale', 'normal']] as const)(
    'starts, saves and plays a %s match with that profile for every bot step',
    (label, botDifficulty) => {
      const storage = createMemoryStorage()
      const createRoundFactory = vi.fn(seededFactory)
      render(<App storage={storage} createRoundFactory={createRoundFactory} />)

      fireEvent.click(difficultyRadio(label === 'Facile' ? 'Normale' : 'Facile'))
      fireEvent.click(difficultyRadio(label))
      fireEvent.click(lengthRadio(3))
      startWith(' Lorenzo ')

      const setup = { humanPlayerName: 'Lorenzo', roundCount: 3, botDifficulty }
      expect(createRoundFactory).toHaveBeenCalledExactlyOnceWith(setup)
      expect(storedSave(storage).setup).toEqual(setup)
      fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
      fireEvent.click(within(screen.getByLabelText('Carte di Lorenzo')).getAllByRole('button')[0]!)
      fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
      playPendingBots()

      expect(chainStepSpy).toHaveBeenCalled()
      expect(difficultiesUsed()).toEqual(new Set([botDifficulty]))
      expect(storedSave(storage).setup.botDifficulty).toBe(botDifficulty)
    },
  )

  it('retains the last difficulty with the name and length when returning to onboarding', () => {
    render(<App storage={createMemoryStorage()} createRoundFactory={seededFactory} />)
    fireEvent.click(difficultyRadio('Facile'))
    fireEvent.click(lengthRadio(2))
    startWith('Lorenzo')

    requestLeave()
    leaveConfirmed()

    expect(nameInput()).toHaveValue('Lorenzo')
    expect(lengthRadio(2)).toBeChecked()
    expect(difficultyRadio('Facile')).toBeChecked()
    expect(difficultyRadio('Normale')).not.toBeChecked()
  })

  it('keeps the active match and its difficulty when Nuova partita is cancelled', () => {
    const storage = createMemoryStorage()
    render(<App storage={storage} createRoundFactory={seededFactory} />)
    fireEvent.click(difficultyRadio('Facile'))
    startWith('Lorenzo')
    const saved = storage.getItem(MATCH_SAVE_STORAGE_KEY)

    requestLeave()
    cancelLeave()

    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(saved)
    expect(storedSave(storage).setup.botDifficulty).toBe('easy')
  })

  it('resumes a saved easy match with the easy profile instead of the default', () => {
    const setup: MatchSetup = { humanPlayerName: 'Lorenzo', roundCount: 4, botDifficulty: 'easy' }
    const storage = createMemoryStorage()
    expect(saveMatch(setup, pendingBotMatch(setup), storage)).toBe(true)

    render(<App storage={storage} createRoundFactory={seededFactory} />)
    playPendingBots()

    expect(chainStepSpy).toHaveBeenCalled()
    expect(difficultiesUsed()).toEqual(new Set(['easy']))
    expect(storedSave(storage).setup.botDifficulty).toBe('easy')
  })

  it.each(['easy', 'normal'] as const)('keeps the restored %s profile in the next round', (botDifficulty: BotDifficulty) => {
    const setup: MatchSetup = { humanPlayerName: 'Lorenzo', roundCount: 4, botDifficulty }
    const storage = createMemoryStorage()
    expect(saveMatch(setup, betweenRoundMatch(setup), storage)).toBe(true)

    render(<App storage={storage} createRoundFactory={seededFactory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))

    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expect(difficultiesUsed()).toEqual(new Set([botDifficulty]))
    expect(storedSave(storage).setup.botDifficulty).toBe(botDifficulty)
  })

  it('resumes a released version-2 save with the normal profile and rewrites it as version 3', () => {
    const setup: MatchSetup = { humanPlayerName: 'Lorenzo', roundCount: 3, botDifficulty: 'normal' }
    const storage = createMemoryStorage()
    const match = pendingBotMatch(setup)
    storage.setItem(MATCH_SAVE_STORAGE_KEY, JSON.stringify({
      version: 2,
      setup: { humanPlayerName: 'Lorenzo', roundCount: 3 },
      match,
    }))

    render(<App storage={storage} createRoundFactory={seededFactory} />)
    expect(screen.getByText('Smazzata 1/3')).toBeInTheDocument()
    playPendingBots()

    expect(difficultiesUsed()).toEqual(new Set(['normal']))
    expect(storedSave(storage).version).toBe(3)
    expect(storedSave(storage).setup).toEqual(setup)
  })
})
