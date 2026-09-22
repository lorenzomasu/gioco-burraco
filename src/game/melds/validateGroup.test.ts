import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Rank, Suit } from '../cards/types'
import { validateGroup } from './validateGroup'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (deckNumber: 1 | 2 = 1, occurrence = 0): Card =>
  deck.filter((candidate) => candidate.rank === 'joker' && candidate.deckNumber === deckNumber)[occurrence]!
const allOfRank = (rank: Rank): readonly Card[] => deck.filter((candidate) => candidate.rank === rank)

describe('validateGroup', () => {
  it.each([
    ['three naturals', [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]],
    ['four naturals', [
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'), card('seven', 'spades'),
    ]],
    ['same face from both decks', [
      card('seven', 'clubs', 1), card('seven', 'clubs', 2), card('seven', 'hearts'),
    ]],
  ])('accepts %s as a same-rank group', (_, cards) => {
    const result = validateGroup(cards)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.meld.type).toBe('group')
      expect(result.meld.rank).toBe('seven')
      expect(result.meld.cards.every((placement) => placement.role === 'natural')).toBe(true)
    }
  })

  it('rejects different natural ranks', () => {
    expect(validateGroup([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('eight', 'hearts'),
    ])).toEqual({ valid: false, reason: 'NOT_A_VALID_GROUP' })
  })

  it('rejects fewer than three cards', () => {
    expect(validateGroup([card('seven', 'clubs'), card('seven', 'diamonds')]))
      .toEqual({ valid: false, reason: 'TOO_FEW_CARDS' })
  })

  it.each([
    ['pinelle', [card('two', 'clubs'), card('two', 'diamonds'), card('two', 'hearts')]],
    ['Jokers', [joker(1, 0), joker(1, 1), joker(2, 0)]],
    ['mixed matte', [card('two', 'clubs'), joker(1, 0), card('two', 'hearts')]],
  ])('rejects a group made only of %s', (_, cards) => {
    expect(validateGroup(cards)).toEqual({ valid: false, reason: 'GROUP_CANNOT_BE_WILDCARDS_ONLY' })
  })

  it.each([
    ['Joker', joker()],
    ['pinella', card('two', 'spades')],
  ])('accepts two naturals plus one %s', (_, wildcard) => {
    const cards = [card('seven', 'clubs'), card('seven', 'diamonds'), wildcard]
    const result = validateGroup(cards)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.meld.activeWildcard).toEqual({
        card: wildcard,
        role: 'wildcard',
        representedRank: 'seven',
      })
      expect(result.meld.cards.at(-1)?.card).toBe(wildcard)
    }
  })

  it('rejects two active wildcards', () => {
    expect(validateGroup([
      card('seven', 'clubs'), card('seven', 'diamonds'), joker(), card('two', 'hearts'),
    ])).toEqual({ valid: false, reason: 'TOO_MANY_WILDCARDS' })
  })

  it('accepts all eight physical naturals of one rank', () => {
    const result = validateGroup(allOfRank('seven'))
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.meld.cards).toHaveLength(8)
  })

  it('accepts eight naturals plus one wildcard', () => {
    const result = validateGroup([...allOfRank('seven'), joker()])
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.meld.cards).toHaveLength(9)
  })

  it('enforces the eight-natural limit independently of the total-size limit', () => {
    const ninthNatural: Card = { ...card('seven', 'clubs'), id: 'synthetic-ninth-seven' }
    expect(validateGroup([...allOfRank('seven'), ninthNatural]))
      .toEqual({ valid: false, reason: 'TOO_MANY_CARDS' })
  })

  it('rejects more than nine total cards', () => {
    expect(validateGroup([...allOfRank('seven'), joker(), card('two', 'hearts')]))
      .toEqual({ valid: false, reason: 'TOO_MANY_CARDS' })
  })

  it('rejects duplicate physical IDs even when the object is copied', () => {
    const repeated = card('seven', 'clubs')
    expect(validateGroup([repeated, { ...repeated }, card('seven', 'hearts')]))
      .toEqual({ valid: false, reason: 'DUPLICATE_CARD_ID' })
  })

  it('normalizes independently of input order and does not mutate either input', () => {
    const firstInput = [joker(), card('seven', 'hearts'), card('seven', 'clubs')]
    const secondInput = [...firstInput].reverse()
    const firstBefore = [...firstInput]
    const secondBefore = [...secondInput]
    const first = validateGroup(firstInput)
    const second = validateGroup(secondInput)
    expect(first).toEqual(second)
    expect(firstInput).toEqual(firstBefore)
    expect(secondInput).toEqual(secondBefore)
  })
})
