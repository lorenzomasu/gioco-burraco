import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import { dealInitialState } from '../game/engine/startGame'
import { PlayerSeat } from './PlayerSeat'

const { players } = dealInitialState(createBurracoDeck())
const partner = players.find(({ id }) => id === 'player-3')!
const north = players.find(({ id }) => id === 'player-2')!

describe('PlayerSeat', () => {
  it('states the relation to the human and the team in text', () => {
    render(<PlayerSeat player={partner} position="top" relation="teammate" bot />)
    const seat = screen.getByRole('region', { name: 'Giocatore Partner' })

    expect(seat).toHaveAttribute('data-seat', 'top')
    expect(seat).toHaveTextContent('Partner · Bot')
    expect(seat).toHaveTextContent('Compagno · Squadra 1')
    expect(seat).not.toHaveAttribute('aria-current')
    expect(screen.getByLabelText(`${partner.hand.length} carte in mano`)).toBeInTheDocument()
  })

  it('marks the active opponent seat in text and with aria-current', () => {
    render(<PlayerSeat player={north} position="left" relation="opponent" bot active />)
    const seat = screen.getByRole('region', { name: 'Giocatore North' })

    expect(seat).toHaveTextContent('Avversario · Squadra 2')
    expect(seat).toHaveTextContent('Di turno')
    expect(seat).toHaveAttribute('aria-current', 'true')
  })
})
