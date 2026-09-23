import { haveEquivalentFaces, type Card } from '../cards/types'
import type {
  GameState,
  InProgressGameState,
  InProgressRoundState,
  Player,
  PlayerId,
  TurnPhase,
} from '../state/types'
import { GameRuleError } from './errors'
import { acquirePozzettoIfEligible } from './pozzetto'
import { concludeIfDrawPileExhausted, isClosingWildcard, teamHasBurraco } from './roundClosure'
import { requireInProgressRound } from './roundGuards'

const PLAYER_ORDER: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']

const requireCurrentPlayer = (round: InProgressRoundState, playerId: PlayerId): void => {
  if (round.turn.currentPlayerId !== playerId) {
    throw new GameRuleError('NOT_CURRENT_PLAYER', 'Only the current player may act.')
  }
}

const requirePhase = (round: InProgressRoundState, phase: TurnPhase): void => {
  if (round.turn.phase !== phase) {
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
export const drawCard = (state: GameState, playerId: PlayerId): InProgressGameState => {
  const round = requireInProgressRound(state)
  requireCurrentPlayer(round, playerId)
  requirePhase(round, 'mustDraw')
  const card = state.drawPile[0]
  if (!card) throw new GameRuleError('DRAW_PILE_EMPTY', 'Cannot draw: the draw pile is empty.')
  const player = playerById(state, playerId)

  return {
    ...state,
    players: replacePlayerHand(state, playerId, [...player.hand, card]),
    drawPile: state.drawPile.slice(1),
    round: {
      ...round,
      turn: { currentPlayerId: playerId, phase: 'action', acquisition: { source: 'drawPile', cardIds: [card.id] } },
    },
  }
}

/** Takes all discards. The discard-pile top is stored at the final array index. */
export const takeDiscardPile = (state: GameState, playerId: PlayerId): InProgressGameState => {
  const round = requireInProgressRound(state)
  requireCurrentPlayer(round, playerId)
  requirePhase(round, 'mustDraw')
  if (state.discardPile.length === 0) {
    throw new GameRuleError('DISCARD_PILE_EMPTY', 'Cannot take: the discard pile is empty.')
  }
  const player = playerById(state, playerId)
  const singleCollectedCard = state.discardPile.length === 1 ? state.discardPile[0]! : undefined
  const canRediscardSingleCollectedCard = singleCollectedCard !== undefined
    && player.hand.some((candidate) => haveEquivalentFaces(candidate, singleCollectedCard))

  return {
    ...state,
    players: replacePlayerHand(state, playerId, [...player.hand, ...state.discardPile]),
    discardPile: [],
    round: {
      ...round,
      turn: {
        currentPlayerId: playerId,
        phase: 'action',
        acquisition: {
          source: 'discardPile',
          cardIds: state.discardPile.map((card) => card.id),
          canRediscardSingleCollectedCard,
        },
      },
    },
  }
}

/**
 * Discards a physical card and atomically advances to the next player's draw choice,
 * unless the discard closes the round or leaves only unplayable draw-pile cards.
 */
export const discardCard = (state: GameState, playerId: PlayerId, cardId: string): GameState => {
  const round = requireInProgressRound(state)
  requireCurrentPlayer(round, playerId)
  requirePhase(round, 'action')
  const player = playerById(state, playerId)
  const cardIndex = player.hand.findIndex((card) => card.id === cardId)
  if (cardIndex < 0) {
    throw new GameRuleError('CARD_NOT_IN_HAND', 'Cannot discard a card that is not in the player hand.')
  }
  const card = player.hand[cardIndex]!
  const acquisition = round.turn.phase === 'action' ? round.turn.acquisition : undefined
  if (
    acquisition?.source === 'discardPile'
    && acquisition.cardIds.length === 1
    && acquisition.cardIds[0] === card.id
    && !acquisition.canRediscardSingleCollectedCard
  ) {
    throw new GameRuleError(
      'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD',
      'Cannot immediately discard the only card collected from the discard pile.',
    )
  }

  const team = state.teams.find((candidate) => candidate.id === player.teamId)
  if (!team) throw new Error(`Game state does not contain team: ${player.teamId}`)
  const isClosingAttempt = player.hand.length === 1 && team.hasTakenPozzetto
  if (isClosingAttempt) {
    if (isClosingWildcard(card)) {
      throw new GameRuleError(
        'CANNOT_CLOSE_WITH_WILDCARD',
        'Cannot close the round by discarding a joker or pinella.',
      )
    }
    if (!teamHasBurraco(team)) {
      throw new GameRuleError(
        'CANNOT_CLOSE_WITHOUT_BURRACO',
        'Cannot close the round without a Burraco.',
      )
    }

    return {
      ...state,
      players: replacePlayerHand(state, playerId, []),
      discardPile: [...state.discardPile, card],
      round: { status: 'completed', ending: 'closure', closedByPlayerId: playerId, closingTeamId: team.id },
    }
  }

  const nextState: InProgressGameState = {
    ...state,
    players: replacePlayerHand(state, playerId, player.hand.filter((_, index) => index !== cardIndex)),
    discardPile: [...state.discardPile, card],
    round: {
      ...round,
      turn: { currentPlayerId: nextPlayerId(playerId), phase: 'mustDraw' },
    },
  }

  return concludeIfDrawPileExhausted(acquirePozzettoIfEligible(nextState, playerId), playerId)
}

export { playMeld } from './playMeld'
export { extendMeld } from './extendMeld'
