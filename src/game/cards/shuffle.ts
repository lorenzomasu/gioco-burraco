import type { Deck } from './types'

export type RandomSource = () => number

/** An immutable Fisher-Yates shuffle. The source must return values in [0, 1). */
export const shuffle = <T>(items: readonly T[], random: RandomSource = Math.random): readonly T[] => {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random()
    if (randomValue < 0 || randomValue >= 1) {
      throw new RangeError('Random source must return a value in [0, 1).')
    }
    const targetIndex = Math.floor(randomValue * (index + 1))
    ;[shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]]
  }
  return shuffled
}

/** Mulberry32: a small seeded source for repeatable games and unit tests. */
export const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const shuffleDeck = (deck: Deck, random?: RandomSource): Deck => shuffle(deck, random)
