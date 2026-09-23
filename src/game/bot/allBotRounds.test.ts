import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../cards/shuffle'
import { startGame } from '../engine/startGame'
import type { GameState } from '../state/types'
import { playBotTurn } from './playBotTurn'

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1)
/** Seed whose all-bot round cycled through the discard pile forever before draw-pile exhaustion. */
const PREVIOUSLY_ENDLESS_SEED = 125
const MAX_TURNS_PER_ROUND = 200
const SIMULATION_TIMEOUT_MS = 60_000

const playAllBotRound = (seed: number): Readonly<{ state: GameState; turns: number }> => {
  let state: GameState = startGame(createSeededRandom(seed))
  let turns = 0
  while (state.round.status === 'in-progress' && turns < MAX_TURNS_PER_ROUND) {
    state = playBotTurn(state, state.round.turn.currentPlayerId)
    turns += 1
  }
  return { state, turns }
}

describe('all-bot rounds', () => {
  it('ends the previously endless seed through draw-pile exhaustion', () => {
    const { state } = playAllBotRound(PREVIOUSLY_ENDLESS_SEED)

    expect(state.round).toMatchObject({ status: 'completed', ending: 'draw-pile-exhausted' })
  })

  it(`completes every seeded round within ${MAX_TURNS_PER_ROUND} turns`, () => {
    expect(SEEDS).toContain(PREVIOUSLY_ENDLESS_SEED)

    const unfinishedSeeds = SEEDS.filter((seed) => playAllBotRound(seed).state.round.status !== 'completed')

    expect(unfinishedSeeds).toEqual([])
  }, SIMULATION_TIMEOUT_MS)
})
