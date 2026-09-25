import { describe, expect, it } from 'vitest'
import { playNextBotChainStep } from '../game/bot'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import { extendMeld } from '../game/engine/extendMeld'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { InProgressGameState } from '../game/state/types'
import { botStepFeedback, changedBurracoMelds, humanActionFeedback, type TableFeedback } from './tableFeedback'
import { motionAnchor, planMotion, prefersReducedMotion } from './tableMotion'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) => candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber)!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const actionState = (hand: readonly Card[], teamOneMelds: readonly ValidatedMeld[] = []): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, hand } : player),
    teams: initial.teams.map((team) => team.id === 'team-1' ? { ...team, melds: teamOneMelds } : team),
    round: {
      status: 'in-progress',
      turn: { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

const base: TableFeedback = {
  sequence: 1,
  cycle: 'a',
  action: null,
  cardCount: 0,
  receivedCardIds: [],
  actorId: null,
  turnChange: null,
  pozzettoTeamIds: [],
  burracoMelds: [],
}

describe('planMotion', () => {
  it('plans nothing without a committed cue', () => {
    expect(planMotion(null)).toEqual([])
    expect(planMotion(base)).toEqual([])
  })

  it('flies each human action from its source to its exact destination', () => {
    expect(planMotion({ ...base, action: { type: 'draw-stock' }, cardCount: 1, receivedCardIds: ['c'] })).toEqual([
      { source: { kind: 'stock' }, destination: { kind: 'received-card' }, face: 'back', count: 1 },
    ])
    expect(planMotion({ ...base, action: { type: 'collect-discard-pile' }, cardCount: 5 })).toEqual([
      { source: { kind: 'discard' }, destination: { kind: 'hand' }, face: 'blank', count: 5 },
    ])
    expect(planMotion({ ...base, action: { type: 'discard' }, cardCount: 1 })).toEqual([
      { source: { kind: 'hand-selection' }, destination: { kind: 'discard' }, face: 'blank', count: 1 },
    ])
    expect(planMotion({ ...base, action: { type: 'play-meld', teamId: 'team-1', meldIndex: 2 }, cardCount: 3 })).toEqual([
      { source: { kind: 'hand-selection' }, destination: { kind: 'meld', teamId: 'team-1', meldIndex: 2 }, face: 'blank', count: 3 },
    ])
    expect(planMotion({ ...base, action: { type: 'extend-meld', teamId: 'team-1', meldIndex: 0 }, cardCount: 1 })[0])
      .toMatchObject({ destination: { kind: 'meld', teamId: 'team-1', meldIndex: 0 } })
  })

  it('ties bot flights to the acting seat and keeps hidden sources face down', () => {
    const bot = { ...base, actorId: 'player-2' as const }
    expect(planMotion({ ...bot, action: { type: 'draw-stock' }, cardCount: 1 })).toEqual([
      { source: { kind: 'stock' }, destination: { kind: 'seat', playerId: 'player-2' }, face: 'back', count: 1 },
    ])
    expect(planMotion({ ...bot, action: { type: 'discard' }, cardCount: 1 })[0])
      .toMatchObject({ source: { kind: 'seat', playerId: 'player-2' }, destination: { kind: 'discard' } })
    expect(planMotion({ ...bot, action: { type: 'extend-meld', teamId: 'team-2', meldIndex: 1 }, cardCount: 2 })[0])
      .toMatchObject({ source: { kind: 'seat', playerId: 'player-2' }, destination: { kind: 'meld', teamId: 'team-2', meldIndex: 1 } })
  })

  it('adds a face-down pozzetto flight to whoever took it, without any count or content', () => {
    const flights = planMotion({
      ...base,
      actorId: 'player-2',
      action: { type: 'play-meld', teamId: 'team-2', meldIndex: 0 },
      cardCount: 3,
      pozzettoTeamIds: ['team-2'],
    })
    expect(flights[1]).toEqual({
      source: { kind: 'pozzetti' },
      destination: { kind: 'seat', playerId: 'player-2' },
      face: 'back',
      count: 0,
    })
    expect(planMotion({ ...base, pozzettoTeamIds: ['team-1'] })[0]!.destination).toEqual({ kind: 'hand' })
  })

  it('addresses only public anchors', () => {
    expect(motionAnchor({ kind: 'seat', playerId: 'player-3' })).toBe('seat-player-3')
    expect(motionAnchor({ kind: 'meld', teamId: 'team-2', meldIndex: 4 })).toBe('meld-team-2-4')
    expect(motionAnchor({ kind: 'stock' })).toBe('stock')
  })

  it('reads the reduced-motion preference safely', () => {
    expect(prefersReducedMotion(null)).toBe(false)
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) } as unknown as Window)).toBe(true)
    expect(prefersReducedMotion({ matchMedia: () => { throw new Error('x') } } as unknown as Window)).toBe(false)
  })
})

describe('motion metadata of committed cues', () => {
  it('never carries a hidden card identity for a bot stock draw', () => {
    const initial = dealInitialState(deck)
    const state: InProgressGameState = {
      ...initial,
      discardPile: [],
      round: { status: 'in-progress', turn: { currentPlayerId: 'player-2', phase: 'mustDraw' } },
    }
    const step = playNextBotChainStep(state, 'player-1')!
    expect(step.events[0]!.type).toBe('draw-stock')
    const feedback = botStepFeedback(state, step.state, step.events, null)
    const serialized = JSON.stringify([feedback, planMotion(feedback)])
    const hidden = [...state.drawPile, ...step.state.players.filter(({ id }) => id !== 'player-1').flatMap(({ hand }) => hand), ...state.pozzetti.flat()]
    expect(hidden.filter(({ id }) => serialized.includes(id))).toEqual([])
    expect(feedback.cardCount).toBe(1)
    expect(feedback.receivedCardIds).toEqual([])
  })

  it('counts the whole collected pile and the cards added to a meld', () => {
    const existing = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const before = actionState([card('seven', 'spades'), card('seven', 'clubs', 2), card('king', 'spades')], [existing])
    const after = extendMeld(before, 'player-1', 0, [card('seven', 'spades').id, card('seven', 'clubs', 2).id])
    const feedback = humanActionFeedback(before, after, { type: 'extend-meld', teamId: 'team-1', meldIndex: 0 }, null)
    expect(feedback.cardCount).toBe(2)
    expect(feedback.sequence).toBe(1)
    expect(humanActionFeedback(before, after, { type: 'extend-meld', teamId: 'team-1', meldIndex: 0 }, feedback).sequence).toBe(2)
  })
})

describe('changedBurracoMelds', () => {
  const run = (suit: Suit, ranks: readonly Rank[]) => ranks.map((rank) => card(rank, suit))
  const six: readonly Rank[] = ['three', 'four', 'five', 'six', 'seven', 'eight']

  it('reports a meld that newly reaches a Burraco and not an unchanged one', () => {
    const before = actionState([card('nine', 'clubs')], [validatedMeld(run('clubs', six)), validatedMeld(run('spades', [...six, 'nine']))])
    const after = extendMeld(before, 'player-1', 0, [card('nine', 'clubs').id])
    expect(changedBurracoMelds(before, after)).toEqual([{ teamId: 'team-1', meldIndex: 0 }])
  })

  it('reports a changed classification and ignores melds that are not Burraco', () => {
    const dirty = validatedMeld([...run('hearts', six), card('two', 'diamonds')])
    const clean = validatedMeld(run('hearts', [...six, 'nine']))
    const plain = validatedMeld(run('clubs', ['three', 'four', 'five']))
    const before = actionState([], [clean, plain])
    const after = actionState([], [dirty, plain])
    expect(changedBurracoMelds(before, after)).toEqual([{ teamId: 'team-1', meldIndex: 0 }])
    expect(changedBurracoMelds(after, after)).toEqual([])
  })
})
