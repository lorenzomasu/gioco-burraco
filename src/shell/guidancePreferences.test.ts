import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../tests/memoryStorage'
import {
  DEFAULT_GUIDANCE_PREFERENCES,
  GUIDANCE_PREFERENCES_STORAGE_KEY,
  guidanceAfterMatchCompletion,
  loadGuidancePreferences,
  parseGuidancePreferences,
  saveGuidancePreferences,
} from './guidancePreferences'
import { AUDIO_PREFERENCES_STORAGE_KEY } from './audioPreferences'
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

describe('guidance preferences storage (M36)', () => {
  it('uses its own key, distinct from the active-match save and the audio preferences', () => {
    expect(GUIDANCE_PREFERENCES_STORAGE_KEY).not.toBe(MATCH_SAVE_STORAGE_KEY)
    expect(GUIDANCE_PREFERENCES_STORAGE_KEY).not.toBe(AUDIO_PREFERENCES_STORAGE_KEY)
  })

  it('defaults to an enabled, not yet completed first-match guide', () => {
    expect(DEFAULT_GUIDANCE_PREFERENCES).toEqual({ enabled: true, completedOnce: false })
    expect(loadGuidancePreferences(createMemoryStorage())).toEqual(DEFAULT_GUIDANCE_PREFERENCES)
    expect(loadGuidancePreferences(null)).toEqual(DEFAULT_GUIDANCE_PREFERENCES)
  })

  it.each([
    { enabled: true, completedOnce: false },
    { enabled: false, completedOnce: false },
    { enabled: false, completedOnce: true },
    { enabled: true, completedOnce: true },
  ])('round-trips %o and writes only its own key', (preferences) => {
    const storage = createMemoryStorage()
    expect(saveGuidancePreferences(storage, preferences)).toBe(true)
    expect(loadGuidancePreferences(storage)).toEqual(preferences)
    expect(storage.length).toBe(1)
    expect(JSON.parse(storage.getItem(GUIDANCE_PREFERENCES_STORAGE_KEY)!)).toEqual({ version: 1, ...preferences })
  })

  it.each([
    'not json',
    'null',
    '[]',
    '{}',
    JSON.stringify({ version: 2, enabled: false, completedOnce: true }),
    JSON.stringify({ version: 1, enabled: 'no', completedOnce: true }),
    JSON.stringify({ version: 1, enabled: false }),
  ])('falls back to the defaults for malformed data %s without touching the match save', (raw) => {
    const storage = createMemoryStorage()
    storage.setItem(MATCH_SAVE_STORAGE_KEY, 'match-save')
    storage.setItem(GUIDANCE_PREFERENCES_STORAGE_KEY, raw)
    expect(parseGuidancePreferences(raw)).toBeNull()
    expect(loadGuidancePreferences(storage)).toEqual(DEFAULT_GUIDANCE_PREFERENCES)
    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe('match-save')
  })

  it('contains read and write exceptions', () => {
    expect(loadGuidancePreferences(throwingStorage())).toEqual(DEFAULT_GUIDANCE_PREFERENCES)
    expect(() => saveGuidancePreferences(throwingStorage(), { enabled: false, completedOnce: false })).not.toThrow()
    expect(saveGuidancePreferences(throwingStorage(), { enabled: false, completedOnce: false })).toBe(false)
    expect(saveGuidancePreferences(null, DEFAULT_GUIDANCE_PREFERENCES)).toBe(false)
  })
})

describe('guidance after an authoritative match completion (M36)', () => {
  it('ends the active first-match guide', () => {
    expect(guidanceAfterMatchCompletion({ enabled: true, completedOnce: false }))
      .toEqual({ enabled: false, completedOnce: true })
  })

  it('does not mark an unguided completion', () => {
    const unguided = { enabled: false, completedOnce: false }
    expect(guidanceAfterMatchCompletion(unguided)).toBe(unguided)
  })

  it('keeps an explicit re-enable after the first guided match', () => {
    const reenabled = { enabled: true, completedOnce: true }
    expect(guidanceAfterMatchCompletion(reenabled)).toBe(reenabled)
    const disabled = { enabled: false, completedOnce: true }
    expect(guidanceAfterMatchCompletion(disabled)).toBe(disabled)
  })
})
