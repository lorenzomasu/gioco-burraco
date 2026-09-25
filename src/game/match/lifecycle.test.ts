import { describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { createSeededRandom } from '../cards/shuffle'
import { dealInitialState } from '../engine/startGame'
import type { CompletedRoundState, GameState } from '../state/types'
import {
  advanceMatch,
  calculateCumulativeScores,
  createMatchRound,
  createMatchRoundFactory,
  getFinalMatchOutcome,
  getRoundStartingPlayerId,
  isFinalRound,
  MatchLifecycleError,
  settleCompletedRound,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
} from './lifecycle'
import {
  DEFAULT_MATCH_ROUND_COUNT,
  isMatchRoundCount,
  MATCH_ROUND_COUNTS,
  type MatchRoundCount,
  type MatchState,
  type RoundFactory,
  type SettledRoundResult,
} from './types'

const deck = createBurracoDeck()
const freshRound = () => dealInitialState(deck)
/** Honors the requested starter through the engine setup API, as the default factory does. */
const contextAwareRound: RoundFactory = ({ startingPlayerId }) => dealInitialState(deck, { startingPlayerId })

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
      roundCount: 4,
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
      roundCount: 4,
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
      roundCount: 4,
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
    expect(() => advanceMatch(completedMatch, factory)).toThrowError('beyond its configured final round')
    expect(factory).toHaveBeenCalledTimes(4)
  })
})

describe('round starter rotation', () => {
  const completeAndAdvance = (match: MatchState, factory: RoundFactory): MatchState =>
    advanceMatch(updateCurrentRound(match, completedRound(match.currentRound)), factory)

  it('maps smazzate 1–4 to player-1…player-4 in table order', () => {
    expect(([1, 2, 3, 4] as const).map(getRoundStartingPlayerId))
      .toEqual(['player-1', 'player-2', 'player-3', 'player-4'])
  })

  it('requests and creates round 1 with starter player-1', () => {
    const factory = vi.fn(contextAwareRound)
    const match = startMatch(factory)

    expect(factory).toHaveBeenCalledOnce()
    expect(factory).toHaveBeenCalledWith({ roundNumber: 1, startingPlayerId: 'player-1' })
    expect(match.currentRound.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: 'player-1', phase: 'mustDraw' },
    })
  })

  it('requests each starter exactly once and in order across the 1→2→3→4 lifecycle', () => {
    const factory = vi.fn(contextAwareRound)
    let match = startMatch(factory)
    const starters = [match.currentRound.round]

    for (let roundNumber = 2; roundNumber <= 4; roundNumber += 1) {
      match = completeAndAdvance(match, factory)
      starters.push(match.currentRound.round)
    }

    expect(factory.mock.calls).toEqual([
      [{ roundNumber: 1, startingPlayerId: 'player-1' }],
      [{ roundNumber: 2, startingPlayerId: 'player-2' }],
      [{ roundNumber: 3, startingPlayerId: 'player-3' }],
      [{ roundNumber: 4, startingPlayerId: 'player-4' }],
    ])
    expect(starters).toEqual((['player-1', 'player-2', 'player-3', 'player-4'] as const).map((currentPlayerId) => ({
      status: 'in-progress',
      turn: { currentPlayerId, phase: 'mustDraw' },
    })))
    expect(Object.keys(match).sort()).toEqual(['currentRound', 'currentRoundNumber', 'roundCount', 'roundResults', 'status'])
  })

  it('does not call the factory or skip a starter when a transition is rejected', () => {
    const factory = vi.fn(contextAwareRound)
    const started = startMatch(factory)
    factory.mockClear()

    expect(() => advanceMatch(started, factory)).toThrowError('cannot advance')
    const unsettled = { ...started, currentRound: completedRound(started.currentRound) }
    expect(() => advanceMatch(unsettled, factory)).toThrowError('must be settled')
    expect(factory).not.toHaveBeenCalled()

    const second = advanceMatch(settleCompletedRound(unsettled), factory)
    expect(factory.mock.calls).toEqual([[{ roundNumber: 2, startingPlayerId: 'player-2' }]])
    expect(second.currentRound.round).toMatchObject({ turn: { currentPlayerId: 'player-2' } })

    const completedSecond = updateCurrentRound(second, completedRound(second.currentRound))
    const third = advanceMatch(completedSecond, factory)
    expect(factory.mock.calls.at(-1)).toEqual([{ roundNumber: 3, startingPlayerId: 'player-3' }])
    expect(third.currentRound.round).toMatchObject({ turn: { currentPlayerId: 'player-3' } })

    const fourth = completeAndAdvance(third, factory)
    const completedMatch = updateCurrentRound(fourth, completedRound(fourth.currentRound))
    expect(() => advanceMatch(completedMatch, factory)).toThrowError('beyond its configured final round')
    expect(factory).toHaveBeenCalledTimes(3)
  })

  it('restarts the schedule at player-1 for a fresh second match', () => {
    const factory = vi.fn(contextAwareRound)
    let first = startMatch(factory)
    first = completeAndAdvance(first, factory)
    first = completeAndAdvance(first, factory)
    expect(first.currentRound.round).toMatchObject({ turn: { currentPlayerId: 'player-3' } })
    factory.mockClear()

    const second = startMatch(factory)

    expect(factory.mock.calls).toEqual([[{ roundNumber: 1, startingPlayerId: 'player-1' }]])
    expect(second).toMatchObject({
      status: 'in-progress',
      currentRoundNumber: 1,
      roundResults: [],
      currentRound: { round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } } },
    })
  })

  it('leaves settled history and cumulative totals unaffected by the starter', () => {
    const run = (factory: RoundFactory) => {
      let match = startMatch(factory)
      for (let roundNumber = 2; roundNumber <= 4; roundNumber += 1) match = completeAndAdvance(match, factory)
      return updateCurrentRound(match, completedRound(match.currentRound, 'draw-pile-exhausted'))
    }
    const rotated = run(contextAwareRound)
    const fixedStarter = run(freshRound)

    expect(rotated.roundResults).toEqual(fixedStarter.roundResults)
    expect(calculateCumulativeScores(rotated)).toEqual(calculateCumulativeScores(fixedStarter))
    expect(getFinalMatchOutcome(rotated)).toEqual(getFinalMatchOutcome(fixedStarter))
  })

  it('uses the scheduled starter in the default factory', () => {
    const match = startMatch()
    expect(match.currentRound.round).toMatchObject({ turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } })
    expect(createMatchRound({ roundNumber: 4, startingPlayerId: 'player-4' }).round)
      .toEqual({ status: 'in-progress', turn: { currentPlayerId: 'player-4', phase: 'mustDraw' } })
  })
})

describe('configured match round factory', () => {
  const completeAndAdvance = (match: MatchState, factory: RoundFactory): MatchState =>
    advanceMatch(updateCurrentRound(match, completedRound(match.currentRound)), factory)

  const playMatch = (factory: RoundFactory): readonly MatchState[] => {
    const matches = [startMatch(factory)]
    for (let roundNumber = 2; roundNumber <= 4; roundNumber += 1) {
      matches.push(completeAndAdvance(matches.at(-1)!, factory))
    }
    return matches
  }

  it('carries the configured human name into every round of the match with the scheduled starter', () => {
    const rounds = playMatch(createMatchRoundFactory({
      playerNames: { 'player-1': 'Lorenzo' },
      random: createSeededRandom(21),
    }))

    expect(rounds.map(({ currentRoundNumber }) => currentRoundNumber)).toEqual([1, 2, 3, 4])
    for (const [index, { currentRound }] of rounds.entries()) {
      expect(currentRound.players.map(({ id, name, teamId }) => ({ id, name, teamId }))).toEqual([
        { id: 'player-1', name: 'Lorenzo', teamId: 'team-1' },
        { id: 'player-2', name: 'North', teamId: 'team-2' },
        { id: 'player-3', name: 'Partner', teamId: 'team-1' },
        { id: 'player-4', name: 'South', teamId: 'team-2' },
      ])
      expect(currentRound.teams.map(({ id, playerIds }) => ({ id, playerIds }))).toEqual([
        { id: 'team-1', playerIds: ['player-1', 'player-3'] },
        { id: 'team-2', playerIds: ['player-2', 'player-4'] },
      ])
      expect(currentRound.round).toMatchObject({
        turn: { currentPlayerId: getRoundStartingPlayerId((index + 1) as 1 | 2 | 3 | 4), phase: 'mustDraw' },
      })
    }
  })

  it('deals exactly the same cards as an unnamed factory with the same shuffle source', () => {
    const named = playMatch(createMatchRoundFactory({
      playerNames: { 'player-1': 'Lorenzo' },
      random: createSeededRandom(21),
    }))
    const unnamed = playMatch(createMatchRoundFactory({ random: createSeededRandom(21) }))

    for (const [index, { currentRound }] of named.entries()) {
      const expected = unnamed[index]!.currentRound
      expect({
        ...currentRound,
        players: currentRound.players.map((player) => ({ ...player, name: expected.players.find(({ id }) => id === player.id)!.name })),
      }).toEqual(expected)
    }
  })
})

describe('configured match length', () => {
  const completeAndAdvance = (match: MatchState, factory: RoundFactory): MatchState =>
    advanceMatch(updateCurrentRound(match, completedRound(match.currentRound)), factory)

  it('supports exactly 2, 3 and 4 smazzate with 4 as the default', () => {
    expect(MATCH_ROUND_COUNTS).toEqual([2, 3, 4])
    expect(DEFAULT_MATCH_ROUND_COUNT).toBe(4)
    expect([1, 2, 3, 4, 5, '4', null].map(isMatchRoundCount)).toEqual([false, true, true, true, false, false, false])
    expect(startMatch(freshRound).roundCount).toBe(4)
  })

  it('rejects an unsupported length without creating a round', () => {
    const factory = vi.fn(freshRound)

    for (const invalid of [0, 1, 5, 2.5]) {
      expect(() => startMatch(factory, invalid as MatchRoundCount)).toThrowError(RangeError)
    }
    expect(factory).not.toHaveBeenCalled()
  })

  it.each(MATCH_ROUND_COUNTS)(
    'plays a %i-smazzate match to its terminal round with the starter prefix and no further round',
    (roundCount) => {
      const factory = vi.fn(contextAwareRound)
      let match = startMatch(factory, roundCount)
      const snapshots: MatchState[] = []

      expect(match).toMatchObject({ roundCount, currentRoundNumber: 1, status: 'in-progress' })
      for (let roundNumber = 2; roundNumber <= roundCount; roundNumber += 1) {
        expect(isFinalRound(match)).toBe(false)
        const settled = updateCurrentRound(match, completedRound(match.currentRound))
        expect(settled.status).toBe('in-progress')
        snapshots.push(settled)
        match = advanceMatch(settled, factory)
        expect(match).toMatchObject({ roundCount, currentRoundNumber: roundNumber })
        expect(match.roundResults).toBe(settled.roundResults)
      }

      expect(isFinalRound(match)).toBe(true)
      const completedMatch = updateCurrentRound(match, completedRound(match.currentRound, 'draw-pile-exhausted'))

      expect(completedMatch).toMatchObject({ roundCount, status: 'completed', currentRoundNumber: roundCount })
      expect(completedMatch.roundResults.map(({ roundNumber }) => roundNumber))
        .toEqual(Array.from({ length: roundCount }, (_, index) => index + 1))
      expect(settleCompletedRound(completedMatch)).toBe(completedMatch)
      expect(synchronizeMatch(completedMatch)).toBe(completedMatch)
      expect(() => updateCurrentRound(completedMatch, freshRound())).toThrowError(MatchLifecycleError)
      expect(() => advanceMatch(completedMatch, factory)).toThrowError('beyond its configured final round')
      expect(factory.mock.calls.map(([context]) => context)).toEqual(
        (['player-1', 'player-2', 'player-3', 'player-4'] as const)
          .slice(0, roundCount)
          .map((startingPlayerId, index) => ({ roundNumber: index + 1, startingPlayerId })),
      )
      // Earlier snapshots are never mutated by later transitions.
      snapshots.forEach((snapshot, index) => expect(snapshot.roundResults).toHaveLength(index + 1))
    },
  )

  it('refuses to advance a settled terminal round even if its status was not yet completed', () => {
    const factory = vi.fn(freshRound)
    const second = completeAndAdvance(startMatch(factory, 2), factory)
    const settledSecond = settleCompletedRound({ ...second, currentRound: completedRound(second.currentRound) })

    expect(() => advanceMatch({ ...settledSecond, status: 'in-progress' }, factory))
      .toThrowError('beyond its configured final round')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it.each([
    [2, [scoreResult(1, 300, -100), scoreResult(2, -200, 500)], [100, 400], 300, 'team-2', [7, 13]],
    [3, [scoreResult(1, 300, -100), scoreResult(2, -200, 500), scoreResult(3, 100, 50)], [200, 450], 250, 'team-2', [8, 12]],
  ] as const)(
    'derives cumulative totals, Match Points and VP from the %i-smazzate history and table',
    (roundCount, roundResults, totals, matchPoints, leader, victoryPoints) => {
      const match: MatchState = {
        roundCount,
        status: 'completed',
        currentRoundNumber: roundCount,
        currentRound: completedRound(freshRound()),
        roundResults,
      }

      expect(calculateCumulativeScores(match).map(({ total }) => total)).toEqual(totals)
      expect(getFinalMatchOutcome(match)).toMatchObject({
        matchPoints,
        leadingTeamId: leader,
        victoryPoints: [
          { teamId: 'team-1', victoryPoints: victoryPoints[0] },
          { teamId: 'team-2', victoryPoints: victoryPoints[1] },
        ],
      })
    },
  )
})
