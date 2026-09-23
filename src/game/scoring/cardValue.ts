import type { Card } from '../cards/types'

const CARD_VALUES: Readonly<Record<Card['rank'], number>> = {
  joker: 30,
  two: 20,
  ace: 15,
  king: 10,
  queen: 10,
  jack: 10,
  ten: 10,
  nine: 10,
  eight: 10,
  seven: 5,
  six: 5,
  five: 5,
  four: 5,
  three: 5,
}

/** Returns the value printed on the physical card, independently of its semantic meld role. */
export const cardValue = (card: Card): number => CARD_VALUES[card.rank]
