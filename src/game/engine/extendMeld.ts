import { validateMeld } from '../melds'
import type { GameState, PlayerId } from '../state/types'
import { GameRuleError } from './errors'
import { cardsByPhysicalId, playerById, requireCurrentPlayer, requireMeldActionPhase } from './meldCommandGuards'

/** Adds hand cards to one zero-based meld in the current player's team without ending the turn. */
export const extendMeld = (
  state: GameState,
  playerId: PlayerId,
  meldIndex: number,
  cardIds: readonly string[],
): GameState => {
  requireCurrentPlayer(state, playerId)
  requireMeldActionPhase(state)

  const player = playerById(state, playerId)
  const team = state.teams.find((candidate) => candidate.id === player.teamId)
  if (!team) throw new Error(`Game state does not contain team: ${player.teamId}`)

  if (!Number.isInteger(meldIndex) || meldIndex < 0 || meldIndex >= team.melds.length) {
    throw new GameRuleError('MELD_NOT_FOUND', 'The requested team meld does not exist.')
  }
  if (cardIds.length === 0) {
    throw new GameRuleError('EMPTY_CARD_SELECTION', 'Extending a meld requires at least one card.')
  }

  const addedCards = cardsByPhysicalId(player, cardIds)
  const existingMeld = team.melds[meldIndex]!
  const existingCards = existingMeld.cards.map((placement) => placement.card)
  const validation = validateMeld([...existingCards, ...addedCards])
  if (!validation.valid) {
    throw new GameRuleError('INVALID_MELD', `Cannot extend meld: ${validation.reason}.`)
  }

  const addedCardIds = new Set(cardIds)
  return {
    ...state,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, hand: candidate.hand.filter((card) => !addedCardIds.has(card.id)) }
      : candidate),
    teams: state.teams.map((candidate) => candidate.id === player.teamId
      ? {
          ...candidate,
          melds: candidate.melds.map((meld, index) => index === meldIndex ? validation.meld : meld),
        }
      : candidate),
  }
}
