import { isJoker, isPinella, type Card } from '../cards/types'
import { classifyBurraco } from '../melds'
import type { Player, Team } from '../state/types'
import { GameRuleError } from './errors'

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
