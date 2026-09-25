import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../tests/memoryStorage'
import {
  AUDIO_PREFERENCES_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  clampVolume,
  loadAudioPreferences,
  parseAudioPreferences,
  saveAudioPreferences,
} from './audioPreferences'
import { MATCH_SAVE_STORAGE_KEY } from './matchPersistence'

const throwingStorage = (): Storage => ({
  length: 0,
  clear: () => undefined,
  key: () => null,
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
})

describe('audio preferences storage', () => {
  it('uses its own key, distinct from the active-match save', () => {
    expect(AUDIO_PREFERENCES_STORAGE_KEY).not.toBe(MATCH_SAVE_STORAGE_KEY)
  })

  it('defaults to sound on at a moderate volume', () => {
    expect(DEFAULT_AUDIO_PREFERENCES).toEqual({ muted: false, volume: 0.6 })
    expect(loadAudioPreferences(createMemoryStorage())).toEqual(DEFAULT_AUDIO_PREFERENCES)
    expect(loadAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES)
  })

  it('round-trips a valid versioned preference and writes only its own key', () => {
    const storage = createMemoryStorage()
    expect(saveAudioPreferences(storage, { muted: true, volume: 0.25 })).toBe(true)
    expect(storage.length).toBe(1)
    expect(JSON.parse(storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)!)).toEqual({ version: 1, muted: true, volume: 0.25 })
    expect(loadAudioPreferences(storage)).toEqual({ muted: true, volume: 0.25 })
  })

  it('clamps the volume into 0..1', () => {
    expect(clampVolume(-1)).toBe(0)
    expect(clampVolume(4)).toBe(1)
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_AUDIO_PREFERENCES.volume)
    expect(parseAudioPreferences(JSON.stringify({ version: 1, muted: false, volume: 3 }))).toEqual({ muted: false, volume: 1 })
  })

  it.each([
    ['corrupt JSON', '{nope'],
    ['another version', JSON.stringify({ version: 2, muted: false, volume: 0.5 })],
    ['a missing field', JSON.stringify({ version: 1, volume: 0.5 })],
    ['a wrong type', JSON.stringify({ version: 1, muted: 'no', volume: 0.5 })],
    ['a non-object', JSON.stringify([1, 2])],
  ])('falls back to defaults for %s without touching other storage', (_, raw) => {
    const storage = createMemoryStorage()
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, raw)
    storage.setItem(MATCH_SAVE_STORAGE_KEY, 'match')
    expect(loadAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES)
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe('match')
  })

  it('contains unavailable or throwing storage', () => {
    expect(loadAudioPreferences(throwingStorage())).toEqual(DEFAULT_AUDIO_PREFERENCES)
    expect(saveAudioPreferences(throwingStorage(), { muted: true, volume: 1 })).toBe(false)
    expect(saveAudioPreferences(null, { muted: true, volume: 1 })).toBe(false)
  })
})
