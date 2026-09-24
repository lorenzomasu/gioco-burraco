import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { createSeededRandom } from '../cards/shuffle'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { dealInitialState, getPlayer, startGame } from '../engine/startGame'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TurnPhase } from '../state/types'
import {
  BotAutomationError,
  INITIAL_BOT_CHAIN_PROGRESS,
  playBotStep,
  playBotsUntilHumanTurnWithTrace,
  playBotTurn,
  playBotTurnWithTrace,
  playNextBotChainStep,
  type BotPublicActionEvent,
  type BotRunLimits,
  type BotStepAction,
} from './playBotTurn'

const deck = createBurracoDeck()

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card => {
  const found = deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )
  if (!found) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return found
}

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const playableDrawPile = (): readonly Card[] => [
  card('king', 'clubs', 2), card('queen', 'diamonds', 2), card('jack', 'hearts', 2),
]

const defaultPozzetti = (): readonly [Pozzetto, Pozzetto] => [[
  card('ace', 'clubs'), card('three', 'diamonds'), card('five', 'hearts'),
  card('seven', 'spades'), card('nine', 'clubs'), card('jack', 'diamonds'),
  card('king', 'hearts'), card('four', 'spades'), card('six', 'clubs'),
  card('eight', 'diamonds'), card('queen', 'spades'),
], [card('ace', 'diamonds')]]

const stateFor = ({
  playerId = 'player-2',
  hand,
  phase = 'action',
  drawPile = playableDrawPile(),
  discardPile = [],
  melds = [],
  hasTakenPozzetto = false,
  pozzetti = defaultPozzetti(),
}: {
  playerId?: PlayerId
  hand: readonly Card[]
  phase?: TurnPhase
  drawPile?: readonly Card[]
  discardPile?: readonly Card[]
  melds?: readonly ValidatedMeld[]
  hasTakenPozzetto?: boolean
  pozzetti?: readonly [Pozzetto, Pozzetto]
}): InProgressGameState => {
  const initial = dealInitialState(deck)
  const teamId = getPlayer(initial, playerId).teamId
  return {
    ...initial,
    players: initial.players.map((player) => ({
      ...player,
      hand: player.id === playerId ? hand : [],
    })),
    teams: initial.teams.map((team) => ({
      ...team,
      melds: team.id === teamId ? melds : [],
      hasTakenPozzetto: team.id === teamId ? hasTakenPozzetto : false,
    })),
    drawPile,
    discardPile,
    pozzetti,
    round: {
      status: 'in-progress',
      turn: phase === 'mustDraw'
        ? { currentPlayerId: playerId, phase }
        : {
            currentPlayerId: playerId,
            phase,
            acquisition: { source: 'drawPile', cardIds: [] },
          },
    },
  }
}

const teamOf = (state: GameState, playerId: PlayerId) =>
  state.teams.find((team) => team.id === getPlayer(state, playerId).teamId)!

const currentTurn = (state: GameState) => {
  if (state.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
  return state.round.turn
}

/** Loops the one-step API through exactly one bot turn. */
const stepThroughTurn = (state: GameState, playerId: PlayerId) => {
  let current = state
  const events: BotPublicActionEvent[] = []
  const actions: BotStepAction[] = []
  do {
    const step = playBotStep(current, playerId)
    current = step.state
    events.push(...step.events)
    actions.push(step.action)
  } while (current.round.status === 'in-progress' && current.round.turn.currentPlayerId === playerId)
  return { state: current, events, actions }
}

/** Loops the guarded chain-step API until control returns to the human. */
const stepThroughChain = (state: GameState, humanPlayerId: PlayerId, limits: BotRunLimits = {}) => {
  let current = state
  let progress = INITIAL_BOT_CHAIN_PROGRESS
  const events: BotPublicActionEvent[] = []
  const actions: BotStepAction[] = []
  for (;;) {
    const step = playNextBotChainStep(current, humanPlayerId, progress, limits)
    if (!step) break
    current = step.state
    progress = step.progress
    events.push(...step.events)
    actions.push(step.action)
  }
  return { state: current, events, actions }
}

const threeBotState = (): InProgressGameState => {
  const base = stateFor({
    hand: [card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'), card('four', 'spades')],
    phase: 'mustDraw',
    drawPile: [card('king', 'clubs'), card('queen', 'diamonds'), card('jack', 'hearts'), ...playableDrawPile()],
  })
  return {
    ...base,
    players: base.players.map((player) => {
      if (player.id === 'player-1') return { ...player, hand: [card('ace', 'spades'), card('two', 'hearts')] }
      if (player.id === 'player-3') return { ...player, hand: [card('five', 'clubs'), card('six', 'hearts')] }
      if (player.id === 'player-4') return { ...player, hand: [card('seven', 'clubs'), card('eight', 'hearts')] }
      return player
    }),
  }
}

describe('one-step bot execution', () => {
  it('advances a must-draw bot by exactly one stock acquisition and stops in the action phase', () => {
    const drawn = card('ace', 'spades')
    const state = stateFor({
      hand: [card('three', 'clubs'), card('six', 'hearts')],
      phase: 'mustDraw',
      drawPile: [drawn, ...playableDrawPile()],
    })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('acquire')
    expect(step.events).toEqual([{ type: 'draw-stock', playerId: 'player-2' }])
    expect(JSON.stringify(step.events)).not.toContain(drawn.id)
    expect(currentTurn(step.state)).toMatchObject({ currentPlayerId: 'player-2', phase: 'action' })
    expect(getPlayer(step.state, 'player-2').hand).toHaveLength(3)
    expect(step.state.discardPile).toEqual([])
    expect(teamOf(step.state, 'player-2').melds).toEqual([])
  })

  it('advances by exactly one discard-pile collection without also melding', () => {
    const collected = card('queen', 'hearts')
    const state = stateFor({
      hand: [card('queen', 'clubs'), card('queen', 'diamonds'), card('five', 'spades')],
      phase: 'mustDraw',
      discardPile: [collected],
    })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('acquire')
    expect(step.events).toEqual([{ type: 'collect-discard-pile', playerId: 'player-2', cardCount: 1 }])
    expect(currentTurn(step.state)).toMatchObject({ currentPlayerId: 'player-2', phase: 'action' })
    expect(getPlayer(step.state, 'player-2').hand).toContain(collected)
    expect(teamOf(step.state, 'player-2').melds).toEqual([])
  })

  it('commits exactly the selected meld and does not also discard', () => {
    const meldCards = [card('nine', 'clubs', 2), card('nine', 'diamonds'), card('nine', 'hearts')]
    const state = stateFor({
      hand: [...meldCards, card('four', 'spades'), card('king', 'spades')],
      hasTakenPozzetto: true,
    })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('meld')
    expect(step.events).toHaveLength(1)
    expect(step.events[0]).toMatchObject({ type: 'play-meld', playerId: 'player-2', meldIndex: 0 })
    expect(teamOf(step.state, 'player-2').melds).toHaveLength(1)
    expect(step.state.discardPile).toEqual([])
    expect(currentTurn(step.state)).toMatchObject({ currentPlayerId: 'player-2', phase: 'action' })
  })

  it('commits exactly one extension', () => {
    const first = validatedMeld([card('five', 'clubs'), card('five', 'diamonds'), card('five', 'hearts')])
    const second = validatedMeld([card('eight', 'clubs'), card('eight', 'diamonds'), card('eight', 'hearts')])
    const state = stateFor({
      hand: [card('five', 'spades'), card('eight', 'spades'), card('king', 'spades')],
      melds: [first, second],
    })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('extend')
    expect(step.events).toHaveLength(1)
    expect(step.events[0]?.type).toBe('extend-meld')
    expect(getPlayer(step.state, 'player-2').hand).toHaveLength(2)
    expect(teamOf(step.state, 'player-2').melds.map(({ cards }) => cards.length).sort()).toEqual([3, 4])
    expect(currentTurn(step.state)).toMatchObject({ currentPlayerId: 'player-2', phase: 'action' })
  })

  it('advances the turn exactly once with a discard', () => {
    const state = stateFor({ hand: [card('king', 'spades'), card('four', 'hearts')] })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('discard')
    expect(step.events).toEqual([{ type: 'discard', playerId: 'player-2', card: step.state.discardPile.at(-1) }])
    expect(step.state.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: 'player-3', phase: 'mustDraw' },
    })
    expect(getPlayer(step.state, 'player-3').hand).toEqual([])
  })

  it('pairs an al-volo pozzetto acquisition with its triggering meld step', () => {
    const pozzettoCards = defaultPozzetti()[0]
    const state = stateFor({ hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')] })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('meld')
    expect(step.events.map(({ type }) => type)).toEqual(['play-meld', 'take-pozzetto'])
    expect(step.events[1]).toEqual({ type: 'take-pozzetto', playerId: 'player-2', mode: 'flight' })
    expect(teamOf(step.state, 'player-2').hasTakenPozzetto).toBe(true)
    expect(currentTurn(step.state)).toMatchObject({ currentPlayerId: 'player-2', phase: 'action' })
    for (const hidden of pozzettoCards) expect(JSON.stringify(step.events)).not.toContain(hidden.id)
  })

  it('pairs a con-lo-scarto pozzetto acquisition with its triggering discard step', () => {
    const discarded = card('king', 'spades')
    const state = stateFor({ hand: [discarded] })

    const step = playBotStep(state, 'player-2')

    expect(step.action).toBe('discard')
    expect(step.events).toEqual([
      { type: 'discard', playerId: 'player-2', card: discarded },
      { type: 'take-pozzetto', playerId: 'player-2', mode: 'discard' },
    ])
    expect(currentTurn(step.state).currentPlayerId).toBe('player-3')
  })

  it('returns the terminal discard event together with the completed state', () => {
    const burraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const discarded = card('king', 'spades')
    const state = stateFor({ hand: [discarded], melds: [burraco], hasTakenPozzetto: true })

    const step = playBotStep(state, 'player-2')

    expect(step.events).toEqual([{ type: 'discard', playerId: 'player-2', card: discarded }])
    expect(step.state.round).toMatchObject({ status: 'completed', ending: 'closure' })
  })

  it('is deterministic, preserves its input, and refuses to operate another player', () => {
    const state = stateFor({ hand: [card('king', 'spades'), card('four', 'hearts')], phase: 'mustDraw' })
    const before = structuredClone(state)

    expect(playBotStep(state, 'player-2')).toEqual(playBotStep(state, 'player-2'))
    expect(state).toEqual(before)
    expect(Object.keys(playBotStep(state, 'player-2').state).sort()).toEqual(Object.keys(state).sort())
    expect(() => playBotStep(state, 'player-3')).toThrowError(BotAutomationError)
  })
})

describe('stepwise and full execution equivalence', () => {
  it('matches playBotTurnWithTrace for a turn with multiple action-phase moves', () => {
    const first = validatedMeld([card('five', 'clubs'), card('five', 'diamonds'), card('five', 'hearts')])
    const second = validatedMeld([card('eight', 'clubs'), card('eight', 'diamonds'), card('eight', 'hearts')])
    const state = stateFor({
      hand: [card('five', 'spades'), card('eight', 'spades'), card('king', 'spades')],
      phase: 'mustDraw',
      drawPile: [card('four', 'hearts'), ...playableDrawPile()],
      melds: [first, second],
    })

    const stepped = stepThroughTurn(state, 'player-2')
    const traced = playBotTurnWithTrace(state, 'player-2')

    expect(stepped.actions).toEqual(['acquire', 'extend', 'extend', 'discard'])
    expect(stepped.state).toEqual(traced.state)
    expect(stepped.events).toEqual(traced.events)
    expect(stepped.state).toEqual(playBotTurn(state, 'player-2'))
  })

  it('matches playBotTurnWithTrace when the turn takes the pozzetto al volo', () => {
    const state = stateFor({ hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')] })

    const stepped = stepThroughTurn(state, 'player-2')
    const traced = playBotTurnWithTrace(state, 'player-2')

    expect(stepped.actions[0]).toBe('meld')
    expect(stepped.actions.at(-1)).toBe('discard')
    expect(stepped.events.slice(0, 2).map(({ type }) => type)).toEqual(['play-meld', 'take-pozzetto'])
    expect(stepped.state).toEqual(traced.state)
    expect(stepped.events).toEqual(traced.events)
  })

  it('matches playBotsUntilHumanTurnWithTrace across three consecutive bots', () => {
    const state = threeBotState()

    const chained = stepThroughChain(state, 'player-1')
    const rawSteps = [
      stepThroughTurn(state, 'player-2'),
    ]
    rawSteps.push(stepThroughTurn(rawSteps[0]!.state, 'player-3'))
    rawSteps.push(stepThroughTurn(rawSteps[1]!.state, 'player-4'))
    const traced = playBotsUntilHumanTurnWithTrace(state, 'player-1')

    expect(chained.actions.slice(0, 3)).toEqual(['acquire', 'meld', 'discard'])
    expect(chained.events.filter(({ type }) => type === 'draw-stock').map(({ playerId }) => playerId))
      .toEqual(['player-2', 'player-3', 'player-4'])
    expect(chained.state).toEqual(traced.state)
    expect(chained.events).toEqual(traced.events)
    expect(rawSteps[2]!.state).toEqual(traced.state)
    expect(rawSteps.flatMap(({ events }) => events)).toEqual(traced.events)
    expect(currentTurn(chained.state)).toEqual({ currentPlayerId: 'player-1', phase: 'mustDraw' })
  })

  it('matches the full chain when a bot completes the round', () => {
    const burraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const state = stateFor({ hand: [card('king', 'spades')], melds: [burraco], hasTakenPozzetto: true })

    const chained = stepThroughChain(state, 'player-1')
    const traced = playBotsUntilHumanTurnWithTrace(state, 'player-1')

    expect(chained.state).toEqual(traced.state)
    expect(chained.events).toEqual(traced.events)
    expect(chained.events.at(-1)?.type).toBe('discard')
    expect(playNextBotChainStep(chained.state, 'player-1', INITIAL_BOT_CHAIN_PROGRESS)).toBeNull()
  })

  it.each([1, 7, 42, 125, 200])('matches the full chain and single turns for dealt seed %i', (seed) => {
    const dealt = startGame(createSeededRandom(seed))
    const humanPlayerId = dealt.round.status === 'in-progress' ? dealt.round.turn.currentPlayerId : 'player-1'
    const afterHuman = playBotTurn(dealt, humanPlayerId)
    if (afterHuman.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
    const firstBot = afterHuman.round.turn.currentPlayerId

    const chained = stepThroughChain(afterHuman, humanPlayerId)
    const traced = playBotsUntilHumanTurnWithTrace(afterHuman, humanPlayerId)
    const singleTurn = stepThroughTurn(afterHuman, firstBot)

    expect(chained.state).toEqual(traced.state)
    expect(chained.events).toEqual(traced.events)
    expect(singleTurn.state).toEqual(playBotTurnWithTrace(afterHuman, firstBot).state)
    expect(singleTurn.events).toEqual(playBotTurnWithTrace(afterHuman, firstBot).events)
  })

  it('returns no chain step when control belongs to the human', () => {
    const state = stateFor({ playerId: 'player-1', hand: [card('king', 'spades')] })

    expect(playNextBotChainStep(state, 'player-1')).toBeNull()
  })
})

describe('stepwise safety limits', () => {
  it('applies the same per-turn action limit as the full-turn and full-chain APIs', () => {
    const state = stateFor({ hand: [card('king', 'spades')] })
    const limits = { maxActionsPerTurn: 0 }

    expect(() => playNextBotChainStep(state, 'player-1', INITIAL_BOT_CHAIN_PROGRESS, limits))
      .toThrowError('exceeded the 0-action safety limit')
    expect(() => playBotsUntilHumanTurnWithTrace(state, 'player-1', limits))
      .toThrowError('exceeded the 0-action safety limit')
  })

  it('counts action-phase moves across steps of the same turn', () => {
    const first = validatedMeld([card('five', 'clubs'), card('five', 'diamonds'), card('five', 'hearts')])
    const second = validatedMeld([card('eight', 'clubs'), card('eight', 'diamonds'), card('eight', 'hearts')])
    const state = stateFor({
      hand: [card('five', 'spades'), card('eight', 'spades'), card('king', 'spades')],
      phase: 'mustDraw',
      drawPile: [card('four', 'hearts'), ...playableDrawPile()],
      melds: [first, second],
    })
    const limits = { maxActionsPerTurn: 1 }

    expect(() => stepThroughChain(state, 'player-1', limits)).toThrowError('exceeded the 1-action safety limit')
    expect(() => playBotTurnWithTrace(state, 'player-2', limits)).toThrowError('exceeded the 1-action safety limit')
  })

  it('applies the same bot-turn limit as the full-chain API', () => {
    const state = threeBotState()
    const limits = { maxBotTurns: 2 }

    expect(() => stepThroughChain(state, 'player-1', limits)).toThrowError('exceeded the 2-turn safety limit')
    expect(() => playBotsUntilHumanTurnWithTrace(state, 'player-1', limits))
      .toThrowError('exceeded the 2-turn safety limit')
    expect(() => playNextBotChainStep(state, 'player-1', INITIAL_BOT_CHAIN_PROGRESS, { maxBotTurns: 0 }))
      .toThrowError(BotAutomationError)
  })
})
