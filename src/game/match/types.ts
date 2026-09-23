import type { RoundScore } from '../scoring'
import type { CompletedRoundState, GameState, InProgressGameState, TeamId } from '../state/types'

export const MATCH_ROUND_COUNT = 4

export type MatchRoundNumber = 1 | 2 | 3 | 4

export type SettledRoundResult = Readonly<{
  roundNumber: MatchRoundNumber
  ending: CompletedRoundState['ending']
  score: RoundScore
}>

export type MatchState = Readonly<{
  status: 'in-progress' | 'completed'
  currentRoundNumber: MatchRoundNumber
  currentRound: GameState
  roundResults: readonly SettledRoundResult[]
}>

export type RoundFactory = () => InProgressGameState

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
