/**
 * Browser-local sound preferences. They are a shell presentation concern, stored under
 * their own key and never inside `MatchState`, `MatchSetup` or the active-match envelope.
 */
export const AUDIO_PREFERENCES_STORAGE_KEY = 'gioco-burraco:audio-preferences'

/** The current preference wire-format version; any other version falls back to defaults. */
export const AUDIO_PREFERENCES_SCHEMA_VERSION = 1

export type AudioPreferences = Readonly<{
  muted: boolean
  /** Linear output volume in `0..1`. */
  volume: number
}>

/** Sound on at a moderate volume when nothing valid is stored. */
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = { muted: false, volume: 0.6 }

/** Clamps any number into the valid `0..1` volume range; non-finite values use the default. */
export const clampVolume = (volume: number): number =>
  Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_AUDIO_PREFERENCES.volume

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Parses a stored wire string; anything invalid, corrupt or of another version is `null`. */
export const parseAudioPreferences = (raw: string): AudioPreferences | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== AUDIO_PREFERENCES_SCHEMA_VERSION) return null
  const { muted, volume } = parsed
  if (typeof muted !== 'boolean' || typeof volume !== 'number' || !Number.isFinite(volume)) return null
  return { muted, volume: clampVolume(volume) }
}

/**
 * Reads the stored preferences. Missing, corrupt or unsupported data and unavailable or
 * throwing storage all fall back to the defaults; nothing else in storage is touched.
 */
export const loadAudioPreferences = (storage: Storage | null): AudioPreferences => {
  if (!storage) return DEFAULT_AUDIO_PREFERENCES
  try {
    const raw = storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)
    return (raw === null ? null : parseAudioPreferences(raw)) ?? DEFAULT_AUDIO_PREFERENCES
  } catch {
    return DEFAULT_AUDIO_PREFERENCES
  }
}

/** Writes the preferences under their own key; a failure is contained and reported as `false`. */
export const saveAudioPreferences = (storage: Storage | null, preferences: AudioPreferences): boolean => {
  if (!storage) return false
  try {
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: AUDIO_PREFERENCES_SCHEMA_VERSION,
      muted: preferences.muted,
      volume: clampVolume(preferences.volume),
    }))
    return true
  } catch {
    return false
  }
}
