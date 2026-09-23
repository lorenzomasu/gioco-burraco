import type { GameState, InProgressRoundState } from '../state/types'
import { GameRuleError } from './errors'

/** Returns the playable round or rejects every gameplay command after closure. */
export const requireInProgressRound = (state: GameState): InProgressRoundState => {
  if (state.round.status === 'completed') {
    throw new GameRuleError('ROUND_COMPLETED', 'The round is already completed.')
  }
  return state.round
}
