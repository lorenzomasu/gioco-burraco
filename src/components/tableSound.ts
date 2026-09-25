import type { SoundCue } from '../audio/soundEffects'
import type { ActionCue, TableFeedback } from './tableFeedback'

const actionSounds: Readonly<Record<ActionCue['type'], SoundCue>> = {
  'draw-stock': 'draw',
  'collect-discard-pile': 'collect',
  'play-meld': 'play',
  'extend-meld': 'extend',
  discard: 'discard',
}

/** Public facts of the committed state the sounds of one transition may refer to. */
export type SoundContextFacts = Readonly<{
  roundCompleted: boolean
  matchCompleted: boolean
  /** Whether the human now holds the turn. */
  humanTurn: boolean
  /** Fast bot playback thins ordinary bot-to-bot turn cues. */
  fastPlayback: boolean
}>

/** The single strongest accent of a committed state; match completion beats round completion. */
const completionAccent = (facts: SoundContextFacts): SoundCue | null =>
  facts.matchCompleted ? 'match-complete' : facts.roundCompleted ? 'round-complete' : null

/**
 * Sounds for one committed M30 cue: at most one primary action sound, then at most one
 * accent — completion, then Burraco, then pozzetto — or, when there is no accent, a turn
 * cue. Everything comes from the cue and public state; nothing re-decides legality.
 */
export const soundsForFeedback = (feedback: TableFeedback, facts: SoundContextFacts): readonly SoundCue[] => {
  const primary = feedback.action ? actionSounds[feedback.action.type] : null
  const accent = completionAccent(facts)
    ?? (feedback.burracoMelds.length > 0 ? 'burraco' : null)
    ?? (feedback.pozzettoTeamIds.length > 0 ? 'pozzetto' : null)
  let turn: SoundCue | null = null
  if (!accent && feedback.turnChange === 'player') {
    if (facts.humanTurn) turn = 'human-turn'
    // In fast playback an ordinary bot-to-bot handover stays silent.
    else if (!(facts.fastPlayback && feedback.actorId !== null)) turn = 'turn'
  }
  return [primary, accent ?? turn].filter((cue): cue is SoundCue => cue !== null)
}

/**
 * After «Completa subito» every intermediate step stays silent; only the final committed
 * state may sound once: match or round completion, or control returning to the human.
 */
export const finalAccentSounds = (facts: SoundContextFacts): readonly SoundCue[] => {
  const accent = completionAccent(facts) ?? (facts.humanTurn ? 'human-turn' : null)
  return accent ? [accent] : []
}
