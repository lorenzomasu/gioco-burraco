import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { createSeededRandom } from '../cards/shuffle'
import { isJoker, isPinella, type Card, type Deck } from '../cards/types'
import type { PlayerId } from '../state/types'
import { dealInitialState, getPlayer, HAND_SIZE, POZZETTO_SIZE, startGame } from './startGame'

const OPENING_DISCARD_INDEX = HAND_SIZE * 4 + POZZETTO_SIZE * 2

const cardsInOriginalConsumptionOrder = (state: ReturnType<typeof dealInitialState>): Card[] => {
  const dealtHands: Card[] = []
  for (let round = 0; round < HAND_SIZE; round += 1) {
    for (const player of state.players) dealtHands.push(player.hand[round]!)
  }
  const dealtPozzetti: Card[] = []
  for (let round = 0; round < POZZETTO_SIZE; round += 1) {
    for (const pozzetto of state.pozzetti) dealtPozzetti.push(pozzetto[round]!)
  }
  return [...dealtHands, ...dealtPozzetti, ...state.discardPile, ...state.drawPile]
}

const putAtOpeningDiscard = (deck: Deck, predicate: (card: Card) => boolean): Deck => {
  const copy = [...deck]
  const targetIndex = copy.findIndex(predicate)
  if (targetIndex < 0) throw new Error('Expected test card was not found.')
  ;[copy[OPENING_DISCARD_INDEX], copy[targetIndex]] = [copy[targetIndex]!, copy[OPENING_DISCARD_INDEX]!]
  return copy
}

describe('dealInitialState', () => {
  const orderedDeck = createBurracoDeck()
  const game = dealInitialState(orderedDeck)

  it('sets up four players in two opposing pairs', () => {
    expect(game.players).toHaveLength(4)
    expect(game.teams).toEqual([
      { id: 'team-1', playerIds: ['player-1', 'player-3'], melds: [], hasTakenPozzetto: false },
      { id: 'team-2', playerIds: ['player-2', 'player-4'], melds: [], hasTakenPozzetto: false },
    ])
  })

  it('deals eleven cards to every player, round-robin from the ordered deck', () => {
    expect(game.players.map((player) => player.hand.length)).toEqual([11, 11, 11, 11])
    expect(game.players.map((player) => player.hand[0]!.id)).toEqual([
      orderedDeck[0]!.id, orderedDeck[1]!.id, orderedDeck[2]!.id, orderedDeck[3]!.id,
    ])
    expect(game.players.map((player) => player.hand[10]!.id)).toEqual([
      orderedDeck[40]!.id, orderedDeck[41]!.id, orderedDeck[42]!.id, orderedDeck[43]!.id,
    ])
  })

  it('builds two eleven-card pozzetti alternately from the ordered deck', () => {
    expect(game.pozzetti.map((pozzetto) => pozzetto.length)).toEqual([11, 11])
    expect(game.pozzetti[0].map((card) => card.id)).toEqual(
      Array.from({ length: 11 }, (_, index) => orderedDeck[44 + index * 2]!.id),
    )
    expect(game.pozzetti[1].map((card) => card.id)).toEqual(
      Array.from({ length: 11 }, (_, index) => orderedDeck[45 + index * 2]!.id),
    )
  })

  it('uses exactly the next ordered card as opening discard and retains 41 draw cards', () => {
    expect(game.discardPile).toEqual([orderedDeck[OPENING_DISCARD_INDEX]])
    expect(game.drawPile).toEqual(orderedDeck.slice(OPENING_DISCARD_INDEX + 1))
    expect(game.drawPile).toHaveLength(41)
  })

  it('allows a joker as the opening discard', () => {
    const deck = putAtOpeningDiscard(orderedDeck, isJoker)
    const state = dealInitialState(deck)
    expect(state.discardPile[0]).toBe(deck[OPENING_DISCARD_INDEX])
    expect(isJoker(state.discardPile[0]!)).toBe(true)
  })

  it('allows a pinella as the opening discard', () => {
    const deck = putAtOpeningDiscard(orderedDeck, isPinella)
    const state = dealInitialState(deck)
    expect(state.discardPile[0]).toBe(deck[OPENING_DISCARD_INDEX])
    expect(isPinella(state.discardPile[0]!)).toBe(true)
  })

  it('does not skip or reorder any card during the initial layout', () => {
    expect(cardsInOriginalConsumptionOrder(game)).toEqual(orderedDeck)
  })

  it('allocates all 108 physical cards once and only once', () => {
    const allCards = cardsInOriginalConsumptionOrder(game)
    expect(allCards).toHaveLength(108)
    expect(new Set(allCards.map((card) => card.id)).size).toBe(108)
  })

  it('requires a complete deck for a valid initial state', () => {
    expect(() => dealInitialState(orderedDeck.slice(0, 107))).toThrow('requires exactly 108 cards')
  })

  it('begins with player 1 awaiting a draw', () => {
    expect(game.round.turn).toEqual({ currentPlayerId: 'player-1', phase: 'mustDraw' })
    expect(getPlayer(game, 'player-1').name).toBe('You')
    expect(() => getPlayer(game, 'missing' as never)).toThrow('Unknown player: missing')
  })
})

describe('dealInitialState with an explicit starting player', () => {
  const orderedDeck = createBurracoDeck()
  const allPlayerIds: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']

  it('keeps player 1 as the default when no starter is requested', () => {
    expect(dealInitialState(orderedDeck, {}).round.turn).toEqual({ currentPlayerId: 'player-1', phase: 'mustDraw' })
    expect(dealInitialState(orderedDeck, {})).toEqual(dealInitialState(orderedDeck))
  })

  it.each(allPlayerIds)('starts %s awaiting a draw when requested', (startingPlayerId) => {
    const state = dealInitialState(orderedDeck, { startingPlayerId })
    expect(state.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: startingPlayerId, phase: 'mustDraw' },
    })
  })

  it.each(allPlayerIds.slice(1))('changes only the initial turn owner for %s', (startingPlayerId) => {
    const byDefault = dealInitialState(orderedDeck)
    const rotated = dealInitialState(orderedDeck, { startingPlayerId })

    expect(rotated.players).toEqual(byDefault.players)
    expect(rotated.teams).toEqual(byDefault.teams)
    expect(rotated.pozzetti).toEqual(byDefault.pozzetti)
    expect(rotated.discardPile).toEqual(byDefault.discardPile)
    expect(rotated.drawPile).toEqual(byDefault.drawPile)
    expect(cardsInOriginalConsumptionOrder(rotated).map(({ id }) => id))
      .toEqual(cardsInOriginalConsumptionOrder(byDefault).map(({ id }) => id))
    expect(cardsInOriginalConsumptionOrder(rotated)).toEqual(orderedDeck)
    expect({ ...rotated, round: byDefault.round }).toEqual(byDefault)
  })

  it('rejects an unknown starting player', () => {
    expect(() => dealInitialState(orderedDeck, { startingPlayerId: 'player-5' as never }))
      .toThrow('Unknown starting player: player-5')
  })
})

describe('startGame', () => {
  it('shuffles before applying the same deterministic deal', () => {
    const first = startGame(createSeededRandom(77))
    const second = startGame(createSeededRandom(77))
    expect(first).toEqual(second)
    expect(first.drawPile).toHaveLength(41)
  })

  it('defaults to player 1 and deals identically whatever starter is requested', () => {
    const byDefault = startGame(createSeededRandom(77))
    const rotated = startGame(createSeededRandom(77), { startingPlayerId: 'player-3' })

    expect(byDefault.round.turn).toEqual({ currentPlayerId: 'player-1', phase: 'mustDraw' })
    expect(rotated.round.turn).toEqual({ currentPlayerId: 'player-3', phase: 'mustDraw' })
    expect({ ...rotated, round: byDefault.round }).toEqual(byDefault)
  })
})
