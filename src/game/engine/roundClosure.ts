import { isJoker, isPinella, type Card } from '../cards/types'
import { classifyBurraco } from '../melds'
import type { GameState, InProgressGameState, Player, PlayerId, Team } from '../state/types'
import { GameRuleError } from './errors'

/** The last draw-pile cards are never playable; a discard that leaves only these ends the round. */
export const UNPLAYABLE_DRAW_PILE_CARDS = 2

export const teamHasBurraco = (team: Team): boolean =>
  team.melds.some((meld) => classifyBurraco(meld) !== 'none')

export const isClosingWildcard = (card: Card): boolean => isJoker(card) || isPinella(card)

/** After taking the pozzetto, at least one hand card must remain for the mandatory final discard. */
export const requireFinalDiscard = (
  player: Player,
  team: Team,
  playedCardCount: number,
): void => {
  if (team.hasTakenPozzetto && playedCardCount === player.hand.length) {
    throw new GameRuleError(
      'CANNOT_CLOSE_WITHOUT_DISCARD',
      'The round can only be closed by discarding the final card.',
    )
  }
}

/** Ends the round after a completed non-closing discard when only unplayable stock cards remain. */
export const concludeIfDrawPileExhausted = (
  state: InProgressGameState,
  lastDiscardPlayerId: PlayerId,
): GameState => state.drawPile.length > UNPLAYABLE_DRAW_PILE_CARDS
  ? state
  : { ...state, round: { status: 'completed', ending: 'draw-pile-exhausted', lastDiscardPlayerId } }
