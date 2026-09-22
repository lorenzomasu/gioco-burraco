import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { RANKS, type Card, type Rank, type Suit } from '../cards/types'
import type { MeldCardPlacement, ValidatedSequence } from './types'
import { validateSequence } from './validateSequence'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (deckNumber: 1 | 2 = 1, occurrence = 0): Card =>
  deck.filter((candidate) => candidate.rank === 'joker' && candidate.deckNumber === deckNumber)[occurrence]!

const expectSequence = (cards: readonly Card[]): ValidatedSequence => {
  const result = validateSequence(cards)
  expect(result.valid).toBe(true)
  if (!result.valid) throw new Error(`Expected valid sequence, received ${result.reason}`)
  return result.meld
}

const semanticRanks = (placements: readonly MeldCardPlacement[]): readonly (Rank | null)[] =>
  placements.map((placement) =>
    placement.role === 'wildcard' ? placement.representedRank : placement.card.rank as Rank,
  )

describe('validateSequence', () => {
  it('accepts and deterministically normalizes unordered consecutive cards', () => {
    const meld = expectSequence([
      card('five', 'spades'), card('three', 'spades'), card('four', 'spades'),
    ])
    expect(meld.type).toBe('sequence')
    expect(meld.suit).toBe('spades')
    expect(semanticRanks(meld.cards)).toEqual(['three', 'four', 'five'])
  })

  it('rejects incompatible natural suits without blaming an off-suit wildcard pinella', () => {
    expect(validateSequence([
      card('three', 'spades'), card('four', 'hearts'), card('two', 'clubs'),
    ])).toEqual({ valid: false, reason: 'INVALID_SEQUENCE_SUITS' })

    const meld = expectSequence([
      card('three', 'spades'), card('four', 'spades'), card('two', 'hearts'),
    ])
    expect(meld.suit).toBe('spades')
    expect(meld.activeWildcard?.card).toBe(card('two', 'hearts'))
    expect(meld.activeWildcard?.representedRank).toBe('two')
  })

  it.each([
    ['different suits', card('five', 'spades'), card('five', 'hearts')],
    ['same face from two decks', card('five', 'spades', 1), card('five', 'spades', 2)],
  ])('rejects duplicate natural ranks from %s', (kind, firstFive, secondFive) => {
    const result = validateSequence([firstFive, secondFive, card('six', 'spades')])
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe(kind === 'different suits' ? 'INVALID_SEQUENCE_SUITS' : 'DUPLICATE_SEQUENCE_RANK')
    }
  })

  it.each([
    ['Joker', joker()],
    ['pinella', card('two', 'hearts')],
  ])('uses a %s for exactly one internal gap', (_, wildcard) => {
    const meld = expectSequence([
      card('three', 'spades'), card('six', 'spades'), card('four', 'spades'), wildcard,
    ])
    expect(semanticRanks(meld.cards)).toEqual(['three', 'four', 'five', 'six'])
    expect(meld.activeWildcard).toEqual({ card: wildcard, role: 'wildcard', representedRank: 'five' })
  })

  it('rejects a gap of two ranks that one wildcard cannot repair', () => {
    expect(validateSequence([card('three', 'spades'), card('six', 'spades'), joker()]))
      .toEqual({ valid: false, reason: 'INVALID_SEQUENCE_GAPS' })
  })

  it.each([
    ['Joker and pinella', [card('three', 'spades'), card('four', 'spades'), joker(), card('two', 'hearts')]],
    ['two Jokers', [card('three', 'spades'), card('four', 'spades'), joker(1, 0), joker(1, 1)]],
    ['two off-suit pinelle', [
      card('three', 'spades'), card('four', 'spades'), card('two', 'hearts'), card('two', 'clubs'),
    ]],
  ])('rejects two active wildcards: %s', (_, cards) => {
    expect(validateSequence(cards)).toEqual({ valid: false, reason: 'TOO_MANY_WILDCARDS' })
  })

  it.each([
    ['2-3-4', ['two', 'three', 'four'] as const, 'none'],
    ['A-2-3', ['ace', 'two', 'three'] as const, 'low'],
  ])('uses a same-suit 2 naturally in %s', (_, ranks, acePosition) => {
    const two = card('two', 'spades')
    const meld = expectSequence(ranks.map((rank) => card(rank, 'spades')))
    expect(semanticRanks(meld.cards)).toEqual(ranks)
    expect(meld.cards.find((placement) => placement.card.id === two.id)?.role).toBe('natural')
    expect(meld.activeWildcard).toBeNull()
    expect(meld.acePosition).toBe(acePosition)
  })

  it('can use a same-suit 2 as the wildcard when that is the legal interpretation', () => {
    const two = card('two', 'spades')
    const meld = expectSequence([two, card('three', 'spades'), card('five', 'spades')])
    expect(semanticRanks(meld.cards)).toEqual(['three', 'four', 'five'])
    expect(meld.activeWildcard).toEqual({ card: two, role: 'wildcard', representedRank: 'four' })
  })

  it('allows a natural same-suit 2 and one Joker', () => {
    const two = card('two', 'spades')
    const wild = joker()
    const meld = expectSequence([two, card('three', 'spades'), card('four', 'spades'), wild])
    expect(meld.cards.find((placement) => placement.card.id === two.id)?.role).toBe('natural')
    expect(meld.activeWildcard?.card).toBe(wild)
    expect(meld.activeWildcard?.representedRank).toBe('ace')
  })

  it('allows a natural same-suit 2 and another pinella as wildcard', () => {
    const naturalTwo = card('two', 'spades')
    const wildTwo = card('two', 'hearts')
    const meld = expectSequence([
      naturalTwo, card('three', 'spades'), card('four', 'spades'), wildTwo,
    ])
    expect(meld.cards.find((placement) => placement.card.id === naturalTwo.id)?.role).toBe('natural')
    expect(meld.activeWildcard?.card).toBe(wildTwo)
  })

  it('deterministically assigns one duplicate same-suit 2 naturally and the other as wildcard', () => {
    const firstTwo = card('two', 'spades', 1)
    const secondTwo = card('two', 'spades', 2)
    const meld = expectSequence([
      secondTwo, card('four', 'spades'), firstTwo, card('three', 'spades'),
    ])
    expect(meld.cards.find((placement) => placement.card.id === firstTwo.id)?.role).toBe('natural')
    expect(meld.activeWildcard?.card).toBe(secondTwo)
    expect(new Set(meld.cards.map((placement) => placement.card.id)).size).toBe(4)
  })

  it.each([
    ['Ace low', ['ace', 'two', 'three'] as const, 'low'],
    ['Ace high', ['queen', 'king', 'ace'] as const, 'high'],
    ['upper run without Ace', ['jack', 'queen', 'king'] as const, 'none'],
  ])('supports %s', (_, ranks, acePosition) => {
    const meld = expectSequence(ranks.map((rank) => card(rank, 'spades')))
    expect(semanticRanks(meld.cards)).toEqual(ranks)
    expect(meld.acePosition).toBe(acePosition)
  })

  it.each([
    ['physical K-A-2', ['king', 'ace', 'two'] as const, ['queen', 'king', 'ace'] as const, 'queen'],
    ['physical Q-K-A-2', ['queen', 'king', 'ace', 'two'] as const, ['jack', 'queen', 'king', 'ace'] as const, 'jack'],
  ])('resolves %s without semantic Ace wraparound', (_, physicalRanks, resolvedRanks, representedRank) => {
    const pinella = card('two', 'spades')
    const input = physicalRanks.map((rank) => card(rank, 'spades'))
    const meld = expectSequence(input)

    expect(semanticRanks(meld.cards)).toEqual(resolvedRanks)
    expect(semanticRanks(meld.cards)).not.toEqual(['king', 'ace', 'two'])
    expect(semanticRanks(meld.cards)).not.toEqual(['queen', 'king', 'ace', 'two'])
    expect(meld.acePosition).toBe('high')
    expect(meld.activeWildcard).toEqual({
      card: pinella,
      role: 'wildcard',
      representedRank,
    })
    expect(meld.activeWildcard?.card).toBe(pinella)

    const shuffled = [input.at(-1)!, ...input.slice(0, -1).reverse()]
    expect(validateSequence(shuffled)).toEqual(validateSequence(input))
  })

  it('keeps the pinella natural in the real Ace-low A-2-3 sequence', () => {
    const pinella = card('two', 'spades')
    const meld = expectSequence([card('three', 'spades'), pinella, card('ace', 'spades')])
    expect(semanticRanks(meld.cards)).toEqual(['ace', 'two', 'three'])
    expect(meld.cards.find((placement) => placement.card.id === pinella.id)?.role).toBe('natural')
    expect(meld.activeWildcard).toBeNull()
    expect(meld.acePosition).toBe('low')
  })

  it.each([
    {
      name: 'natural J-Q-K-A',
      cards: [card('jack', 'spades'), card('queen', 'spades'), card('king', 'spades'), card('ace', 'spades')],
      semanticRanks: ['jack', 'queen', 'king', 'ace'],
      wildcard: null,
    },
    {
      name: 'J-Q-K plus Joker',
      cards: [card('jack', 'spades'), card('queen', 'spades'), card('king', 'spades'), joker()],
      semanticRanks: ['ten', 'jack', 'queen', 'king'],
      wildcard: joker(),
    },
    {
      name: 'Q-K-A plus Joker',
      cards: [card('queen', 'spades'), card('king', 'spades'), card('ace', 'spades'), joker()],
      semanticRanks: ['jack', 'queen', 'king', 'ace'],
      wildcard: joker(),
    },
    {
      name: 'Q-K-A plus off-suit pinella',
      cards: [
        card('queen', 'spades'), card('king', 'spades'), card('ace', 'spades'), card('two', 'hearts'),
      ],
      semanticRanks: ['jack', 'queen', 'king', 'ace'],
      wildcard: card('two', 'hearts'),
    },
    {
      name: 'Q-K-A plus same-suit pinella',
      cards: [
        card('queen', 'spades'), card('king', 'spades'), card('ace', 'spades'), card('two', 'spades'),
      ],
      semanticRanks: ['jack', 'queen', 'king', 'ace'],
      wildcard: card('two', 'spades'),
    },
  ])('handles Ace-high regression: $name', ({ cards, semanticRanks: expectedRanks, wildcard }) => {
    const meld = expectSequence(cards)
    expect(semanticRanks(meld.cards)).toEqual(expectedRanks)
    expect(meld.acePosition).toBe(expectedRanks.includes('ace') ? 'high' : 'none')
    expect(meld.activeWildcard?.card ?? null).toBe(wildcard)
    if (wildcard) expect(meld.activeWildcard?.representedRank).toBe(expectedRanks[0])
  })

  it('uses a Joker for the missing natural 2 in A-?-3', () => {
    const wild = joker()
    const meld = expectSequence([card('ace', 'spades'), card('three', 'spades'), wild])
    expect(semanticRanks(meld.cards)).toEqual(['ace', 'two', 'three'])
    expect(meld.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'two' })
  })

  it('puts a free Joker at the high end when Ace occupies the low end', () => {
    const wild = joker()
    const meld = expectSequence([
      card('three', 'spades'), wild, card('ace', 'spades'), card('two', 'spades'),
    ])
    expect(semanticRanks(meld.cards)).toEqual(['ace', 'two', 'three', 'four'])
    expect(meld.activeWildcard?.representedRank).toBe('four')
  })

  it('puts an otherwise free wildcard at the lowest available end', () => {
    const meld = expectSequence([card('three', 'spades'), joker(), card('four', 'spades')])
    expect(semanticRanks(meld.cards)).toEqual(['two', 'three', 'four'])
  })

  it('accepts thirteen natural ranks plus a free wildcard as the maximum sequence', () => {
    const wild = joker()
    const meld = expectSequence([...RANKS.map((rank) => card(rank, 'spades')), wild])
    expect(meld.cards).toHaveLength(14)
    expect(meld.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: null })
    expect(meld.cards.at(-1)).toEqual(meld.activeWildcard)
  })

  it('rejects a candidate beyond the fourteen-card sequence maximum', () => {
    const oversized = [
      ...RANKS.map((rank) => card(rank, 'spades')),
      joker(),
      card('two', 'hearts'),
    ]
    expect(validateSequence(oversized)).toEqual({ valid: false, reason: 'TOO_MANY_CARDS' })
  })

  it('rejects duplicate physical IDs before interpreting roles', () => {
    const repeated = card('three', 'spades')
    expect(validateSequence([repeated, { ...repeated }, card('four', 'spades')]))
      .toEqual({ valid: false, reason: 'DUPLICATE_CARD_ID' })
  })

  it('preserves physical wildcard identity separately from its represented rank', () => {
    const wild = joker()
    const meld = expectSequence([card('three', 'spades'), wild, card('five', 'spades')])
    expect(meld.activeWildcard?.card).toBe(wild)
    expect(meld.activeWildcard?.card.rank).toBe('joker')
    expect(meld.activeWildcard?.representedRank).toBe('four')
  })

  it('does not mutate inputs and returns identical semantics for every input order', () => {
    const input = [card('six', 'spades'), joker(), card('three', 'spades'), card('four', 'spades')]
    const reversed = [...input].reverse()
    const before = [...input]
    const reversedBefore = [...reversed]
    expect(validateSequence(input)).toEqual(validateSequence(reversed))
    expect(input).toEqual(before)
    expect(reversed).toEqual(reversedBefore)
  })
})
