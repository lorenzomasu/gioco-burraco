import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card } from '../cards/types'
import { cardValue } from './cardValue'

const deck = createBurracoDeck()
const cardWithRank = (rank: Card['rank']): Card =>
  deck.find((candidate) => candidate.rank === rank)!

describe('cardValue', () => {
  it.each([
    ['joker', 30],
    ['two', 20],
    ['ace', 15],
    ['king', 10],
    ['queen', 10],
    ['jack', 10],
    ['ten', 10],
    ['nine', 10],
    ['eight', 10],
    ['seven', 5],
    ['six', 5],
    ['five', 5],
    ['four', 5],
    ['three', 5],
  ] as const)('values a physical %s at %i points', (rank, expected) => {
    expect(cardValue(cardWithRank(rank))).toBe(expected)
  })
})
