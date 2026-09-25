import { describe, expect, it } from 'vitest'
import type { MatchRoundCount } from './types'
import { calculateMatchOutcome } from './victoryPoints'

const outcomeFor = (team1: number, team2: number, roundCount: MatchRoundCount = 4) => calculateMatchOutcome([
  { teamId: 'team-1', total: team1 },
  { teamId: 'team-2', total: team2 },
], roundCount)

/** Every official lower/upper boundary, with the winner/loser split, per match length. */
const OFFICIAL_BOUNDARIES: Readonly<Record<MatchRoundCount, readonly (readonly [number, number, number])[]>> = {
  2: [
    [0, 10, 10], [40, 10, 10],
    [45, 11, 9], [120, 11, 9],
    [125, 12, 8], [200, 12, 8],
    [205, 13, 7], [300, 13, 7],
    [305, 14, 6], [400, 14, 6],
    [405, 15, 5], [500, 15, 5],
    [505, 16, 4], [620, 16, 4],
    [625, 17, 3], [740, 17, 3],
    [745, 18, 2], [870, 18, 2],
    [875, 19, 1], [1000, 19, 1],
    [1005, 20, 0], [5000, 20, 0],
  ],
  3: [
    [0, 10, 10], [50, 10, 10],
    [55, 11, 9], [150, 11, 9],
    [155, 12, 8], [250, 12, 8],
    [255, 13, 7], [350, 13, 7],
    [355, 14, 6], [500, 14, 6],
    [505, 15, 5], [650, 15, 5],
    [655, 16, 4], [800, 16, 4],
    [805, 17, 3], [1000, 17, 3],
    [1005, 18, 2], [1250, 18, 2],
    [1255, 19, 1], [1500, 19, 1],
    [1505, 20, 0], [5000, 20, 0],
  ],
  4: [
    [0, 10, 10], [100, 10, 10],
    [105, 11, 9], [300, 11, 9],
    [305, 12, 8], [500, 12, 8],
    [505, 13, 7], [700, 13, 7],
    [705, 14, 6], [900, 14, 6],
    [905, 15, 5], [1100, 15, 5],
    [1105, 16, 4], [1300, 16, 4],
    [1305, 17, 3], [1500, 17, 3],
    [1505, 18, 2], [1700, 18, 2],
    [1705, 19, 1], [2000, 19, 1],
    [2005, 20, 0], [5000, 20, 0],
  ],
}

describe.each([2, 3, 4] as const)('%i-smazzate Victory Points', (roundCount) => {
  it.each(OFFICIAL_BOUNDARIES[roundCount])(
    'maps a %i-point boundary to %i–%i VP',
    (matchPoints, winnerVp, loserVp) => {
      const outcome = outcomeFor(matchPoints, 0, roundCount)

      expect(outcome.matchPoints).toBe(matchPoints)
      expect(outcome.victoryPoints).toEqual([
        { teamId: 'team-1', victoryPoints: winnerVp },
        { teamId: 'team-2', victoryPoints: loserVp },
      ])
    },
  )

  it('assigns 10–10 to an exact tie with no leader', () => {
    expect(outcomeFor(730, 730, roundCount)).toEqual({
      cumulativeScores: [
        { teamId: 'team-1', total: 730 },
        { teamId: 'team-2', total: 730 },
      ],
      matchPoints: 0,
      leadingTeamId: null,
      victoryPoints: [
        { teamId: 'team-1', victoryPoints: 10 },
        { teamId: 'team-2', victoryPoints: 10 },
      ],
    })
  })

  it('rejects an unreachable value between two official bands', () => {
    const [upperOfFirstBand] = OFFICIAL_BOUNDARIES[roundCount][1]!
    expect(() => outcomeFor(upperOfFirstBand + 1, 0, roundCount)).toThrow(RangeError)
  })

  it('rejects every unreachable value between the last finite band and the 20–0 band', () => {
    const lastFinite = { 2: 1000, 3: 1500, 4: 2000 }[roundCount]
    for (const offset of [1, 2, 3, 4]) {
      expect(() => outcomeFor(lastFinite + offset, 0, roundCount)).toThrow(RangeError)
      expect(() => outcomeFor(0, lastFinite + offset, roundCount)).toThrow(RangeError)
    }
    expect(outcomeFor(lastFinite + 5, 0, roundCount).victoryPoints.map(({ victoryPoints }) => victoryPoints))
      .toEqual([20, 0])
  })

  it('rejects a non-multiple of five inside a band', () => {
    const [lower, upper] = [OFFICIAL_BOUNDARIES[roundCount][2]![0], OFFICIAL_BOUNDARIES[roundCount][3]![0]]
    expect(() => outcomeFor(lower + 3, 0, roundCount)).toThrow(RangeError)
    expect(() => outcomeFor(upper - 2, 0, roundCount)).toThrow(RangeError)
    expect(() => outcomeFor(1_000_003, 0, roundCount)).toThrow(RangeError)
  })
})

describe('Victory Points outcome', () => {
  it('keeps 10–10 for a non-zero difference within the first band while retaining the leader', () => {
    expect(outcomeFor(100, 0)).toMatchObject({
      matchPoints: 100,
      leadingTeamId: 'team-1',
      victoryPoints: [
        { teamId: 'team-1', victoryPoints: 10 },
        { teamId: 'team-2', victoryPoints: 10 },
      ],
    })
    expect(outcomeFor(0, 40, 2)).toMatchObject({ matchPoints: 40, leadingTeamId: 'team-2' })
    expect(outcomeFor(0, 40, 2).victoryPoints.map(({ victoryPoints }) => victoryPoints)).toEqual([10, 10])
  })

  it.each([
    [2, 350, 0, 'team-1', 14, 6],
    [2, 0, 350, 'team-2', 6, 14],
    [3, 350, 0, 'team-1', 13, 7],
    [3, 0, 350, 'team-2', 7, 13],
    [4, 350, 0, 'team-1', 12, 8],
    [4, 0, 350, 'team-2', 8, 12],
  ] as const)(
    'assigns the higher VP symmetrically (%i smazzate, totals %i–%i)',
    (roundCount, team1, team2, leader, team1Vp, team2Vp) => {
      expect(outcomeFor(team1, team2, roundCount)).toMatchObject({
        leadingTeamId: leader,
        victoryPoints: [
          { teamId: 'team-1', victoryPoints: team1Vp },
          { teamId: 'team-2', victoryPoints: team2Vp },
        ],
      })
    },
  )

  it('selects the table from the configured match length for the same Match Points', () => {
    const splitFor = (roundCount: MatchRoundCount) =>
      outcomeFor(1000, 0, roundCount).victoryPoints.map(({ victoryPoints }) => victoryPoints)

    expect(splitFor(2)).toEqual([19, 1])
    expect(splitFor(3)).toEqual([17, 3])
    expect(splitFor(4)).toEqual([15, 5])
  })

  it('rejects negative, fractional and unsupported-length inputs', () => {
    expect(() => calculateMatchOutcome([
      { teamId: 'team-1', total: 2.5 },
      { teamId: 'team-2', total: 0 },
    ], 4)).toThrow(RangeError)
    expect(() => outcomeFor(0, 0, 5 as MatchRoundCount)).toThrow(RangeError)
    expect(() => outcomeFor(0, 0, 1 as MatchRoundCount)).toThrow(RangeError)
  })
})
