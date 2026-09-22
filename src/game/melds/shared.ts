import { RANKS, SUITS, type Card, type Rank, type Suit } from '../cards/types'
import type { MeldValidationReason } from './types'

export const MIN_MELD_SIZE = 3
export const MAX_GROUP_NATURALS = 8
export const MAX_GROUP_SIZE = 9
export const MAX_SEQUENCE_SIZE = 14

export const ACE_LOW_RANKS: readonly Rank[] = RANKS
export const ACE_HIGH_RANKS: readonly Rank[] = [...RANKS.slice(1), 'ace']

const suitOrder = new Map<Suit, number>(SUITS.map((suit, index) => [suit, index]))

export const comparePhysicalCards = (first: Card, second: Card): number => {
  const firstSuit = first.suit === null ? SUITS.length : suitOrder.get(first.suit)!
  const secondSuit = second.suit === null ? SUITS.length : suitOrder.get(second.suit)!
  return firstSuit - secondSuit || first.deckNumber - second.deckNumber || first.id.localeCompare(second.id)
}

export const commonCandidateError = (
  cards: readonly Card[],
  maximum: number,
): MeldValidationReason | null => {
  if (cards.length < MIN_MELD_SIZE) return 'TOO_FEW_CARDS'
  if (cards.length > maximum) return 'TOO_MANY_CARDS'
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return 'DUPLICATE_CARD_ID'
  return null
}
