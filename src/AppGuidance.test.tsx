import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createBurracoDeck } from './game/cards/deck'
import { createSeededRandom } from './game/cards/shuffle'
import { dealInitialState } from './game/engine/startGame'
import type { MatchState, RoundFactory } from './game/match'
import type { InProgressGameState } from './game/state/types'
import {
  GUIDANCE_PREFERENCES_STORAGE_KEY,
  type GuidancePreferences,
} from './shell/guidancePreferences'
import { MATCH_SAVE_SCHEMA_VERSION, MATCH_SAVE_STORAGE_KEY, saveMatch } from './shell/matchPersistence'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'
import { createMemoryStorage } from './tests/memoryStorage'
import { closeDialog, openSettings, settingsDialog } from './tests/shellDialogs'

const deck = createBurracoDeck()

/** A complete dealt round (every physical card placed) whose next move is the human's draw. */
const humanDrawRound = (): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, name: 'Ada' } : player),
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
  }
}

const savedMatch = (): MatchState => ({
  roundCount: 4,
  status: 'in-progress',
  currentRoundNumber: 1,
  currentRound: humanDrawRound(),
  roundResults: [],
})

const SETUP: MatchSetup = { humanPlayerName: 'Ada', roundCount: 4, botDifficulty: 'normal' }

/**
 * Seeded named rounds whose stock is cut to three cards (the rest moves to the pozzetti),
 * so every smazzata ends quickly by exhaustion while staying a valid resumable save.
 */
const shortFactories = (setup: MatchSetup): RoundFactory => {
  const factory = createSetupRoundFactory(setup, createSeededRandom(5))
  return (context) => {
    const full = factory(context)
    const cut = full.drawPile.slice(3)
    const half = Math.ceil(cut.length / 2)
    return {
      ...full,
      drawPile: full.drawPile.slice(0, 3),
      pozzetti: [[...full.pozzetti[0], ...cut.slice(0, half)], [...full.pozzetti[1], ...cut.slice(half)]],
    }
  }
}

const coach = () => screen.queryByRole('region', { name: 'Guida contestuale' })
const compactGuidance = () => document.querySelector('.turn-guidance')
const guidanceToggle = () => within(settingsDialog()!).getByRole('checkbox', { name: 'Guida contestuale' })
const storedGuidance = (storage: Storage) => {
  const raw = storage.getItem(GUIDANCE_PREFERENCES_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw) as { version: number } & GuidancePreferences
}
const storeGuidance = (storage: Storage, preferences: GuidancePreferences) =>
  storage.setItem(GUIDANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }))

const startMatch = (name = 'Ada') => {
  fireEvent.change(screen.getByLabelText('Il tuo nome'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Inizia partita' }))
}

/** Plays the mounted match to its authoritative final result through the public UI only. */
const playToFinalResult = () => {
  for (let step = 0; step < 200; step += 1) {
    if (screen.queryByRole('heading', { name: 'Risultato finale' })) return
    const nextRound = screen.queryByRole('button', { name: /^Inizia smazzata \d$/ })
    if (nextRound) fireEvent.click(nextRound)
    else playOneStep()
  }
  throw new Error('The match did not reach its final result.')
}

describe('App contextual guidance (M36)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('guides a fresh first match by default without writing any preference', () => {
    const storage = createMemoryStorage()
    render(<App storage={storage} />)
    startMatch()

    expect(coach()).toBeInTheDocument()
    expect(compactGuidance()).toBeNull()
    expect(storedGuidance(storage)).toBeNull()
  })

  it('dismisses to the compact guidance and writes only the guidance preference', () => {
    const storage = createMemoryStorage()
    render(<App storage={storage} />)
    startMatch()
    const saveBefore = storage.getItem(MATCH_SAVE_STORAGE_KEY)

    fireEvent.click(within(coach()!).getByRole('button', { name: 'Nascondi guida' }))

    expect(coach()).toBeNull()
    expect(compactGuidance()).toHaveTextContent(/^Tocca a te/)
    expect(storedGuidance(storage)).toEqual({ version: 1, enabled: false, completedOnce: false })
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(saveBefore)
  })

  it('mentions the Settings control in Help, which stays openable and closable', () => {
    render(<App storage={createMemoryStorage()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Come si gioca' }))
    const help = screen.getByRole('dialog', { name: 'Come si gioca' })
    expect(help).toHaveTextContent('puoi nasconderla o riattivarla da Impostazioni')
    closeDialog(help)
    expect(screen.queryByRole('dialog', { name: 'Come si gioca' })).toBeNull()
  })

  it('disables and re-enables guidance from Settings', () => {
    const storage = createMemoryStorage()
    render(<App storage={storage} />)
    openSettings()
    expect(guidanceToggle()).toBeChecked()
    fireEvent.click(guidanceToggle())
    expect(guidanceToggle()).not.toBeChecked()
    expect(storedGuidance(storage)).toEqual({ version: 1, enabled: false, completedOnce: false })
    // The existing settings are untouched.
    expect(within(settingsDialog()!).getByRole('radio', { name: 'Normale' })).toBeChecked()
    expect(within(settingsDialog()!).getByRole('checkbox', { name: 'Disattiva suoni' })).not.toBeChecked()
    closeDialog(settingsDialog()!)

    startMatch()
    expect(coach()).toBeNull()
    expect(compactGuidance()).toBeInTheDocument()

    openSettings()
    fireEvent.click(guidanceToggle())
    closeDialog(settingsDialog()!)
    expect(coach()).toBeInTheDocument()
    expect(storedGuidance(storage)).toEqual({ version: 1, enabled: true, completedOnce: false })
  })

  it.each([
    [null, true],
    [{ enabled: false, completedOnce: false }, false],
    [{ enabled: true, completedOnce: true }, true],
  ] as const)('restores an active match with the independent guidance preference %o', (preference, shown) => {
    const storage = createMemoryStorage()
    expect(saveMatch(SETUP, savedMatch(), storage)).toBe(true)
    if (preference) storeGuidance(storage, preference)
    const saved = JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!)

    render(<App storage={storage} />)

    expect(screen.getByRole('region', { name: 'Mano di Ada' })).toBeInTheDocument()
    expect(coach() !== null).toBe(shown)
    expect(compactGuidance() !== null).toBe(!shown)
    // Restoring rewrites neither setup nor state, and the envelope has no guidance field.
    const after = JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!)
    expect(after).toEqual(saved)
    expect(after.version).toBe(MATCH_SAVE_SCHEMA_VERSION)
    expect(MATCH_SAVE_SCHEMA_VERSION).toBe(3)
    expect(Object.keys(after).sort()).toEqual(['match', 'setup', 'version'])
    expect(Object.keys(after.setup).sort()).toEqual(['botDifficulty', 'humanPlayerName', 'roundCount'])
    expect(JSON.stringify(after)).not.toMatch(/guid|completedOnce/i)
  })

  it('keeps a valid match playable when the guidance preference is malformed or unwritable', () => {
    const storage = createMemoryStorage()
    expect(saveMatch(SETUP, savedMatch(), storage)).toBe(true)
    storage.setItem(GUIDANCE_PREFERENCES_STORAGE_KEY, '{"version":1,')
    const setItem = storage.setItem.bind(storage)
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === GUIDANCE_PREFERENCES_STORAGE_KEY) throw new Error('quota')
      setItem(key, value)
    })

    render(<App storage={storage} />)
    expect(coach()).toBeInTheDocument()
    fireEvent.click(within(coach()!).getByRole('button', { name: 'Nascondi guida' }))

    expect(coach()).toBeNull()
    expect(compactGuidance()).toBeInTheDocument()
    expect(screen.queryByRole('status')).toHaveTextContent(/^Partita ripresa/)
    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!).match.currentRound.round.turn.phase).toBe('action')
  })

  it('stays guided through every smazzata and ends the first guided match on authoritative completion', () => {
    const storage = createMemoryStorage()
    render(<App storage={storage} createRoundFactory={shortFactories} />)
    startMatch()

    const guidedRounds = new Set<string>()
    for (let step = 0; step < 200 && !screen.queryByRole('heading', { name: 'Risultato finale' }); step += 1) {
      if (coach()) guidedRounds.add(screen.getByText(/^Smazzata \d\/4$/).textContent!)
      expect(storedGuidance(storage)).toBeNull()
      const nextRound = screen.queryByRole('button', { name: /^Inizia smazzata \d$/ })
      if (nextRound) fireEvent.click(nextRound)
      else playOneStep()
    }
    expect(guidedRounds).toEqual(new Set(['Smazzata 1/4', 'Smazzata 2/4', 'Smazzata 3/4', 'Smazzata 4/4']))

    expect(screen.getByRole('heading', { name: 'Risultato finale' })).toBeInTheDocument()
    expect(storedGuidance(storage)).toEqual({ version: 1, enabled: false, completedOnce: true })

    fireEvent.click(screen.getByRole('button', { name: 'Gioca ancora' }))
    startMatch()
    expect(coach()).toBeNull()
    expect(compactGuidance()).toBeInTheDocument()
  })

  it('does not mark an unguided completion as the first guided match', () => {
    const storage = createMemoryStorage()
    storeGuidance(storage, { enabled: false, completedOnce: false })
    render(<App storage={storage} createRoundFactory={shortFactories} />)
    startMatch()

    playToFinalResult()

    expect(storedGuidance(storage)).toEqual({ version: 1, enabled: false, completedOnce: false })
  })

  it('keeps guidance explicitly re-enabled after the first guided match across later completions', () => {
    const storage = createMemoryStorage()
    storeGuidance(storage, { enabled: true, completedOnce: true })
    render(<App storage={storage} createRoundFactory={shortFactories} />)
    startMatch()
    expect(coach()).toBeInTheDocument()

    playToFinalResult()

    expect(storedGuidance(storage)).toEqual({ version: 1, enabled: true, completedOnce: true })
    fireEvent.click(screen.getByRole('button', { name: 'Gioca ancora' }))
    startMatch()
    expect(coach()).toBeInTheDocument()
  })
})

/** One human or «Completa subito» progression step through public controls. */
function playOneStep() {
  const completeNow = screen.queryByRole('button', { name: 'Completa subito' })
  const stock = screen.queryByRole('button', { name: /^Pesca dal tallone/ })
  if (completeNow) {
    fireEvent.click(completeNow)
  } else if (stock && !stock.hasAttribute('disabled')) {
    fireEvent.click(stock)
  } else {
    fireEvent.click(within(screen.getByLabelText('Carte di Ada')).getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
  }
}
