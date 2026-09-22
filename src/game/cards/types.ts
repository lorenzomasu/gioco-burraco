export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const
export type Suit = (typeof SUITS)[number]

export const RANKS = [
  'ace', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'jack', 'queen', 'king',
] as const
export type Rank = (typeof RANKS)[number]

export type Card = Readonly<{
  /** A physical-card identifier; rank and suit alone are not unique in Burraco. */
  id: string
  deckNumber: 1 | 2
  rank: Rank | 'joker'
  suit: Suit | null
}>

export type Deck = readonly Card[]
export type DiscardPile = readonly Card[]
export type Pozzetto = readonly Card[]

export const isJoker = (card: Card): boolean => card.rank === 'joker'
export const isPinella = (card: Card): boolean => card.rank === 'two'

/** Compares the playable face, never the physical-card identity. All jokers are equivalent. */
export const haveEquivalentFaces = (first: Card, second: Card): boolean =>
  first.rank === second.rank && first.suit === second.suit
