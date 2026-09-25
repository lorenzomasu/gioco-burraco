import { clampVolume, type AudioPreferences } from '../shell/audioPreferences'

/**
 * The complete sound-effect vocabulary. Names describe presentation events only; they never
 * carry a card, a hand or any other game data.
 */
export type SoundCue =
  | 'selection'
  | 'draw'
  | 'collect'
  | 'play'
  | 'extend'
  | 'discard'
  | 'invalid'
  | 'turn'
  | 'human-turn'
  | 'pozzetto'
  | 'burraco'
  | 'round-complete'
  | 'match-complete'

/** Whatever actually produces sound; tests inject a recorder instead of Web Audio. */
export type SoundBackend = Readonly<{
  play: (cue: SoundCue, volume: number) => void
  /** Resumes a suspended output inside the activating user gesture. */
  resume?: () => void
}>

/**
 * Presentation-only sound service. It never calls game code and never delays anything:
 * every request is fire-and-forget, dropped (never queued) while inactive, muted or failing.
 */
export type SoundController = Readonly<{
  /** Called from a trusted user gesture; creates the output lazily and plays nothing. */
  activate: () => void
  isActive: () => boolean
  setPreferences: (preferences: AudioPreferences) => void
  /** Plays at most `MAX_SOUNDS_PER_REQUEST` cues of one committed transition. */
  play: (cues: readonly SoundCue[]) => void
}>

/** One primary action sound plus one accent at most, so a transition never becomes a burst. */
export const MAX_SOUNDS_PER_REQUEST = 2

export const createSoundController = (
  createBackend: () => SoundBackend | null,
  initialPreferences: AudioPreferences,
): SoundController => {
  let preferences = initialPreferences
  let active = false
  let backend: SoundBackend | null = null
  return {
    activate: () => {
      if (active) return
      active = true
      try {
        backend = createBackend()
        backend?.resume?.()
      } catch {
        // Audio is optional: an unavailable output leaves the game silent and playable.
        backend = null
      }
    },
    isActive: () => active,
    setPreferences: (next) => {
      preferences = { muted: next.muted, volume: clampVolume(next.volume) }
    },
    play: (cues) => {
      if (!active || !backend || preferences.muted || preferences.volume <= 0) return
      for (const cue of cues.slice(0, MAX_SOUNDS_PER_REQUEST)) {
        try {
          backend.play(cue, preferences.volume)
        } catch {
          // A failed sound never reaches gameplay.
        }
      }
    },
  }
}

type Tone = Readonly<{
  /** Frequency in Hz. */
  frequency: number
  /** Start offset and length in seconds. */
  at: number
  length: number
  wave?: OscillatorType
  /** Relative loudness in `0..1`. */
  level?: number
  /** Optional end frequency for a short glide. */
  glideTo?: number
}>

/**
 * Short synthesized cues: soft card-like clicks for actions, a rising pair for turns, and
 * brief chimes for accents. Nothing loops and nothing lasts longer than about a second.
 */
const SOUND_RECIPES: Readonly<Record<SoundCue, readonly Tone[]>> = {
  selection: [{ frequency: 1250, at: 0, length: 0.035, wave: 'triangle', level: 0.35 }],
  draw: [{ frequency: 520, at: 0, length: 0.09, wave: 'triangle', glideTo: 760, level: 0.55 }],
  collect: [
    { frequency: 420, at: 0, length: 0.07, wave: 'triangle', level: 0.5 },
    { frequency: 470, at: 0.05, length: 0.07, wave: 'triangle', level: 0.5 },
    { frequency: 530, at: 0.1, length: 0.1, wave: 'triangle', level: 0.5 },
  ],
  play: [
    { frequency: 660, at: 0, length: 0.08, wave: 'sine', level: 0.6 },
    { frequency: 880, at: 0.07, length: 0.12, wave: 'sine', level: 0.6 },
  ],
  extend: [{ frequency: 740, at: 0, length: 0.1, wave: 'sine', level: 0.55 }],
  discard: [{ frequency: 360, at: 0, length: 0.1, wave: 'triangle', glideTo: 260, level: 0.55 }],
  invalid: [
    { frequency: 220, at: 0, length: 0.09, wave: 'square', level: 0.25 },
    { frequency: 180, at: 0.1, length: 0.12, wave: 'square', level: 0.25 },
  ],
  turn: [{ frequency: 600, at: 0, length: 0.06, wave: 'sine', level: 0.3 }],
  'human-turn': [
    { frequency: 587, at: 0, length: 0.1, wave: 'sine', level: 0.6 },
    { frequency: 784, at: 0.1, length: 0.16, wave: 'sine', level: 0.6 },
  ],
  pozzetto: [
    { frequency: 523, at: 0, length: 0.1, wave: 'triangle', level: 0.6 },
    { frequency: 659, at: 0.09, length: 0.1, wave: 'triangle', level: 0.6 },
    { frequency: 523, at: 0.18, length: 0.16, wave: 'triangle', level: 0.6 },
  ],
  burraco: [
    { frequency: 659, at: 0, length: 0.12, wave: 'sine', level: 0.65 },
    { frequency: 831, at: 0.1, length: 0.12, wave: 'sine', level: 0.65 },
    { frequency: 988, at: 0.2, length: 0.28, wave: 'sine', level: 0.65 },
  ],
  'round-complete': [
    { frequency: 523, at: 0, length: 0.14, wave: 'sine', level: 0.6 },
    { frequency: 659, at: 0.14, length: 0.14, wave: 'sine', level: 0.6 },
    { frequency: 784, at: 0.28, length: 0.3, wave: 'sine', level: 0.6 },
  ],
  'match-complete': [
    { frequency: 523, at: 0, length: 0.14, wave: 'sine', level: 0.65 },
    { frequency: 659, at: 0.13, length: 0.14, wave: 'sine', level: 0.65 },
    { frequency: 784, at: 0.26, length: 0.14, wave: 'sine', level: 0.65 },
    { frequency: 1047, at: 0.39, length: 0.5, wave: 'sine', level: 0.65 },
  ],
}

/** Peak output gain at full volume; the cues stay well below clipping. */
const MASTER_LEVEL = 0.22

type AudioContextConstructor = new () => AudioContext

/**
 * Web Audio backend synthesizing every cue locally: no asset, no network request and no
 * runtime dependency. Returns `null` where the platform has no Web Audio.
 */
export const createWebAudioBackend = (): SoundBackend | null => {
  const view = typeof window === 'undefined'
    ? undefined
    : window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor }
  const Context = view?.AudioContext ?? view?.webkitAudioContext
  if (!Context) return null
  const context = new Context()
  return {
    resume: () => {
      if (context.state === 'suspended') void context.resume().catch(() => undefined)
    },
    play: (cue, volume) => {
      const start = context.currentTime + 0.005
      for (const tone of SOUND_RECIPES[cue]) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const peak = MASTER_LEVEL * volume * (tone.level ?? 0.5)
        const toneStart = start + tone.at
        const toneEnd = toneStart + tone.length
        oscillator.type = tone.wave ?? 'sine'
        oscillator.frequency.setValueAtTime(tone.frequency, toneStart)
        if (tone.glideTo) oscillator.frequency.exponentialRampToValueAtTime(tone.glideTo, toneEnd)
        gain.gain.setValueAtTime(0.0001, toneStart)
        gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), toneStart + Math.min(0.012, tone.length / 3))
        gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(toneStart)
        oscillator.stop(toneEnd + 0.02)
      }
    },
  }
}
