/**
 * M39 (experimental, prototype-only): deterministic presentation state for the iOS feel spike.
 *
 * This is NOT a second rules engine. Draw and discard only move cards between presentation
 * regions so touch, motion and haptics can be judged on a device; there is no legality check,
 * turn order, bot, scoring or save. Production gameplay stays in `src/game`.
 */
import { createBurracoDeck } from '../game/cards/deck'
import type { Card } from '../game/cards/types'

export type SpikeSeat = Readonly<{ id: string; name: string; role: 'partner' | 'opponent'; cardCount: number }>

export type SpikeState = Readonly<{
  hand: readonly Card[]
  selectedIds: readonly string[]
  stock: readonly Card[]
  discardPile: readonly Card[]
  /** A representative own-team meld; fixed prototype content. */
  ownMeld: readonly Card[]
  seats: readonly SpikeSeat[]
  score: Readonly<{ us: number; them: number }>
  round: Readonly<{ current: number; total: number }>
}>

export type SpikeAction =
  | Readonly<{ type: 'toggle'; cardId: string }>
  | Readonly<{ type: 'draw' }>
  | Readonly<{ type: 'discard' }>
  | Readonly<{ type: 'reset' }>

const byId = (deck: readonly Card[], ids: readonly string[]): Card[] => ids.map((id) => {
  const card = deck.find((candidate) => candidate.id === id)
  if (!card) throw new Error(`Unknown fixture card ${id}`)
  return card
})

const HAND_IDS = [
  'deck-1-three-clubs', 'deck-1-seven-clubs', 'deck-2-seven-clubs', 'deck-1-queen-clubs',
  'deck-1-four-diamonds', 'deck-1-nine-diamonds', 'deck-1-ace-hearts', 'deck-1-king-hearts',
  'deck-1-six-spades', 'deck-1-jack-spades', 'deck-1-joker-1',
]
const MELD_IDS = ['deck-1-five-hearts', 'deck-1-six-hearts', 'deck-1-seven-hearts', 'deck-2-two-spades']
const DISCARD_IDS = ['deck-2-eight-diamonds']

/** The same fixture on every launch: deterministic for tests and repeatable on the device. */
export const createSpikeFixture = (): SpikeState => {
  const deck = createBurracoDeck()
  const used = new Set([...HAND_IDS, ...MELD_IDS, ...DISCARD_IDS])
  return {
    hand: byId(deck, HAND_IDS),
    selectedIds: [],
    // Fixed order; the prototype draws from the front.
    stock: deck.filter((card) => !used.has(card.id)),
    discardPile: byId(deck, DISCARD_IDS),
    ownMeld: byId(deck, MELD_IDS),
    seats: [
      { id: 'left', name: 'Bot Ovest', role: 'opponent', cardCount: 11 },
      { id: 'partner', name: 'Compagno', role: 'partner', cardCount: 9 },
      { id: 'right', name: 'Bot Est', role: 'opponent', cardCount: 11 },
    ],
    score: { us: 1240, them: 980 },
    round: { current: 2, total: 4 },
  }
}

export const canDiscard = (state: SpikeState): boolean => state.selectedIds.length === 1

export const spikeReducer = (state: SpikeState, action: SpikeAction): SpikeState => {
  switch (action.type) {
    case 'toggle': {
      if (!state.hand.some((card) => card.id === action.cardId)) return state
      const selectedIds = state.selectedIds.includes(action.cardId)
        ? state.selectedIds.filter((id) => id !== action.cardId)
        : [...state.selectedIds, action.cardId]
      return { ...state, selectedIds }
    }
    case 'draw': {
      const [drawn, ...stock] = state.stock
      if (!drawn) return state
      return { ...state, stock, hand: [...state.hand, drawn] }
    }
    case 'discard': {
      if (!canDiscard(state)) return state
      const [cardId] = state.selectedIds
      const card = state.hand.find((candidate) => candidate.id === cardId)
      if (!card) return state
      return {
        ...state,
        hand: state.hand.filter((candidate) => candidate.id !== cardId),
        selectedIds: [],
        discardPile: [...state.discardPile, card],
      }
    }
    case 'reset':
      return createSpikeFixture()
  }
}
