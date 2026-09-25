import type { RoundScore } from '../scoring'
import type { CompletedRoundState, GameState, InProgressGameState, PlayerId, TeamId } from '../state/types'

/** The supported match lengths (smazzate per match): the single finite source of truth. */
export const MATCH_ROUND_COUNTS = [2, 3, 4] as const

export type MatchRoundCount = (typeof MATCH_ROUND_COUNTS)[number]

/** A match started without an explicit length keeps the original four-smazzate format. */
export const DEFAULT_MATCH_ROUND_COUNT: MatchRoundCount = 4

export const isMatchRoundCount = (value: unknown): value is MatchRoundCount =>
  (MATCH_ROUND_COUNTS as readonly unknown[]).includes(value)

/** Bounded by the longest supported length; the configured `roundCount` is the real limit. */
export type MatchRoundNumber = 1 | 2 | 3 | 4

export type SettledRoundResult = Readonly<{
  roundNumber: MatchRoundNumber
  ending: CompletedRoundState['ending']
  score: RoundScore
}>

export type MatchState = Readonly<{
  /** Configured number of smazzate, fixed when the match starts. */
  roundCount: MatchRoundCount
  status: 'in-progress' | 'completed'
  currentRoundNumber: MatchRoundNumber
  currentRound: GameState
  roundResults: readonly SettledRoundResult[]
}>

/**
 * Transient creation context for one fresh round. It is passed to the factory only and
 * is never stored in `MatchState`.
 */
export type RoundFactoryContext = Readonly<{
  roundNumber: MatchRoundNumber
  startingPlayerId: PlayerId
}>

export type RoundFactory = (context: RoundFactoryContext) => InProgressGameState

export type TeamCumulativeScore = Readonly<{
  teamId: TeamId
  total: number
}>

export type TeamVictoryPoints = Readonly<{
  teamId: TeamId
  victoryPoints: number
}>

export type MatchOutcome = Readonly<{
  cumulativeScores: readonly TeamCumulativeScore[]
  matchPoints: number
  leadingTeamId: TeamId | null
  victoryPoints: readonly TeamVictoryPoints[]
}>
