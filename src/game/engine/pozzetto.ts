import type { Pozzetto } from '../cards/types'
import type { GameState, PlayerId } from '../state/types'

/**
 * Assigns the first available pozzetto when a valid move empties a player's first hand.
 * Turn timing remains the caller's responsibility: meld commands continue in action,
 * while discard has already advanced to the next player.
 */
export const acquirePozzettoIfEligible = (state: GameState, playerId: PlayerId): GameState => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Game state does not contain player: ${playerId}`)
  if (player.hand.length > 0) return state

  const team = state.teams.find((candidate) => candidate.id === player.teamId)
  if (!team) throw new Error(`Game state does not contain team: ${player.teamId}`)
  if (team.hasTakenPozzetto) return state

  const pozzettoIndex = state.pozzetti.findIndex((pozzetto) => pozzetto.length > 0)
  if (pozzettoIndex < 0) {
    throw new Error(`Invariant violation: no pozzetto is available for team ${team.id}.`)
  }

  const pozzetto = state.pozzetti[pozzettoIndex]!
  const pozzetti: readonly [Pozzetto, Pozzetto] = pozzettoIndex === 0
    ? [[], state.pozzetti[1]]
    : [state.pozzetti[0], []]

  return {
    ...state,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, hand: pozzetto }
      : candidate),
    teams: state.teams.map((candidate) => candidate.id === team.id
      ? { ...candidate, hasTakenPozzetto: true }
      : candidate),
    pozzetti,
  }
}
