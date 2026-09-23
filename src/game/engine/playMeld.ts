import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TeamId } from '../state/types'
import { GameRuleError } from './errors'
import { cardsByPhysicalId, playerById, requireCurrentPlayer, requireMeldActionPhase } from './meldCommandGuards'
import { acquirePozzettoIfEligible } from './pozzetto'
import { requireFinalDiscard } from './roundClosure'

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
): InProgressGameState => {
  const round = requireCurrentPlayer(state, playerId)
  requireMeldActionPhase(round)

  const player = playerById(state, playerId)
  const cards = cardsByPhysicalId(player, cardIds)
  const validation = validateMeld(cards)
  if (!validation.valid) {
    throw new GameRuleError('INVALID_MELD', `Cannot play invalid meld: ${validation.reason}.`)
  }

  const team = state.teams.find((candidate) => candidate.id === player.teamId)
  if (!team) throw new Error(`Game state does not contain team: ${player.teamId}`)
  requireFinalDiscard(player, team, cards.length)

  const playedCardIds = new Set(cardIds)
  const teams = addTeamMeld(state, player.teamId, validation.meld)

  const nextState: InProgressGameState = {
    ...state,
    round,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, hand: candidate.hand.filter((card) => !playedCardIds.has(card.id)) }
      : candidate),
    teams,
  }

  return acquirePozzettoIfEligible(nextState, playerId)
}
