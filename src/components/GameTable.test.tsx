import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { drawCard } from '../game/engine/turn'
import { dealInitialState } from '../game/engine/startGame'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { CompletedGameState, InProgressGameState } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { GameTable } from './GameTable'

const deck = createBurracoDeck()

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card => {
  const match = deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )
  if (!match) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return match
}

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const actionState = (
  hand: readonly Card[],
  teamOneMelds: readonly ValidatedMeld[] = [],
): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, hand } : player),
    teams: initial.teams.map((team) => team.id === 'team-1'
      ? { ...team, melds: teamOneMelds }
      : team),
    round: {
      status: 'in-progress',
      turn: {
        currentPlayerId: 'player-1',
        phase: 'action',
        acquisition: { source: 'drawPile', cardIds: [] },
      },
    },
  }
}

describe('GameTable', () => {
  it('renders the initial table, all four players, piles, and draw phase', () => {
    render(<GameTable initialState={dealInitialState(deck)} />)

    expect(screen.getByRole('region', { name: 'Tavolo di Burraco' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mano di You' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giocatore North' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giocatore Partner' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giocatore South' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pesca dal tallone, 41 carte rimaste' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Raccogli il monte degli scarti, 1 carta' })).toBeEnabled()
    expect(screen.getByText('Pesca')).toBeInTheDocument()
  })

  it('draws through the engine and reflects the action phase and enlarged hand', () => {
    render(<GameTable initialState={dealInitialState(deck)} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pesca dal tallone, 41 carte rimaste' }))

    expect(screen.getByText('Gioco')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('12 carte')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pesca dal tallone, 40 carte rimaste' })).toBeDisabled()
  })

  it('takes the discard pile through the engine and empties the visible pile', () => {
    render(<GameTable initialState={dealInitialState(deck)} />)

    fireEvent.click(screen.getByRole('button', { name: 'Raccogli il monte degli scarti, 1 carta' }))

    expect(screen.getByText('Gioco')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('12 carte')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monte degli scarti vuoto' })).toBeDisabled()
  })

  it('discards the selected physical card and rotates the hot-seat hand', () => {
    const state = drawCard(dealInitialState(deck), 'player-1')
    const selected = state.players[0]!.hand[0]!
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(screen.getByRole('region', { name: 'Mano di North' })).toBeInTheDocument()
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mano di You' })).not.toBeInTheDocument()
  })

  it('creates a valid meld from selected physical cards', () => {
    const meldCards = [
      card('seven', 'clubs'),
      card('seven', 'diamonds'),
      card('seven', 'hearts'),
    ]
    const remainingCard = card('king', 'spades')
    render(<GameTable initialState={actionState([...meldCards, remainingCard])} />)

    for (const selected of meldCards) {
      fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    const teamArea = screen.getByRole('region', { name: 'Calate squadra 1' })
    expect(within(teamArea).getByText('Combinazione')).toBeInTheDocument()
    expect(within(teamArea).getAllByRole('img')).toHaveLength(3)
    const hand = screen.getByRole('region', { name: 'Mano di You' })
    expect(within(hand).getAllByRole('button', { pressed: false })).toHaveLength(1)
    expect(within(hand).getByRole('button', { name: cardLabel(remainingCard) })).toBeInTheDocument()
  })

  it('extends an existing team meld with the selected card', () => {
    const existingMeld = validatedMeld([
      card('seven', 'clubs'),
      card('seven', 'diamonds'),
      card('seven', 'hearts'),
    ])
    const extension = card('seven', 'spades')
    const remainingCard = card('king', 'spades')
    render(<GameTable initialState={actionState([extension, remainingCard], [existingMeld])} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(extension) }))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata' }))

    const teamArea = screen.getByRole('region', { name: 'Calate squadra 1' })
    expect(within(teamArea).getAllByRole('img')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: cardLabel(extension) })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: cardLabel(remainingCard) })).toBeInTheDocument()
  })

  it('shows an engine rule error without losing state or selection', () => {
    const invalidCards = [
      card('three', 'clubs'),
      card('five', 'hearts'),
      card('seven', 'spades'),
    ]
    render(<GameTable initialState={actionState([...invalidCards, card('king', 'diamonds')])} />)

    for (const selected of invalidCards) {
      fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Le carte selezionate non formano una calata valida.')
    expect(screen.getByText('4 carte')).toBeInTheDocument()
    for (const selected of invalidCards) {
      expect(screen.getByRole('button', { name: cardLabel(selected) })).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('starts a fresh engine game and clears transient UI state', () => {
    const invalidCards = [
      card('three', 'clubs'),
      card('five', 'hearts'),
      card('seven', 'spades'),
    ]
    const createGame = vi.fn(() => dealInitialState(deck))
    render(
      <GameTable
        initialState={actionState([...invalidCards, card('king', 'diamonds')])}
        createGame={createGame}
      />,
    )

    for (const selected of invalidCards) {
      fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(createGame).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    expect(screen.getByText('Pesca')).toBeInTheDocument()
  })

  it('renders the engine scoring breakdown and removes gameplay controls for a completed round', () => {
    const cleanBurraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const base = actionState([], [cleanBurraco])
    const completed: CompletedGameState = {
      ...base,
      teams: base.teams.map((team) => team.id === 'team-1'
        ? { ...team, hasTakenPozzetto: true }
        : team),
      round: { status: 'completed', closedByPlayerId: 'player-1', closingTeamId: 'team-1' },
    }

    render(<GameTable initialState={completed} />)

    expect(screen.getByRole('heading', { name: 'Ha chiuso You' })).toBeInTheDocument()
    expect(screen.getAllByText('Carte calate')).toHaveLength(2)
    expect(screen.getAllByText('Bonus Burraco')).toHaveLength(2)
    expect(screen.getAllByText('Bonus chiusura')).toHaveLength(2)
    expect(screen.getAllByText('Carte in mano')).toHaveLength(2)
    expect(screen.getAllByText('Pozzetto')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Cala' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scarta e passa' })).not.toBeInTheDocument()
  })
})
