import type { Card } from '../game/cards/types'
import { sortCardsForDisplay } from './cardPresentation'

/**
 * Presentation-only order of the human hand, as physical card IDs. It is transient React
 * state: it never enters `GameState`, `MatchState` or the local save, and the engine hand
 * stays authoritative for which cards the player holds.
 */
export type HandOrder = readonly string[]

/** The deterministic default order: the existing display sort of the current hand. */
export const sortedHandOrder = (hand: readonly Card[]): HandOrder =>
  sortCardsForDisplay(hand).map(({ id }) => id)

/**
 * Reconciles a presentation order with the committed hand: surviving cards keep their
 * relative visible order, cards no longer held disappear and newly held cards are appended
 * in their engine-hand order. Returns the same array when nothing changed.
 */
export const reconcileHandOrder = (order: HandOrder, hand: readonly Card[]): HandOrder => {
  const held = new Set(hand.map(({ id }) => id))
  const survivors = order.filter((id) => held.has(id))
  const known = new Set(survivors)
  const added = hand.filter(({ id }) => !known.has(id)).map(({ id }) => id)
  const next = [...survivors, ...added]
  return next.length === order.length && next.every((id, index) => id === order[index]) ? order : next
}

/** The payload IDs in their current visible order. */
export const inVisibleOrder = (order: HandOrder, cardIds: Iterable<string>): string[] => {
  const wanted = new Set(cardIds)
  return order.filter((id) => wanted.has(id))
}

/**
 * Moves the payload as one contiguous group to an insertion boundary of the current order
 * (`0` = before the first card, `order.length` = after the last). The payload keeps its
 * relative visible order and so does every other card.
 */
export const moveCardsToBoundary = (order: HandOrder, payload: Iterable<string>, boundary: number): HandOrder => {
  const moving = new Set(payload)
  const group = order.filter((id) => moving.has(id))
  if (group.length === 0) return order
  const clamped = Math.max(0, Math.min(boundary, order.length))
  const rest = order.filter((id) => !moving.has(id))
  const insertAt = order.slice(0, clamped).filter((id) => !moving.has(id)).length
  const next = [...rest.slice(0, insertAt), ...group, ...rest.slice(insertAt)]
  return next.every((id, index) => id === order[index]) ? order : next
}

export type ShiftDirection = 'left' | 'right'

/**
 * The boundary for moving the selected group by one step, or `null` when no move is
 * possible: left places the group before the card preceding its first card, right after
 * the card following its last card. A non-contiguous selection is gathered into one group.
 */
const shiftBoundary = (order: HandOrder, selected: ReadonlySet<string>, direction: ShiftDirection): number | null => {
  const positions = order.flatMap((id, index) => selected.has(id) ? [index] : [])
  if (positions.length === 0) return null
  if (direction === 'left') {
    const first = positions[0]!
    for (let index = first - 1; index >= 0; index -= 1) {
      if (!selected.has(order[index]!)) return index
    }
    return null
  }
  const last = positions.at(-1)!
  const after = order.slice(last + 1).findIndex((id) => !selected.has(id))
  return after === -1 ? null : last + after + 2
}

export const canShiftCards = (order: HandOrder, selected: ReadonlySet<string>, direction: ShiftDirection): boolean =>
  shiftBoundary(order, selected, direction) !== null

/** Moves the selected cards one insertion step left or right as one stable group. */
export const shiftCards = (order: HandOrder, selected: ReadonlySet<string>, direction: ShiftDirection): HandOrder => {
  const boundary = shiftBoundary(order, selected, direction)
  return boundary === null ? order : moveCardsToBoundary(order, selected, boundary)
}
