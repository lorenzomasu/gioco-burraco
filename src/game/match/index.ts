export {
  advanceMatch,
  calculateCumulativeScores,
  createMatchRound,
  createMatchRoundFactory,
  getFinalMatchOutcome,
  getRoundStartingPlayerId,
  MATCH_LIFECYCLE_ERROR_CODES,
  MatchLifecycleError,
  settleCompletedRound,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
} from './lifecycle'
export type { MatchRoundFactoryOptions } from './lifecycle'
export { calculateFourRoundOutcome } from './victoryPoints'
export { MATCH_ROUND_COUNT } from './types'
export type {
  MatchOutcome,
  MatchRoundNumber,
  MatchState,
  RoundFactory,
  RoundFactoryContext,
  SettledRoundResult,
  TeamCumulativeScore,
  TeamVictoryPoints,
} from './types'
