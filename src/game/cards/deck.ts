import { RANKS, SUITS, type Card, type Deck, type Rank, type Suit } from './types'

const standardCard = (deckNumber: 1 | 2, rank: Rank, suit: Suit): Card => ({
  id: `deck-${deckNumber}-${rank}-${suit}`,
  deckNumber,
  rank,
  suit,
})

const joker = (deckNumber: 1 | 2, jokerNumber: 1 | 2): Card => ({
  id: `deck-${deckNumber}-joker-${jokerNumber}`,
  deckNumber,
  rank: 'joker',
  suit: null,
})

/** Creates the 108 physical cards used in a standard two-deck Burraco game. */
export const createBurracoDeck = (): Deck => {
  const cards: Card[] = []
  for (const deckNumber of [1, 2] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(standardCard(deckNumber, rank, suit))
    }
    cards.push(joker(deckNumber, 1), joker(deckNumber, 2))
  }
  return cards
}
