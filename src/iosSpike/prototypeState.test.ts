import { describe, expect, it } from 'vitest'
import { canDiscard, createSpikeFixture, spikeReducer } from './prototypeState'

describe('M39 prototype presentation state', () => {
  it('is deterministic and keeps every physical card in exactly one region', () => {
    const state = createSpikeFixture()
    expect(createSpikeFixture()).toEqual(state)
    const ids = [...state.hand, ...state.stock, ...state.discardPile, ...state.ownMeld].map((card) => card.id)
    expect(ids).toHaveLength(108)
    expect(new Set(ids).size).toBe(108)
    expect(state.hand).toHaveLength(11)
  })

  it('toggles selection only for cards in the hand', () => {
    const state = createSpikeFixture()
    const [first] = state.hand
    const selected = spikeReducer(state, { type: 'toggle', cardId: first.id })
    expect(selected.selectedIds).toEqual([first.id])
    expect(spikeReducer(selected, { type: 'toggle', cardId: first.id }).selectedIds).toEqual([])
    expect(spikeReducer(state, { type: 'toggle', cardId: state.stock[0].id })).toBe(state)
  })

  it('draws the front stock card into the end of the hand', () => {
    const state = createSpikeFixture()
    const drawn = spikeReducer(state, { type: 'draw' })
    expect(drawn.hand.at(-1)).toBe(state.stock[0])
    expect(drawn.stock).toEqual(state.stock.slice(1))
    expect(spikeReducer({ ...state, stock: [] }, { type: 'draw' }).hand).toEqual(state.hand)
  })

  it('discards exactly one selected card onto the discard pile and clears the selection', () => {
    const state = createSpikeFixture()
    const [first, second] = state.hand
    expect(canDiscard(state)).toBe(false)
    expect(spikeReducer(state, { type: 'discard' })).toBe(state)

    const two = spikeReducer(spikeReducer(state, { type: 'toggle', cardId: first.id }), { type: 'toggle', cardId: second.id })
    expect(canDiscard(two)).toBe(false)
    expect(spikeReducer(two, { type: 'discard' })).toBe(two)

    const one = spikeReducer(two, { type: 'toggle', cardId: second.id })
    const discarded = spikeReducer(one, { type: 'discard' })
    expect(discarded.discardPile.at(-1)).toBe(first)
    expect(discarded.hand).not.toContain(first)
    expect(discarded.selectedIds).toEqual([])
    expect(spikeReducer(discarded, { type: 'reset' })).toEqual(createSpikeFixture())
  })
})
