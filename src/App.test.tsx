import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createBurracoDeck } from './game/cards/deck'
import { createSeededRandom } from './game/cards/shuffle'
import type { Card, Rank, Suit } from './game/cards/types'
import { dealInitialState } from './game/engine/startGame'
import type { RoundFactory, RoundFactoryContext } from './game/match'
import type { InProgressGameState, PlayerId } from './game/state/types'
import { cardLabel } from './components/cardPresentation'
import { BOT_PLAYBACK_DELAYS_MS, BOT_STEP_DELAY_MS, LEAVE_MATCH_CONFIRMATION } from './components/GameTable'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'

const deck = createBurracoDeck()

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card => {
  const match = deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )
  if (!match) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return match
}

/** Human in the action phase holding the king of hearts; bots follow after the discard. */
const chainState = (): InProgressGameState => {
  const initial = dealInitialState(deck)
  const hands = new Map<PlayerId, readonly Card[]>([
    ['player-1', [card('king', 'hearts'), card('ace', 'spades')]],
    ['player-2', [
      card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'), card('queen', 'spades'),
    ]],
    ['player-3', [card('four', 'clubs'), card('six', 'hearts')]],
    ['player-4', [card('five', 'clubs'), card('seven', 'hearts')]],
  ])
  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: hands.get(player.id)! })),
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

const freshDrawPile = [
  card('two', 'spades', 2), card('three', 'spades', 2), card('four', 'spades', 2),
  card('five', 'spades', 2), card('six', 'spades', 2), card('seven', 'spades', 2),
  card('eight', 'spades', 2), card('nine', 'spades', 2),
]

/** A distinguishable second match whose round starts on a pending North. */
const pendingBotState = (): InProgressGameState => ({
  ...chainState(),
  drawPile: freshDrawPile,
  round: { status: 'in-progress', turn: { currentPlayerId: 'player-2', phase: 'mustDraw' } },
})

/** First match: `chainState`; every later match: `pendingBotState`. */
const twoMatchFactories = () => {
  const setups: MatchSetup[] = []
  const createRoundFactory = vi.fn((setup: MatchSetup): RoundFactory => {
    setups.push(setup)
    return setups.length === 1 ? chainState : pendingBotState
  })
  return { setups, createRoundFactory }
}

/** Real named rounds from a seeded shuffle, spied so tests can inspect actual game state. */
const seededNamedFactories = (seed = 21) => {
  const created: { context: RoundFactoryContext; state: InProgressGameState }[] = []
  const createRoundFactory = vi.fn((setup: MatchSetup): RoundFactory => {
    const factory = createSetupRoundFactory(setup, createSeededRandom(seed))
    return (context) => {
      const state = factory(context)
      created.push({ context, state })
      return state
    }
  })
  return { created, createRoundFactory }
}

const nameInput = () => screen.getByLabelText('Il tuo nome')
const startButton = () => screen.getByRole('button', { name: 'Inizia partita' })
const table = () => screen.queryByRole('region', { name: 'Tavolo di Burraco' })
const timelineItems = () =>
  within(screen.getByRole('region', { name: 'Cronologia bot' })).queryAllByRole('listitem')
const timelineTypes = () => timelineItems().map((item) => item.getAttribute('data-event-type'))
const turnBanner = () => screen.getByText('Turno di').parentElement!
const drawPileButton = () => screen.getByRole('button', { name: /^Pesca dal tallone/ })
const speedRadio = (label: 'Normale' | 'Veloce') => screen.getByRole('radio', { name: label })

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const startWith = (name: string) => {
  fireEvent.change(nameInput(), { target: { value: name } })
  fireEvent.click(startButton())
}

const expectOnboarding = () => {
  expect(screen.getByRole('heading', { level: 1, name: 'Burraco' })).toBeInTheDocument()
  expect(nameInput()).toBeInTheDocument()
  expect(table()).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Nuova partita' })).not.toBeInTheDocument()
  expect(screen.queryByText(/^Smazzata \d\/4$/)).not.toBeInTheDocument()
}

const discardKingOfHearts = () => {
  fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
  fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
}

describe('App shell onboarding', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('opens on onboarding without mounting the game table', () => {
    const { createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)

    expectOnboarding()
    expect(screen.queryByRole('region', { name: /^Mano di / })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cronologia bot' })).not.toBeInTheDocument()
    expect(createRoundFactory).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('explains the fixed local configuration', () => {
    render(<App />)

    expect(screen.getByText('Partita locale')).toBeInTheDocument()
    const setup = screen.getByRole('list', { name: 'Configurazione della partita' })
    expect(within(setup).getByText('1 giocatore umano')).toBeInTheDocument()
    expect(within(setup).getByText('3 bot')).toBeInTheDocument()
    expect(within(setup).getByText('4 smazzate')).toBeInTheDocument()
  })

  it('cannot start with an empty or whitespace-only name', () => {
    const { createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)

    expect(nameInput()).toHaveAccessibleName('Il tuo nome')
    expect(startButton()).toBeDisabled()

    fireEvent.change(nameInput(), { target: { value: '   \t ' } })
    expect(startButton()).toBeDisabled()
    fireEvent.submit(startButton().closest('form')!)
    fireEvent.click(startButton())

    expect(createRoundFactory).not.toHaveBeenCalled()
    expectOnboarding()
  })

  it('starts round 1 with the trimmed name in the actual player-1 state and the table UI', () => {
    const { created, createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)

    startWith('  Lorenzo  ')

    expect(createRoundFactory).toHaveBeenCalledExactlyOnceWith({ humanPlayerName: 'Lorenzo' })
    expect(created).toHaveLength(1)
    expect(created[0]!.context).toEqual({ roundNumber: 1, startingPlayerId: 'player-1' })
    expect(created[0]!.state.players.map(({ id, name, teamId }) => ({ id, name, teamId }))).toEqual([
      { id: 'player-1', name: 'Lorenzo', teamId: 'team-1' },
      { id: 'player-2', name: 'North', teamId: 'team-2' },
      { id: 'player-3', name: 'Partner', teamId: 'team-1' },
      { id: 'player-4', name: 'South', teamId: 'team-2' },
    ])

    expect(table()).toBeInTheDocument()
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mano di Lorenzo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Lorenzo' })).toBeInTheDocument()
    expect(turnBanner()).toHaveTextContent('Lorenzo')
    expect(screen.queryByText(/\bYou\b/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Il tuo nome')).not.toBeInTheDocument()
    expect(drawPileButton()).toBeEnabled()
  })

  it('cancelling Nuova partita keeps the exact active match and its pending bot playback', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    discardKingOfHearts()
    advance(BOT_STEP_DELAY_MS)
    expect(timelineTypes()).toEqual(['draw-stock'])
    const pileBefore = drawPileButton().getAttribute('aria-label')

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledExactlyOnceWith(LEAVE_MATCH_CONFIRMATION)
    expect(createRoundFactory).toHaveBeenCalledOnce()
    expect(table()).toBeInTheDocument()
    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(drawPileButton()).toHaveAttribute('aria-label', pileBefore)
    expect(vi.getTimerCount()).toBe(1)

    advance(BOT_STEP_DELAY_MS)
    expect(timelineItems()).toHaveLength(2)
  })

  it('confirming Nuova partita returns to onboarding and a stale bot step cannot mutate the next match', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { setups, createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    discardKingOfHearts()

    // The old session's first bot step is just about to fire when the match is left.
    advance(BOT_STEP_DELAY_MS - 1)
    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expectOnboarding()
    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_STEP_DELAY_MS * 3)
    expectOnboarding()
    // Leaving never starts another match by itself.
    expect(createRoundFactory).toHaveBeenCalledOnce()
    expect(nameInput()).toHaveValue('Lorenzo')

    startWith('Giulia')

    expect(setups).toEqual([{ humanPlayerName: 'Lorenzo' }, { humanPlayerName: 'Giulia' }])
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    expect(turnBanner()).toHaveTextContent('North')
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 8 carte rimaste')
    advance(BOT_STEP_DELAY_MS - 1)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 7 carte rimaste')
  })

  it('does not let a callback rescheduled by a speed change survive leaving the match', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    discardKingOfHearts()
    advance(400)

    fireEvent.click(speedRadio('Veloce'))
    expect(vi.getTimerCount()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expectOnboarding()
    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectOnboarding()
  })

  it('keeps the selected bot speed for the next match started from onboarding', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    fireEvent.click(speedRadio('Veloce'))
    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    startWith('Lorenzo')

    expect(speedRadio('Veloce')).toBeChecked()
    advance(BOT_PLAYBACK_DELAYS_MS.fast - 1)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
  })
})

/**
 * Seeded named rounds whose stock is cut to three cards, so each smazzata ends by
 * draw-pile exhaustion after a few turns while keeping names and starter rotation.
 */
const shortNamedFactories = () => {
  const created: { context: RoundFactoryContext; state: InProgressGameState }[] = []
  const createRoundFactory = vi.fn((setup: MatchSetup): RoundFactory => {
    const factory = createSetupRoundFactory(setup, createSeededRandom(5))
    return (context) => {
      const full = factory(context)
      const state = { ...full, drawPile: full.drawPile.slice(0, 3) }
      created.push({ context, state })
      return state
    }
  })
  return { created, createRoundFactory }
}

/** Plays the mounted match to its terminal result using only the public UI. */
const playToFinalResult = (humanName: string) => {
  for (let step = 0; step < 200; step += 1) {
    if (screen.queryByRole('heading', { name: 'Risultato finale' })) return
    const nextRound = screen.queryByRole('button', { name: /^Inizia smazzata \d$/ })
    const completeNow = screen.queryByRole('button', { name: 'Completa subito' })
    if (nextRound) {
      fireEvent.click(nextRound)
    } else if (completeNow) {
      fireEvent.click(completeNow)
    } else if (!drawPileButton().hasAttribute('disabled')) {
      fireEvent.click(drawPileButton())
    } else {
      expect(screen.getByRole('region', { name: `Mano di ${humanName}` })).toBeInTheDocument()
      fireEvent.click(within(screen.getByLabelText(`Carte di ${humanName}`)).getAllByRole('button')[0]!)
      fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    }
  }
  throw new Error('The match did not reach its final result.')
}

describe('App shell completed-match restart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('keeps the name through four smazzate and restarts from the final result without confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { created, createRoundFactory } = shortNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith(' Lorenzo ')

    playToFinalResult('Lorenzo')

    expect(created.map(({ context }) => context)).toEqual([
      { roundNumber: 1, startingPlayerId: 'player-1' },
      { roundNumber: 2, startingPlayerId: 'player-2' },
      { roundNumber: 3, startingPlayerId: 'player-3' },
      { roundNumber: 4, startingPlayerId: 'player-4' },
    ])
    for (const { state } of created) {
      expect(state.players.map(({ id, name }) => [id, name])).toEqual([
        ['player-1', 'Lorenzo'], ['player-2', 'North'], ['player-3', 'Partner'], ['player-4', 'South'],
      ])
    }
    expect(screen.getByText('Smazzata 4/4')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Gioca ancora' }))

    expect(confirm).not.toHaveBeenCalled()
    expectOnboarding()
    expect(created).toHaveLength(4)

    startWith('Giulia')

    expect(createRoundFactory).toHaveBeenLastCalledWith({ humanPlayerName: 'Giulia' })
    expect(created.at(-1)!.context).toEqual({ roundNumber: 1, startingPlayerId: 'player-1' })
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mano di Giulia' })).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
  })
})
