import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Rank, Suit } from '../cards/types'
import { validateMeld } from './validateMeld'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!

describe('validateMeld', () => {
  it('auto-detects a group', () => {
    const result = validateMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    expect(result.valid && result.meld.type).toBe('group')
  })

  it('auto-detects a sequence', () => {
    const result = validateMeld([
      card('five', 'spades'), card('three', 'spades'), card('four', 'spades'),
    ])
    expect(result.valid && result.meld.type).toBe('sequence')
  })

  it('returns a stable generic reason when neither meld type is legal', () => {
    expect(validateMeld([
      card('three', 'spades'), card('seven', 'hearts'), card('king', 'clubs'),
    ])).toEqual({ valid: false, reason: 'NOT_A_VALID_MELD' })
  })

  it('preserves common structural failure reasons', () => {
    const repeated = card('seven', 'clubs')
    expect(validateMeld([repeated, { ...repeated }, card('seven', 'hearts')]))
      .toEqual({ valid: false, reason: 'DUPLICATE_CARD_ID' })
  })
})
