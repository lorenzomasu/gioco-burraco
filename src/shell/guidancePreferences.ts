/**
 * Browser-local contextual-guidance preference (M36). Like the audio preferences it is a
 * shell presentation concern, stored under its own key and never inside `MatchState`,
 * `MatchSetup` or the active-match envelope.
 */
export const GUIDANCE_PREFERENCES_STORAGE_KEY = 'gioco-burraco:guidance-preferences'

/** The current preference wire-format version; any other version falls back to defaults. */
export const GUIDANCE_PREFERENCES_SCHEMA_VERSION = 1

export type GuidancePreferences = Readonly<{
  /** Whether the contextual coach is currently shown during a match. */
  enabled: boolean
  /** Whether this browser completed at least one match while the first-match guide was active. */
  completedOnce: boolean
}>

/** The first match is guided when nothing valid is stored. */
export const DEFAULT_GUIDANCE_PREFERENCES: GuidancePreferences = { enabled: true, completedOnce: false }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Parses a stored wire string; anything invalid, corrupt or of another version is `null`. */
export const parseGuidancePreferences = (raw: string): GuidancePreferences | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== GUIDANCE_PREFERENCES_SCHEMA_VERSION) return null
  const { enabled, completedOnce } = parsed
  if (typeof enabled !== 'boolean' || typeof completedOnce !== 'boolean') return null
  return { enabled, completedOnce }
}

/**
 * Reads the stored preference. Missing, corrupt or unsupported data and unavailable or
 * throwing storage all fall back to the defaults; nothing else in storage is touched.
 */
export const loadGuidancePreferences = (storage: Storage | null): GuidancePreferences => {
  if (!storage) return DEFAULT_GUIDANCE_PREFERENCES
  try {
    const raw = storage.getItem(GUIDANCE_PREFERENCES_STORAGE_KEY)
    return (raw === null ? null : parseGuidancePreferences(raw)) ?? DEFAULT_GUIDANCE_PREFERENCES
  } catch {
    return DEFAULT_GUIDANCE_PREFERENCES
  }
}

/** Writes the preference under its own key; a failure is contained and reported as `false`. */
export const saveGuidancePreferences = (storage: Storage | null, preferences: GuidancePreferences): boolean => {
  if (!storage) return false
  try {
    storage.setItem(GUIDANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: GUIDANCE_PREFERENCES_SCHEMA_VERSION,
      enabled: preferences.enabled,
      completedOnce: preferences.completedOnce,
    }))
    return true
  } catch {
    return false
  }
}

/**
 * The preference after an authoritative match completion: the first match completed while
 * the first-match guide was active marks it completed and switches later play to compact
 * guidance. Any other completion (unguided, or guidance re-enabled explicitly after the
 * first guided match) leaves the preference unchanged.
 */
export const guidanceAfterMatchCompletion = (preferences: GuidancePreferences): GuidancePreferences =>
  preferences.enabled && !preferences.completedOnce
    ? { enabled: false, completedOnce: true }
    : preferences
