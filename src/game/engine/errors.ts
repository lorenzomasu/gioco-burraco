export const GAME_ERROR_CODES = [
  'NOT_CURRENT_PLAYER',
  'INVALID_TURN_PHASE',
  'DRAW_PILE_EMPTY',
  'DISCARD_PILE_EMPTY',
  'CARD_NOT_IN_HAND',
  'DUPLICATE_CARD_ID',
  'INVALID_MELD',
  'EMPTY_CARD_SELECTION',
  'MELD_NOT_FOUND',
  'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD',
  'ROUND_COMPLETED',
  'CANNOT_CLOSE_WITHOUT_BURRACO',
  'CANNOT_CLOSE_WITH_WILDCARD',
  'CANNOT_CLOSE_WITHOUT_DISCARD',
] as const

export type GameErrorCode = (typeof GAME_ERROR_CODES)[number]

/** Stable, engine-level failure for a command that is not legal in the current state. */
export class GameRuleError extends Error {
  readonly name = 'GameRuleError'

  constructor(readonly code: GameErrorCode, message: string) {
    super(message)
  }
}
