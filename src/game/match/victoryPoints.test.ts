import { describe, expect, it } from 'vitest'
import { calculateFourRoundOutcome } from './victoryPoints'

const outcomeFor = (team1: number, team2: number) => calculateFourRoundOutcome([
  { teamId: 'team-1', total: team1 },
  { teamId: 'team-2', total: team2 },
])

describe('four-round Victory Points', () => {
  it.each([
    [0, 10, 10],
    [100, 10, 10],
    [105, 11, 9],
    [300, 11, 9],
    [305, 12, 8],
    [500, 12, 8],
    [505, 13, 7],
    [700, 13, 7],
    [705, 14, 6],
    [900, 14, 6],
    [905, 15, 5],
    [1100, 15, 5],
    [1105, 16, 4],
    [1300, 16, 4],
    [1305, 17, 3],
    [1500, 17, 3],
    [1505, 18, 2],
    [1700, 18, 2],
    [1705, 19, 1],
    [2000, 19, 1],
    [2001, 20, 0],
  ])('maps a %i-point boundary to %i–%i VP', (matchPoints, winnerVp, loserVp) => {
    const outcome = outcomeFor(matchPoints, 0)

    expect(outcome.matchPoints).toBe(matchPoints)
    expect(outcome.victoryPoints).toEqual([
      { teamId: 'team-1', victoryPoints: winnerVp },
      { teamId: 'team-2', victoryPoints: loserVp },
    ])
  })

  it('keeps 10–10 for a non-zero difference within the first band while retaining the leader', () => {
    expect(outcomeFor(100, 0)).toMatchObject({
      matchPoints: 100,
      leadingTeamId: 'team-1',
      victoryPoints: [
        { teamId: 'team-1', victoryPoints: 10 },
        { teamId: 'team-2', victoryPoints: 10 },
      ],
    })
  })

  it.each([
    [350, 0, 'team-1', 12, 8],
    [0, 350, 'team-2', 8, 12],
  ] as const)(
    'assigns the higher VP symmetrically for cumulative totals %i–%i',
    (team1, team2, leader, team1Vp, team2Vp) => {
      expect(outcomeFor(team1, team2)).toMatchObject({
        leadingTeamId: leader,
        victoryPoints: [
          { teamId: 'team-1', victoryPoints: team1Vp },
          { teamId: 'team-2', victoryPoints: team2Vp },
        ],
      })
    },
  )
})
