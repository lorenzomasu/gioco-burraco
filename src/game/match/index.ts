export {
  advanceMatch,
  calculateCumulativeScores,
  getFinalMatchOutcome,
  MATCH_LIFECYCLE_ERROR_CODES,
  MatchLifecycleError,
  settleCompletedRound,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
} from './lifecycle'
export { calculateFourRoundOutcome } from './victoryPoints'
export { MATCH_ROUND_COUNT } from './types'
export type {
  MatchOutcome,
  MatchRoundNumber,
  MatchState,
  RoundFactory,
  SettledRoundResult,
  TeamCumulativeScore,
  TeamVictoryPoints,
} from './types'
