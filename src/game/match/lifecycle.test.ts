import { describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { dealInitialState } from '../engine/startGame'
import type { CompletedRoundState, GameState } from '../state/types'
import {
  advanceMatch,
  calculateCumulativeScores,
  getFinalMatchOutcome,
  MatchLifecycleError,
  settleCompletedRound,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
} from './lifecycle'
import type { MatchState, SettledRoundResult } from './types'

const deck = createBurracoDeck()
const freshRound = () => dealInitialState(deck)

const completedRound = (
  state: GameState,
  ending: CompletedRoundState['ending'] = 'closure',
): GameState => ({
  ...state,
  round: ending === 'closure'
    ? {
        status: 'completed',
        ending,
        closedByPlayerId: 'player-1',
        closingTeamId: 'team-1',
      }
    : {
        status: 'completed',
        ending,
        lastDiscardPlayerId: 'player-2',
      },
})

const scoreResult = (
  roundNumber: 1 | 2 | 3 | 4,
  team1Total: number,
  team2Total: number,
): SettledRoundResult => ({
  roundNumber,
  ending: roundNumber % 2 === 0 ? 'draw-pile-exhausted' : 'closure',
  score: {
    teams: [
      {
        teamId: 'team-1',
        meldCardPoints: 0,
        burracoBonus: 0,
        closingBonus: 0,
        handPenalty: 0,
        pozzettoPenalty: 0,
        total: team1Total,
      },
      {
        teamId: 'team-2',
        meldCardPoints: 0,
        burracoBonus: 0,
        closingBonus: 0,
        handPenalty: 0,
        pozzettoPenalty: 0,
        total: team2Total,
      },
    ],
  },
})

describe('four-round match lifecycle', () => {
  it('starts round 1 with a fresh round, empty history, and zero cumulative totals', () => {
    const factory = vi.fn(freshRound)
    const match = startMatch(factory)

    expect(factory).toHaveBeenCalledOnce()
    expect(match).toMatchObject({
      status: 'in-progress',
      currentRoundNumber: 1,
      roundResults: [],
      currentRound: { round: { status: 'in-progress' } },
    })
    expect(calculateCumulativeScores(match)).toEqual([
      { teamId: 'team-1', total: 0 },
      { teamId: 'team-2', total: 0 },
    ])
  })

  it.each([
    ['closure', [-105, -205]],
    ['draw-pile-exhausted', [-205, -205]],
  ] as const)('settles a %s result with its ending and scorer output', (ending, totals) => {
    const started = startMatch(freshRound)
    const match = settleCompletedRound({ ...started, currentRound: completedRound(started.currentRound, ending) })

    expect(match.roundResults).toHaveLength(1)
    expect(match.roundResults[0]).toMatchObject({ roundNumber: 1, ending })
    expect(match.roundResults[0]!.score.teams.map(({ total }) => total)).toEqual(totals)
    expect(match.currentRound.round).toMatchObject({ status: 'completed', ending })
  })

  it('settles the same completed current round exactly once', () => {
    const started = startMatch(freshRound)
    const once = settleCompletedRound({ ...started, currentRound: completedRound(started.currentRound) })
    const twice = settleCompletedRound(once)
    const synchronizedAgain = synchronizeMatch(twice)

    expect(twice).toBe(once)
    expect(synchronizedAgain).toBe(once)
    expect(once.roundResults).toHaveLength(1)
  })

  it('rejects settlement and advancement while the current round is in progress', () => {
    const match = startMatch(freshRound)

    expect(() => settleCompletedRound(match)).toThrowError(MatchLifecycleError)
    expect(() => settleCompletedRound(match)).toThrowError('cannot be settled')
    expect(() => advanceMatch(match, freshRound)).toThrowError('cannot advance')
    expect(match.roundResults).toEqual([])
  })

  it('rejects advancement of a completed round that has not been settled', () => {
    const started = startMatch(freshRound)
    const completedButUnsettled = { ...started, currentRound: completedRound(started.currentRound) }

    expect(() => advanceMatch(completedButUnsettled, freshRound)).toThrowError('must be settled')
  })

  it('transitions exactly 1→2, 2→3 and 3→4 with one fresh factory round each time', () => {
    const factory = vi.fn(freshRound)
    let match = startMatch(factory)
    const priorRounds: GameState[] = []

    for (const expectedRound of [2, 3, 4] as const) {
      match = updateCurrentRound(match, completedRound(match.currentRound))
      priorRounds.push(match.currentRound)
      const priorHistory = match.roundResults
      match = advanceMatch(match, factory)

      expect(match.currentRoundNumber).toBe(expectedRound)
      expect(match.currentRound.round.status).toBe('in-progress')
      expect(match.currentRound).not.toBe(priorRounds.at(-1))
      expect(match.currentRound.players.every((player) => player.hand.length === 11)).toBe(true)
      expect(match.currentRound.teams.every((team) => team.melds.length === 0 && !team.hasTakenPozzetto)).toBe(true)
      expect(match.currentRound.pozzetti.map(({ length }) => length)).toEqual([11, 11])
      expect(match.currentRound.discardPile).toHaveLength(1)
      expect(match.currentRound.drawPile).toHaveLength(41)
      expect(match.roundResults).toBe(priorHistory)
      expect(match.roundResults).toHaveLength(expectedRound - 1)
    }

    expect(factory).toHaveBeenCalledTimes(4)
  })

  it('derives signed cumulative totals and final Match Points from the net four-round result', () => {
    const roundResults = [
      scoreResult(1, 300, -100),
      scoreResult(2, -200, 500),
      scoreResult(3, 100, 50),
      scoreResult(4, -50, -150),
    ]
    const match: MatchState = {
      status: 'completed',
      currentRoundNumber: 4,
      currentRound: completedRound(freshRound()),
      roundResults,
    }

    expect(calculateCumulativeScores(match)).toEqual([
      { teamId: 'team-1', total: 150 },
      { teamId: 'team-2', total: 300 },
    ])
    expect(getFinalMatchOutcome(match)).toMatchObject({
      matchPoints: 150,
      leadingTeamId: 'team-2',
      victoryPoints: [
        { teamId: 'team-1', victoryPoints: 9 },
        { teamId: 'team-2', victoryPoints: 11 },
      ],
    })
  })

  it('represents exact cumulative equality as a tie', () => {
    const match: MatchState = {
      status: 'completed',
      currentRoundNumber: 4,
      currentRound: completedRound(freshRound()),
      roundResults: [
        scoreResult(1, 100, 0),
        scoreResult(2, -100, 0),
        scoreResult(3, 50, 100),
        scoreResult(4, 50, 0),
      ],
    }

    expect(getFinalMatchOutcome(match)).toMatchObject({
      matchPoints: 0,
      leadingTeamId: null,
      victoryPoints: [
        { teamId: 'team-1', victoryPoints: 10 },
        { teamId: 'team-2', victoryPoints: 10 },
      ],
    })
  })

  it('settles round 4 as terminal and rejects any fifth round without calling its factory', () => {
    const factory = vi.fn(freshRound)
    let match = startMatch(factory)
    for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
      match = updateCurrentRound(match, completedRound(match.currentRound))
      match = advanceMatch(match, factory)
    }

    const completedMatch = updateCurrentRound(match, completedRound(match.currentRound, 'draw-pile-exhausted'))

    expect(completedMatch).toMatchObject({
      status: 'completed',
      currentRoundNumber: 4,
    })
    expect(completedMatch.roundResults).toHaveLength(4)
    expect(() => advanceMatch(completedMatch, factory)).toThrowError('cannot advance to a fifth round')
    expect(factory).toHaveBeenCalledTimes(4)
  })
})
