import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Rank, Suit } from '../cards/types'
import type { MeldCardPlacement, ValidatedMeld, ValidatedSequence } from './types'
import { validateMeld } from './validateMeld'
import { validateMeldExtension } from './validateMeldExtension'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (deckNumber: 1 | 2 = 1, occurrence = 0): Card =>
  deck.filter((candidate) => candidate.rank === 'joker' && candidate.deckNumber === deckNumber)[occurrence]!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const validatedSequence = (cards: readonly Card[]): ValidatedSequence => {
  const meld = validatedMeld(cards)
  if (meld.type !== 'sequence') throw new Error('Expected a sequence')
  return meld
}

const expectValidExtension = (existing: ValidatedMeld, additions: readonly Card[]): ValidatedMeld => {
  const result = validateMeldExtension(existing, additions)
  expect(result.valid).toBe(true)
  if (!result.valid) throw new Error(`Expected a valid extension, received ${result.reason}`)
  return result.meld
}

const semanticRanks = (placements: readonly MeldCardPlacement[]): readonly (Rank | null)[] =>
  placements.map((placement) => placement.role === 'wildcard'
    ? placement.representedRank
    : placement.card.rank as Rank)

describe('validateMeldExtension', () => {
  it('rejects a no-op extension without changing new-meld validation', () => {
    const existing = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])

    expect(validateMeldExtension(existing, [])).toEqual({ valid: false, reason: 'EMPTY_EXTENSION' })
    expect(validateMeld(existing.cards.map((placement) => placement.card))).toEqual({
      valid: true,
      meld: existing,
    })
  })

  it('preserves stateless group-extension behaviour', () => {
    const existing = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    const addition = card('seven', 'spades')

    const extended = expectValidExtension(existing, [addition])

    expect(extended.type).toBe('group')
    expect(extended.cards.map((placement) => placement.card.id)).toContain(addition.id)
  })

  it('accepts an ordinary sequence extension with no active wildcard', () => {
    const existing = validatedSequence([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
    ])

    const extended = expectValidExtension(existing, [card('six', 'spades')])

    expect(semanticRanks(extended.cards)).toEqual(['three', 'four', 'five', 'six'])
  })

  it('accepts an active wildcard that remains on its represented rank', () => {
    const wild = joker()
    const existing = validatedSequence([card('three', 'clubs'), wild, card('five', 'clubs')])

    const extended = expectValidExtension(existing, [card('six', 'clubs')])

    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'four' })
  })

  it('rejects stateless reinterpretation of an existing wildcard without replacement', () => {
    const wild = joker()
    const existing = validatedSequence([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'), wild,
    ])
    expect(existing.activeWildcard?.representedRank).toBe('two')
    const addition = card('seven', 'spades')
    const stateless = validateMeld([...existing.cards.map((placement) => placement.card), addition])
    expect(stateless.valid && stateless.meld.activeWildcard?.representedRank).toBe('six')

    expect(validateMeldExtension(existing, [addition])).toEqual({
      valid: false,
      reason: 'WILDCARD_POSITION_LOCKED',
    })
  })

  it('allows exact natural replacement to reposition the same physical wildcard', () => {
    const wild = joker()
    const existing = validatedSequence([card('three', 'clubs'), wild, card('five', 'clubs')])
    const replacement = card('four', 'clubs')

    const extended = expectValidExtension(existing, [replacement])

    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'two' })
    expect(extended.cards.find((placement) => placement.card.id === wild.id)?.card).toBe(wild)
    expect(extended.cards.find((placement) => placement.card.id === replacement.id)).toEqual({
      card: replacement,
      role: 'natural',
    })
  })

  it('does not treat a same-rank card of another suit as an exact replacement', () => {
    const wild = joker()
    const existing = validatedSequence([card('three', 'clubs'), wild, card('five', 'clubs')])

    expect(validateMeldExtension(existing, [card('four', 'diamonds')]).valid).toBe(false)
  })

  it('checks replacement suit even when stateless two-matta normalization is valid', () => {
    const previouslyActivePinella = card('two', 'spades')
    const existing: ValidatedSequence = {
      type: 'sequence',
      suit: 'spades',
      cards: [
        { card: previouslyActivePinella, role: 'wildcard', representedRank: 'two' },
        { card: card('three', 'spades'), role: 'natural' },
        { card: card('four', 'spades'), role: 'natural' },
      ],
      acePosition: 'none',
      activeWildcard: { card: previouslyActivePinella, role: 'wildcard', representedRank: 'two' },
    }
    const wrongSuitTwo = card('two', 'hearts')
    const stateless = validateMeld([...existing.cards.map((placement) => placement.card), wrongSuitTwo])
    expect(stateless.valid).toBe(true)

    expect(validateMeldExtension(existing, [wrongSuitTwo])).toEqual({
      valid: false,
      reason: 'WILDCARD_POSITION_LOCKED',
    })
  })

  it('does not count a pre-existing table card as the replacement supplied by this extension', () => {
    const wild = joker()
    const existing: ValidatedSequence = {
      type: 'sequence',
      suit: 'clubs',
      cards: [
        { card: card('three', 'clubs'), role: 'natural' },
        { card: wild, role: 'wildcard', representedRank: 'four' },
        { card: card('four', 'clubs'), role: 'natural' },
        { card: card('five', 'clubs'), role: 'natural' },
      ],
      acePosition: 'none',
      activeWildcard: { card: wild, role: 'wildcard', representedRank: 'four' },
    }
    const addition = card('seven', 'clubs')
    const stateless = validateMeld([...existing.cards.map((placement) => placement.card), addition])
    expect(stateless.valid && stateless.meld.activeWildcard?.representedRank).toBe('six')

    expect(validateMeldExtension(existing, [addition])).toEqual({
      valid: false,
      reason: 'WILDCARD_POSITION_LOCKED',
    })
  })

  it.each([1, 2] as const)(
    'accepts deck %s of the exact natural face and preserves its physical identity',
    (deckNumber) => {
      const wild = joker()
      const existing = validatedSequence([card('three', 'hearts'), wild, card('five', 'hearts')])
      const replacement = card('four', 'hearts', deckNumber)

      const extended = expectValidExtension(existing, [replacement])

      expect(extended.cards.find((placement) => placement.card.id === replacement.id)?.card).toBe(replacement)
      expect(extended.cards.map((placement) => placement.card.id)).toContain(wild.id)
    },
  )

  it('keeps a previously free wildcard unranked', () => {
    const wild = joker()
    const existing: ValidatedSequence = {
      type: 'sequence',
      suit: 'clubs',
      cards: [
        { card: card('three', 'clubs'), role: 'natural' },
        { card: card('four', 'clubs'), role: 'natural' },
        { card: card('five', 'clubs'), role: 'natural' },
        { card: wild, role: 'wildcard', representedRank: null },
      ],
      acePosition: 'none',
      activeWildcard: { card: wild, role: 'wildcard', representedRank: null },
    }

    expect(validateMeldExtension(existing, [card('seven', 'clubs')])).toEqual({
      valid: false,
      reason: 'WILDCARD_POSITION_LOCKED',
    })
  })

  it('allows a natural same-suit pinella to become the active wildcard', () => {
    const pinella = card('two', 'diamonds')
    const existing = validatedSequence([pinella, card('three', 'diamonds'), card('four', 'diamonds')])
    expect(existing.activeWildcard).toBeNull()

    const extended = expectValidExtension(existing, [card('six', 'diamonds')])

    expect(extended.activeWildcard).toEqual({ card: pinella, role: 'wildcard', representedRank: 'five' })
  })

  it('locks a pinella after it has become an active wildcard', () => {
    const pinella = card('two', 'diamonds')
    const natural = validatedSequence([pinella, card('three', 'diamonds'), card('four', 'diamonds')])
    const active = expectValidExtension(natural, [card('six', 'diamonds')])
    if (active.type !== 'sequence') throw new Error('Expected a sequence')

    const extendedAgain = expectValidExtension(active, [card('seven', 'diamonds')])

    expect(extendedAgain.activeWildcard).toEqual({
      card: pinella,
      role: 'wildcard',
      representedRank: 'five',
    })
  })

  it('allows an active same-suit pinella to return to natural two after exact replacement', () => {
    const pinella = card('two', 'diamonds')
    const active = validatedSequence([
      pinella, card('three', 'diamonds'), card('four', 'diamonds'), card('six', 'diamonds'),
    ])
    expect(active.activeWildcard?.representedRank).toBe('five')
    const replacement = card('five', 'diamonds')

    const extended = expectValidExtension(active, [replacement])

    expect(extended.activeWildcard).toBeNull()
    expect(extended.cards.find((placement) => placement.card.id === pinella.id)).toEqual({
      card: pinella,
      role: 'natural',
    })
  })

  it('retains deterministic two-matta identity when exact replacement frees the wildcard', () => {
    const naturalTwo = card('two', 'spades')
    const wild = joker()
    const existing = validatedSequence([
      naturalTwo, card('three', 'spades'), card('four', 'spades'), wild,
    ])
    expect(existing.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'ace' })
    const replacement = card('ace', 'spades')

    const extended = expectValidExtension(existing, [replacement])

    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'five' })
    expect(extended.cards.find((placement) => placement.card.id === naturalTwo.id)?.role).toBe('natural')
    expect(extended.cards.find((placement) => placement.card.id === replacement.id)?.card).toBe(replacement)
    expect(new Set(extended.cards.map((placement) => placement.card.id)).size).toBe(5)
  })
})
