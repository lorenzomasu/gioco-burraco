import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { InProgressGameState } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { BOT_STEP_DELAY_MS, GameTable } from './GameTable'
import { REJECTION_COACHING } from './guidedCoaching'

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

const drawPhaseState = (discardPile?: readonly Card[]): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    discardPile: discardPile ?? initial.discardPile,
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
  }
}

/** A deterministic table: the human is in the action phase; every bot holds two cards. */
const actionState = (
  hand: readonly Card[],
  teamOne: Readonly<{ melds?: readonly ValidatedMeld[]; hasTakenPozzetto?: boolean }> = {},
): InProgressGameState => {
  const initial = dealInitialState(deck)
  const botHands = new Map([
    ['player-2', [card('three', 'hearts'), card('five', 'diamonds')]],
    ['player-3', [card('four', 'hearts'), card('six', 'diamonds')]],
    ['player-4', [card('five', 'spades'), card('seven', 'diamonds')]],
  ] as const)
  return {
    ...initial,
    players: initial.players.map((player) => ({
      ...player,
      hand: player.id === 'player-1' ? hand : botHands.get(player.id as 'player-2')!,
    })),
    teams: initial.teams.map((team) => team.id === 'team-1'
      ? { ...team, melds: teamOne.melds ?? [], hasTakenPozzetto: teamOne.hasTakenPozzetto ?? false }
      : { ...team, melds: [], hasTakenPozzetto: false }),
    drawPile: [
      card('king', 'clubs'), card('queen', 'diamonds'), card('ace', 'hearts'),
      card('jack', 'diamonds'), card('ten', 'diamonds'), card('eight', 'diamonds'),
    ],
    discardPile: [],
    round: {
      status: 'in-progress',
      turn: { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

/** North (opponent team) melds out in its action phase and takes its pozzetto. */
const botPozzettoState = (): InProgressGameState => {
  const base = actionState([card('king', 'hearts'), card('ace', 'spades')])
  return {
    ...base,
    players: base.players.map((player) => player.id === 'player-2'
      ? { ...player, hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')] }
      : player),
    round: {
      status: 'in-progress',
      turn: { currentPlayerId: 'player-2', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

const coach = () => screen.queryByRole('region', { name: 'Guida contestuale' })
const guided = (state: InProgressGameState, onDismiss = vi.fn()) =>
  render(<GameTable initialState={state} guidance={{ enabled: true, onDismiss }} />)
const select = (...cards: readonly Card[]) => {
  for (const selected of cards) fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
}

describe('GameTable contextual coach (M36)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('shows a named, non-live coach with a dismiss control when guidance is enabled', () => {
    const onDismiss = vi.fn()
    guided(drawPhaseState(), onDismiss)

    const region = coach()!
    expect(within(region).getByRole('heading', { name: 'Guida contestuale' })).toBeInTheDocument()
    expect(region).toHaveTextContent('pesca dal tallone oppure raccogli tutto il monte degli scarti')
    expect(region.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
    expect(region.querySelector('[aria-live]')).toBeNull()
    // It replaces the compact line instead of duplicating it.
    expect(document.querySelector('.turn-guidance')).toBeNull()
    // Unavailable-control reasons stay in a closed native disclosure, keeping the coach compact.
    const details = region.querySelector('details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(region).getByText('Comandi disattivati e chiusura').tagName).toBe('SUMMARY')
    expect(details).toHaveTextContent('«Cala» e «Scarta e passa» si attivano solo dopo')

    const dismiss = within(region).getByRole('button', { name: 'Nascondi guida' })
    dismiss.focus()
    expect(dismiss).toHaveFocus()
    fireEvent.click(dismiss)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('keeps the existing compact guidance when disabled or not provided', () => {
    const { unmount } = render(
      <GameTable initialState={drawPhaseState()} guidance={{ enabled: false, onDismiss: vi.fn() }} />,
    )
    expect(coach()).toBeNull()
    expect(screen.getByText('Tocca a te: pesca una carta dal tallone oppure raccogli il monte degli scarti.'))
      .toBeInTheDocument()
    unmount()

    render(<GameTable initialState={drawPhaseState()} />)
    expect(coach()).toBeNull()
    expect(screen.getByText(/^Tocca a te: pesca una carta/)).toBeInTheDocument()
  })

  it('derives acquisition coaching from the actual pile controls and leaves them unchanged', () => {
    guided(drawPhaseState([]))

    expect(coach()).toHaveTextContent('pesca dal tallone (il monte degli scarti è vuoto)')
    expect(coach()).toHaveTextContent('«Cala» e «Scarta e passa» si attivano solo dopo')
    expect(screen.getByRole('button', { name: /^Pesca dal tallone/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Raccogli tutto il monte degli scarti/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cala' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scarta e passa' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(coach()).toHaveTextContent('Seleziona carte per provare «Cala»')
  })

  it('tracks the UI selection count without changing the Cala/Scarta e passa contracts', () => {
    const hand = [card('three', 'clubs'), card('five', 'hearts'), card('king', 'spades')]
    guided(actionState(hand))
    const meldButton = screen.getByRole('button', { name: 'Cala' })
    const discardButton = screen.getByRole('button', { name: 'Scarta e passa' })

    expect(coach()).toHaveTextContent('«Cala» richiede almeno una carta selezionata.')
    expect(meldButton).toBeDisabled()
    expect(discardButton).toBeDisabled()

    select(hand[0]!)
    expect(coach()).toHaveTextContent('«Scarta e passa» scarta la carta selezionata')
    expect(coach()).not.toHaveTextContent('richiede')
    expect(meldButton).toBeEnabled()
    expect(discardButton).toBeEnabled()

    select(hand[1]!)
    expect(coach()).toHaveTextContent('Con 2 carte selezionate prova «Cala»')
    expect(coach()).toHaveTextContent('«Scarta e passa» richiede esattamente una carta selezionata.')
    expect(meldButton).toBeEnabled()
    expect(discardButton).toBeDisabled()
  })

  it('explains an invalid meld only after the engine rejected it, keeping the state atomic', () => {
    const invalid = [card('three', 'clubs'), card('five', 'hearts'), card('seven', 'spades')]
    guided(actionState([...invalid, card('king', 'diamonds')]))
    expect(coach()).not.toHaveTextContent(REJECTION_COACHING.INVALID_MELD!)

    select(...invalid)
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Le carte selezionate non formano una calata valida.')
    expect(coach()).toHaveTextContent(REJECTION_COACHING.INVALID_MELD!)
    expect(screen.getByText('4 carte')).toBeInTheDocument()
    for (const selected of invalid) {
      expect(screen.getByRole('button', { name: cardLabel(selected) })).toHaveAttribute('aria-pressed', 'true')
    }

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi messaggio di errore' }))
    expect(coach()).not.toHaveTextContent(REJECTION_COACHING.INVALID_MELD!)
  })

  it('keeps closure refusals on the engine error path', () => {
    const last = card('king', 'spades')
    guided(actionState([last], { hasTakenPozzetto: true }))

    select(last)
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Per chiudere serve almeno un Burraco.')
    expect(coach()).toHaveTextContent(REJECTION_COACHING.CANNOT_CLOSE_WITHOUT_BURRACO!)
    expect(document.querySelector('.hand-count')).toHaveTextContent('1 carte')
    expect(screen.getByRole('heading', { level: 1, name: 'You' })).toBeInTheDocument()
  })

  it('explains the human pozzetto from committed feedback', () => {
    const meldCards = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const state = actionState(meldCards)
    guided(state)

    select(...meldCards)
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(coach()).toHaveTextContent('La tua squadra ha preso il pozzetto')
    // The newly received pozzetto is the human's own hand; the other one stays hidden.
    for (const hidden of state.pozzetti[1]!) expect(coach()).not.toHaveTextContent(cardLabel(hidden))
  })

  it('explains an opponent pozzetto during bot playback without hidden identities and keeps Completa subito', () => {
    const state = botPozzettoState()
    guided(state)
    expect(coach()).toHaveTextContent('I bot giocano una mossa alla volta')
    expect(screen.getByRole('button', { name: 'Completa subito' })).toBeEnabled()

    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })

    expect(coach()).toHaveTextContent('Gli avversari hanno preso il loro pozzetto.')
    for (const pozzetto of state.pozzetti) {
      for (const hidden of pozzetto) expect(coach()).not.toHaveTextContent(cardLabel(hidden))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))
    expect(screen.queryByRole('button', { name: 'Completa subito' })).not.toBeInTheDocument()
    expect(coach()).toBeInTheDocument()
  })

  it('explains a newly reached Burraco from the committed classification cue', () => {
    const sixClubs = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
    ])
    const nine = card('nine', 'clubs')
    guided(actionState([nine, card('king', 'spades')], { melds: [sixClubs] }))
    expect(coach()).not.toHaveTextContent('Burraco:')

    select(nine)
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    expect(coach()).toHaveTextContent('Una calata della tua squadra è ora un Burraco')
    expect(within(screen.getByRole('article', { name: 'Calata 1 squadra 1' })).getByText(/Burraco/))
      .toBeInTheDocument()
  })

  it('explains both a Burraco and the pozzetto reached with the last cards of the first hand', () => {
    const sixClubs = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
    ])
    const nine = card('nine', 'clubs')
    guided(actionState([nine], { melds: [sixClubs] }))

    select(nine)
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    expect(screen.getByRole('region', { name: 'Calate squadra 1' })).toHaveTextContent('Pozzetto preso')
    expect(coach()).toHaveTextContent('La tua squadra ha preso il pozzetto')
    expect(coach()).toHaveTextContent('Una calata della tua squadra è ora un Burraco')
  })

  it('does not steal focus on phase or selection changes', () => {
    const hand = [card('three', 'clubs'), card('king', 'spades')]
    guided(actionState(hand))
    const keep = screen.getByRole('button', { name: cardLabel(hand[0]!) })
    keep.focus()
    fireEvent.click(keep)
    expect(keep).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS * 2)
    })
    expect(within(coach()!).getByRole('button', { name: 'Nascondi guida' })).not.toHaveFocus()
    expect(document.activeElement).not.toBe(coach())
  })
})
