import type { TeamId } from '../state/types'
import type { MatchOutcome, MatchRoundCount, TeamCumulativeScore } from './types'

type VictoryPointBand = Readonly<{
  minimum: number
  maximum: number
  winner: number
  loser: number
}>

/**
 * Official F.I.Bur. (January 2026) tables, one per supported match length. Each band is
 * inclusive and bounded by reachable five-point values; «oltre X» starts at X + 5.
 */
const VP_BANDS_BY_ROUND_COUNT: Readonly<Record<MatchRoundCount, readonly VictoryPointBand[]>> = {
  2: [
    { minimum: 0, maximum: 40, winner: 10, loser: 10 },
    { minimum: 45, maximum: 120, winner: 11, loser: 9 },
    { minimum: 125, maximum: 200, winner: 12, loser: 8 },
    { minimum: 205, maximum: 300, winner: 13, loser: 7 },
    { minimum: 305, maximum: 400, winner: 14, loser: 6 },
    { minimum: 405, maximum: 500, winner: 15, loser: 5 },
    { minimum: 505, maximum: 620, winner: 16, loser: 4 },
    { minimum: 625, maximum: 740, winner: 17, loser: 3 },
    { minimum: 745, maximum: 870, winner: 18, loser: 2 },
    { minimum: 875, maximum: 1000, winner: 19, loser: 1 },
    { minimum: 1005, maximum: Number.POSITIVE_INFINITY, winner: 20, loser: 0 },
  ],
  3: [
    { minimum: 0, maximum: 50, winner: 10, loser: 10 },
    { minimum: 55, maximum: 150, winner: 11, loser: 9 },
    { minimum: 155, maximum: 250, winner: 12, loser: 8 },
    { minimum: 255, maximum: 350, winner: 13, loser: 7 },
    { minimum: 355, maximum: 500, winner: 14, loser: 6 },
    { minimum: 505, maximum: 650, winner: 15, loser: 5 },
    { minimum: 655, maximum: 800, winner: 16, loser: 4 },
    { minimum: 805, maximum: 1000, winner: 17, loser: 3 },
    { minimum: 1005, maximum: 1250, winner: 18, loser: 2 },
    { minimum: 1255, maximum: 1500, winner: 19, loser: 1 },
    { minimum: 1505, maximum: Number.POSITIVE_INFINITY, winner: 20, loser: 0 },
  ],
  4: [
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
    { minimum: 2005, maximum: Number.POSITIVE_INFINITY, winner: 20, loser: 0 },
  ],
}

const victoryPointSplit = (matchPoints: number, roundCount: MatchRoundCount): readonly [number, number] => {
  if (!Number.isInteger(matchPoints) || matchPoints < 0) {
    throw new RangeError('Match Points must be a non-negative integer.')
  }
  // Legal round scores are multiples of five, so any other difference is unreachable.
  if (matchPoints % 5 !== 0) {
    throw new RangeError('Match Points must use a reachable five-point increment.')
  }
  const bands = VP_BANDS_BY_ROUND_COUNT[roundCount]
  if (!bands) {
    throw new RangeError('Victory Points are defined only for 2, 3 or 4 smazzate.')
  }

  const band = bands.find(
    ({ minimum, maximum }) => matchPoints >= minimum && matchPoints <= maximum,
  )
  if (!band) {
    throw new RangeError('Match Points must use a reachable five-point increment.')
  }
  return [band.winner, band.loser]
}

const cumulativeFor = (scores: readonly TeamCumulativeScore[], teamId: TeamId): number =>
  scores.find((score) => score.teamId === teamId)?.total ?? 0

/**
 * Converts final cumulative points into Match Points, leader and the official VP split of
 * the table for the configured match length.
 */
export const calculateMatchOutcome = (
  cumulativeScores: readonly TeamCumulativeScore[],
  roundCount: MatchRoundCount,
): MatchOutcome => {
  const team1Total = cumulativeFor(cumulativeScores, 'team-1')
  const team2Total = cumulativeFor(cumulativeScores, 'team-2')
  const matchPoints = Math.abs(team1Total - team2Total)
  const leadingTeamId: TeamId | null = team1Total === team2Total
    ? null
    : team1Total > team2Total ? 'team-1' : 'team-2'
  const [winnerVictoryPoints, loserVictoryPoints] = victoryPointSplit(matchPoints, roundCount)

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
