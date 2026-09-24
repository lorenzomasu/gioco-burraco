import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import { dealInitialState } from '../game/engine/startGame'
import type { MatchState, SettledRoundResult } from '../game/match'
import type { CompletedGameState } from '../game/state/types'

const mocks = vi.hoisted(() => ({
  getFinalMatchOutcome: vi.fn(),
}))

vi.mock('../game/match', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../game/match')>()
  return { ...actual, getFinalMatchOutcome: mocks.getFinalMatchOutcome }
})

import { GameTable } from './GameTable'

const settledResult = (
  roundNumber: 1 | 2 | 3 | 4,
  team1Total: number,
  team2Total: number,
): SettledRoundResult => ({
  roundNumber,
  ending: 'draw-pile-exhausted',
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

const completedRound = (): CompletedGameState => {
  const initial = dealInitialState(createBurracoDeck())
  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: [] })),
    teams: initial.teams.map((team) => ({ ...team, melds: [], hasTakenPozzetto: false })),
    drawPile: [],
    discardPile: [],
    pozzetti: [[], []],
    round: { status: 'completed', ending: 'draw-pile-exhausted', lastDiscardPlayerId: 'player-2' },
  }
}

describe('GameTable match-outcome authority', () => {
  beforeEach(() => {
    mocks.getFinalMatchOutcome.mockReset()
  })

  it('renders final Match Points, VP and leader exactly as returned by the match domain', () => {
    const initialMatch: MatchState = {
      status: 'completed',
      currentRoundNumber: 4,
      currentRound: completedRound(),
      roundResults: [
        settledResult(1, 75, 0),
        settledResult(2, 75, 0),
        settledResult(3, 75, 0),
        settledResult(4, 75, 0),
      ],
    }
    mocks.getFinalMatchOutcome.mockReturnValue({
      cumulativeScores: [
        { teamId: 'team-1', total: -999 },
        { teamId: 'team-2', total: 999 },
      ],
      matchPoints: 4321,
      leadingTeamId: 'team-2',
      victoryPoints: [
        { teamId: 'team-1', victoryPoints: 3 },
        { teamId: 'team-2', victoryPoints: 17 },
      ],
    })

    render(<GameTable initialMatch={initialMatch} />)

    const cumulativeScores = screen.getByLabelText('Punti cumulativi')
    expect(within(cumulativeScores).getByText('300')).toBeInTheDocument()
    expect(within(cumulativeScores).getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Match Points')).toHaveTextContent('4321')
    const victoryPoints = screen.getByLabelText('Victory Points')
    expect(within(victoryPoints).getByText('3 VP')).toBeInTheDocument()
    expect(within(victoryPoints).getByText('17 VP')).toBeInTheDocument()
    expect(screen.getByText('Prima la Squadra 2.')).toBeInTheDocument()
    expect(mocks.getFinalMatchOutcome).toHaveBeenCalledOnce()
    expect(mocks.getFinalMatchOutcome).toHaveBeenCalledWith(initialMatch)
  })
})
