import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, PlayerId, TeamId } from '../state/types'
import { GameRuleError } from './errors'
import { cardsByPhysicalId, playerById, requireCurrentPlayer, requireMeldActionPhase } from './meldCommandGuards'
import { acquirePozzettoIfEligible } from './pozzetto'

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
  requireMeldActionPhase(state)

  const player = playerById(state, playerId)
  const cards = cardsByPhysicalId(player, cardIds)
  const validation = validateMeld(cards)
  if (!validation.valid) {
    throw new GameRuleError('INVALID_MELD', `Cannot play invalid meld: ${validation.reason}.`)
  }

  const playedCardIds = new Set(cardIds)
  const teams = addTeamMeld(state, player.teamId, validation.meld)

  const nextState: GameState = {
    ...state,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, hand: candidate.hand.filter((card) => !playedCardIds.has(card.id)) }
      : candidate),
    teams,
  }

  return acquirePozzettoIfEligible(nextState, playerId)
}
