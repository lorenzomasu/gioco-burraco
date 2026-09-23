import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { dealInitialState } from '../engine/startGame'
import type { CompletedGameState } from '../state/types'

const mocks = vi.hoisted(() => ({
  calculateRoundScore: vi.fn(),
}))

vi.mock('../scoring', () => ({
  calculateRoundScore: mocks.calculateRoundScore,
}))

import { settleCompletedRound, startMatch } from './lifecycle'

describe('round settlement scoring authority', () => {
  beforeEach(() => {
    mocks.calculateRoundScore.mockReset()
  })

  it('records exactly the RoundScore snapshot returned by calculateRoundScore', () => {
    const expectedScore = {
      teams: [
        {
          teamId: 'team-1' as const,
          meldCardPoints: 10,
          burracoBonus: 20,
          closingBonus: 30,
          handPenalty: 40,
          pozzettoPenalty: 50,
          total: -30,
        },
        {
          teamId: 'team-2' as const,
          meldCardPoints: 60,
          burracoBonus: 70,
          closingBonus: 80,
          handPenalty: 90,
          pozzettoPenalty: 100,
          total: 20,
        },
      ],
    }
    mocks.calculateRoundScore.mockReturnValue(expectedScore)
    const active = dealInitialState(createBurracoDeck())
    const completed: CompletedGameState = {
      ...active,
      round: {
        status: 'completed',
        ending: 'closure',
        closedByPlayerId: 'player-1',
        closingTeamId: 'team-1',
      },
    }
    const started = startMatch(() => active)
    const match = { ...started, currentRound: completed }

    const settled = settleCompletedRound(match)
    const settledAgain = settleCompletedRound(settled)

    expect(mocks.calculateRoundScore).toHaveBeenCalledOnce()
    expect(mocks.calculateRoundScore).toHaveBeenCalledWith(completed)
    expect(settled.roundResults[0]!.score).toBe(expectedScore)
    expect(settledAgain).toBe(settled)
  })
})
