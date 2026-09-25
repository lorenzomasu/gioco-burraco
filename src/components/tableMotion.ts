import type { PlayerId, TeamId } from '../game/state/types'
import type { TableFeedback } from './tableFeedback'

/**
 * A public place on the rendered table a card flight can start from or land on. Endpoints
 * name only public table zones, seats and melds; they never carry a card identity.
 * `hand-selection` is the human's own pre-commit card position, captured only after the
 * engine accepted the action.
 */
export type MotionEndpoint =
  | Readonly<{ kind: 'stock' }>
  | Readonly<{ kind: 'discard' }>
  | Readonly<{ kind: 'pozzetti' }>
  | Readonly<{ kind: 'hand' }>
  | Readonly<{ kind: 'hand-selection' }>
  | Readonly<{ kind: 'received-card' }>
  | Readonly<{ kind: 'seat'; playerId: PlayerId }>
  | Readonly<{ kind: 'meld'; teamId: TeamId; meldIndex: number }>

/**
 * One decorative source → destination movement. `face` is `back` for anything hidden
 * (stock, bot hands, pozzetti) and `blank` for a neutral card shape; a proxy never shows
 * a rank or suit, only the public card count.
 */
export type MotionFlight = Readonly<{
  source: MotionEndpoint
  destination: MotionEndpoint
  face: 'back' | 'blank'
  count: number
}>

/** The DOM attribute value marking a rendered endpoint (`data-motion-anchor`). */
export const motionAnchor = (endpoint: MotionEndpoint): string => {
  switch (endpoint.kind) {
    case 'seat':
      return `seat-${endpoint.playerId}`
    case 'meld':
      return `meld-${endpoint.teamId}-${endpoint.meldIndex}`
    default:
      return endpoint.kind
  }
}

/**
 * Derives the flights for one committed presentation cue. Everything comes from the cue,
 * which itself comes only from a successful human command or a committed bot step's public
 * events; motion never re-decides legality and never reads hidden state.
 */
export const planMotion = (feedback: TableFeedback | null): readonly MotionFlight[] => {
  if (!feedback) return []
  const actor: MotionEndpoint = feedback.actorId ? { kind: 'seat', playerId: feedback.actorId } : { kind: 'hand' }
  const isHuman = feedback.actorId === null
  const flights: MotionFlight[] = []
  const { action } = feedback
  switch (action?.type) {
    case 'draw-stock':
      flights.push({
        source: { kind: 'stock' },
        destination: isHuman && feedback.receivedCardIds.length > 0 ? { kind: 'received-card' } : actor,
        face: 'back',
        count: 1,
      })
      break
    case 'collect-discard-pile':
      flights.push({ source: { kind: 'discard' }, destination: actor, face: 'blank', count: feedback.cardCount })
      break
    case 'discard':
      flights.push({
        source: isHuman ? { kind: 'hand-selection' } : actor,
        destination: { kind: 'discard' },
        face: 'blank',
        count: 1,
      })
      break
    case 'play-meld':
    case 'extend-meld':
      flights.push({
        source: isHuman ? { kind: 'hand-selection' } : actor,
        destination: { kind: 'meld', teamId: action.teamId, meldIndex: action.meldIndex },
        face: 'blank',
        count: feedback.cardCount,
      })
      break
  }
  // A pozzetto travels face down to whoever took it; its contents and size stay hidden.
  if (feedback.pozzettoTeamIds.length > 0) {
    flights.push({ source: { kind: 'pozzetti' }, destination: actor, face: 'back', count: 0 })
  }
  return flights
}

/** Reduced-motion preference; unknown (no `matchMedia`) means motion is allowed. */
export const prefersReducedMotion = (view: Window | null | undefined): boolean => {
  try {
    return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}
