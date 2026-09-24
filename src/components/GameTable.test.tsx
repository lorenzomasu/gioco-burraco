import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { drawCard } from '../game/engine/turn'
import { dealInitialState } from '../game/engine/startGame'
import type { MatchState, SettledRoundResult } from '../game/match'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { CompletedGameState, InProgressGameState } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { BOT_STEP_DELAY_MS, GameTable, LEAVE_MATCH_CONFIRMATION } from './GameTable'

const deck = createBurracoDeck()

/** Steps pending bot playback to completion through the UI presentation delay. */
const playPendingBots = () => {
  for (let step = 0; step < 500 && vi.getTimerCount() > 0; step += 1) {
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })
  }
  expect(vi.getTimerCount()).toBe(0)
}

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card => {
  const match = deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )
  if (!match) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return match
}

const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

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

const automaticSequenceState = (botMeld = false): InProgressGameState => {
  const initial = dealInitialState(deck)
  const playerHands = new Map([
    ['player-1', [card('king', 'hearts'), card('ace', 'spades')]],
    ['player-2', botMeld
      ? [
          card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'),
          card('queen', 'spades'),
        ]
      : [card('three', 'clubs'), card('five', 'hearts')]],
    ['player-3', [card('four', 'clubs'), card('six', 'hearts')]],
    ['player-4', [card('five', 'clubs'), card('seven', 'hearts')]],
  ] as const)

  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: playerHands.get(player.id)! })),
    teams: initial.teams.map((team) => ({ ...team, melds: [], hasTakenPozzetto: false })),
    drawPile: [
      card('king', 'clubs'), card('queen', 'diamonds'), card('ace', 'hearts'),
      card('jack', 'diamonds'), card('ten', 'diamonds'), card('eight', 'diamonds'),
    ],
    discardPile: [],
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

const botClosureState = (): InProgressGameState => {
  const burraco = validatedMeld([
    card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
    card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
  ])
  const initial = automaticSequenceState()
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-2'
      ? { ...player, hand: [card('king', 'spades')] }
      : player),
    teams: initial.teams.map((team) => team.id === 'team-2'
      ? { ...team, melds: [burraco], hasTakenPozzetto: true }
      : team),
    round: {
      status: 'in-progress',
      turn: {
        currentPlayerId: 'player-2',
        phase: 'action',
        acquisition: { source: 'drawPile', cardIds: [] },
      },
    },
  }
}

const settledResult = (
  roundNumber: 1 | 2 | 3 | 4,
  team1Total: number,
  team2Total: number,
): SettledRoundResult => ({
  roundNumber,
  ending: 'draw-pile-exhausted',
  score: {
    teams: [
      {
        teamId: 'team-1',
        meldCardPoints: 0,
        burracoBonus: 0,
        closingBonus: 0,
        handPenalty: 0,
        pozzettoPenalty: 0,
        total: team1Total,
      },
      {
        teamId: 'team-2',
        meldCardPoints: 0,
        burracoBonus: 0,
        closingBonus: 0,
        handPenalty: 0,
        pozzettoPenalty: 0,
        total: team2Total,
      },
    ],
  },
})

const emptyCompletedRound = (): CompletedGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: [] })),
    teams: initial.teams.map((team) => ({ ...team, melds: [], hasTakenPozzetto: false })),
    drawPile: [],
    discardPile: [],
    pozzetti: [[], []],
    round: { status: 'completed', ending: 'draw-pile-exhausted', lastDiscardPlayerId: 'player-2' },
  }
}

describe('GameTable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders the initial table, all four players, piles, and draw phase', () => {
    const state = dealInitialState(deck)
    const hiddenBotCard = state.players[1]!.hand[0]!
    render(<GameTable initialState={state} />)

    expect(screen.getByRole('region', { name: 'Tavolo di Burraco' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mano di You' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giocatore North' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giocatore Partner' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Giocatore South' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pesca dal tallone, 41 carte rimaste' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Raccogli il monte degli scarti, 1 carta' })).toBeEnabled()
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(screen.getByText('North · Bot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: cardLabel(hiddenBotCard) })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: cardLabel(hiddenBotCard) })).not.toBeInTheDocument()
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
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

  it('automatically resolves all three bot turns and returns control to the human', () => {
    const state = drawCard(dealInitialState(deck), 'player-1')
    const selected = state.players[0]!.hand[0]!
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    playPendingBots()

    expect(screen.getByRole('region', { name: 'Mano di You' })).toBeInTheDocument()
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mano di North' })).not.toBeInTheDocument()
    const timeline = screen.getByRole('region', { name: 'Cronologia bot' })
    const timelineItems = within(timeline).getAllByRole('listitem')
    expect(timelineItems[0]).toHaveTextContent(/^North /)
    expect(timelineItems.some((item) => item.textContent?.startsWith('Partner '))).toBe(true)
    expect(timelineItems.some((item) => item.textContent?.startsWith('South '))).toBe(true)
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
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    const teamArea = screen.getByRole('region', { name: 'Calate squadra 1' })
    expect(within(teamArea).getAllByRole('img')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: cardLabel(extension) })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: cardLabel(remainingCard) })).toBeInTheDocument()
  })

  it('renders the domain-provided represented rank after exact wildcard replacement', () => {
    const wild = joker()
    const existingMeld = validatedMeld([
      card('three', 'clubs'), wild, card('five', 'clubs'),
    ])
    const replacement = card('four', 'clubs')
    render(
      <GameTable
        initialState={actionState([replacement, card('king', 'spades')], [existingMeld])}
      />,
    )

    expect(screen.getByText('Matta → 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: cardLabel(replacement) }))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    expect(screen.queryByText('Matta → 4')).not.toBeInTheDocument()
    expect(screen.getByText('Matta → 2')).toBeInTheDocument()
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

  it('keeps the exact match, selection and error when Nuova partita is cancelled', () => {
    const invalidCards = [
      card('three', 'clubs'),
      card('five', 'hearts'),
      card('seven', 'spades'),
    ]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const createGame = vi.fn(() => dealInitialState(deck))
    const onLeaveMatch = vi.fn()
    render(
      <GameTable
        initialState={actionState([...invalidCards, card('king', 'diamonds')])}
        createGame={createGame}
        onLeaveMatch={onLeaveMatch}
      />,
    )

    for (const selected of invalidCards) {
      fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledExactlyOnceWith(LEAVE_MATCH_CONFIRMATION)
    expect(onLeaveMatch).not.toHaveBeenCalled()
    expect(createGame).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    for (const selected of invalidCards) {
      expect(screen.getByRole('button', { name: cardLabel(selected) })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('4 carte')).toBeInTheDocument()
    expect(screen.getByText('Gioco')).toBeInTheDocument()
  })

  it('leaves an in-progress match only after explicit confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const createGame = vi.fn(() => dealInitialState(deck))
    const onLeaveMatch = vi.fn()
    render(<GameTable initialState={dealInitialState(deck)} createGame={createGame} onLeaveMatch={onLeaveMatch} />)

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledExactlyOnceWith(LEAVE_MATCH_CONFIRMATION)
    expect(onLeaveMatch).toHaveBeenCalledOnce()
    expect(createGame).not.toHaveBeenCalled()
  })

  it('offers no match exit when no shell owns the table', () => {
    render(<GameTable initialState={dealInitialState(deck)} />)

    expect(screen.queryByRole('button', { name: 'Nuova partita' })).not.toBeInTheDocument()
  })

  it('renders bot-created melds after the automatic turn chain', () => {
    const state = automaticSequenceState(true)
    const humanDiscard = state.players[0]!.hand[0]!
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(humanDiscard) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    playPendingBots()

    const botTeamArea = screen.getByRole('region', { name: 'Calate squadra 2' })
    expect(within(botTeamArea).getByText('Combinazione')).toBeInTheDocument()
    expect(within(botTeamArea).getAllByRole('img')).toHaveLength(3)
    expect(screen.getByRole('region', { name: 'Mano di You' })).toBeInTheDocument()
    const timeline = screen.getByRole('region', { name: 'Cronologia bot' })
    expect(timeline).toHaveTextContent(cardLabel(card('nine', 'clubs')))
    expect(timeline).toHaveTextContent(cardLabel(card('nine', 'diamonds')))
    expect(timeline).toHaveTextContent(cardLabel(card('nine', 'hearts')))
    for (const drawItem of timeline.querySelectorAll('[data-event-type="draw-stock"]')) {
      expect(drawItem).not.toHaveTextContent('mazzo')
      expect(drawItem).not.toHaveTextContent(cardLabel(state.drawPile[0]!))
    }
  })

  it('does not expose human controls during a bot turn that closes the round', () => {
    const state = botClosureState()
    const discarded = state.players.find(({ id }) => id === 'player-2')!.hand[0]!
    render(<GameTable initialState={state} />)
    playPendingBots()

    expect(screen.getByRole('heading', { name: 'Ha chiuso North' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cala' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scarta e passa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mano di You' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cronologia bot' })).toHaveTextContent(
      `North scarta ${cardLabel(discarded)}.`,
    )
  })

  it('keeps pending bot playback and its events when Nuova partita is cancelled', () => {
    const state = automaticSequenceState(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onLeaveMatch = vi.fn()
    render(<GameTable initialState={state} onLeaveMatch={onLeaveMatch} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(state.players[0]!.hand[0]!) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })
    const timeline = screen.getByRole('region', { name: 'Cronologia bot' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(onLeaveMatch).not.toHaveBeenCalled()
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(1)
    expect(timeline).toHaveTextContent('North pesca dal tallone.')
    expect(vi.getTimerCount()).toBe(1)

    playPendingBots()

    expect(within(timeline).getAllByRole('listitem').length).toBeGreaterThan(1)
    expect(screen.getByRole('region', { name: 'Mano di You' })).toBeInTheDocument()
    expect(screen.getByText('Pesca')).toBeInTheDocument()
  })

  it('does not render hidden pozzetto card labels in the acquisition event', () => {
    const initial = automaticSequenceState()
    const state: InProgressGameState = {
      ...initial,
      players: initial.players.map((player) => player.id === 'player-2'
        ? {
            ...player,
            hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')],
          }
        : player),
      round: {
        status: 'in-progress',
        turn: {
          currentPlayerId: 'player-2',
          phase: 'action',
          acquisition: { source: 'drawPile', cardIds: [] },
        },
      },
    }

    render(<GameTable initialState={state} />)
    playPendingBots()

    const pozzettoItem = screen.getByText('North prende il pozzetto al volo.')
    expect(pozzettoItem).not.toHaveTextContent('mazzo')
    for (const hiddenCard of state.pozzetti[0]) {
      expect(pozzettoItem).not.toHaveTextContent(cardLabel(hiddenCard))
    }
  })

  it('clears the completed-round timeline before starting the next smazzata', () => {
    const completedByBot = botClosureState()
    const priorDiscard = completedByBot.players.find(({ id }) => id === 'player-2')!.hand[0]!
    const pendingBotRound = automaticSequenceState()
    const createGame = vi.fn((): InProgressGameState => ({
      ...pendingBotRound,
      round: {
        status: 'in-progress',
        turn: { currentPlayerId: 'player-2', phase: 'mustDraw' },
      },
    }))
    render(<GameTable initialState={completedByBot} createGame={createGame} />)
    playPendingBots()

    expect(within(screen.getByRole('region', { name: 'Cronologia bot' })).getAllByRole('listitem'))
      .toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))
    playPendingBots()

    const timeline = screen.getByRole('region', { name: 'Cronologia bot' })
    expect(within(timeline).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(timeline).toHaveTextContent('North pesca dal tallone.')
    expect(timeline).not.toHaveTextContent(`North scarta ${cardLabel(priorDiscard)}.`)
  })

  it('requires confirmation to leave between smazzate of an unfinished match', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const createGame = vi.fn(() => dealInitialState(deck))
    const onLeaveMatch = vi.fn()
    render(<GameTable initialState={emptyCompletedRound()} createGame={createGame} onLeaveMatch={onLeaveMatch} />)
    expect(screen.queryByRole('button', { name: 'Gioca ancora' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(onLeaveMatch).not.toHaveBeenCalled()
    expect(createGame).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Inizia smazzata 2' })).toBeInTheDocument()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(onLeaveMatch).toHaveBeenCalledOnce()
    expect(createGame).not.toHaveBeenCalled()
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
      round: { status: 'completed', ending: 'closure', closedByPlayerId: 'player-1', closingTeamId: 'team-1' },
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

  it('reports a draw-pile exhaustion with the player who made the last discard', () => {
    const base = actionState([])
    const completed: CompletedGameState = {
      ...base,
      round: { status: 'completed', ending: 'draw-pile-exhausted', lastDiscardPlayerId: 'player-2' },
    }

    render(<GameTable initialState={completed} />)

    expect(screen.getByRole('heading', { name: 'Tallone esaurito' })).toBeInTheDocument()
    expect(screen.getByText(/L’ultimo scarto è di North\./)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Ha chiuso/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/La Squadra . ottiene il bonus di chiusura/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scarta e passa' })).not.toBeInTheDocument()
  })

  it('shows an intermediate result and starts the next fresh round only on request', () => {
    const completed = emptyCompletedRound()
    const createGame = vi.fn(() => dealInitialState(deck))

    render(<GameTable initialState={completed} createGame={createGame} />)

    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tallone esaurito' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Punteggio cumulativo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inizia smazzata 2' })).toBeInTheDocument()
    expect(createGame).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(createGame).toHaveBeenCalledOnce()
    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tavolo di Burraco' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Punteggio cumulativo' })).not.toBeInTheDocument()
  })

  it.each(['Gioca ancora', 'Nuova partita'])(
    'shows the terminal four-round result and leaves it through %s without confirmation',
    (actionName) => {
      const finalRound = emptyCompletedRound()
      const initialMatch: MatchState = {
        status: 'in-progress',
        currentRoundNumber: 4,
        currentRound: finalRound,
        roundResults: [
          settledResult(1, 100, 0),
          settledResult(2, 100, 0),
          settledResult(3, 100, 0),
        ],
      }
      const confirm = vi.spyOn(window, 'confirm')
      const createGame = vi.fn(() => dealInitialState(deck))
      const onLeaveMatch = vi.fn()

      render(<GameTable initialMatch={initialMatch} createGame={createGame} onLeaveMatch={onLeaveMatch} />)

      expect(screen.getByText('Smazzata 4/4')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Risultato finale' })).toBeInTheDocument()
      expect(screen.getByText('Match Points')).toHaveTextContent('300')
      const victoryPoints = screen.getByLabelText('Victory Points')
      expect(within(victoryPoints).getByText('11 VP')).toBeInTheDocument()
      expect(within(victoryPoints).getByText('9 VP')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Inizia smazzata 5/ })).not.toBeInTheDocument()
      expect(within(screen.getByRole('region', { name: 'Punteggio cumulativo' }))
        .getByRole('button', { name: 'Gioca ancora' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: actionName }))

      expect(confirm).not.toHaveBeenCalled()
      expect(onLeaveMatch).toHaveBeenCalledOnce()
      expect(createGame).not.toHaveBeenCalled()
    },
  )
})

const drawPhaseState = (discardPile?: readonly Card[]): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    discardPile: discardPile ?? initial.discardPile,
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
  }
}

const turnStatus = () => screen.getByText('Turno di').closest('[tabindex="-1"]')

describe('GameTable accessibility and interaction semantics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('exposes playable cards as named toggle buttons with a non-colour selected marker', () => {
    const selectable = card('seven', 'clubs')
    render(<GameTable initialState={actionState([selectable, card('king', 'spades')])} />)
    const button = screen.getByRole('button', { name: cardLabel(selectable) })

    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(within(button).queryByText('✓')).not.toBeInTheDocument()

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(within(button).getByText('✓')).toHaveAttribute('aria-hidden', 'true')
    expect(button).toHaveAccessibleName(cardLabel(selectable))

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(within(button).queryByText('✓')).not.toBeInTheDocument()
  })

  it('keeps unavailable actions as genuinely disabled native controls', () => {
    const existingMeld = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    render(<GameTable initialState={actionState([card('seven', 'spades'), card('king', 'spades')], [existingMeld])} />)

    expect(screen.getByRole('button', { name: /^Pesca dal tallone/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Raccogli il monte degli scarti/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cala' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scarta e passa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' })).toBeDisabled()
  })

  it('gives every meld-extension control a unique name identifying team and meld', () => {
    const firstMeld = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const secondMeld = validatedMeld([card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts')])
    const extension = card('six', 'hearts')
    render(<GameTable initialState={actionState([extension, card('king', 'spades')], [firstMeld, secondMeld])} />)

    const extendButtons = screen.getAllByRole('button', { name: /^Aggiungi alla calata/ })
    const names = extendButtons.map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Aggiungi alla calata 1 della squadra 1',
      'Aggiungi alla calata 2 della squadra 1',
    ])
    expect(extendButtons.map((button) => button.textContent)).toEqual(['Aggiungi alla calata', 'Aggiungi alla calata'])

    fireEvent.click(screen.getByRole('button', { name: cardLabel(extension) }))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 2 della squadra 1' }))

    expect(within(screen.getByRole('article', { name: 'Calata 1 squadra 1' })).getAllByRole('img')).toHaveLength(3)
    expect(within(screen.getByRole('article', { name: 'Calata 2 squadra 1' })).getAllByRole('img')).toHaveLength(4)
  })

  it('marks the current player and active team with text, not colour alone', () => {
    render(<GameTable initialState={automaticSequenceState()} />)

    const hand = screen.getByRole('region', { name: 'Mano di You' })
    expect(within(hand).getByText('Di turno')).toBeInTheDocument()
    for (const name of ['North', 'Partner', 'South']) {
      const seat = screen.getByRole('region', { name: `Giocatore ${name}` })
      expect(seat).not.toHaveAttribute('aria-current')
      expect(within(seat).queryByText('Di turno')).not.toBeInTheDocument()
    }
    expect(within(screen.getByRole('region', { name: 'Calate squadra 1' })).getByText('Di turno')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Calate squadra 2' })).queryByText('Di turno')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    const north = screen.getByRole('region', { name: 'Giocatore North' })
    expect(north).toHaveAttribute('aria-current', 'true')
    expect(within(north).getByText('Di turno')).toBeInTheDocument()
    expect(within(hand).queryByText('Di turno')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Calate squadra 2' })).getByText('Di turno')).toBeInTheDocument()
    expect(screen.getAllByText('Di turno')).toHaveLength(2)
  })

  it('exposes the bot timeline as a polite log that appends events without re-rendering history', () => {
    render(<GameTable initialState={automaticSequenceState()} />)

    const log = screen.getByRole('log', { name: 'Cronologia bot' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).toHaveAttribute('aria-relevant', 'additions')
    expect(within(log).queryAllByRole('listitem')).toHaveLength(0)
    expect(log).not.toHaveTextContent('Nessuna azione automatica')
    expect(screen.getByText('Nessuna azione automatica in questa smazzata.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })

    const firstItems = within(log).getAllByRole('listitem')
    expect(firstItems.length).toBeGreaterThan(0)

    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })

    expect(screen.getByRole('log', { name: 'Cronologia bot' })).toBe(log)
    const nextItems = within(log).getAllByRole('listitem')
    expect(nextItems.length).toBeGreaterThan(firstItems.length)
    // Existing entries are the same DOM nodes: only the appended entries are additions.
    firstItems.forEach((item, index) => expect(nextItems[index]).toBe(item))
    expect(screen.queryByText('Nessuna azione automatica in questa smazzata.')).not.toBeInTheDocument()
  })

  it('keeps one polite atomic turn status, an alert for rule errors, and non-live guidance', () => {
    const invalid = [card('three', 'clubs'), card('five', 'hearts'), card('seven', 'spades')]
    render(<GameTable initialState={actionState([...invalid, card('king', 'spades')])} />)

    const banner = screen.getByText('Turno di').closest('[aria-live]')
    expect(banner).toHaveAttribute('aria-live', 'polite')
    expect(banner).toHaveAttribute('aria-atomic', 'true')
    expect(banner).toHaveTextContent('You')
    expect(banner).toHaveTextContent('Gioco')
    expect(screen.getByText(/^Seleziona le carte/).closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()

    for (const selected of invalid) fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Le carte selezionate non formano una calata valida.')
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi messaggio di errore' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('adapts the contextual guidance to the draw, action and bot phases without claiming disabled actions', () => {
    const { unmount } = render(<GameTable initialState={drawPhaseState()} />)
    expect(screen.getByText('Tocca a te: pesca una carta dal tallone oppure raccogli il monte degli scarti.'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pesca dal tallone/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Raccogli il monte degli scarti/ })).toBeEnabled()
    unmount()

    render(<GameTable initialState={drawPhaseState([])} />)
    expect(screen.getByText('Tocca a te: pesca una carta dal tallone. Il monte degli scarti è vuoto.'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monte degli scarti vuoto' })).toBeDisabled()
    expect(screen.queryByText(/raccogli il monte/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(screen.getByText(
      'Seleziona le carte per aprire una nuova calata con «Cala». Per finire il turno seleziona una sola carta e premi «Scarta e passa».',
    )).toBeInTheDocument()
    expect(screen.queryByText(/Tocca a te/)).not.toBeInTheDocument()
  })

  it('mentions meld extension only when the team has melds, and Completa subito only while it is rendered', () => {
    const existingMeld = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const { unmount } = render(
      <GameTable initialState={actionState([card('seven', 'spades'), card('king', 'spades')], [existingMeld])} />,
    )
    expect(screen.getByText(/per aggiungerle a una calata della tua squadra/)).toBeInTheDocument()
    unmount()

    render(<GameTable initialState={automaticSequenceState()} />)
    expect(screen.queryByText(/Completa subito/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(screen.getByRole('button', { name: 'Completa subito' })).toBeInTheDocument()
    expect(screen.getByText(
      'I bot giocano automaticamente. Attendi il tuo turno oppure usa «Completa subito» per concludere le loro mosse.',
    )).toBeInTheDocument()

    playPendingBots()
    expect(screen.queryByRole('button', { name: 'Completa subito' })).not.toBeInTheDocument()
    expect(screen.queryByText(/I bot giocano automaticamente/)).not.toBeInTheDocument()
  })
})

describe('GameTable lifecycle focus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not move focus on mount unless the owner asks for it', () => {
    const { unmount } = render(<GameTable initialState={drawPhaseState()} />)
    expect(document.activeElement).toBe(document.body)
    unmount()

    render(<GameTable initialState={drawPhaseState()} focusContextOnMount />)
    expect(turnStatus()).toHaveFocus()
  })

  it('moves focus to the result heading when a bot completes the round', () => {
    render(<GameTable initialState={botClosureState()} />)
    const fast = screen.getByRole('radio', { name: 'Veloce' })
    fast.focus()

    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Ha chiuso North' })).toHaveFocus()
  })

  it('moves focus to the fresh round turn status when the next smazzata starts', () => {
    render(<GameTable initialState={emptyCompletedRound()} createGame={() => dealInitialState(deck)} />)
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(turnStatus()).toHaveFocus()
    expect(turnStatus()).toHaveTextContent('You')
  })

  it('does not steal focus on card selection, committed actions or bot timeline events', () => {
    const state = automaticSequenceState()
    render(<GameTable initialState={state} />)
    const keep = screen.getByRole('button', { name: cardLabel(card('ace', 'spades')) })
    keep.focus()
    fireEvent.click(keep)
    expect(keep).toHaveFocus()
    fireEvent.click(keep)

    const speed = screen.getByRole('radio', { name: 'Normale' })
    speed.focus()
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
    })

    expect(within(screen.getByRole('log', { name: 'Cronologia bot' })).getAllByRole('listitem').length)
      .toBeGreaterThan(0)
    expect(speed).toHaveFocus()
  })
})
