import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { discardCard, drawCard, takeDiscardPile } from '../game/engine/turn'
import { dealInitialState } from '../game/engine/startGame'
import type { MatchState, SettledRoundResult } from '../game/match'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { CompletedGameState, InProgressGameState } from '../game/state/types'
import { cancelLeave, leaveConfirmed, leaveDialog, requestLeave } from '../tests/shellDialogs'
import { cardLabel, sortCardsForDisplay } from './cardPresentation'
import { BOT_SIGNIFICANT_STEP_DELAYS_MS, BOT_STEP_DELAY_MS, GameTable, LEAVE_MATCH_CONFIRMATION } from './GameTable'

/** The normal delay after a player hand-off (for example the human's discard). */
const HANDOFF_DELAY_MS = BOT_SIGNIFICANT_STEP_DELAYS_MS.normal

const deck = createBurracoDeck()

/** Steps pending bot playback to completion through the UI presentation delay. */
const playPendingBots = () => {
  for (let step = 0; step < 500 && vi.getTimerCount() > 0; step += 1) {
    act(() => {
      vi.advanceTimersToNextTimer()
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
    expect(screen.getByRole('button', { name: 'Raccogli tutto il monte degli scarti, 1 carta' })).toBeEnabled()
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

    fireEvent.click(screen.getByRole('button', { name: 'Raccogli tutto il monte degli scarti, 1 carta' }))

    expect(screen.getByText('Gioco')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('12 carte')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raccogli tutto il monte degli scarti, 0 carte' })).toBeDisabled()
    expect(screen.getByText('Monte degli scarti vuoto')).toBeInTheDocument()
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

  it('extends the playtest sequence Jolly=4♦, 5♦, 6♦, 7♦, 8♦ with 10♦ through the extension button', () => {
    const wild = joker()
    const existingMeld = validatedMeld([
      wild, card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
      card('eight', 'diamonds'),
    ])
    const ten = card('ten', 'diamonds')
    const remainingCard = card('king', 'spades')
    const onMatchChange = vi.fn()
    render(
      <GameTable
        initialState={actionState([ten, remainingCard], [existingMeld])}
        onMatchChange={onMatchChange}
      />,
    )

    expect(screen.getByText('Matta → 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: cardLabel(ten) }))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    expect(screen.queryByText('Mossa non valida')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Matta → 4')).not.toBeInTheDocument()
    expect(screen.getByText('Matta → 9')).toBeInTheDocument()
    const teamArea = screen.getByRole('region', { name: 'Calate squadra 1' })
    expect(within(teamArea).getAllByRole('img')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: cardLabel(ten) })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: cardLabel(remainingCard) })).toBeInTheDocument()
    const committed = onMatchChange.mock.lastCall![0] as MatchState
    expect(committed.currentRound.teams[0]!.melds[0]!.activeWildcard)
      .toEqual({ card: wild, role: 'wildcard', representedRank: 'nine' })
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

    requestLeave()
    expect(leaveDialog()).toHaveTextContent(LEAVE_MATCH_CONFIRMATION)
    cancelLeave()

    expect(leaveDialog()).not.toBeInTheDocument()
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
    const createGame = vi.fn(() => dealInitialState(deck))
    const onLeaveMatch = vi.fn()
    render(<GameTable initialState={dealInitialState(deck)} createGame={createGame} onLeaveMatch={onLeaveMatch} />)

    requestLeave()
    expect(onLeaveMatch).not.toHaveBeenCalled()
    const abandon = within(leaveDialog()!).getByRole('button', { name: 'Abbandona partita' })
    fireEvent.click(abandon)
    fireEvent.click(abandon)

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
    const onLeaveMatch = vi.fn()
    render(<GameTable initialState={state} onLeaveMatch={onLeaveMatch} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(state.players[0]!.hand[0]!) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    act(() => {
      vi.advanceTimersByTime(HANDOFF_DELAY_MS)
    })
    const timeline = screen.getByRole('region', { name: 'Cronologia bot' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    requestLeave()
    // No bot step may commit behind the open confirmation, however long it stays open.
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS * 3)
    })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(1)
    cancelLeave()

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
    const createGame = vi.fn(() => dealInitialState(deck))
    const onLeaveMatch = vi.fn()
    render(<GameTable initialState={emptyCompletedRound()} createGame={createGame} onLeaveMatch={onLeaveMatch} />)
    expect(screen.queryByRole('button', { name: 'Gioca ancora' })).not.toBeInTheDocument()

    requestLeave()
    cancelLeave()

    expect(onLeaveMatch).not.toHaveBeenCalled()
    expect(createGame).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Inizia smazzata 2' })).toBeInTheDocument()

    leaveConfirmed()

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
      expect(leaveDialog()).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Raccogli tutto il monte degli scarti/ })).toBeDisabled()
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
      vi.advanceTimersByTime(HANDOFF_DELAY_MS)
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
    expect(screen.getByRole('button', { name: /Raccogli tutto il monte degli scarti/ })).toBeEnabled()
    unmount()

    render(<GameTable initialState={drawPhaseState([])} />)
    expect(screen.getByText('Tocca a te: pesca una carta dal tallone. Il monte degli scarti è vuoto.'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Raccogli tutto il monte degli scarti, 0 carte' })).toBeDisabled()
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
      vi.advanceTimersByTime(HANDOFF_DELAY_MS)
    })

    expect(within(screen.getByRole('log', { name: 'Cronologia bot' })).getAllByRole('listitem').length)
      .toBeGreaterThan(0)
    expect(speed).toHaveFocus()
  })
})

describe('GameTable tabletop composition (M27)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const seat = (name: string) => screen.getByRole('region', { name: `Giocatore ${name}` })
  const historyToggle = () => screen.getByRole('button', { name: /^Cronologia bot/ })
  const historyLog = () => screen.getByRole('log', { name: 'Cronologia bot' })
  const turnBanner = () => screen.getByText('Turno di').closest('[aria-live]')!

  it('seats the teammate opposite and the opponents left/right in clockwise turn order without changing domain seating', () => {
    const state = dealInitialState(deck)
    render(<GameTable initialState={state} />)

    expect(seat('Partner')).toHaveAttribute('data-seat', 'top')
    expect(seat('Partner')).toHaveTextContent('Compagno · Squadra 1')
    // The opponent who plays right after the human sits on the left, the other on the right.
    expect(seat('North')).toHaveAttribute('data-seat', 'left')
    expect(seat('North')).toHaveTextContent('Avversario · Squadra 2')
    expect(seat('South')).toHaveAttribute('data-seat', 'right')
    expect(seat('South')).toHaveTextContent('Avversario · Squadra 2')
    // Document order follows the clockwise turn order from the human: left, top, right.
    expect(screen.getAllByRole('region', { name: /^Giocatore / }).map((region) => region.dataset.seat))
      .toEqual(['left', 'top', 'right'])
    expect(screen.getByRole('region', { name: 'Mano di You' })).toHaveTextContent('Tu · Squadra 1')
    expect(screen.getByRole('region', { name: 'Calate squadra 1' })).toHaveTextContent('La tua squadra')
    expect(screen.getByRole('region', { name: 'Calate squadra 2' })).toHaveTextContent('Avversari')

    // The visual mapping is presentation only: IDs, teams and turn order are untouched.
    expect(state.players.map(({ id, name, teamId }) => [id, name, teamId])).toEqual([
      ['player-1', 'You', 'team-1'],
      ['player-2', 'North', 'team-2'],
      ['player-3', 'Partner', 'team-1'],
      ['player-4', 'South', 'team-2'],
    ])
    expect(turnBanner()).toHaveTextContent('You')
    expect(turnBanner()).toHaveTextContent('Tu · Squadra 1')
  })

  it('labels the active bot turn with its relation and the next domain player in order', () => {
    render(<GameTable initialState={automaticSequenceState()} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(turnBanner()).toHaveTextContent('North')
    expect(turnBanner()).toHaveTextContent('Avversario · Squadra 2')
    expect(seat('North')).toHaveAttribute('aria-current', 'true')
    expect(seat('North')).toHaveAttribute('data-seat', 'left')
  })

  it('moves the active-turn emphasis from the human to each bot seat and back (M33.1)', () => {
    render(<GameTable initialState={automaticSequenceState()} />)
    const hand = screen.getByRole('region', { name: 'Mano di You' })
    const activeSeats = () => screen.getAllByRole('region', { name: /^Giocatore / })
      .filter((region) => region.getAttribute('aria-current') === 'true')
    expect(hand).toHaveClass('active-player--turn')
    expect(activeSeats()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    expect(hand).not.toHaveClass('active-player--turn')
    expect(activeSeats()).toEqual([seat('North')])
    expect(seat('North')).toHaveClass('player-seat--active')
    expect(seat('North')).toHaveTextContent('Di turno')

    const seen = new Set<string>()
    for (let step = 0; step < 50 && vi.getTimerCount() > 0; step += 1) {
      act(() => {
        vi.advanceTimersToNextTimer()
      })
      const active = activeSeats()
      // Exactly one place on the table carries the turn, matching the announced player.
      expect(active.length + Number(hand.classList.contains('active-player--turn'))).toBe(1)
      if (active[0]) {
        seen.add(active[0].dataset.seat!)
        expect(turnBanner()).toHaveTextContent(active[0].getAttribute('aria-label')!.replace('Giocatore ', ''))
      }
    }
    // The turn travelled clockwise through left (North) and the teammate on top (Partner).
    expect(seen.has('left')).toBe(true)
    expect(seen.has('top')).toBe(true)
    expect(turnBanner()).toHaveTextContent('You')
    expect(hand).toHaveClass('active-player--turn')
  })

  it('offers an operable history disclosure that keeps the mounted log in the accessibility tree', () => {
    render(<GameTable initialState={automaticSequenceState()} />)

    const toggle = historyToggle()
    const log = historyLog()
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).toContainElement(log)
    // Collapsed is visual only: never `hidden`, `display: none` or aria-hidden.
    expect(panel).not.toHaveAttribute('hidden')
    expect(log.closest('[aria-hidden="true"]')).toBeNull()
    expect(log).toBeVisible()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(historyLog()).toBe(log)

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(historyLog()).toBe(log)

    // Keyboard: native button activation plus Escape to close and return focus.
    fireEvent.click(toggle)
    fireEvent.keyDown(log, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
  })

  it('appends ordered bot events to the same log nodes while the history is collapsed', () => {
    render(<GameTable initialState={automaticSequenceState()} />)
    const log = historyLog()

    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    act(() => {
      vi.advanceTimersByTime(HANDOFF_DELAY_MS)
    })
    const firstItems = within(log).getAllByRole('listitem')
    expect(firstItems).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))

    expect(historyToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(historyLog()).toBe(log)
    const items = within(log).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(1)
    expect(items[0]).toBe(firstItems[0])
    expect(historyToggle()).toHaveTextContent(`${items.length} azioni`)
    // The visible preview repeats the newest entry for sighted users only.
    const preview = screen.getByText(`Ultima: ${items.at(-1)!.textContent}`)
    expect(preview).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(historyToggle())
    within(historyLog()).getAllByRole('listitem').forEach((item, index) => expect(item).toBe(items[index]))
    expect(screen.queryByText(/^Ultima:/)).not.toBeInTheDocument()
  })

  it('keeps the draw → select → discard path and bot completion working with the history collapsed', () => {
    const state = dealInitialState(deck)
    render(<GameTable initialState={state} />)
    const hand = () => screen.getByRole('region', { name: 'Mano di You' })

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(within(hand()).getByText('12 carte')).toBeInTheDocument()

    const [first] = within(hand()).getAllByRole('button', { pressed: false })
    fireEvent.click(first!)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('carta selezionata')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(within(hand()).getByText('11 carte')).toBeInTheDocument()
    expect(screen.getByText('Bot in gioco…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))

    expect(turnBanner()).toHaveTextContent('You')
    expect(screen.getByRole('button', { name: /^Pesca dal tallone/ })).toBeEnabled()
    expect(historyToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(within(historyLog()).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('preserves the history and its disclosure state on the completed-round view', () => {
    render(<GameTable initialState={botClosureState()} />)
    fireEvent.click(historyToggle())

    playPendingBots()

    expect(screen.getByRole('heading', { name: 'Ha chiuso North' })).toBeInTheDocument()
    expect(historyToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(within(historyLog()).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})

/**
 * A human-turn state whose face-up pile is exactly `pile` (engine order, oldest first).
 * The pile's physical cards are removed from every other zone so each card exists once.
 */
const pileState = (
  pile: readonly Card[],
  phase: 'mustDraw' | 'action' = 'mustDraw',
  teamOneMelds: readonly ValidatedMeld[] = [],
): InProgressGameState => {
  const initial = dealInitialState(deck)
  const pileIds = new Set(pile.map(({ id }) => id))
  const meldIds = new Set(teamOneMelds.flatMap(({ cards }) => cards.map(({ card }) => card.id)))
  const keep = (cards: readonly Card[]) => cards.filter(({ id }) => !pileIds.has(id) && !meldIds.has(id))
  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: keep(player.hand) })),
    teams: initial.teams.map((team) => team.id === 'team-1' ? { ...team, melds: teamOneMelds } : team),
    drawPile: keep(initial.drawPile),
    pozzetti: [keep(initial.pozzetti[0]), keep(initial.pozzetti[1])],
    discardPile: pile,
    round: {
      status: 'in-progress',
      turn: phase === 'mustDraw'
        ? { currentPlayerId: 'player-1', phase: 'mustDraw' }
        : { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

/** Distinguishable faces, including the same face from both physical decks and a joker. */
const mixedPile = (): readonly Card[] => [
  card('king', 'hearts', 1),
  card('three', 'clubs', 2),
  card('king', 'hearts', 2),
  joker(),
  card('seven', 'spades', 1),
]

const discardGroup = () => screen.getByRole('group', { name: 'Monte degli scarti' })
const discardList = () => within(discardGroup()).getByRole('list', { name: /^Carte scartate/ })
const collectButton = () => screen.getByRole('button', { name: /^Raccogli tutto il monte degli scarti/ })
const renderedPile = () => within(discardList()).getAllByRole('img').map((image) => image.getAttribute('aria-label'))

describe('GameTable discard pile (M28)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders every discard exactly once in engine order, oldest to newest', () => {
    const pile = mixedPile()
    render(<GameTable initialState={pileState(pile)} />)

    expect(renderedPile()).toEqual(pile.map(cardLabel))
    expect(within(discardList()).getAllByRole('listitem')).toHaveLength(pile.length)
    for (const discarded of pile) {
      expect(screen.getAllByRole('img', { name: cardLabel(discarded) })).toHaveLength(1)
    }
    // The individual discards are informative only: no per-card control inside the pile.
    expect(within(discardGroup()).getAllByRole('button')).toEqual([collectButton()])
  })

  it('marks only the newest card in text and states the pile count', () => {
    const pile = mixedPile()
    render(<GameTable initialState={pileState(pile)} />)

    const items = within(discardList()).getAllByRole('listitem')
    expect(within(discardGroup()).getAllByText('In cima')).toHaveLength(1)
    expect(within(items.at(-1)!).getByText('In cima')).toBeInTheDocument()
    expect(within(items.at(-1)!).getByRole('img')).toHaveAccessibleName(cardLabel(pile.at(-1)!))
    expect(items.at(-1)).toHaveClass('discard-spread__item--top')
    expect(within(discardGroup()).getByText('5 carte')).toBeInTheDocument()
    expect(collectButton()).toHaveAccessibleName('Raccogli tutto il monte degli scarti, 5 carte')
  })

  it('shows an explicit empty pile with a zero count, no stale card and no collection', () => {
    render(<GameTable initialState={pileState([])} />)

    expect(within(discardGroup()).getByText('Monte degli scarti vuoto')).toBeInTheDocument()
    expect(within(discardGroup()).getByText('0 carte')).toBeInTheDocument()
    expect(within(discardGroup()).queryByRole('list')).not.toBeInTheDocument()
    expect(within(discardGroup()).queryByRole('img')).not.toBeInTheDocument()
    expect(within(discardGroup()).queryByText('In cima')).not.toBeInTheDocument()
    expect(collectButton()).toBeDisabled()
    expect(collectButton()).toHaveAccessibleName('Raccogli tutto il monte degli scarti, 0 carte')
  })

  it('enables collection only in the human draw phase and keeps the pile visible otherwise', () => {
    const pile = mixedPile()
    const { unmount } = render(<GameTable initialState={pileState(pile, 'mustDraw')} />)
    expect(collectButton()).toBeEnabled()
    unmount()

    render(<GameTable initialState={pileState(pile, 'action')} />)
    expect(collectButton()).toBeDisabled()
    expect(renderedPile()).toEqual(pile.map(cardLabel))
    expect(within(discardGroup()).getByText('In cima')).toBeInTheDocument()
  })

  it('keeps the pile visible and uncollectable while a bot is to play', () => {
    const pile = mixedPile()
    const state = pileState(pile)
    render(<GameTable initialState={{ ...state, round: { status: 'in-progress', turn: { currentPlayerId: 'player-2', phase: 'mustDraw' } } }} />)

    expect(collectButton()).toBeDisabled()
    expect(renderedPile()).toEqual(pile.map(cardLabel))
  })

  it('collects the whole pile through the engine command and empties the spread', () => {
    const pile = mixedPile()
    const state = pileState(pile)
    const onMatchChange = vi.fn()
    render(<GameTable initialState={state} onMatchChange={onMatchChange} />)

    fireEvent.click(collectButton())

    const committed = onMatchChange.mock.calls.at(-1)![0] as MatchState
    expect(committed.currentRound).toEqual(takeDiscardPile(state, 'player-1'))
    expect(within(discardGroup()).getByText('Monte degli scarti vuoto')).toBeInTheDocument()
    expect(within(discardGroup()).getByText('0 carte')).toBeInTheDocument()
    expect(collectButton()).toBeDisabled()
    const hand = screen.getByRole('region', { name: 'Mano di You' })
    for (const collected of pile) {
      expect(within(hand).getByRole('button', { name: cardLabel(collected) })).toBeInTheDocument()
    }
    expect(screen.getByText('Gioco')).toBeInTheDocument()
  })

  it('renders a long pile in stored order without sorting or changing the state', () => {
    // Forty physical cards in a deterministic order that is deliberately not display-sorted.
    const source = deck.slice(0, 40)
    const pile = source.map((_, index) => source[(index * 7) % source.length]!)
    const state = pileState(pile)
    const snapshot = structuredClone(state)
    const onMatchChange = vi.fn()
    render(<GameTable initialState={state} onMatchChange={onMatchChange} />)

    expect(renderedPile()).toEqual(pile.map(cardLabel))
    expect(renderedPile()).not.toEqual(sortCardsForDisplay(pile).map(cardLabel))
    expect(within(discardGroup()).getByText('40 carte')).toBeInTheDocument()
    expect(state).toEqual(snapshot)
    expect((onMatchChange.mock.calls.at(-1)![0] as MatchState).currentRound.discardPile).toEqual(pile)
  })

  it('brings the newest card into view on mount and on a new discard, but not on unrelated renders', () => {
    // jsdom has no layout: give only the spread an overflowing geometry.
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function (this: HTMLElement) { return this.classList.contains('discard-spread') ? 1200 : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) { return this.classList.contains('discard-spread') ? 300 : 0 })
    const discarded = card('queen', 'diamonds', 2)
    const state = pileState(mixedPile(), 'action')
    const players = state.players.map((player) => player.id === 'player-1'
      ? { ...player, hand: [discarded, ...player.hand] }
      : { ...player, hand: player.hand.filter(({ id }) => id !== discarded.id) })
    render(<GameTable initialState={{
      ...state,
      players,
      drawPile: state.drawPile.filter(({ id }) => id !== discarded.id),
      pozzetti: [
        state.pozzetti[0].filter(({ id }) => id !== discarded.id),
        state.pozzetti[1].filter(({ id }) => id !== discarded.id),
      ],
    }} />)

    // The overflowing spread starts on the newest card and is a keyboard scroll surface.
    expect(discardList().scrollLeft).toBe(1200)
    expect(discardList()).toHaveAttribute('tabindex', '0')
    expect(within(discardGroup()).getByText(/scorri per i precedenti/)).toBeInTheDocument()

    // A manual scroll back survives selection, speed and history changes.
    discardList().scrollLeft = 0
    fireEvent.click(screen.getByRole('button', { name: cardLabel(discarded) }))
    fireEvent.click(screen.getByRole('radio', { name: 'Veloce' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cronologia bot/ }))
    expect(discardList().scrollLeft).toBe(0)

    // A committed discard appends a new top card and brings it into view.
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    expect(renderedPile().at(-1)).toBe(cardLabel(discarded))
    expect(discardList().scrollLeft).toBe(1200)
  })

  it('drops the scroll affordance once an overflowing pile is collected', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function (this: HTMLElement) { return this.classList.contains('discard-spread') ? 1200 : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) { return this.classList.contains('discard-spread') ? 300 : 0 })
    render(<GameTable initialState={pileState(mixedPile())} />)
    expect(within(discardGroup()).getByText(/scorri per i precedenti/)).toBeInTheDocument()

    fireEvent.click(collectButton())

    expect(within(discardGroup()).getByText('Monte degli scarti vuoto')).toBeInTheDocument()
    expect(within(discardGroup()).queryByText(/scorri per i precedenti/)).not.toBeInTheDocument()
  })

  it('adds no tab stop to a pile that fits', () => {
    render(<GameTable initialState={pileState(mixedPile())} />)

    expect(discardList()).not.toHaveAttribute('tabindex')
    expect(within(discardGroup()).queryByText(/scorri per i precedenti/)).not.toBeInTheDocument()
  })

  it('renders the stock face-down and the pozzetti only as availability', () => {
    const state = pileState(mixedPile())
    const withOnePozzetto: InProgressGameState = { ...state, pozzetti: [[], state.pozzetti[1]] }
    const { container } = render(<GameTable initialState={withOnePozzetto} />)
    // Two jokers of one deck share a label, so a label that is also public cannot identify a hidden card.
    const publicLabels = new Set([...withOnePozzetto.discardPile, ...withOnePozzetto.players[0]!.hand].map(cardLabel))
    const hidden = [...withOnePozzetto.drawPile, ...withOnePozzetto.pozzetti.flat()]
    const html = container.innerHTML

    expect(hidden.filter((hiddenCard) => html.includes(hiddenCard.id)
      || (!publicLabels.has(cardLabel(hiddenCard)) && html.includes(cardLabel(hiddenCard))))).toEqual([])
    const stock = screen.getByRole('button', { name: `Pesca dal tallone, ${state.drawPile.length} carte rimaste` })
    expect(within(stock).queryByRole('img')).not.toBeInTheDocument()

    const counter = screen.getByText('Pozzetti').closest('.pozzetti-counter')!
    expect(counter).toHaveTextContent('Pozzetti1ancora disponibili')
    expect(counter.querySelectorAll('.pozzetto-stack')).toHaveLength(2)
    expect(counter.querySelectorAll('.pozzetto-stack--empty')).toHaveLength(1)
    expect(counter.querySelector('.pozzetti-counter__stacks')).toHaveAttribute('aria-hidden', 'true')
    expect(within(counter as HTMLElement).queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps meld extension, card selection and bot playback working around a long pile', () => {
    const existing = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const extension = card('seven', 'spades')
    const pile = dealInitialState(deck).drawPile.slice(0, 20).filter(({ id }) => id !== extension.id)
    const base = pileState(pile, 'action', [existing])
    const state: InProgressGameState = {
      ...base,
      players: base.players.map((player) => ({
        ...player,
        hand: player.id === 'player-1'
          ? [extension, ...player.hand.filter(({ id }) => id !== extension.id)]
          : player.hand.filter(({ id }) => id !== extension.id),
      })),
      drawPile: base.drawPile.filter(({ id }) => id !== extension.id),
      pozzetti: [
        base.pozzetti[0].filter(({ id }) => id !== extension.id),
        base.pozzetti[1].filter(({ id }) => id !== extension.id),
      ],
    }
    const onMatchChange = vi.fn()
    render(<GameTable initialState={state} onMatchChange={onMatchChange} />)

    const extensionButton = screen.getByRole('button', { name: cardLabel(extension) })
    fireEvent.click(extensionButton)
    expect(extensionButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))
    expect(within(screen.getByRole('article', { name: 'Calata 1 squadra 1' })).getAllByRole('img')).toHaveLength(4)
    expect(renderedPile()).toEqual(pile.map(cardLabel))

    const [toDiscard] = within(screen.getByRole('region', { name: 'Mano di You' })).getAllByRole('button', { pressed: false })
    const discardedLabel = toDiscard!.getAttribute('aria-label')
    fireEvent.click(toDiscard!)
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    expect(renderedPile()).toEqual([...pile.map(cardLabel), discardedLabel])

    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))
    const committed = (onMatchChange.mock.calls.at(-1)![0] as MatchState).currentRound
    if (committed.round.status === 'in-progress') {
      expect(renderedPile()).toEqual(committed.discardPile.map(cardLabel))
    }
    expect(within(screen.getByRole('log', { name: 'Cronologia bot' })).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})
