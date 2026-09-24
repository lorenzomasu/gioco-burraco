import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BotPublicActionEvent } from '../game/bot'
import { dealInitialState } from '../game/engine/startGame'
import { createBurracoDeck } from '../game/cards/deck'
import { BotActionTimeline } from './BotActionTimeline'

const { players } = dealInitialState(createBurracoDeck())

const events: readonly BotPublicActionEvent[] = [
  { type: 'draw-stock', playerId: 'player-2' },
  { type: 'collect-discard-pile', playerId: 'player-3', cardCount: 2 },
  { type: 'take-pozzetto', playerId: 'player-4', mode: 'flight' },
]

describe('BotActionTimeline disclosure', () => {
  it('starts collapsed and toggles its visual history without remounting the log', () => {
    render(<BotActionTimeline events={events.slice(0, 1)} players={players} />)
    const toggle = screen.getByRole('button', { name: /^Cronologia bot/ })
    const log = screen.getByRole('log', { name: 'Cronologia bot' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('1 azione')
    expect(screen.getByRole('region', { name: 'Cronologia bot' })).toContainElement(log)

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('log', { name: 'Cronologia bot' })).toBe(log)
  })

  it('appends new events in order to the existing entries while collapsed', () => {
    const { rerender } = render(<BotActionTimeline events={events.slice(0, 1)} players={players} />)
    const log = screen.getByRole('log', { name: 'Cronologia bot' })
    const [first] = within(log).getAllByRole('listitem')

    rerender(<BotActionTimeline events={events} players={players} />)

    const items = within(log).getAllByRole('listitem')
    expect(items[0]).toBe(first)
    expect(items.map((item) => item.textContent)).toEqual([
      'North pesca dal tallone.',
      'Partner raccoglie il monte degli scarti (2 carte).',
      'South prende il pozzetto al volo.',
    ])
    expect(screen.getByRole('button', { name: /^Cronologia bot/ })).toHaveTextContent('3 azioni')
    expect(screen.getByText('Ultima: South prende il pozzetto al volo.')).toHaveAttribute('aria-hidden', 'true')
  })

  it('follows a controlled expanded state from its owner', () => {
    const changes: boolean[] = []
    const { rerender } = render(
      <BotActionTimeline events={[]} players={players} expanded onExpandedChange={(next) => changes.push(next)} />,
    )
    const toggle = screen.getByRole('button', { name: /^Cronologia bot/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Nessuna azione automatica in questa smazzata.')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(changes).toEqual([false])
    rerender(<BotActionTimeline events={[]} players={players} expanded={false} onExpandedChange={() => {}} />)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
