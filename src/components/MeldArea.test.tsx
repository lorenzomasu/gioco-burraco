import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { Team } from '../game/state/types'
import { denseMeldState } from '../tests/denseTable'
import { cardLabel } from './cardPresentation'
import { MeldArea, meldDensity } from './MeldArea'

const deck = createBurracoDeck()
const group = (rank: string): ValidatedMeld => {
  const result = validateMeld(deck.filter((card) => card.rank === rank && card.deckNumber === 1).slice(0, 3))
  if (!result.valid) throw new Error(result.reason)
  return result.meld
}

describe('MeldArea adaptive density (M33.1)', () => {
  it('chooses density from public meld and card counts only', () => {
    expect(meldDensity([])).toBe('roomy')
    expect(meldDensity([group('king'), group('queen'), group('jack')])).toBe('roomy')
    expect(meldDensity(['king', 'queen', 'jack', 'ten'].map(group))).toBe('compact')
    expect(meldDensity(['king', 'queen', 'jack', 'ten', 'nine', 'eight', 'seven'].map(group))).toBe('dense')
    const [longSequence] = denseMeldState().teams[0]!.melds
    expect(longSequence!.cards.length).toBeGreaterThanOrEqual(10)
    expect(meldDensity([longSequence!])).toBe('compact')
    expect(meldDensity(denseMeldState().teams[0]!.melds)).toBe('dense')
  })

  it('renders every meld and card of a dense team with its annotations and extension controls', () => {
    const team: Team = denseMeldState().teams[0]!
    const onExtend = vi.fn()
    render(<MeldArea team={team} owner="La tua squadra" activeTeam canExtend onExtend={onExtend} />)
    const area = screen.getByRole('region', { name: 'Calate squadra 1' })

    expect(area).toHaveAttribute('data-density', 'dense')
    const melds = within(area).getAllByRole('article')
    expect(melds).toHaveLength(team.melds.length)
    team.melds.forEach((meld, index) => {
      const cards = within(melds[index]!).getAllByRole('img')
      expect(cards).toHaveLength(meld.cards.length)
      meld.cards.forEach(({ card }, cardIndex) => expect(cards[cardIndex]!.getAttribute('aria-label')).toContain(cardLabel(card)))
      // The whole-row treatment is presentation of long melds only.
      expect(melds[index]!.hasAttribute('data-long')).toBe(meld.cards.length >= 8)
    })
    expect(within(area).getAllByText(/^Matta → /).length).toBeGreaterThan(0)
    expect(area).toHaveTextContent('Burraco Sporco')
    expect(area).toHaveTextContent('Burraco Pulito')
    // The type word stays in the document for assistive technology.
    expect(within(melds[1]!).getByText('Combinazione')).toBeInTheDocument()

    const extend = within(area).getByRole('button', { name: 'Aggiungi alla calata 2 della squadra 1' })
    expect(extend).toHaveTextContent('Aggiungi alla calata')
    extend.click()
    expect(onExtend).toHaveBeenCalledExactlyOnceWith(1)
  })
})
