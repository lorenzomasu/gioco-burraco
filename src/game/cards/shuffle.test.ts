import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from './deck'
import { createSeededRandom, shuffle, shuffleDeck } from './shuffle'

describe('shuffle', () => {
  it('is deterministic for the same seed', () => {
    const deck = createBurracoDeck()
    const first = shuffleDeck(deck, createSeededRandom(123)).map((card) => card.id)
    const second = shuffleDeck(deck, createSeededRandom(123)).map((card) => card.id)
    expect(first).toEqual(second)
  })

  it('does not mutate the input', () => {
    const original = [1, 2, 3, 4]
    const shuffled = shuffle(original, () => 0)
    expect(original).toEqual([1, 2, 3, 4])
    expect(shuffled).toEqual([2, 3, 4, 1])
  })

  it('preserves every card exactly once', () => {
    const deck = createBurracoDeck()
    const shuffled = shuffleDeck(deck, createSeededRandom(99))
    expect(new Set(shuffled.map((card) => card.id))).toEqual(new Set(deck.map((card) => card.id)))
  })

  it('rejects invalid random values', () => {
    expect(() => shuffle([1, 2], () => 1)).toThrow(RangeError)
  })
})
