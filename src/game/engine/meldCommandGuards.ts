import type { Card } from '../cards/types'
import type { GameState, Player, PlayerId } from '../state/types'
import { GameRuleError } from './errors'

export const requireCurrentPlayer = (state: GameState, playerId: PlayerId): void => {
  if (state.round.turn.currentPlayerId !== playerId) {
    throw new GameRuleError('NOT_CURRENT_PLAYER', 'Only the current player may act.')
  }
}

export const requireMeldActionPhase = (state: GameState): void => {
  if (state.round.turn.phase !== 'action') {
    throw new GameRuleError('INVALID_TURN_PHASE', 'Playing or extending a meld requires the action phase.')
  }
}

export const playerById = (state: GameState, playerId: PlayerId): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Game state does not contain player: ${playerId}`)
  return player
}

export const cardsByPhysicalId = (player: Player, cardIds: readonly string[]): readonly Card[] => {
  if (new Set(cardIds).size !== cardIds.length) {
    throw new GameRuleError('DUPLICATE_CARD_ID', 'The same physical card cannot be requested more than once.')
  }

  return cardIds.map((cardId) => {
    const card = player.hand.find((candidate) => candidate.id === cardId)
    if (!card) {
      throw new GameRuleError('CARD_NOT_IN_HAND', 'Cannot play a card that is not in the player hand.')
    }
    return card
  })
}
