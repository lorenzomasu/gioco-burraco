import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { dealInitialState, getPlayer } from '../engine/startGame'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TurnPhase } from '../state/types'
import {
  BotAutomationError,
  playBotsUntilHumanTurn,
  playBotsUntilHumanTurnWithTrace,
  playBotTurn,
  playBotTurnWithTrace,
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

const eventTypes = (events: ReturnType<typeof playBotTurnWithTrace>['events']) =>
  events.map(({ type }) => type)

describe('public bot action trace', () => {
  it('reports a stock draw without any hidden card identity or face data', () => {
    const drawn = card('ace', 'spades')
    const state = stateFor({
      hand: [card('three', 'clubs'), card('six', 'hearts')],
      phase: 'mustDraw',
      drawPile: [drawn, ...playableDrawPile()],
    })

    const traced = playBotTurnWithTrace(state, 'player-2')
    const drawEvent = traced.events[0]

    expect(drawEvent).toEqual({ type: 'draw-stock', playerId: 'player-2' })
    expect(Object.keys(drawEvent!)).toEqual(['type', 'playerId'])
    expect(JSON.stringify(drawEvent)).not.toContain(drawn.id)
    expect(JSON.stringify(drawEvent)).not.toContain(drawn.rank)
    expect(traced.state).toEqual(playBotTurn(state, 'player-2'))
  })

  it('reports one public discard-pile collection despite strategy simulation', () => {
    const collected = card('queen', 'hearts')
    const state = stateFor({
      hand: [card('queen', 'clubs'), card('queen', 'diamonds'), card('five', 'spades')],
      phase: 'mustDraw',
      discardPile: [collected],
    })

    const { events } = playBotTurnWithTrace(state, 'player-2')

    expect(events[0]).toEqual({
      type: 'collect-discard-pile',
      playerId: 'player-2',
      cardCount: 1,
    })
    expect(events.filter(({ type }) => type === 'collect-discard-pile')).toHaveLength(1)
    expect(events.filter(({ type }) => type === 'play-meld')).toHaveLength(1)
    expect(JSON.stringify(events[0])).not.toContain(collected.id)
  })

  it('emits acquisition, meld, and discard in committed order with exact physical cards', () => {
    const physicalCopy = card('nine', 'clubs', 2)
    const meldCards = [physicalCopy, card('nine', 'diamonds'), card('nine', 'hearts')]
    const state = stateFor({
      hand: [...meldCards, card('four', 'spades')],
      phase: 'mustDraw',
      drawPile: [card('ace', 'clubs'), ...playableDrawPile()],
    })

    const { events } = playBotTurnWithTrace(state, 'player-2')
    const meldEvent = events.find(({ type }) => type === 'play-meld')

    expect(eventTypes(events)).toEqual(['draw-stock', 'play-meld', 'discard'])
    expect(meldEvent).toMatchObject({ type: 'play-meld', playerId: 'player-2', meldIndex: 0 })
    if (meldEvent?.type !== 'play-meld') throw new Error('Expected meld event')
    expect(meldEvent.cards.map(({ id }) => id).sort()).toEqual(meldCards.map(({ id }) => id).sort())
    expect(meldEvent.cards).toContain(physicalCopy)
    expect(meldEvent.cards).not.toContain(card('nine', 'clubs', 1))
  })

  it('reports only the newly added physical card for an extension', () => {
    const oldCards = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const added = card('seven', 'spades', 2)
    const state = stateFor({
      hand: [added, card('king', 'spades')],
      melds: [validatedMeld(oldCards)],
    })

    const { events } = playBotTurnWithTrace(state, 'player-2')
    const extension = events.find(({ type }) => type === 'extend-meld')

    expect(extension).toEqual({
      type: 'extend-meld',
      playerId: 'player-2',
      cards: [added],
      meldIndex: 0,
    })
    if (extension?.type !== 'extend-meld') throw new Error('Expected extension event')
    expect(extension.cards).not.toEqual(expect.arrayContaining(oldCards))
  })

  it('reports every committed meld extension exactly once', () => {
    const first = validatedMeld([
      card('five', 'clubs'), card('five', 'diamonds'), card('five', 'hearts'),
    ])
    const second = validatedMeld([
      card('eight', 'clubs'), card('eight', 'diamonds'), card('eight', 'hearts'),
    ])
    const state = stateFor({
      hand: [card('five', 'spades'), card('eight', 'spades'), card('king', 'spades')],
      melds: [first, second],
    })

    const extensions = playBotTurnWithTrace(state, 'player-2').events
      .filter(({ type }) => type === 'extend-meld')

    expect(extensions).toHaveLength(2)
    expect(extensions.map((event) => event.type === 'extend-meld' ? event.meldIndex : -1).sort())
      .toEqual([0, 1])
  })

  it('places an al-volo pozzetto event immediately after its triggering meld', () => {
    const pozzettoCards = defaultPozzetti()[0]
    const state = stateFor({
      hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')],
    })

    const { events } = playBotTurnWithTrace(state, 'player-2')
    const pozzettoIndex = events.findIndex(({ type }) => type === 'take-pozzetto')

    expect(events[pozzettoIndex - 1]?.type).toBe('play-meld')
    expect(events[pozzettoIndex]).toEqual({
      type: 'take-pozzetto', playerId: 'player-2', mode: 'flight',
    })
    expect(Object.keys(events[pozzettoIndex]!)).toEqual(['type', 'playerId', 'mode'])
    for (const hidden of pozzettoCards) expect(JSON.stringify(events[pozzettoIndex])).not.toContain(hidden.id)
  })

  it('places a con-lo-scarto pozzetto event after the final first-hand discard', () => {
    const discarded = card('king', 'spades')
    const state = stateFor({ hand: [discarded] })

    const { events } = playBotTurnWithTrace(state, 'player-2')

    expect(events.slice(0, 2)).toEqual([
      { type: 'discard', playerId: 'player-2', card: discarded },
      { type: 'take-pozzetto', playerId: 'player-2', mode: 'discard' },
    ])
  })

  it('keeps the final discard in both closure and draw-pile-exhaustion traces', () => {
    const burraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const closing = stateFor({
      hand: [card('king', 'spades')], melds: [burraco], hasTakenPozzetto: true,
    })
    const exhausted = stateFor({
      hand: [card('ace', 'spades'), card('king', 'spades')],
      drawPile: playableDrawPile().slice(1),
    })

    const closedTrace = playBotTurnWithTrace(closing, 'player-2')
    const exhaustedTrace = playBotTurnWithTrace(exhausted, 'player-2')

    expect(closedTrace.state.round).toMatchObject({ status: 'completed', ending: 'closure' })
    expect(closedTrace.events.at(-1)?.type).toBe('discard')
    expect(exhaustedTrace.state.round).toMatchObject({ status: 'completed', ending: 'draw-pile-exhausted' })
    expect(exhaustedTrace.events[0]?.type).toBe('discard')
  })

  it('concatenates three bot turns in actual player order and preserves state equivalence', () => {
    const base = stateFor({
      hand: [card('three', 'clubs'), card('four', 'hearts')],
      phase: 'mustDraw',
      drawPile: [card('king', 'clubs'), card('queen', 'diamonds'), card('jack', 'hearts'), ...playableDrawPile()],
    })
    const state: InProgressGameState = {
      ...base,
      players: base.players.map((player) => {
        if (player.id === 'player-3') return { ...player, hand: [card('five', 'clubs'), card('six', 'hearts')] }
        if (player.id === 'player-4') return { ...player, hand: [card('seven', 'clubs'), card('eight', 'hearts')] }
        return player
      }),
    }

    const traced = playBotsUntilHumanTurnWithTrace(state, 'player-1')

    expect(traced.events.filter(({ type }) => type === 'draw-stock').map(({ playerId }) => playerId))
      .toEqual(['player-2', 'player-3', 'player-4'])
    expect(traced.state).toEqual(playBotsUntilHumanTurn(state, 'player-1'))
  })

  it('preserves the state-only safety-limit error conditions', () => {
    const state = stateFor({ hand: [card('king', 'spades')] })

    expect(() => playBotTurnWithTrace(state, 'player-2', { maxActionsPerTurn: 0 }))
      .toThrowError(BotAutomationError)
    expect(() => playBotTurn(state, 'player-2', { maxActionsPerTurn: 0 }))
      .toThrowError('exceeded the 0-action safety limit')
    expect(() => playBotsUntilHumanTurnWithTrace(state, 'player-1', { maxBotTurns: 0 }))
      .toThrowError('exceeded the 0-turn safety limit')
    expect(() => playBotsUntilHumanTurn(state, 'player-1', { maxBotTurns: 0 }))
      .toThrowError('exceeded the 0-turn safety limit')
  })

  it('does not add trace fields to game state', () => {
    const state: GameState = stateFor({ hand: [card('king', 'spades')] })
    const traced = playBotTurnWithTrace(state, 'player-2')

    expect(traced.state).not.toHaveProperty('events')
    expect(traced.state).not.toHaveProperty('botEvents')
  })
})
