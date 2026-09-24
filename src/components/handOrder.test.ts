import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card } from '../game/cards/types'
import { sortCardsForDisplay } from './cardPresentation'
import {
  canShiftCards,
  inVisibleOrder,
  moveCardsToBoundary,
  reconcileHandOrder,
  shiftCards,
  sortedHandOrder,
} from './handOrder'

const deck = createBurracoDeck()
const cards = (...ids: string[]): Card[] => ids.map((id) => deck.find((card) => card.id === id)!)
const [a, b, c, d, e] = ['A', 'B', 'C', 'D', 'E']

describe('hand presentation order', () => {
  it('seeds from the existing deterministic display sort', () => {
    const hand = deck.slice(40, 52).reverse()
    expect(sortedHandOrder(hand)).toEqual(sortCardsForDisplay(hand).map(({ id }) => id))
  })

  it('keeps surviving order, drops removed cards and appends new ones in engine-hand order', () => {
    const [x, y, z, p, q] = deck.slice(0, 5)
    const order = [z!.id, x!.id, y!.id]
    // y left the hand; q and p arrived in that engine-hand order.
    const next = reconcileHandOrder(order, [x!, z!, q!, p!])
    expect(next).toEqual([z!.id, x!.id, q!.id, p!.id])
  })

  it('returns the same order when the hand is unchanged', () => {
    const hand = deck.slice(0, 4)
    const order = sortedHandOrder(hand)
    expect(reconcileHandOrder(order, [...hand].reverse())).toBe(order)
  })

  it('moves one card to any insertion boundary', () => {
    const order = [a, b, c, d]
    expect(moveCardsToBoundary(order, [a], 3)).toEqual([b, c, a, d])
    expect(moveCardsToBoundary(order, [d], 0)).toEqual([d, a, b, c])
    expect(moveCardsToBoundary(order, [b], 4)).toEqual([a, c, d, b])
    // A boundary next to the card itself changes nothing.
    expect(moveCardsToBoundary(order, [b], 1)).toBe(order)
    expect(moveCardsToBoundary(order, [b], 2)).toBe(order)
  })

  it('moves a payload as one contiguous group, preserving both relative orders', () => {
    const order = [a, b, c, d, e]
    // Payload given out of visible order still keeps the visible order (b before d).
    expect(moveCardsToBoundary(order, [d, b], 0)).toEqual([b, d, a, c, e])
    expect(moveCardsToBoundary(order, [b, d], 5)).toEqual([a, c, e, b, d])
    expect(moveCardsToBoundary(order, [a, e], 3)).toEqual([b, c, a, e, d])
  })

  it('orders a payload by visible order', () => {
    expect(inVisibleOrder([a, b, c, d], new Set([d, a]))).toEqual([a, d])
  })

  it('shifts a selected group one step and reports when no move is possible', () => {
    const order = [a, b, c, d, e]
    const selected = new Set([b, c])
    expect(shiftCards(order, selected, 'left')).toEqual([b, c, a, d, e])
    expect(shiftCards(order, selected, 'right')).toEqual([a, d, b, c, e])
    expect(canShiftCards([b, c, a], selected, 'left')).toBe(false)
    expect(canShiftCards([a, b, c], selected, 'right')).toBe(false)
    expect(canShiftCards(order, new Set(), 'left')).toBe(false)
    expect(canShiftCards(order, new Set(), 'right')).toBe(false)
  })

  it('gathers a non-contiguous selection into one group when shifting', () => {
    const order = [a, b, c, d, e]
    expect(shiftCards(order, new Set([b, d]), 'left')).toEqual([b, d, a, c, e])
    expect(shiftCards(order, new Set([b, d]), 'right')).toEqual([a, c, e, b, d])
  })

  it('works on real physical IDs from both decks', () => {
    const twins = cards(...deck.filter((card) => card.rank === 'seven' && card.suit === 'hearts').map(({ id }) => id))
    expect(twins).toHaveLength(2)
    const order = sortedHandOrder(twins)
    expect(moveCardsToBoundary(order, [order[0]!], 2)).toEqual([order[1], order[0]])
  })
})
