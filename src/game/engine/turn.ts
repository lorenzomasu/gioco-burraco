import { haveEquivalentFaces, type Card } from '../cards/types'
import type { GameState, Player, PlayerId, TurnPhase } from '../state/types'
import { GameRuleError } from './errors'

const PLAYER_ORDER: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']

const requireCurrentPlayer = (state: GameState, playerId: PlayerId): void => {
  if (state.round.turn.currentPlayerId !== playerId) {
    throw new GameRuleError('NOT_CURRENT_PLAYER', 'Only the current player may act.')
  }
}

const requirePhase = (state: GameState, phase: TurnPhase): void => {
  if (state.round.turn.phase !== phase) {
    throw new GameRuleError('INVALID_TURN_PHASE', `Action requires the ${phase} phase.`)
  }
}

const playerById = (state: GameState, playerId: PlayerId): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Game state does not contain player: ${playerId}`)
  return player
}

const replacePlayerHand = (state: GameState, playerId: PlayerId, hand: readonly Card[]): GameState['players'] =>
  state.players.map((player) => (player.id === playerId ? { ...player, hand } : player))

const nextPlayerId = (playerId: PlayerId): PlayerId => {
  const index = PLAYER_ORDER.indexOf(playerId)
  return PLAYER_ORDER[(index + 1) % PLAYER_ORDER.length]!
}

/** Draws the top stock card. The draw-pile top is stored at array index 0. */
export const drawCard = (state: GameState, playerId: PlayerId): GameState => {
  requireCurrentPlayer(state, playerId)
  requirePhase(state, 'mustDraw')
  const card = state.drawPile[0]
  if (!card) throw new GameRuleError('DRAW_PILE_EMPTY', 'Cannot draw: the draw pile is empty.')
  const player = playerById(state, playerId)

  return {
    ...state,
    players: replacePlayerHand(state, playerId, [...player.hand, card]),
    drawPile: state.drawPile.slice(1),
    round: {
      ...state.round,
      turn: { currentPlayerId: playerId, phase: 'action', acquisition: { source: 'drawPile', cardIds: [card.id] } },
    },
  }
}

/** Takes all discards. The discard-pile top is stored at the final array index. */
export const takeDiscardPile = (state: GameState, playerId: PlayerId): GameState => {
  requireCurrentPlayer(state, playerId)
  requirePhase(state, 'mustDraw')
  if (state.discardPile.length === 0) {
    throw new GameRuleError('DISCARD_PILE_EMPTY', 'Cannot take: the discard pile is empty.')
  }
  const player = playerById(state, playerId)

  return {
    ...state,
    players: replacePlayerHand(state, playerId, [...player.hand, ...state.discardPile]),
    discardPile: [],
    round: {
      ...state.round,
      turn: {
        currentPlayerId: playerId,
        phase: 'action',
        acquisition: { source: 'discardPile', cardIds: state.discardPile.map((card) => card.id) },
      },
    },
  }
}

/** Discards a physical card and atomically advances to the next player's draw choice. */
export const discardCard = (state: GameState, playerId: PlayerId, cardId: string): GameState => {
  requireCurrentPlayer(state, playerId)
  requirePhase(state, 'action')
  const player = playerById(state, playerId)
  const cardIndex = player.hand.findIndex((card) => card.id === cardId)
  if (cardIndex < 0) {
    throw new GameRuleError('CARD_NOT_IN_HAND', 'Cannot discard a card that is not in the player hand.')
  }
  const card = player.hand[cardIndex]!
  const acquisition = state.round.turn.phase === 'action' ? state.round.turn.acquisition : undefined
  const isOnlyCollectedDiscard = acquisition?.source === 'discardPile'
    && acquisition.cardIds.length === 1
    && acquisition.cardIds[0] === card.id
  const hasEquivalentCardAlreadyInHand = player.hand.some((candidate) =>
    candidate.id !== card.id && haveEquivalentFaces(candidate, card),
  )
  if (isOnlyCollectedDiscard && !hasEquivalentCardAlreadyInHand) {
    throw new GameRuleError(
      'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD',
      'Cannot immediately discard the only card collected from the discard pile.',
    )
  }

  return {
    ...state,
    players: replacePlayerHand(state, playerId, player.hand.filter((_, index) => index !== cardIndex)),
    discardPile: [...state.discardPile, card],
    round: {
      ...state.round,
      turn: { currentPlayerId: nextPlayerId(playerId), phase: 'mustDraw' },
    },
  }
}

export { playMeld } from './playMeld'
