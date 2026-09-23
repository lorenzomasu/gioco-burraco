import type { Card, Deck, DiscardPile, Pozzetto } from '../cards/types'
import type { ValidatedMeld } from '../melds'

export type PlayerId = 'player-1' | 'player-2' | 'player-3' | 'player-4'
export type TeamId = 'team-1' | 'team-2'

export type Player = Readonly<{
  id: PlayerId
  name: string
  teamId: TeamId
  hand: readonly Card[]
}>

export type Team = Readonly<{
  id: TeamId
  playerIds: readonly [PlayerId, PlayerId]
  melds: readonly ValidatedMeld[]
  hasTakenPozzetto: boolean
}>

/** `mustDraw` is the start-of-turn choice; `action` permits future non-draw actions and the final discard. */
export type TurnPhase = 'mustDraw' | 'action'
export type TurnAcquisition =
  | Readonly<{
      source: 'drawPile'
      cardIds: readonly string[]
    }>
  | Readonly<{
      source: 'discardPile'
      cardIds: readonly string[]
      canRediscardSingleCollectedCard: boolean
    }>
export type MustDrawTurnState = Readonly<{ currentPlayerId: PlayerId; phase: 'mustDraw' }>
export type ActionTurnState = Readonly<{
  currentPlayerId: PlayerId
  phase: 'action'
  acquisition: TurnAcquisition
}>
export type TurnState = MustDrawTurnState | ActionTurnState
export type InProgressRoundState = Readonly<{
  status: 'in-progress'
  turn: TurnState
}>
export type ClosedRoundState = Readonly<{
  status: 'completed'
  ending: 'closure'
  closedByPlayerId: PlayerId
  closingTeamId: TeamId
}>
/** The round ended because a non-closing discard left only unplayable draw-pile cards. */
export type DrawPileExhaustedRoundState = Readonly<{
  status: 'completed'
  ending: 'draw-pile-exhausted'
  lastDiscardPlayerId: PlayerId
}>
export type CompletedRoundState = ClosedRoundState | DrawPileExhaustedRoundState
export type RoundState = InProgressRoundState | CompletedRoundState

export type GameState = Readonly<{
  players: readonly Player[]
  teams: readonly Team[]
  drawPile: Deck
  discardPile: DiscardPile
  pozzetti: readonly [Pozzetto, Pozzetto]
  round: RoundState
}>

export type InProgressGameState = Omit<GameState, 'round'> & Readonly<{
  round: InProgressRoundState
}>

export type CompletedGameState = Omit<GameState, 'round'> & Readonly<{
  round: CompletedRoundState
}>
