import type { RandomSource } from '../cards/shuffle'
import { startGame, type RoundSetupOptions } from '../engine/startGame'
import { calculateRoundScore } from '../scoring'
import type { CompletedGameState, GameState, PlayerId, TeamId } from '../state/types'
import { calculateMatchOutcome } from './victoryPoints'
import {
  DEFAULT_MATCH_ROUND_COUNT,
  isMatchRoundCount,
  type MatchOutcome,
  type MatchRoundCount,
  type MatchRoundNumber,
  type MatchState,
  type RoundFactory,
  type SettledRoundResult,
  type TeamCumulativeScore,
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

/** The single authoritative smazzata → initial player schedule, in table order. */
const ROUND_STARTING_PLAYERS: Readonly<Record<MatchRoundNumber, PlayerId>> = {
  1: 'player-1',
  2: 'player-2',
  3: 'player-3',
  4: 'player-4',
}

export const getRoundStartingPlayerId = (roundNumber: MatchRoundNumber): PlayerId =>
  ROUND_STARTING_PLAYERS[roundNumber]

export type MatchRoundFactoryOptions = Readonly<{
  /** Display names applied to every round of the match; configuration metadata only. */
  playerNames?: RoundSetupOptions['playerNames']
  /** Explicit shuffle source shared by every round; defaults to `Math.random`. */
  random?: RandomSource
}>

/**
 * Builds the factory for one match: every fresh round is shuffled, starts on the player
 * requested by the match schedule, and carries the same configured player names.
 */
export const createMatchRoundFactory = (
  { playerNames, random }: MatchRoundFactoryOptions = {},
): RoundFactory => ({ startingPlayerId }) => startGame(random, { startingPlayerId, playerNames })

/** Default factory: a freshly shuffled round starting on the requested player. */
export const createMatchRound: RoundFactory = createMatchRoundFactory()

const createRound = (roundFactory: RoundFactory, roundNumber: MatchRoundNumber) =>
  roundFactory({ roundNumber, startingPlayerId: getRoundStartingPlayerId(roundNumber) })

export const startMatch = (
  roundFactory: RoundFactory = createMatchRound,
  roundCount: MatchRoundCount = DEFAULT_MATCH_ROUND_COUNT,
): MatchState => {
  if (!isMatchRoundCount(roundCount)) {
    throw new RangeError('A match must last 2, 3 or 4 smazzate.')
  }
  return {
    roundCount,
    status: 'in-progress',
    currentRoundNumber: 1,
    currentRound: createRound(roundFactory, 1),
    roundResults: [],
  }
}

/** Whether the current round is the configured final smazzata of the match. */
export const isFinalRound = (match: MatchState): boolean => match.currentRoundNumber >= match.roundCount

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
    status: isFinalRound(match) ? 'completed' : 'in-progress',
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
  roundFactory: RoundFactory = createMatchRound,
): MatchState => {
  if (match.status === 'completed' || isFinalRound(match)) {
    throw new MatchLifecycleError('MATCH_COMPLETED', 'A match cannot advance beyond its configured final round.')
  }
  if (match.currentRound.round.status === 'in-progress') {
    throw new MatchLifecycleError('ROUND_IN_PROGRESS', 'An in-progress round cannot advance.')
  }
  if (!hasSettledCurrentRound(match)) {
    throw new MatchLifecycleError('ROUND_NOT_SETTLED', 'The completed round must be settled before advancing.')
  }

  const nextRoundNumber = (match.currentRoundNumber + 1) as MatchRoundNumber
  return {
    ...match,
    currentRoundNumber: nextRoundNumber,
    currentRound: createRound(roundFactory, nextRoundNumber),
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
    throw new MatchLifecycleError('ROUND_IN_PROGRESS', 'The final outcome is available only after the final round.')
  }
  return calculateMatchOutcome(calculateCumulativeScores(match), match.roundCount)
}
