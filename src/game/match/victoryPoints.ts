import type { TeamId } from '../state/types'
import type { MatchOutcome, TeamCumulativeScore } from './types'

type VictoryPointBand = Readonly<{
  minimum: number
  maximum: number
  winner: number
  loser: number
}>

const FOUR_ROUND_VP_BANDS: readonly VictoryPointBand[] = [
  { minimum: 0, maximum: 100, winner: 10, loser: 10 },
  { minimum: 105, maximum: 300, winner: 11, loser: 9 },
  { minimum: 305, maximum: 500, winner: 12, loser: 8 },
  { minimum: 505, maximum: 700, winner: 13, loser: 7 },
  { minimum: 705, maximum: 900, winner: 14, loser: 6 },
  { minimum: 905, maximum: 1100, winner: 15, loser: 5 },
  { minimum: 1105, maximum: 1300, winner: 16, loser: 4 },
  { minimum: 1305, maximum: 1500, winner: 17, loser: 3 },
  { minimum: 1505, maximum: 1700, winner: 18, loser: 2 },
  { minimum: 1705, maximum: 2000, winner: 19, loser: 1 },
  { minimum: 2001, maximum: Number.POSITIVE_INFINITY, winner: 20, loser: 0 },
]

const victoryPointSplit = (matchPoints: number): readonly [number, number] => {
  if (!Number.isInteger(matchPoints) || matchPoints < 0) {
    throw new RangeError('Match Points must be a non-negative integer.')
  }

  const band = FOUR_ROUND_VP_BANDS.find(
    ({ minimum, maximum }) => matchPoints >= minimum && matchPoints <= maximum,
  )
  if (!band) {
    throw new RangeError('Four-round Match Points must use a reachable five-point increment.')
  }
  return [band.winner, band.loser]
}

const cumulativeFor = (scores: readonly TeamCumulativeScore[], teamId: TeamId): number =>
  scores.find((score) => score.teamId === teamId)?.total ?? 0

/** Converts final four-round cumulative points into Match Points, leader and official VP. */
export const calculateFourRoundOutcome = (
  cumulativeScores: readonly TeamCumulativeScore[],
): MatchOutcome => {
  const team1Total = cumulativeFor(cumulativeScores, 'team-1')
  const team2Total = cumulativeFor(cumulativeScores, 'team-2')
  const matchPoints = Math.abs(team1Total - team2Total)
  const leadingTeamId: TeamId | null = team1Total === team2Total
    ? null
    : team1Total > team2Total ? 'team-1' : 'team-2'
  const [winnerVictoryPoints, loserVictoryPoints] = victoryPointSplit(matchPoints)

  return {
    cumulativeScores: [
      { teamId: 'team-1', total: team1Total },
      { teamId: 'team-2', total: team2Total },
    ],
    matchPoints,
    leadingTeamId,
    victoryPoints: [
      {
        teamId: 'team-1',
        victoryPoints: leadingTeamId === 'team-2' ? loserVictoryPoints : winnerVictoryPoints,
      },
      {
        teamId: 'team-2',
        victoryPoints: leadingTeamId === 'team-2' ? winnerVictoryPoints : loserVictoryPoints,
      },
    ],
  }
}
