import type { BotPublicActionEvent } from '../game/bot'
import { classifyBurraco } from '../game/melds'
import type { GameState, PlayerId, TeamId } from '../game/state/types'

/**
 * The visible action a committed change stands for. Human cues come from the control the
 * player used, bot cues from that step's public events; neither re-decides legality.
 */
export type ActionCue =
  | Readonly<{ type: 'draw-stock' }>
  | Readonly<{ type: 'collect-discard-pile' }>
  | Readonly<{ type: 'play-meld' | 'extend-meld'; teamId: TeamId; meldIndex: number }>
  | Readonly<{ type: 'discard' }>

/**
 * Transient presentation cue for the latest committed change. It lives only in the React
 * session, never in `GameState`, `MatchState` or the local save, and it never delays or
 * gates the committed state it decorates.
 */
export type TableFeedback = Readonly<{
  /**
   * Increases with every cue of one session, so presentation side effects (motion) can
   * treat each committed change as a one-shot event however often it is rendered.
   */
  sequence: number
  /**
   * Alternates on every new cue so an element cued by two consecutive changes restarts
   * its CSS animation without being remounted (which would drop keyboard focus).
   */
  cycle: 'a' | 'b'
  action: ActionCue | null
  /**
   * How many cards the action moved, taken only from public facts (the pile size, the
   * cards that became a public meld); never a hidden card identity.
   */
  cardCount: number
  /** Only the human's own newly drawn card; never set for a bot. */
  receivedCardIds: readonly string[]
  /** The bot whose step produced this cue. */
  actorId: PlayerId | null
  /** Whether the current player, or only the turn phase, changed. */
  turnChange: 'player' | 'phase' | null
  /** Teams whose durable pozzetto state just changed to taken. */
  pozzettoTeamIds: readonly TeamId[]
  /** Melds that newly reached, or changed, a Burraco classification (`classifyBurraco`). */
  burracoMelds: readonly MeldRef[]
}>

/** One public table meld, addressed by its team and stable index. */
export type MeldRef = Readonly<{ teamId: TeamId; meldIndex: number }>

export type HumanAction =
  | Readonly<{ type: 'draw-stock' }>
  | Readonly<{ type: 'collect-discard-pile' }>
  | Readonly<{ type: 'play-meld'; teamId: TeamId }>
  | Readonly<{ type: 'extend-meld'; teamId: TeamId; meldIndex: number }>
  | Readonly<{ type: 'discard' }>

const nextCycle = (previous: TableFeedback | null): TableFeedback['cycle'] =>
  previous?.cycle === 'a' ? 'b' : 'a'

const nextSequence = (previous: TableFeedback | null): number => (previous?.sequence ?? 0) + 1

/**
 * Melds whose committed Burraco classification is new or different after the change. The
 * domain helper alone classifies; presentation only compares its before/after results.
 */
export const changedBurracoMelds = (before: GameState, after: GameState): readonly MeldRef[] =>
  after.teams.flatMap((team) => {
    const previousMelds = before.teams.find(({ id }) => id === team.id)?.melds ?? []
    return team.melds.flatMap((meld, meldIndex) => {
      const classification = classifyBurraco(meld)
      const previous = previousMelds[meldIndex]
      const previousClassification = previous ? classifyBurraco(previous) : 'none'
      return classification !== 'none' && classification !== previousClassification
        ? [{ teamId: team.id, meldIndex }]
        : []
    })
  })

/** Public count of cards a meld action added to its committed meld. */
const meldCardCount = (before: GameState, after: GameState, cue: ActionCue): number => {
  if (cue.type !== 'play-meld' && cue.type !== 'extend-meld') return 0
  const meldAfter = after.teams.find(({ id }) => id === cue.teamId)?.melds[cue.meldIndex]
  const meldBefore = cue.type === 'extend-meld'
    ? before.teams.find(({ id }) => id === cue.teamId)?.melds[cue.meldIndex]
    : undefined
  return Math.max(1, (meldAfter?.cards.length ?? 0) - (meldBefore?.cards.length ?? 0))
}

const humanCardCount = (before: GameState, after: GameState, cue: ActionCue): number => {
  switch (cue.type) {
    case 'draw-stock':
    case 'discard':
      return 1
    case 'collect-discard-pile':
      return before.discardPile.length
    default:
      return meldCardCount(before, after, cue)
  }
}

const botCardCount = (event: BotPublicActionEvent | undefined): number => {
  switch (event?.type) {
    case 'draw-stock':
    case 'discard':
      return 1
    case 'collect-discard-pile':
      return event.cardCount
    case 'play-meld':
    case 'extend-meld':
      return event.cards.length
    default:
      return 0
  }
}

const turnChange = (before: GameState, after: GameState): TableFeedback['turnChange'] => {
  if (before.round.status !== 'in-progress' || after.round.status !== 'in-progress') return null
  if (before.round.turn.currentPlayerId !== after.round.turn.currentPlayerId) return 'player'
  return before.round.turn.phase !== after.round.turn.phase ? 'phase' : null
}

const newlyTakenPozzetti = (before: GameState, after: GameState): readonly TeamId[] =>
  after.teams
    .filter((team) => team.hasTakenPozzetto
      && before.teams.some(({ id, hasTakenPozzetto }) => id === team.id && !hasTakenPozzetto))
    .map(({ id }) => id)

/** Cue for a successful human action, built only after the engine has committed it. */
export const humanActionFeedback = (
  before: GameState,
  after: GameState,
  action: HumanAction,
  previous: TableFeedback | null,
): TableFeedback => {
  const cue: ActionCue = action.type === 'play-meld'
    ? {
        type: 'play-meld',
        teamId: action.teamId,
        meldIndex: after.teams.find(({ id }) => id === action.teamId)!.melds.length - 1,
      }
    : action
  const acquisition = after.round.status === 'in-progress' && after.round.turn.phase === 'action'
    ? after.round.turn.acquisition
    : undefined
  return {
    sequence: nextSequence(previous),
    cycle: nextCycle(previous),
    action: cue,
    cardCount: humanCardCount(before, after, cue),
    receivedCardIds: action.type === 'draw-stock' && acquisition ? acquisition.cardIds : [],
    actorId: null,
    turnChange: turnChange(before, after),
    pozzettoTeamIds: newlyTakenPozzetti(before, after),
    burracoMelds: changedBurracoMelds(before, after),
  }
}

const botActionCue = (
  event: BotPublicActionEvent,
  state: GameState,
): ActionCue | null => {
  switch (event.type) {
    case 'draw-stock':
    case 'collect-discard-pile':
    case 'discard':
      return { type: event.type }
    case 'play-meld':
    case 'extend-meld': {
      const teamId = state.players.find(({ id }) => id === event.playerId)!.teamId
      return { type: event.type, teamId, meldIndex: event.meldIndex }
    }
    case 'take-pozzetto':
      return null
  }
}

/**
 * Cue for one committed bot step. The action comes only from that step's public events;
 * the turn and pozzetto cues compare only public, durable state.
 */
export const botStepFeedback = (
  before: GameState,
  after: GameState,
  events: readonly BotPublicActionEvent[],
  previous: TableFeedback | null,
): TableFeedback => {
  const actionEvent = events.find(({ type }) => type !== 'take-pozzetto')
  return {
    sequence: nextSequence(previous),
    cycle: nextCycle(previous),
    action: actionEvent ? botActionCue(actionEvent, after) : null,
    cardCount: botCardCount(actionEvent),
    receivedCardIds: [],
    actorId: events[0]?.playerId ?? null,
    turnChange: turnChange(before, after),
    pozzettoTeamIds: newlyTakenPozzetti(before, after),
    burracoMelds: changedBurracoMelds(before, after),
  }
}

export type CueAttributes = Readonly<{
  'data-feedback'?: string
  'data-feedback-cycle'?: TableFeedback['cycle']
}>

/** Presentation attributes for one cued element, or none when it is not cued. */
export const cueAttributes = (
  feedback: TableFeedback | null,
  kind: string | false | null | undefined,
): CueAttributes =>
  feedback && kind ? { 'data-feedback': kind, 'data-feedback-cycle': feedback.cycle } : {}
