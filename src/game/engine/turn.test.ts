import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { haveEquivalentFaces, type Card } from '../cards/types'
import { GameRuleError, type GameErrorCode } from './errors'
import { dealInitialState, getPlayer } from './startGame'
import { discardCard, drawCard, takeDiscardPile } from './turn'

const initialState = () => dealInitialState(createBurracoDeck())
const OPENING_DISCARD_INDEX = 66

const stateWithNonEquivalentSingleDiscard = () => {
  const deck = [...createBurracoDeck()]
  ;[deck[OPENING_DISCARD_INDEX], deck[1]] = [deck[1]!, deck[OPENING_DISCARD_INDEX]!]
  return dealInitialState(deck)
}

const allCards = (state: ReturnType<typeof initialState>): Card[] => [
  ...state.players.flatMap((player) => player.hand),
  ...state.pozzetti.flat(),
  ...state.drawPile,
  ...state.discardPile,
]

const expectRuleError = (action: () => unknown, code: GameErrorCode): void => {
  try {
    action()
    throw new Error('Expected a GameRuleError')
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError)
    expect(error).toMatchObject({ code })
  }
}

describe('turn transitions', () => {
  it('starts with player 1 in the mustDraw phase', () => {
    const state = initialState()
    expect(state.round.turn).toEqual({ currentPlayerId: 'player-1', phase: 'mustDraw' })
  })

  it('draws exactly the top draw-pile card into the current player hand', () => {
    const state = initialState()
    const topCard = state.drawPile[0]!
    const next = drawCard(state, 'player-1')
    expect(getPlayer(next, 'player-1').hand).toEqual([...getPlayer(state, 'player-1').hand, topCard])
    expect(next.drawPile).toEqual(state.drawPile.slice(1))
    expect(next.round.turn.phase).toBe('action')
    expect(next.round.turn).toMatchObject({
      acquisition: { source: 'drawPile', cardIds: [topCard.id] },
    })
  })

  it('does not mutate the previous state when drawing', () => {
    const state = initialState()
    const before = structuredClone(state)
    drawCard(state, 'player-1')
    expect(state).toEqual(before)
  })

  it('rejects a draw by a non-current or unknown player', () => {
    const state = initialState()
    expectRuleError(() => drawCard(state, 'player-2'), 'NOT_CURRENT_PLAYER')
    expectRuleError(() => drawCard(state, 'unknown-player' as never), 'NOT_CURRENT_PLAYER')
  })

  it('rejects drawing twice and taking discards after a draw', () => {
    const afterDraw = drawCard(initialState(), 'player-1')
    expectRuleError(() => drawCard(afterDraw, 'player-1'), 'INVALID_TURN_PHASE')
    expectRuleError(() => takeDiscardPile(afterDraw, 'player-1'), 'INVALID_TURN_PHASE')
  })

  it('rejects drawing from an empty draw pile with a stable error code', () => {
    const state = { ...initialState(), drawPile: [] }
    expectRuleError(() => drawCard(state, 'player-1'), 'DRAW_PILE_EMPTY')
  })

  it('transfers every discard exactly once to the current player hand', () => {
    const state = initialState()
    const secondDiscard = state.drawPile[0]!
    const withTwoDiscards = {
      ...state,
      drawPile: state.drawPile.slice(1),
      discardPile: [...state.discardPile, secondDiscard],
    }
    const next = takeDiscardPile(withTwoDiscards, 'player-1')
    expect(getPlayer(next, 'player-1').hand).toEqual([
      ...getPlayer(withTwoDiscards, 'player-1').hand,
      ...withTwoDiscards.discardPile,
    ])
    expect(next.discardPile).toEqual([])
    expect(next.round.turn).toEqual({
      currentPlayerId: 'player-1',
      phase: 'action',
      acquisition: { source: 'discardPile', cardIds: withTwoDiscards.discardPile.map((card) => card.id) },
    })
    expect(new Set(allCards(withTwoDiscards).map((card) => card.id)).size).toBe(108)
  })

  it('records the physical ID when collecting a one-card discard pile', () => {
    const state = initialState()
    const next = takeDiscardPile(state, 'player-1')
    expect(next.round.turn).toEqual({
      currentPlayerId: 'player-1',
      phase: 'action',
      acquisition: { source: 'discardPile', cardIds: [state.discardPile[0]!.id] },
    })
  })

  it('does not mutate the previous state when taking the discard pile', () => {
    const state = initialState()
    const before = structuredClone(state)
    takeDiscardPile(state, 'player-1')
    expect(state).toEqual(before)
  })

  it('rejects drawing after taking discards and collecting an empty pile', () => {
    const afterTake = takeDiscardPile(initialState(), 'player-1')
    expectRuleError(() => drawCard(afterTake, 'player-1'), 'INVALID_TURN_PHASE')
    const emptyPile = { ...initialState(), discardPile: [] }
    expectRuleError(() => takeDiscardPile(emptyPile, 'player-1'), 'DISCARD_PILE_EMPTY')
  })

  it('rejects discarding before drawing or collecting', () => {
    const state = initialState()
    expectRuleError(() => discardCard(state, 'player-1', state.players[0]!.hand[0]!.id), 'INVALID_TURN_PHASE')
  })

  it('discards exactly the selected physical card as the new discard-pile top', () => {
    const afterDraw = drawCard(initialState(), 'player-1')
    const selectedCard = getPlayer(afterDraw, 'player-1').hand[3]!
    const next = discardCard(afterDraw, 'player-1', selectedCard.id)
    expect(getPlayer(next, 'player-1').hand.some((card) => card.id === selectedCard.id)).toBe(false)
    expect(next.discardPile.at(-1)).toEqual(selectedCard)
    expect(next.discardPile.slice(0, -1)).toEqual(afterDraw.discardPile)
  })

  it('rejects an attempt to discard a card that is not in the current hand', () => {
    const afterDraw = drawCard(initialState(), 'player-1')
    const player2CardId = getPlayer(afterDraw, 'player-2').hand[0]!.id
    expectRuleError(() => discardCard(afterDraw, 'player-1', player2CardId), 'CARD_NOT_IN_HAND')
  })

  it('does not mutate the previous state when discarding', () => {
    const afterDraw = drawCard(initialState(), 'player-1')
    const before = structuredClone(afterDraw)
    discardCard(afterDraw, 'player-1', getPlayer(afterDraw, 'player-1').hand[0]!.id)
    expect(afterDraw).toEqual(before)
  })

  it('clears acquisition information when a discard advances the turn', () => {
    const afterDraw = drawCard(initialState(), 'player-1')
    const next = discardCard(afterDraw, 'player-1', getPlayer(afterDraw, 'player-1').hand[0]!.id)
    expect(next.round.turn).toEqual({ currentPlayerId: 'player-2', phase: 'mustDraw' })
  })

  it('forbids immediately rediscarding the only collected card without an equivalent in hand', () => {
    const state = stateWithNonEquivalentSingleDiscard()
    const collected = state.discardPile[0]!
    expect(getPlayer(state, 'player-1').hand.some((card) => haveEquivalentFaces(card, collected))).toBe(false)
    const afterTake = takeDiscardPile(state, 'player-1')
    const beforeRejectedDiscard = structuredClone(afterTake)
    expectRuleError(
      () => discardCard(afterTake, 'player-1', collected.id),
      'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD',
    )
    expect(afterTake).toEqual(beforeRejectedDiscard)
  })

  it('allows another existing hand card to be discarded after collecting one card', () => {
    const state = stateWithNonEquivalentSingleDiscard()
    const existingCard = getPlayer(state, 'player-1').hand[0]!
    const afterTake = takeDiscardPile(state, 'player-1')
    const next = discardCard(afterTake, 'player-1', existingCard.id)
    expect(next.discardPile.at(-1)).toEqual(existingCard)
  })

  it('allows rediscarding a single collected card when a distinct equivalent was already in hand', () => {
    const state = initialState()
    const collected = state.discardPile[0]!
    const equivalentInHand = getPlayer(state, 'player-1').hand.find((card) => haveEquivalentFaces(card, collected))!
    expect(equivalentInHand.id).not.toBe(collected.id)
    const afterTake = takeDiscardPile(state, 'player-1')
    const next = discardCard(afterTake, 'player-1', collected.id)
    expect(next.discardPile.at(-1)).toEqual(collected)
  })

  it('advances a successful discard through the complete player rotation', () => {
    let state = initialState()
    const expectedPlayers = ['player-2', 'player-3', 'player-4', 'player-1']
    for (const expectedPlayer of expectedPlayers) {
      const currentPlayer = state.round.turn.currentPlayerId
      const afterDraw = drawCard(state, currentPlayer)
      state = discardCard(afterDraw, currentPlayer, getPlayer(afterDraw, currentPlayer).hand[0]!.id)
      expect(state.round.turn).toEqual({ currentPlayerId: expectedPlayer, phase: 'mustDraw' })
    }
  })

  it('preserves 108 unique physical cards after each valid transition', () => {
    const state = initialState()
    const afterDraw = drawCard(state, 'player-1')
    const afterDiscard = discardCard(afterDraw, 'player-1', getPlayer(afterDraw, 'player-1').hand[0]!.id)
    const afterTake = takeDiscardPile(afterDiscard, 'player-2')
    for (const current of [state, afterDraw, afterDiscard, afterTake]) {
      const cards = allCards(current)
      expect(cards).toHaveLength(108)
      expect(new Set(cards.map((card) => card.id)).size).toBe(108)
    }
  })
})
