import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from './deck'
import { isJoker, isPinella, RANKS, SUITS } from './types'

describe('createBurracoDeck', () => {
  const deck = createBurracoDeck()

  it('creates two complete 54-card decks', () => {
    expect(deck).toHaveLength(108)
    expect(deck.filter(isJoker)).toHaveLength(4)
    expect(deck.filter(isPinella)).toHaveLength(8)
  })

  it('contains every ordinary rank and suit twice', () => {
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        expect(deck.filter((card) => card.rank === rank && card.suit === suit)).toHaveLength(2)
      }
    }
  })

  it('contains two independently complete physical decks', () => {
    for (const deckNumber of [1, 2] as const) {
      const physicalDeck = deck.filter((card) => card.deckNumber === deckNumber)
      expect(physicalDeck).toHaveLength(54)
      expect(physicalDeck.filter((card) => card.suit !== null)).toHaveLength(52)
      expect(physicalDeck.filter(isJoker)).toHaveLength(2)
    }
  })

  it('gives every physical card a stable unique id', () => {
    const ids = deck.map((card) => card.id)
    expect(new Set(ids).size).toBe(deck.length)
    expect(createBurracoDeck().map((card) => card.id)).toEqual(ids)
  })

  it('represents jokers without a suit', () => {
    expect(deck.filter(isJoker).every((card) => card.suit === null)).toBe(true)
  })
})
