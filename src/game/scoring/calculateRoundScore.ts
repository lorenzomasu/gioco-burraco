import { classifyBurraco, type BurracoClassification } from '../melds'
import type { CompletedGameState, Team } from '../state/types'
import { cardValue } from './cardValue'
import type { RoundScore, TeamRoundScore } from './types'

const BURRACO_BONUSES: Readonly<Record<BurracoClassification, number>> = {
  none: 0,
  clean: 200,
  'semi-clean': 150,
  dirty: 100,
}

const calculateTeamScore = (
  state: CompletedGameState,
  team: Team,
  atLeastOneTeamTookPozzetto: boolean,
): TeamRoundScore => {
  const meldCardPoints = team.melds.reduce(
    (total, meld) => total + meld.cards.reduce(
      (meldTotal, placement) => meldTotal + cardValue(placement.card),
      0,
    ),
    0,
  )
  const burracoBonus = team.melds.reduce(
    (total, meld) => total + BURRACO_BONUSES[classifyBurraco(meld)],
    0,
  )
  const closingBonus = state.round.closingTeamId === team.id ? 100 : 0
  const handPenalty = state.players.reduce(
    (total, player) => player.teamId === team.id
      ? total + player.hand.reduce((handTotal, card) => handTotal + cardValue(card), 0)
      : total,
    0,
  )
  const pozzettoPenalty = !team.hasTakenPozzetto && atLeastOneTeamTookPozzetto ? 100 : 0
  const total = meldCardPoints
    + burracoBonus
    + closingBonus
    - handPenalty
    - pozzettoPenalty

  return {
    teamId: team.id,
    meldCardPoints,
    burracoBonus,
    closingBonus,
    handPenalty,
    pozzettoPenalty,
    total,
  }
}

/** Derives the complete, immutable scoring breakdown from a completed round. */
export const calculateRoundScore = (state: CompletedGameState): RoundScore => {
  const atLeastOneTeamTookPozzetto = state.teams.some((team) => team.hasTakenPozzetto)

  return {
    teams: state.teams.map((team) =>
      calculateTeamScore(state, team, atLeastOneTeamTookPozzetto),
    ),
  }
}
