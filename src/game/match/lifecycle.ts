import { startGame } from '../engine/startGame'
import { calculateRoundScore } from '../scoring'
import type { CompletedGameState, GameState, TeamId } from '../state/types'
import { calculateFourRoundOutcome } from './victoryPoints'
import type {
  MatchOutcome,
  MatchRoundNumber,
  MatchState,
  RoundFactory,
  SettledRoundResult,
  TeamCumulativeScore,
} from './types'

export const MATCH_LIFECYCLE_ERROR_CODES = [
  'ROUND_IN_PROGRESS',
  'ROUND_NOT_SETTLED',
  'MATCH_COMPLETED',
] as const

export type MatchLifecycleErrorCode = (typeof MATCH_LIFECYCLE_ERROR_CODES)[number]

export class MatchLifecycleError extends Error {
  readonly name = 'MatchLifecycleError'

  constructor(readonly code: MatchLifecycleErrorCode, message: string) {
    super(message)
  }
}

export const startMatch = (roundFactory: RoundFactory = startGame): MatchState => ({
  status: 'in-progress',
  currentRoundNumber: 1,
  currentRound: roundFactory(),
  roundResults: [],
})

const hasSettledCurrentRound = (match: MatchState): boolean =>
  match.roundResults.some(({ roundNumber }) => roundNumber === match.currentRoundNumber)

/** Scores the current completed round once; repeated settlement returns the same match object. */
export const settleCompletedRound = (match: MatchState): MatchState => {
  if (match.currentRound.round.status === 'in-progress') {
    throw new MatchLifecycleError('ROUND_IN_PROGRESS', 'An in-progress round cannot be settled.')
  }
  if (hasSettledCurrentRound(match)) return match

  const completedRound: CompletedGameState = {
    ...match.currentRound,
    round: match.currentRound.round,
  }
  const result: SettledRoundResult = {
    roundNumber: match.currentRoundNumber,
    ending: completedRound.round.ending,
    score: calculateRoundScore(completedRound),
  }
  const roundResults = [...match.roundResults, result]

  return {
    ...match,
    status: match.currentRoundNumber === 4 ? 'completed' : 'in-progress',
    roundResults,
  }
}

/** Idempotently settles a completed current round and leaves an active round unchanged. */
export const synchronizeMatch = (match: MatchState): MatchState =>
  match.currentRound.round.status === 'completed' ? settleCompletedRound(match) : match

/** Replaces only the current single-round state and synchronizes completion into match history. */
export const updateCurrentRound = (match: MatchState, currentRound: GameState): MatchState => {
  if (match.status === 'completed') {
    throw new MatchLifecycleError('MATCH_COMPLETED', 'A completed match cannot accept another round state.')
  }
  return synchronizeMatch({ ...match, currentRound })
}

/** Starts the next fresh round after, and only after, the current one has been settled. */
export const advanceMatch = (
  match: MatchState,
  roundFactory: RoundFactory = startGame,
): MatchState => {
  if (match.status === 'completed' || match.currentRoundNumber === 4) {
    throw new MatchLifecycleError('MATCH_COMPLETED', 'A four-round match cannot advance to a fifth round.')
  }
  if (match.currentRound.round.status === 'in-progress') {
    throw new MatchLifecycleError('ROUND_IN_PROGRESS', 'An in-progress round cannot advance.')
  }
  if (!hasSettledCurrentRound(match)) {
    throw new MatchLifecycleError('ROUND_NOT_SETTLED', 'The completed round must be settled before advancing.')
  }

  return {
    ...match,
    currentRoundNumber: (match.currentRoundNumber + 1) as MatchRoundNumber,
    currentRound: roundFactory(),
  }
}

const roundTotal = (result: SettledRoundResult, teamId: TeamId): number =>
  result.score.teams.find((teamScore) => teamScore.teamId === teamId)?.total ?? 0

/** Derives signed cumulative points exclusively from settled round history. */
export const calculateCumulativeScores = (match: MatchState): readonly TeamCumulativeScore[] => [
  {
    teamId: 'team-1',
    total: match.roundResults.reduce((total, result) => total + roundTotal(result, 'team-1'), 0),
  },
  {
    teamId: 'team-2',
    total: match.roundResults.reduce((total, result) => total + roundTotal(result, 'team-2'), 0),
  },
]

export const getFinalMatchOutcome = (match: MatchState): MatchOutcome => {
  if (match.status !== 'completed') {
    throw new MatchLifecycleError('ROUND_IN_PROGRESS', 'The final outcome is available only after round four.')
  }
  return calculateFourRoundOutcome(calculateCumulativeScores(match))
}
