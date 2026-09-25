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

  it('repositions the playtest jolly from 4♦ to 9♦ when 10♦ is added (M33.2 regression)', () => {
    const wild = joker()
    const existing = validatedSequence([
      wild, card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
      card('eight', 'diamonds'),
    ])
    expect(existing.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'four' })
    const ten = card('ten', 'diamonds')

    const extended = expectValidExtension(existing, [ten])

    expect(extended.type).toBe('sequence')
    expect(semanticRanks(extended.cards)).toEqual(['five', 'six', 'seven', 'eight', 'nine', 'ten'])
    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'nine' })
    expect(extended.activeWildcard?.card).toBe(wild)
    expect(extended.cards.map((placement) => placement.card.id).sort()).toEqual(
      [...existing.cards.map((placement) => placement.card.id), ten.id].sort(),
    )
  })

  it('repositions an existing active jolly without adding the natural card it represented', () => {
    const wild = joker()
    const existing = validatedSequence([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'), wild,
    ])
    expect(existing.activeWildcard?.representedRank).toBe('two')
    const addition = card('seven', 'spades')
    const stateless = validateMeld([...existing.cards.map((placement) => placement.card), addition])
    if (!stateless.valid) throw new Error('Expected a valid final sequence')

    const extended = expectValidExtension(existing, [addition])

    expect(extended).toEqual(stateless.meld)
    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'six' })
  })

  it('rejects an extension that no wildcard position can make consecutive', () => {
    const wild = joker()
    const existing = validatedSequence([
      wild, card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
      card('eight', 'diamonds'),
    ])

    expect(validateMeldExtension(existing, [card('jack', 'diamonds')]).valid).toBe(false)
    expect(validateMeldExtension(existing, [card('ten', 'diamonds'), card('queen', 'diamonds')]).valid)
      .toBe(false)
  })

  it.each([
    ['wrong-suit natural', () => [card('ten', 'hearts')]],
    ['second jolly', () => [joker(2)]],
    ['duplicate natural position', () => [card('six', 'diamonds', 2)]],
  ] as const)('keeps rejecting a %s added to the playtest sequence', (_, additions) => {
    const existing = validatedSequence([
      joker(), card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
      card('eight', 'diamonds'),
    ])

    expect(validateMeldExtension(existing, additions()).valid).toBe(false)
  })

  it('rejects a physical card already present in the meld', () => {
    const existing = validatedSequence([
      joker(), card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
    ])

    expect(validateMeldExtension(existing, [card('five', 'diamonds')])).toEqual({
      valid: false,
      reason: 'DUPLICATE_CARD_ID',
    })
  })

  it('rejects a sequence extension whose final cards change the stored type or suit', () => {
    const naturalCards = (cards: readonly Card[]): MeldCardPlacement[] =>
      cards.map((physical) => ({ card: physical, role: 'natural' }))
    const storedAsSequence: ValidatedSequence = {
      type: 'sequence',
      suit: 'clubs',
      cards: naturalCards([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]),
      acePosition: 'none',
      activeWildcard: null,
    }
    const storedWithOtherSuit: ValidatedSequence = {
      ...validatedSequence([card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs')]),
      suit: 'hearts',
    }

    expect(validateMeldExtension(storedAsSequence, [card('seven', 'spades')])).toEqual({
      valid: false,
      reason: 'NOT_A_VALID_MELD',
    })
    expect(validateMeldExtension(storedWithOtherSuit, [card('six', 'clubs')])).toEqual({
      valid: false,
      reason: 'NOT_A_VALID_MELD',
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

  it('lets an active pinella become a natural two when a valid final sequence requires it', () => {
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
    const otherTwo = card('two', 'hearts')
    const stateless = validateMeld([...existing.cards.map((placement) => placement.card), otherTwo])
    if (!stateless.valid) throw new Error('Expected a valid final sequence')

    const extended = expectValidExtension(existing, [otherTwo])

    expect(extended).toEqual(stateless.meld)
    expect(extended.cards.find((placement) => placement.card.id === previouslyActivePinella.id)).toEqual({
      card: previouslyActivePinella,
      role: 'natural',
    })
    expect(extended.activeWildcard).toEqual({ card: otherTwo, role: 'wildcard', representedRank: 'ace' })
  })

  it('does not need a replacement supplied by this extension to reposition the wildcard', () => {
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
    if (!stateless.valid) throw new Error('Expected a valid final sequence')

    const extended = expectValidExtension(existing, [addition])

    expect(extended).toEqual(stateless.meld)
    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'six' })
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

  it('lets a previously free wildcard take a rank in the valid final sequence', () => {
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

    const extended = expectValidExtension(existing, [card('seven', 'clubs')])

    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'six' })
  })

  it('allows a natural same-suit pinella to become the active wildcard', () => {
    const pinella = card('two', 'diamonds')
    const existing = validatedSequence([pinella, card('three', 'diamonds'), card('four', 'diamonds')])
    expect(existing.activeWildcard).toBeNull()

    const extended = expectValidExtension(existing, [card('six', 'diamonds')])

    expect(extended.activeWildcard).toEqual({ card: pinella, role: 'wildcard', representedRank: 'five' })
  })

  it('keeps an active pinella on its rank while the final sequence still needs it there', () => {
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

  it('repositions an active same-suit pinella without the natural card it represented', () => {
    const pinella = card('two', 'diamonds')
    const existing = validatedSequence([
      pinella, card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
    ])
    expect(existing.activeWildcard).toEqual({ card: pinella, role: 'wildcard', representedRank: 'four' })

    const extended = expectValidExtension(existing, [card('nine', 'diamonds')])

    expect(semanticRanks(extended.cards)).toEqual(['five', 'six', 'seven', 'eight', 'nine'])
    expect(extended.activeWildcard).toEqual({ card: pinella, role: 'wildcard', representedRank: 'eight' })
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
