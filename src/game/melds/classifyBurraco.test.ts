import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { RANKS, type Card, type Rank, type Suit } from '../cards/types'
import { classifyBurraco } from './classifyBurraco'
import type { ValidatedMeld } from './types'
import { validateMeld } from './validateMeld'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!
const allOfRank = (rank: Rank): readonly Card[] => deck.filter((candidate) => candidate.rank === rank)

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const spadeSequence = (ranks: readonly Rank[]): ValidatedMeld =>
  validatedMeld(ranks.map((rank) => card(rank, 'spades')))

describe('classifyBurraco', () => {
  it.each([
    ['a three-card group', validatedMeld(allOfRank('four').slice(0, 3))],
    ['a six-card sequence', spadeSequence(['three', 'four', 'five', 'six', 'seven', 'eight'])],
    ['a six-card sequence with an active wildcard', validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), joker(),
    ])],
  ])('classifies %s as none', (_, meld) => {
    expect(classifyBurraco(meld)).toBe('none')
  })

  it('classifies exactly seven natural sequence cards as clean', () => {
    expect(classifyBurraco(spadeSequence([
      'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    ]))).toBe('clean')
  })

  it('classifies more than seven natural sequence cards as clean', () => {
    expect(classifyBurraco(spadeSequence([
      'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    ]))).toBe('clean')
  })

  it('classifies a seven-card natural combination as clean', () => {
    expect(classifyBurraco(validatedMeld(allOfRank('queen').slice(0, 7)))).toBe('clean')
  })

  it('treats a physical pinella interpreted as the natural 2 as clean', () => {
    const meld = spadeSequence(['ace', 'two', 'three', 'four', 'five', 'six', 'seven'])
    const pinella = meld.cards.find((placement) => placement.card.rank === 'two')

    expect(pinella?.role).toBe('natural')
    expect(meld.activeWildcard).toBeNull()
    expect(classifyBurraco(meld)).toBe('clean')
  })

  it('classifies a seven-card sequence with an active Joker as dirty', () => {
    const meld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'), joker(),
    ])

    expect(meld.activeWildcard?.card.rank).toBe('joker')
    expect(classifyBurraco(meld)).toBe('dirty')
  })

  it('classifies a seven-card sequence with a wildcard pinella as dirty', () => {
    const wildPinella = card('two', 'hearts')
    const meld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'), wildPinella,
    ])

    expect(meld.activeWildcard).toMatchObject({ card: wildPinella, role: 'wildcard' })
    expect(classifyBurraco(meld)).toBe('dirty')
  })

  it('classifies an eight-card sequence with a wildcard before seven cards as semi-clean', () => {
    const meld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'),
      card('nine', 'spades'), joker(),
    ])

    expect(meld.cards[0]?.role).toBe('wildcard')
    expect(classifyBurraco(meld)).toBe('semi-clean')
  })

  it('classifies an eight-card sequence with a wildcard after seven cards as semi-clean', () => {
    const meld = validatedMeld([
      card('ace', 'spades'), card('two', 'spades'), card('three', 'spades'),
      card('four', 'spades'), card('five', 'spades'), card('six', 'spades'),
      card('seven', 'spades'), joker(),
    ])

    expect(meld.cards.at(-1)?.role).toBe('wildcard')
    expect(classifyBurraco(meld)).toBe('semi-clean')
  })

  it('classifies a longer sequence with an end wildcard and eight cards on the other side as semi-clean', () => {
    const meld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'),
      card('nine', 'spades'), card('ten', 'spades'), joker(),
    ])

    expect(meld.cards[0]?.role).toBe('wildcard')
    expect(classifyBurraco(meld)).toBe('semi-clean')
  })

  it('classifies a longer sequence with an internal wildcard as dirty', () => {
    const meld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'),
      card('nine', 'spades'), card('jack', 'spades'), joker(),
    ])

    expect(meld.cards.findIndex((placement) => placement.role === 'wildcard')).toBe(7)
    expect(classifyBurraco(meld)).toBe('dirty')
  })

  it('classifies a seven-card combination with a wildcard as dirty', () => {
    expect(classifyBurraco(validatedMeld([
      ...allOfRank('seven').slice(0, 6), joker(),
    ]))).toBe('dirty')
  })

  it('classifies an eight-card combination including a wildcard as semi-clean', () => {
    expect(classifyBurraco(validatedMeld([
      ...allOfRank('seven').slice(0, 7), joker(),
    ]))).toBe('semi-clean')
  })

  it('classifies the legal nine-card combination including a wildcard as dirty', () => {
    expect(classifyBurraco(validatedMeld([
      ...allOfRank('seven'), joker(),
    ]))).toBe('dirty')
  })

  it('treats a free wildcard with representedRank null as an active end wildcard', () => {
    const meld = validatedMeld([
      ...RANKS.map((rank) => card(rank, 'spades')),
      joker(),
    ])

    expect(meld.activeWildcard?.representedRank).toBeNull()
    expect(meld.cards.at(-1)).toBe(meld.activeWildcard)
    expect(classifyBurraco(meld)).toBe('semi-clean')
  })

  it('does not mutate the validated meld or its semantic placements', () => {
    const meld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'),
      card('nine', 'spades'), joker(),
    ])
    const before = structuredClone(meld)
    const cards = meld.cards
    const activeWildcard = meld.activeWildcard

    classifyBurraco(meld)

    expect(meld).toEqual(before)
    expect(meld.cards).toBe(cards)
    expect(meld.activeWildcard).toBe(activeWildcard)
  })

  it('returns the same classification on repeated calls', () => {
    const meld = validatedMeld([
      ...allOfRank('king').slice(0, 7), joker(),
    ])

    expect(classifyBurraco(meld)).toBe('semi-clean')
    expect(classifyBurraco(meld)).toBe('semi-clean')
  })
})
