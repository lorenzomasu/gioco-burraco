import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { haveEquivalentFaces, type Card, type Rank, type Suit } from '../cards/types'
import { validateMeld } from '../melds'
import type { GameState, InProgressGameState } from '../state/types'
import { extendMeld } from './extendMeld'
import { GameRuleError, type GameErrorCode } from './errors'
import { playMeld } from './playMeld'
import { dealInitialState, getPlayer } from './startGame'
import { discardCard, drawCard, takeDiscardPile } from './turn'

const deck = createBurracoDeck()
const initialState = () => dealInitialState(deck)
const OPENING_DISCARD_INDEX = 66

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!

const validatedMeld = (cards: readonly Card[]) => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const stateForRediscardRegression = (
  hand: readonly Card[],
  collected: Card,
): InProgressGameState => {
  const initial = initialState()
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, hand } : player),
    discardPile: [collected],
  }
}

const stateWithNonEquivalentSingleDiscard = () => {
  const deck = [...createBurracoDeck()]
  ;[deck[OPENING_DISCARD_INDEX], deck[1]] = [deck[1]!, deck[OPENING_DISCARD_INDEX]!]
  return dealInitialState(deck)
}

const allCards = (state: GameState): Card[] => [
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
    expect(next.round.turn).toEqual({
      currentPlayerId: 'player-1',
      phase: 'action',
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
      acquisition: {
        source: 'discardPile',
        cardIds: withTwoDiscards.discardPile.map((card) => card.id),
        canRediscardSingleCollectedCard: false,
      },
    })
    expect(new Set(allCards(withTwoDiscards).map((card) => card.id)).size).toBe(108)
  })

  it('records the physical ID when collecting a one-card discard pile', () => {
    const state = initialState()
    const next = takeDiscardPile(state, 'player-1')
    expect(next.round.turn).toEqual({
      currentPlayerId: 'player-1',
      phase: 'action',
      acquisition: {
        source: 'discardPile',
        cardIds: [state.discardPile[0]!.id],
        canRediscardSingleCollectedCard: true,
      },
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
    if (next.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
    expect(next.round.turn).toEqual({ currentPlayerId: 'player-2', phase: 'mustDraw' })
  })

  it('forbids immediately rediscarding the only collected card without an equivalent in hand', () => {
    const state = stateWithNonEquivalentSingleDiscard()
    const collected = state.discardPile[0]!
    expect(getPlayer(state, 'player-1').hand.some((card) => haveEquivalentFaces(card, collected))).toBe(false)
    const afterTake = takeDiscardPile(state, 'player-1')
    expect(afterTake.round.turn).toMatchObject({
      acquisition: { canRediscardSingleCollectedCard: false },
    })
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
    expect(afterTake.round.turn).toMatchObject({
      acquisition: { canRediscardSingleCollectedCard: true },
    })
    const next = discardCard(afterTake, 'player-1', collected.id)
    expect(next.discardPile.at(-1)).toEqual(collected)
  })

  it('preserves single-card rediscard eligibility after the original equivalent is played in a meld', () => {
    const collected = card('seven', 'clubs', 1)
    const equivalentInOriginalHand = card('seven', 'clubs', 2)
    const meldCards = [
      equivalentInOriginalHand,
      card('seven', 'diamonds'),
      card('seven', 'hearts'),
    ]
    const state = stateForRediscardRegression([...meldCards, card('king', 'spades')], collected)

    const afterTake = takeDiscardPile(state, 'player-1')
    const afterMeld = playMeld(afterTake, 'player-1', meldCards.map(({ id }) => id))

    expect(afterMeld.round.turn).toBe(afterTake.round.turn)
    expect(getPlayer(afterMeld, 'player-1').hand).not.toContain(equivalentInOriginalHand)
    const next = discardCard(afterMeld, 'player-1', collected.id)
    expect(next.discardPile.at(-1)).toEqual(collected)
  })

  it('preserves single-card rediscard eligibility after the original equivalent extends a meld', () => {
    const collected = card('seven', 'clubs', 1)
    const equivalentInOriginalHand = card('seven', 'clubs', 2)
    const existingMeld = validatedMeld([
      card('seven', 'diamonds'),
      card('seven', 'hearts'),
      card('seven', 'spades'),
    ])
    const base = stateForRediscardRegression(
      [equivalentInOriginalHand, card('king', 'spades')],
      collected,
    )
    const state: InProgressGameState = {
      ...base,
      teams: base.teams.map((team) => team.id === 'team-1'
        ? { ...team, melds: [existingMeld] }
        : team),
    }

    const afterTake = takeDiscardPile(state, 'player-1')
    const afterExtend = extendMeld(afterTake, 'player-1', 0, [equivalentInOriginalHand.id])

    expect(afterExtend.round.turn).toBe(afterTake.round.turn)
    expect(getPlayer(afterExtend, 'player-1').hand).not.toContain(equivalentInOriginalHand)
    const next = discardCard(afterExtend, 'player-1', collected.id)
    expect(next.discardPile.at(-1)).toEqual(collected)
  })

  it('keeps missing rediscard eligibility false after other action-phase plays', () => {
    const collected = card('five', 'clubs', 1)
    const meldCards = [
      card('seven', 'clubs'),
      card('seven', 'diamonds'),
      card('seven', 'hearts'),
    ]
    const state = stateForRediscardRegression([...meldCards, card('king', 'spades')], collected)

    const afterTake = takeDiscardPile(state, 'player-1')
    const afterMeld = playMeld(afterTake, 'player-1', meldCards.map(({ id }) => id))

    expect(afterMeld.round.turn).toBe(afterTake.round.turn)
    expect(afterMeld.round.turn).toMatchObject({
      acquisition: { canRediscardSingleCollectedCard: false },
    })
    expectRuleError(
      () => discardCard(afterMeld, 'player-1', collected.id),
      'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD',
    )
  })

  it('allows a collected card to be discarded when the pile contained multiple cards', () => {
    const state = initialState()
    const secondDiscard = state.drawPile[0]!
    const withTwoDiscards = {
      ...state,
      drawPile: state.drawPile.slice(1),
      discardPile: [...state.discardPile, secondDiscard],
    }
    const afterTake = takeDiscardPile(withTwoDiscards, 'player-1')

    const next = discardCard(afterTake, 'player-1', secondDiscard.id)

    expect(next.discardPile.at(-1)).toEqual(secondDiscard)
  })

  it('advances a successful discard through the complete player rotation', () => {
    let state: GameState = initialState()
    const expectedPlayers = ['player-2', 'player-3', 'player-4', 'player-1']
    for (const expectedPlayer of expectedPlayers) {
      if (state.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
      const currentPlayer = state.round.turn.currentPlayerId
      const afterDraw = drawCard(state, currentPlayer)
      state = discardCard(afterDraw, currentPlayer, getPlayer(afterDraw, currentPlayer).hand[0]!.id)
      if (state.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
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
