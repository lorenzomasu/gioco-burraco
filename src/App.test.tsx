import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { RESTORE_DISCARDED_NOTICE, SAVE_FAILED_NOTICE, STORAGE_UNAVAILABLE_NOTICE } from './App'
import { INITIAL_BOT_CHAIN_PROGRESS, playNextBotChainStep } from './game/bot'
import { createBurracoDeck } from './game/cards/deck'
import { createSeededRandom } from './game/cards/shuffle'
import type { Card, Rank, Suit } from './game/cards/types'
import { dealInitialState } from './game/engine/startGame'
import { updateCurrentRound, type MatchState, type RoundFactory, type RoundFactoryContext } from './game/match'
import type { InProgressGameState, PlayerId } from './game/state/types'
import { cardLabel } from './components/cardPresentation'
import {
  BOT_PLAYBACK_DELAYS_MS,
  BOT_SIGNIFICANT_STEP_DELAYS_MS,
  BOT_STEP_DELAY_MS,
  LEAVE_MATCH_CONFIRMATION,
} from './components/GameTable'
import { MATCH_SAVE_STORAGE_KEY, type MatchSaveEnvelope } from './shell/matchPersistence'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'
import { createMemoryStorage } from './tests/memoryStorage'
import {
  cancelLeave,
  chooseSpeedInSettings,
  closeDialog,
  leaveConfirmed,
  leaveDialog,
  openSettings,
  requestLeave,
  settingsDialog,
} from './tests/shellDialogs'

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
/** The bot speed radio inside the open shared Settings dialog. */
const speedRadio = (label: 'Normale' | 'Veloce') => within(settingsDialog()!).getByRole('radio', { name: label })

/** The normal delay after a player hand-off (for example the human's discard). */
const HANDOFF_DELAY_MS = BOT_SIGNIFICANT_STEP_DELAYS_MS.normal

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/**
 * Programmatic lifecycle focus (M23) makes jsdom queue an asynchronous 0 ms
 * `selectionchange` timer. Flushing only 0 ms timers keeps every bot playback timer
 * (150 ms or more) pending, so the following timer count still proves no step is left.
 */
const flushFocusSelectionChange = () => advance(0)

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
    const { createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    discardKingOfHearts()
    advance(HANDOFF_DELAY_MS)
    expect(timelineTypes()).toEqual(['draw-stock'])
    const pileBefore = drawPileButton().getAttribute('aria-label')

    requestLeave()
    expect(leaveDialog()).toHaveTextContent(LEAVE_MATCH_CONFIRMATION)
    cancelLeave()

    expect(leaveDialog()).not.toBeInTheDocument()
    expect(createRoundFactory).toHaveBeenCalledOnce()
    expect(table()).toBeInTheDocument()
    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(drawPileButton()).toHaveAttribute('aria-label', pileBefore)
    expect(vi.getTimerCount()).toBe(1)

    advance(BOT_STEP_DELAY_MS)
    expect(timelineItems()).toHaveLength(2)
  })

  it('confirming Nuova partita returns to onboarding and a stale bot step cannot mutate the next match', () => {
    const { setups, createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    discardKingOfHearts()

    // The old session's first bot step is just about to fire when the match is left.
    advance(BOT_STEP_DELAY_MS - 1)
    leaveConfirmed()

    expectOnboarding()
    flushFocusSelectionChange()
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
    const { createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    discardKingOfHearts()
    advance(400)

    chooseSpeedInSettings('Veloce')
    expect(vi.getTimerCount()).toBe(1)
    leaveConfirmed()

    expectOnboarding()
    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_PLAYBACK_DELAYS_MS.normal)
    expectOnboarding()
  })

  it('keeps the selected bot speed for the next match started from onboarding', () => {
    const { createRoundFactory } = twoMatchFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    chooseSpeedInSettings('Veloce')
    leaveConfirmed()

    startWith('Lorenzo')

    openSettings()
    expect(speedRadio('Veloce')).toBeChecked()
    closeDialog(settingsDialog()!)
    advance(BOT_PLAYBACK_DELAYS_MS.fast - 1)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
  })
})

/**
 * Seeded named rounds whose stock is cut to three cards, so each smazzata ends by
 * draw-pile exhaustion after a few turns while keeping names and starter rotation.
 * With `keepFullDeck` the cut stock moves into the pozzetti instead of leaving the
 * table, so every physical card stays placed and the state remains a resumable save.
 */
const shortNamedFactories = ({ keepFullDeck = false } = {}) => {
  const created: { context: RoundFactoryContext; state: InProgressGameState }[] = []
  const createRoundFactory = vi.fn((setup: MatchSetup): RoundFactory => {
    const factory = createSetupRoundFactory(setup, createSeededRandom(5))
    return (context) => {
      const full = factory(context)
      const cut = full.drawPile.slice(3)
      const half = Math.ceil(cut.length / 2)
      const state: InProgressGameState = {
        ...full,
        drawPile: full.drawPile.slice(0, 3),
        pozzetti: keepFullDeck
          ? [[...full.pozzetti[0], ...cut.slice(0, half)], [...full.pozzetti[1], ...cut.slice(half)]]
          : full.pozzetti,
      }
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

const storedRaw = () => window.localStorage.getItem(MATCH_SAVE_STORAGE_KEY)
const storedSave = (): MatchSaveEnvelope => {
  const raw = storedRaw()
  if (raw === null) throw new Error('Expected an active local save.')
  return JSON.parse(raw)
}
const handButtons = (humanName: string) =>
  within(screen.getByLabelText(`Carte di ${humanName}`)).getAllByRole('button')

/** Plays the mounted match through the public UI until the next-round action appears. */
const playToRoundSummary = (humanName: string) => {
  for (let step = 0; step < 100; step += 1) {
    if (screen.queryByRole('button', { name: /^Inizia smazzata \d$/ })) return
    const completeNow = screen.queryByRole('button', { name: 'Completa subito' })
    if (completeNow) {
      fireEvent.click(completeNow)
    } else if (!drawPileButton().hasAttribute('disabled')) {
      fireEvent.click(drawPileButton())
    } else {
      fireEvent.click(handButtons(humanName)[0]!)
      fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    }
  }
  throw new Error('The round did not reach its summary.')
}

/** Storage whose selected operations throw, as an unavailable or full browser storage would. */
const failingStorage = (failing: readonly ('getItem' | 'setItem' | 'removeItem')[]): Storage => {
  const storage = createMemoryStorage()
  for (const operation of failing) {
    vi.spyOn(storage, operation).mockImplementation(() => {
      throw new DOMException('Storage refused', 'QuotaExceededError')
    })
  }
  return storage
}

describe('App local save and resume', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('opens onboarding without writing anything when no save exists', () => {
    render(<App />)

    expectOnboarding()
    expect(window.localStorage.length).toBe(0)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('saves the started match as one version-1 envelope with only the setup and match', () => {
    const { created, createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)

    startWith('  Lorenzo ')

    const raw = storedRaw()!
    const save = JSON.parse(raw)
    expect(Object.keys(save)).toEqual(['version', 'setup', 'match'])
    expect(save.version).toBe(1)
    expect(save.setup).toEqual({ humanPlayerName: 'Lorenzo' })
    expect(save.match).toEqual({
      status: 'in-progress',
      currentRoundNumber: 1,
      currentRound: created[0]!.state,
      roundResults: [],
    })
    for (const transient of ['botEvents', 'botProgress', 'activeTurn', 'selected', 'speed', 'normal', 'fast']) {
      expect(raw).not.toContain(transient)
    }
  })

  it('writes committed human actions but not selection or playback-speed changes', () => {
    const { createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')

    fireEvent.click(drawPileButton())

    const afterDraw = storedSave()
    const human = afterDraw.match.currentRound.players.find(({ id }) => id === 'player-1')!
    expect(human.hand).toHaveLength(12)
    expect(afterDraw.match.currentRound.round).toMatchObject({ turn: { currentPlayerId: 'player-1', phase: 'action' } })

    const setItem = vi.spyOn(window.localStorage, 'setItem')
    fireEvent.click(handButtons('Lorenzo')[0]!)
    chooseSpeedInSettings('Veloce')
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    expect(setItem).not.toHaveBeenCalled()
    expect(storedSave()).toEqual(afterDraw)
  })

  it('restores the exact saved match on reload without starting a new one', () => {
    const first = seededNamedFactories()
    const { unmount } = render(<App createRoundFactory={first.createRoundFactory} />)
    startWith('Lorenzo')
    fireEvent.click(drawPileButton())
    const saved = storedSave()
    unmount()

    const second = seededNamedFactories(99)
    render(<App createRoundFactory={second.createRoundFactory} />)

    expect(second.createRoundFactory).toHaveBeenCalledExactlyOnceWith({ humanPlayerName: 'Lorenzo' })
    expect(second.created).toHaveLength(0)
    expect(storedSave()).toEqual(saved)
    expect(table()).toBeInTheDocument()
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Lorenzo' })).toBeInTheDocument()
    const round = saved.match.currentRound
    expect(handButtons('Lorenzo')).toHaveLength(12)
    expect(drawPileButton()).toHaveAccessibleName(`Pesca dal tallone, ${round.drawPile.length} carte rimaste`)
    expect(drawPileButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scarta e passa' })).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    // M32: a concise, non-blocking resume status replaces silence; it is not a save.
    expect(screen.getByRole('status')).toHaveTextContent('Partita ripresa · Smazzata 1/4')
    expect(storedSave()).toEqual(saved)
  })

  it('resumes a pending bot turn from the committed state without replaying its committed step', () => {
    // A resumable save holds every physical card exactly once: the fixture pozzetti drop the
    // cards `chainState` places in hands and in the stock, and every card left over goes to
    // the bottom of the stock, below the cards the test draws.
    const resumableChainState = (): InProgressGameState => {
      const state = chainState()
      const used = new Set([...state.players.flatMap(({ hand }) => hand), ...state.drawPile].map(({ id }) => id))
      const pozzetti = [
        state.pozzetti[0].filter(({ id }) => !used.has(id)),
        state.pozzetti[1].filter(({ id }) => !used.has(id)),
      ] as const
      pozzetti.flat().forEach(({ id }) => used.add(id))
      return {
        ...state,
        drawPile: [...state.drawPile, ...deck.filter(({ id }) => !used.has(id))],
        pozzetti,
      }
    }
    const createRoundFactory = vi.fn((_setup: MatchSetup): RoundFactory => resumableChainState)
    const { unmount } = render(<App createRoundFactory={createRoundFactory} />)
    // `chainState` keeps the default player-1 name, so the setup uses the same name.
    startWith('You')
    discardKingOfHearts()

    // The scheduled first bot step has not fired: only the human discard is saved.
    expect(storedSave().match.currentRound.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: 'player-2', phase: 'mustDraw' },
    })
    advance(HANDOFF_DELAY_MS - 1)
    expect(storedSave().match.currentRound.round).toMatchObject({ turn: { phase: 'mustDraw' } })

    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
    const saved = storedSave()
    expect(saved.match.currentRound.round).toMatchObject({ turn: { currentPlayerId: 'player-2', phase: 'action' } })
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    const reference = playNextBotChainStep(saved.match.currentRound, 'player-1', INITIAL_BOT_CHAIN_PROGRESS)!
    expect(reference.events.map(({ type }) => type)).not.toContain('draw-stock')

    render(<App createRoundFactory={createRoundFactory} />)

    expect(table()).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    expect(turnBanner()).toHaveTextContent('North')
    expect(screen.getByRole('button', { name: 'Completa subito' })).toBeInTheDocument()
    expect(storedSave()).toEqual(saved)
    expect(vi.getTimerCount()).toBe(1)

    advance(BOT_STEP_DELAY_MS - 1)
    expect(storedSave()).toEqual(saved)
    advance(1)

    expect(timelineTypes()).toEqual(reference.events.map(({ type }) => type))
    const expected: MatchState = updateCurrentRound(saved.match, reference.state)
    expect(storedSave().match).toEqual(JSON.parse(JSON.stringify(expected)))
    expect(drawPileButton()).toHaveAccessibleName(
      `Pesca dal tallone, ${saved.match.currentRound.drawPile.length} carte rimaste`,
    )
  })

  it('restores a between-round summary without re-settling and starts the next round from the setup', () => {
    const first = shortNamedFactories({ keepFullDeck: true })
    const { unmount } = render(<App createRoundFactory={first.createRoundFactory} />)
    startWith('Lorenzo')
    playToRoundSummary('Lorenzo')
    const saved = storedSave()
    expect(saved.match.currentRoundNumber).toBe(1)
    expect(saved.match.roundResults).toHaveLength(1)
    expect(saved.match.currentRound.round.status).toBe('completed')
    const cumulative = screen.getByLabelText('Punti cumulativi').textContent
    unmount()

    const second = shortNamedFactories({ keepFullDeck: true })
    render(<App createRoundFactory={second.createRoundFactory} />)

    expect(second.created).toHaveLength(0)
    expect(screen.getByText('Smazzata 1/4')).toBeInTheDocument()
    expect(screen.getByText('Smazzata 1 di 4 conclusa')).toBeInTheDocument()
    expect(screen.getByLabelText('Punti cumulativi')).toHaveTextContent(cumulative!)
    expect(screen.getByRole('button', { name: 'Inizia smazzata 2' })).toBeInTheDocument()
    advance(BOT_STEP_DELAY_MS * 5)
    expect(storedSave()).toEqual(saved)

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(second.created.map(({ context }) => context)).toEqual([{ roundNumber: 2, startingPlayerId: 'player-2' }])
    expect(second.created[0]!.state.players.find(({ id }) => id === 'player-1')!.name).toBe('Lorenzo')
    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    const next = storedSave()
    expect(next.setup).toEqual({ humanPlayerName: 'Lorenzo' })
    expect(next.match.currentRoundNumber).toBe(2)
    expect(next.match.roundResults).toEqual(saved.match.roundResults)
  })

  it('keeps the save when Nuova partita is cancelled and clears it when confirmed', () => {
    const { createRoundFactory } = seededNamedFactories()
    const { unmount } = render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    fireEvent.click(drawPileButton())
    const saved = storedRaw()

    requestLeave()
    cancelLeave()
    expect(table()).toBeInTheDocument()
    expect(storedRaw()).toBe(saved)

    leaveConfirmed()

    expectOnboarding()
    expect(storedRaw()).toBeNull()
    unmount()
    render(<App createRoundFactory={createRoundFactory} />)
    expectOnboarding()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears the save when the match completes while the final result stays visible', () => {
    const { createRoundFactory } = shortNamedFactories({ keepFullDeck: true })
    const { unmount } = render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')

    playToFinalResult('Lorenzo')

    expect(screen.getByRole('heading', { name: 'Risultato finale' })).toBeInTheDocument()
    expect(storedRaw()).toBeNull()
    unmount()
    render(<App createRoundFactory={createRoundFactory} />)
    expectOnboarding()
    expect(nameInput()).toHaveValue('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([
    ['invalid JSON', () => '{"version":1,'],
    ['an unsupported version', () => JSON.stringify({ ...storedSave(), version: 2 })],
    ['a setup inconsistent with the saved player', () =>
      JSON.stringify({ ...storedSave(), setup: { humanPlayerName: 'Giulia' } })],
    ['a structurally invalid match', () => {
      const save = storedSave()
      return JSON.stringify({ ...save, match: { ...save.match, currentRound: { players: [] } } })
    }],
  ])('discards %s and falls back to onboarding with a notice', (_label, corrupt) => {
    const { createRoundFactory } = seededNamedFactories()
    const { unmount } = render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    const raw = corrupt()
    unmount()
    window.localStorage.setItem(MATCH_SAVE_STORAGE_KEY, raw)
    createRoundFactory.mockClear()

    render(<App createRoundFactory={createRoundFactory} />)

    expectOnboarding()
    expect(createRoundFactory).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(RESTORE_DISCARDED_NOTICE)
    expect(storedRaw()).toBeNull()

    startWith('Giulia')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(storedSave().setup).toEqual({ humanPlayerName: 'Giulia' })
  })

  it('falls back to onboarding when storage cannot be read or a corrupt save cannot be removed', () => {
    const unreadable = failingStorage(['getItem'])
    const { unmount } = render(<App storage={unreadable} />)
    expectOnboarding()
    expect(screen.getByRole('status')).toHaveTextContent(STORAGE_UNAVAILABLE_NOTICE)
    unmount()

    const stuck = createMemoryStorage()
    stuck.setItem(MATCH_SAVE_STORAGE_KEY, 'not json')
    vi.spyOn(stuck, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage refused', 'SecurityError')
    })
    render(<App storage={stuck} />)
    expectOnboarding()
    expect(screen.getByRole('status')).toHaveTextContent(RESTORE_DISCARDED_NOTICE)
  })

  it('keeps a live match playable when saving fails and survives a failing clear on leave', () => {
    const storage = failingStorage(['setItem', 'removeItem'])
    const { createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} storage={storage} />)

    startWith('Lorenzo')

    expect(table()).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(SAVE_FAILED_NOTICE)
    fireEvent.click(drawPileButton())
    expect(handButtons('Lorenzo')).toHaveLength(12)

    leaveConfirmed()
    expectOnboarding()
    expect(storage.removeItem).toHaveBeenCalledWith(MATCH_SAVE_STORAGE_KEY)
  })

  it('treats inaccessible browser storage as unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Blocked', 'SecurityError')
      },
    })
    const { createRoundFactory } = seededNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)

    expectOnboarding()
    expect(screen.getByRole('status')).toHaveTextContent(STORAGE_UNAVAILABLE_NOTICE)
    startWith('Lorenzo')
    expect(table()).toBeInTheDocument()
  })
})

/** The focused element is the table's turn status (current player and phase). */
const expectFocusOnTurnStatus = () => {
  expect(document.activeElement).not.toBe(document.body)
  expect(document.activeElement).toContainElement(screen.getByText('Turno di'))
  expect(document.activeElement).toHaveAttribute('tabindex', '-1')
}

describe('App lifecycle focus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not move focus on the first page load, for onboarding or a restored match', () => {
    const { unmount } = render(<App />)
    expect(document.activeElement).toBe(document.body)
    startWith('Lorenzo')
    unmount()

    render(<App />)
    expect(table()).toBeInTheDocument()
    expect(document.activeElement).toBe(document.body)
  })

  it('moves focus to the turn status when onboarding starts a match', () => {
    render(<App />)
    startWith('Lorenzo')

    expectFocusOnTurnStatus()
    expect(turnBanner()).toHaveTextContent('Lorenzo')
  })

  it('moves focus to the result heading, then to the fresh round when the next smazzata starts', () => {
    const { createRoundFactory } = shortNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')

    playToRoundSummary('Lorenzo')

    expect(screen.getByRole('heading', { level: 1, name: 'Tallone esaurito' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expectFocusOnTurnStatus()
  })

  it('moves focus to the onboarding heading after a confirmed Nuova partita, not after a cancelled one', () => {
    render(<App />)
    startWith('Lorenzo')
    const newMatch = screen.getByRole('button', { name: 'Nuova partita' })
    newMatch.focus()

    requestLeave()
    // The confirmation takes focus on its safe choice and gives it back when cancelled.
    expect(within(leaveDialog()!).getByRole('button', { name: 'Annulla' })).toHaveFocus()
    cancelLeave()
    expect(newMatch).toHaveFocus()

    newMatch.focus()
    leaveConfirmed()

    expectOnboarding()
    expect(screen.getByRole('heading', { level: 1, name: 'Burraco' })).toHaveFocus()
  })

  it('moves focus to the onboarding heading after Gioca ancora', () => {
    const { createRoundFactory } = shortNamedFactories()
    render(<App createRoundFactory={createRoundFactory} />)
    startWith('Lorenzo')
    playToFinalResult('Lorenzo')

    fireEvent.click(screen.getByRole('button', { name: 'Gioca ancora' }))

    expectOnboarding()
    expect(screen.getByRole('heading', { level: 1, name: 'Burraco' })).toHaveFocus()
  })

  it('shows the save-failure notice as the only status region, in the document flow before the table', () => {
    render(<App storage={failingStorage(['setItem'])} />)
    startWith('Lorenzo')

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(SAVE_FAILED_NOTICE)
    expect(notice.compareDocumentPosition(table()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nuova partita' })).toBeEnabled()
  })
})
