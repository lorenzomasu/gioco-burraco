import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { SoundBackend } from './audio/soundEffects'
import { createBurracoDeck } from './game/cards/deck'
import { dealInitialState } from './game/engine/startGame'
import type { MatchState } from './game/match'
import type { InProgressGameState } from './game/state/types'
import { BOT_STEP_DELAY_MS } from './components/GameTable'
import { AUDIO_PREFERENCES_STORAGE_KEY } from './shell/audioPreferences'
import { MATCH_SAVE_STORAGE_KEY, saveMatch } from './shell/matchPersistence'
import { createMemoryStorage } from './tests/memoryStorage'

const deck = createBurracoDeck()

/** A complete dealt round whose next move belongs to North, a bot. */
const pendingBotRound = (): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, name: 'Ada' } : player),
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-2', phase: 'mustDraw' } },
  }
}

const savedMatch = (): MatchState => ({
  status: 'in-progress',
  currentRoundNumber: 1,
  currentRound: pendingBotRound(),
  roundResults: [],
})

let played: Array<[string, number]> = []
let createBackend = vi.fn<() => SoundBackend | null>()
let gesturesAllowed = true

const renderApp = (storage: Storage) => render(
  <App storage={storage} createSoundBackend={createBackend} isAudioActivation={() => gesturesAllowed} />,
)
const step = () => act(() => {
  vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
})
const gesture = () => fireEvent.pointerDown(window)
/** M32 moved the reusable M31 controls into the shared Settings dialog. */
const openSound = () => fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))

beforeEach(() => {
  vi.useFakeTimers()
  played = []
  gesturesAllowed = true
  createBackend = vi.fn(() => ({ play: (cue: string, volume: number) => played.push([cue, volume]) }))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

const restoredStorage = () => {
  const storage = createMemoryStorage()
  expect(saveMatch({ humanPlayerName: 'Ada' }, savedMatch(), storage)).toBe(true)
  return storage
}

describe('App M31 audio', () => {
  it('keeps a restored bot turn silent before a user gesture and never replays it afterwards', () => {
    renderApp(restoredStorage())

    step()
    expect(createBackend).not.toHaveBeenCalled()
    expect(played).toEqual([])

    gesturesAllowed = false
    gesture()
    expect(createBackend).not.toHaveBeenCalled()

    gesturesAllowed = true
    gesture()
    expect(createBackend).toHaveBeenCalledOnce()
    // Activation itself is silent and nothing earlier is queued.
    expect(played).toEqual([])

    step()
    expect(played.length).toBeGreaterThan(0)
    expect(played.length).toBeLessThanOrEqual(2)
  })

  it('offers labelled native mute and volume controls with the default state', () => {
    renderApp(restoredStorage())
    openSound()
    const mute = screen.getByRole('checkbox', { name: 'Disattiva suoni' })
    const volume = screen.getByRole('slider', { name: 'Volume' })
    expect(mute).not.toBeChecked()
    expect(volume).toHaveValue('60')
    expect(volume).toHaveAttribute('aria-valuetext', '60%')
    expect(screen.getByRole('group', { name: 'Suoni' })).toContainElement(mute)
    expect(screen.getByRole('dialog', { name: 'Impostazioni' })).toContainElement(mute)
  })

  it('applies mute and volume immediately and persists them under their own key only', () => {
    const storage = restoredStorage()
    const matchSave = storage.getItem(MATCH_SAVE_STORAGE_KEY)
    renderApp(storage)
    gesture()
    openSound()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disattiva suoni' }))
    step()
    expect(played).toEqual([])
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuetext', '60%, suoni disattivati')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disattiva suoni' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '30' } })
    step()
    expect(played.length).toBeGreaterThan(0)
    expect(played.every(([, volume]) => volume === 0.3)).toBe(true)

    expect(JSON.parse(storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)!)).toEqual({ version: 1, muted: false, volume: 0.3 })
    // Preference changes never write the match save; only committed bot steps did.
    const envelope = JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!)
    expect(Object.keys(envelope).sort()).toEqual(['match', 'setup', 'version'])
    expect(JSON.stringify(envelope)).not.toContain('volume')
    expect(matchSave).not.toBeNull()
  })

  it('restores valid preferences after a reload', () => {
    const storage = restoredStorage()
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, muted: true, volume: 0.2 }))
    renderApp(storage)
    openSound()
    expect(screen.getByRole('checkbox', { name: 'Disattiva suoni' })).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('20')
  })

  it('falls back to defaults for corrupt preferences without touching the active match', () => {
    const storage = restoredStorage()
    const matchSave = storage.getItem(MATCH_SAVE_STORAGE_KEY)
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, '{corrupt')
    renderApp(storage)
    openSound()

    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('60')
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(matchSave)
    expect(screen.getByRole('status')).toHaveTextContent('Partita ripresa')
  })

  it('keeps playing when preferences cannot be stored and when audio is unavailable', () => {
    const storage = restoredStorage()
    const failingPreferences: Storage = {
      ...storage,
      get length() {
        return storage.length
      },
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (key === AUDIO_PREFERENCES_STORAGE_KEY) throw new Error('quota')
        storage.setItem(key, value)
      },
      removeItem: (key) => storage.removeItem(key),
    }
    createBackend = vi.fn(() => {
      throw new Error('no audio')
    })
    renderApp(failingPreferences)
    gesture()
    openSound()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disattiva suoni' }))
    expect(screen.getByRole('checkbox', { name: 'Disattiva suoni' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    step()
    step()
    expect(screen.getByRole('status')).toHaveTextContent('Partita ripresa')
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
  })
})
