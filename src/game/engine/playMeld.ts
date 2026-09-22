import type { Card } from '../cards/types'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, Player, PlayerId, TeamId } from '../state/types'
import { GameRuleError } from './errors'

const requireCurrentPlayer = (state: GameState, playerId: PlayerId): void => {
  if (state.round.turn.currentPlayerId !== playerId) {
    throw new GameRuleError('NOT_CURRENT_PLAYER', 'Only the current player may act.')
  }
}

const requireActionPhase = (state: GameState): void => {
  if (state.round.turn.phase !== 'action') {
    throw new GameRuleError('INVALID_TURN_PHASE', 'Playing a meld requires the action phase.')
  }
}

const playerById = (state: GameState, playerId: PlayerId): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Game state does not contain player: ${playerId}`)
  return player
}

const cardsByPhysicalId = (player: Player, cardIds: readonly string[]): readonly Card[] => {
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

const addTeamMeld = (
  state: GameState,
  teamId: TeamId,
  meld: ValidatedMeld,
): GameState['teams'] => {
  let foundTeam = false
  const teams = state.teams.map((team) => {
    if (team.id !== teamId) return team
    foundTeam = true
    return { ...team, melds: [...team.melds, meld] }
  })
  if (!foundTeam) throw new Error(`Game state does not contain team: ${teamId}`)
  return teams
}

/** Plays a new meld from the current player's hand without ending the action phase. */
export const playMeld = (
  state: GameState,
  playerId: PlayerId,
  cardIds: readonly string[],
): GameState => {
  requireCurrentPlayer(state, playerId)
  requireActionPhase(state)

  const player = playerById(state, playerId)
  const cards = cardsByPhysicalId(player, cardIds)
  const validation = validateMeld(cards)
  if (!validation.valid) {
    throw new GameRuleError('INVALID_MELD', `Cannot play invalid meld: ${validation.reason}.`)
  }

  const playedCardIds = new Set(cardIds)
  const teams = addTeamMeld(state, player.teamId, validation.meld)

  return {
    ...state,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, hand: candidate.hand.filter((card) => !playedCardIds.has(card.id)) }
      : candidate),
    teams,
  }
}
