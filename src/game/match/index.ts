export {
  advanceMatch,
  calculateCumulativeScores,
  createMatchRound,
  createMatchRoundFactory,
  getFinalMatchOutcome,
  getRoundStartingPlayerId,
  isFinalRound,
  MATCH_LIFECYCLE_ERROR_CODES,
  MatchLifecycleError,
  settleCompletedRound,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
} from './lifecycle'
export type { MatchRoundFactoryOptions } from './lifecycle'
export { calculateMatchOutcome } from './victoryPoints'
export { DEFAULT_MATCH_ROUND_COUNT, isMatchRoundCount, MATCH_ROUND_COUNTS } from './types'
export type {
  MatchOutcome,
  MatchRoundCount,
  MatchRoundNumber,
  MatchState,
  RoundFactory,
  RoundFactoryContext,
  SettledRoundResult,
  TeamCumulativeScore,
  TeamVictoryPoints,
} from './types'
