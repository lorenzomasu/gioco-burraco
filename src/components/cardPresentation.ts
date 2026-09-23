import type { Card, Rank, Suit } from '../game/cards/types'

export const rankSymbols: Readonly<Record<Card['rank'], string>> = {
  ace: 'A',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  jack: 'J',
  queen: 'Q',
  king: 'K',
  joker: '★',
}

const rankNames: Readonly<Record<Card['rank'], string>> = {
  ace: 'Asso',
  two: 'Due',
  three: 'Tre',
  four: 'Quattro',
  five: 'Cinque',
  six: 'Sei',
  seven: 'Sette',
  eight: 'Otto',
  nine: 'Nove',
  ten: 'Dieci',
  jack: 'Fante',
  queen: 'Donna',
  king: 'Re',
  joker: 'Jolly',
}

export const suitSymbols: Readonly<Record<Suit, string>> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
}

const suitNames: Readonly<Record<Suit, string>> = {
  clubs: 'fiori',
  diamonds: 'quadri',
  hearts: 'cuori',
  spades: 'picche',
}

const rankOrder: readonly Card['rank'][] = [
  'ace', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'joker',
]
const suitOrder: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']

export const cardLabel = (card: Card): string => card.rank === 'joker'
  ? `Jolly, mazzo ${card.deckNumber}`
  : `${rankNames[card.rank]} di ${suitNames[card.suit!]}, mazzo ${card.deckNumber}`

export const sortCardsForDisplay = (cards: readonly Card[]): Card[] => [...cards].sort((left, right) => {
  if (left.suit !== right.suit) {
    if (left.suit === null) return 1
    if (right.suit === null) return -1
    return suitOrder.indexOf(left.suit) - suitOrder.indexOf(right.suit)
  }
  const rankDifference = rankOrder.indexOf(left.rank) - rankOrder.indexOf(right.rank)
  return rankDifference || left.deckNumber - right.deckNumber
})

export const isRedSuit = (suit: Suit | null): boolean => suit === 'diamonds' || suit === 'hearts'

export const representedRankLabel = (rank: Rank | null): string => rank === null
  ? 'libera'
  : rankSymbols[rank]
