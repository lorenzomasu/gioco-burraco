import type { TeamId } from '../state/types'

/** Penalties are positive magnitudes and are subtracted when calculating `total`. */
export type TeamRoundScore = Readonly<{
  teamId: TeamId
  meldCardPoints: number
  burracoBonus: number
  closingBonus: number
  handPenalty: number
  pozzettoPenalty: number
  total: number
}>

export type RoundScore = Readonly<{
  teams: readonly TeamRoundScore[]
}>
