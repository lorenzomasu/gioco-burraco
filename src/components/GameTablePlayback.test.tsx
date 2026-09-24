import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BotAutomationError,
  INITIAL_BOT_CHAIN_PROGRESS,
  playBotsUntilHumanTurnWithTrace,
  playNextBotChainStep,
  type BotChainProgress,
  type BotPublicActionEvent,
  type BotRunLimits,
} from '../game/bot'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import { discardCard } from '../game/engine/turn'
import {
  advanceMatch,
  startMatch,
  updateCurrentRound,
  type MatchRoundNumber,
  type MatchState,
  type RoundFactory,
} from '../game/match'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { GameState, InProgressGameState, PlayerId } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { BOT_PLAYBACK_DELAYS_MS, BOT_STEP_DELAY_MS, GameTable } from './GameTable'

/**
 * Pass-through spy on the one chain-step primitive, so tests can observe that every
 * playback mode uses it and can inject smaller safety limits into the UI path.
 */
const botStepSpy = vi.hoisted(() => ({ limits: undefined as BotRunLimits | undefined }))

vi.mock('../game/bot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../game/bot')>()
  return {
    ...actual,
    playNextBotChainStep: vi.fn((...args: Parameters<typeof actual.playNextBotChainStep>) => {
      const [state, humanPlayerId, progress, limits] = args
      return actual.playNextBotChainStep(state, humanPlayerId, progress, botStepSpy.limits ?? limits)
    }),
  }
})

const chainStepSpy = vi.mocked(playNextBotChainStep)

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

const playerNames: Readonly<Record<PlayerId, string>> = {
  'player-1': 'You',
  'player-2': 'North',
  'player-3': 'Partner',
  'player-4': 'South',
}

/** Human in the action phase; player-2 can meld nines after drawing. */
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

const pendingBotState = (drawPile?: readonly Card[]): InProgressGameState => {
  const base = chainState()
  return {
    ...base,
    drawPile: drawPile ?? base.drawPile,
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-2', phase: 'mustDraw' } },
  }
}

const botClosureState = (): InProgressGameState => {
  const burraco = validatedMeld([
    card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
    card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
  ])
  const base = chainState()
  return {
    ...base,
    players: base.players.map((player) => player.id === 'player-2'
      ? { ...player, hand: [card('king', 'spades')] }
      : player),
    teams: base.teams.map((team) => team.id === 'team-2'
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

const advanceOneStep = () => {
  act(() => {
    vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
  })
}

/**
 * Programmatic lifecycle focus (M23) makes jsdom queue an asynchronous 0 ms
 * `selectionchange` timer. Flushing only 0 ms timers keeps every bot playback timer
 * (150 ms or more) pending, so the following timer count still proves no step is left.
 */
const flushFocusSelectionChange = () => {
  act(() => {
    vi.advanceTimersByTime(0)
  })
}

const timelineItems = () =>
  within(screen.getByRole('region', { name: 'Cronologia bot' })).queryAllByRole('listitem')

const timelineTypes = () => timelineItems().map((item) => item.getAttribute('data-event-type'))

const turnBanner = () => screen.getByText('Turno di').parentElement!

const drawPileButton = () => screen.getByRole('button', { name: /^Pesca dal tallone/ })

const seatCardCount = (name: string) =>
  within(screen.getByRole('region', { name: `Giocatore ${name}` })).getByLabelText(/carte in mano$/)

/** Hidden cards must be absent from text, accessible names, and every DOM attribute. */
const expectNotRendered = (hidden: Card) => {
  expect(document.body.innerHTML).not.toContain(cardLabel(hidden))
  expect(document.body.innerHTML).not.toContain(hidden.id)
}

const botHandCards = (state: GameState): readonly Card[] =>
  state.players.filter(({ id }) => id !== 'player-1').flatMap(({ hand }) => hand)

const publicCardLabels = (state: GameState): ReadonlySet<string> => new Set([
  ...state.teams.flatMap(({ melds }) => melds.flatMap(({ cards }) => cards.map(({ card: placed }) => placed))),
  ...state.discardPile,
  ...state.players.find(({ id }) => id === 'player-1')!.hand,
].map(cardLabel))

describe('GameTable bot turn playback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('walks one committed bot step per delay through consecutive bots in the domain order', () => {
    const state = chainState()
    const humanDiscard = card('king', 'hearts')
    const afterHuman = discardCard(state, 'player-1', humanDiscard.id)
    const expectedEvents = playBotsUntilHumanTurnWithTrace(afterHuman, 'player-1').events
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(humanDiscard) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    // The human action commits immediately; the first bot has not acted yet.
    expect(turnBanner()).toHaveTextContent('North')
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(screen.getByText('Bot in gioco…')).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 6 carte rimaste')
    expect(seatCardCount('North')).toHaveAccessibleName('4 carte in mano')

    advanceOneStep()
    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(timelineItems()[0]).toHaveTextContent('North pesca dal tallone.')
    expect(turnBanner()).toHaveTextContent('North')
    expect(screen.getByText('Gioco')).toBeInTheDocument()
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 5 carte rimaste')
    expect(seatCardCount('North')).toHaveAccessibleName('5 carte in mano')
    expect(within(screen.getByRole('region', { name: 'Calate squadra 2' })).getByText('Nessuna calata'))
      .toBeInTheDocument()

    advanceOneStep()
    expect(timelineTypes()).toEqual(['draw-stock', 'play-meld'])
    expect(within(screen.getByRole('region', { name: 'Calate squadra 2' })).getAllByRole('img')).toHaveLength(3)
    expect(turnBanner()).toHaveTextContent('North')
    expect(seatCardCount('North')).toHaveAccessibleName('2 carte in mano')

    advanceOneStep()
    expect(timelineTypes()).toEqual(['draw-stock', 'play-meld', 'discard'])
    expect(turnBanner()).toHaveTextContent('Partner')
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(screen.getByText('Bot in gioco…')).toBeInTheDocument()

    const seenPlayers: string[] = []
    for (let step = 0; step < 50 && vi.getTimerCount() > 0; step += 1) {
      const before = timelineItems().length
      advanceOneStep()
      expect(timelineItems().length).toBeGreaterThan(before)
      expect(timelineItems().length - before).toBeLessThanOrEqual(2)
      seenPlayers.push(screen.queryByText('Bot in gioco…') ? turnBanner().textContent ?? '' : 'done')
    }

    expect(seenPlayers.some((text) => text.includes('South'))).toBe(true)
    expect(timelineTypes()).toEqual(expectedEvents.map(({ type }) => type))
    expect(timelineItems().map((item) => item.textContent?.split(' ')[0]))
      .toEqual(expectedEvents.map(({ playerId }) => playerNames[playerId]))
    expect(turnBanner()).toHaveTextContent('You')
    expect(screen.queryByText('Bot in gioco…')).not.toBeInTheDocument()
  })

  it('blocks every human gameplay control while bot playback is active', () => {
    const state = chainState()
    const humanDiscard = card('king', 'hearts')
    const kept = card('ace', 'spades')
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(humanDiscard) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    for (let step = 0; step < 3; step += 1) {
      expect(screen.queryByRole('button', { name: cardLabel(kept) })).not.toBeInTheDocument()
      expect(screen.getByRole('img', { name: cardLabel(kept) })).toBeInTheDocument()
      expect(drawPileButton()).toBeDisabled()
      expect(screen.getByRole('button', { name: /Raccogli il monte degli scarti/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cala' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Scarta e passa' })).toBeDisabled()
      for (const extend of screen.queryAllByRole('button', { name: /^Aggiungi alla calata/ })) {
        expect(extend).toBeDisabled()
      }

      const itemsBefore = timelineItems().length
      const pileBefore = drawPileButton().getAttribute('aria-label')
      fireEvent.click(drawPileButton())
      fireEvent.click(screen.getByRole('button', { name: /Raccogli il monte degli scarti/ }))
      fireEvent.click(screen.getByRole('img', { name: cardLabel(kept) }))
      fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
      fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

      expect(drawPileButton()).toHaveAttribute('aria-label', pileBefore)
      expect(timelineItems()).toHaveLength(itemsBefore)
      expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('1 carte')).toBeInTheDocument()
      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      advanceOneStep()
    }
  })

  it('never renders bot hand faces or the drawn stock card during intermediate states', () => {
    const state = chainState()
    const humanDiscard = card('king', 'hearts')
    let expected: GameState = discardCard(state, 'player-1', humanDiscard.id)
    let progress: BotChainProgress = INITIAL_BOT_CHAIN_PROGRESS
    const drawnByNorth = expected.drawPile[0]!
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(humanDiscard) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    for (let step = 0; step < 50; step += 1) {
      const publicLabels = publicCardLabels(expected)
      for (const hidden of botHandCards(expected)) {
        if (!publicLabels.has(cardLabel(hidden))) expectNotRendered(hidden)
      }
      for (const hidden of expected.drawPile) {
        if (!publicLabels.has(cardLabel(hidden))) expectNotRendered(hidden)
      }
      const next = playNextBotChainStep(expected, 'player-1', progress)
      if (!next) break
      advanceOneStep()
      if (step === 0) {
        expect(timelineTypes()).toEqual(['draw-stock'])
        expectNotRendered(drawnByNorth)
      }
      expected = next.state
      progress = next.progress
    }

    expect(vi.getTimerCount()).toBe(0)
    expect(turnBanner()).toHaveTextContent('You')
  })

  it('reports a pozzetto acquisition with its triggering meld without revealing the pozzetto', () => {
    const base = chainState()
    const state: InProgressGameState = {
      ...base,
      players: base.players.map((player) => player.id === 'player-2'
        ? { ...player, hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')] }
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
    const expected = playNextBotChainStep(state, 'player-1')!
    const publicLabels = publicCardLabels(expected.state)
    const pozzettoCards = expected.state.players.find(({ id }) => id === 'player-2')!.hand
    expect(pozzettoCards).toEqual(state.pozzetti[0])
    render(<GameTable initialState={state} />)

    expect(timelineItems()).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Calate squadra 2' })).toHaveTextContent('Pozzetto da prendere')

    advanceOneStep()

    expect(timelineTypes()).toEqual(['play-meld', 'take-pozzetto'])
    expect(timelineItems()[1]).toHaveTextContent('North prende il pozzetto al volo.')
    expect(screen.getByRole('region', { name: 'Calate squadra 2' })).toHaveTextContent('Pozzetto preso')
    expect(seatCardCount('North')).toHaveAccessibleName(`${pozzettoCards.length} carte in mano`)
    for (const hidden of pozzettoCards) {
      if (!publicLabels.has(cardLabel(hidden))) expectNotRendered(hidden)
    }
  })

  it('renders the terminal bot action on the completed-round screen', () => {
    const state = botClosureState()
    const discarded = card('king', 'spades')
    render(<GameTable initialState={state} />)

    expect(screen.getByRole('region', { name: 'Tavolo di Burraco' })).toBeInTheDocument()
    expect(turnBanner()).toHaveTextContent('North')
    expect(timelineItems()).toHaveLength(0)

    advanceOneStep()

    expect(screen.getByRole('heading', { name: 'Ha chiuso North' })).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(1)
    expect(timelineItems()[0]).toHaveTextContent(`North scarta ${cardLabel(discarded)}.`)
    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts stepwise playback for an initial pending bot instead of resolving it during render', () => {
    render(<GameTable initialState={pendingBotState()} />)

    expect(turnBanner()).toHaveTextContent('North')
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 6 carte rimaste')

    advanceOneStep()

    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 5 carte rimaste')
  })

  it('clears the previous round and step-plays a pending bot in smazzata 2', () => {
    const createGame = vi.fn(() => pendingBotState())
    render(<GameTable initialState={botClosureState()} createGame={createGame} />)
    advanceOneStep()
    expect(timelineItems()).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    expect(turnBanner()).toHaveTextContent('North')

    advanceOneStep()

    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(timelineItems()[0]).toHaveTextContent('North pesca dal tallone.')
  })

  it('cancels the pending bot step when a confirmed Nuova partita unmounts the table', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const createGame = vi.fn(() => pendingBotState())
    const onLeaveMatch = vi.fn()
    const { unmount } = render(
      <GameTable initialState={chainState()} createGame={createGame} onLeaveMatch={onLeaveMatch} />,
    )
    discardKingOfHearts()
    // The first bot step is just about to fire when the match is left.
    advance(BOT_STEP_DELAY_MS - 1)
    expect(vi.getTimerCount()).toBe(1)
    chainStepSpy.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(onLeaveMatch).toHaveBeenCalledOnce()
    expect(createGame).not.toHaveBeenCalled()

    // The shell replaces the table on leave; its effect cleanup cancels the step.
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_STEP_DELAY_MS * 3)
    expect(chainStepSpy).not.toHaveBeenCalled()
  })

  it('restores normal human controls once playback returns control to the human', () => {
    const state = chainState()
    render(<GameTable initialState={state} />)
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    for (let step = 0; step < 50 && vi.getTimerCount() > 0; step += 1) advanceOneStep()

    expect(turnBanner()).toHaveTextContent('You')
    expect(screen.queryByText('Bot in gioco…')).not.toBeInTheDocument()
    const draw = drawPileButton()
    expect(draw).toBeEnabled()
    fireEvent.click(draw)

    expect(screen.getByText('Gioco')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('2 carte')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('ace', 'spades')) }))
    expect(screen.getByRole('button', { name: cardLabel(card('ace', 'spades')) }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(vi.getTimerCount()).toBe(0)
  })
})

/** Honors the lifecycle-requested starter through the engine setup API. */
const rotatingRound: RoundFactory = ({ startingPlayerId }) => dealInitialState(deck, { startingPlayerId })

const completedByHuman = (state: GameState): GameState => ({
  ...state,
  round: { status: 'completed', ending: 'closure', closedByPlayerId: 'player-1', closingTeamId: 'team-1' },
})

/** A match whose smazzata `nextRound - 1` is completed and settled, awaiting `Inizia smazzata N`. */
const matchAwaiting = (nextRound: 2 | 3 | 4): MatchState => {
  let match = startMatch(rotatingRound)
  for (let roundNumber = 1; roundNumber < nextRound; roundNumber += 1) {
    if (roundNumber > 1) match = advanceMatch(match, rotatingRound)
    match = updateCurrentRound(match, completedByHuman(match.currentRound))
  }
  return match
}

/** The discard-pile control, whether the pile currently holds cards or is empty. */
const discardPileButton = () =>
  screen.getByRole('button', { name: /^(Raccogli il monte degli scarti|Monte degli scarti vuoto)/ })

const expectHumanGameplayLocked = () => {
  const humanHand = within(screen.getByLabelText('Carte di You'))
  expect(humanHand.queryAllByRole('button')).toHaveLength(0)
  expect(drawPileButton()).toBeDisabled()
  expect(discardPileButton()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cala' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Scarta e passa' })).toBeDisabled()
  for (const extend of screen.queryAllByRole('button', { name: /^Aggiungi alla calata/ })) {
    expect(extend).toBeDisabled()
  }
}

describe('GameTable round starter rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('starts smazzata 2 on North and step-plays it through the existing playback', () => {
    const createGame = vi.fn(rotatingRound)
    const round2 = dealInitialState(deck, { startingPlayerId: 'player-2' })
    const firstStep = playNextBotChainStep(round2, 'player-1')!
    render(<GameTable initialState={botClosureState()} createGame={createGame} />)
    advanceOneStep()
    expect(screen.getByRole('heading', { name: 'Ha chiuso North' })).toBeInTheDocument()
    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(createGame.mock.calls).toEqual([[{ roundNumber: 2, startingPlayerId: 'player-2' }]])
    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expect(turnBanner()).toHaveTextContent('North')
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(screen.getByText('Bot in gioco…')).toBeInTheDocument()
    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 41 carte rimaste')
    expect(seatCardCount('North')).toHaveAccessibleName('11 carte in mano')
    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS - 1)
    })
    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 41 carte rimaste')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(firstStep.events.length).toBeGreaterThan(0)
    expect(timelineTypes()).toEqual(firstStep.events.map(({ type }) => type))
    expect(timelineItems()[0]).toHaveTextContent(/^North /)
    expect(drawPileButton())
      .toHaveAccessibleName(`Pesca dal tallone, ${firstStep.state.drawPile.length} carte rimaste`)
    const northAfterStep = firstStep.state.players.find(({ id }) => id === 'player-2')!.hand.length
    expect(seatCardCount('North')).toHaveAccessibleName(`${northAfterStep} carte in mano`)
    expect(createGame).toHaveBeenCalledOnce()
  })

  it.each([
    [2, 'North'],
    [3, 'Partner'],
    [4, 'South'],
  ] as const)('renders smazzata %i with its scheduled bot starter %s before any step', (roundNumber, starter) => {
    const createGame = vi.fn(rotatingRound)
    const firstStep = playNextBotChainStep(
      dealInitialState(deck, { startingPlayerId: `player-${roundNumber}` }),
      'player-1',
    )!
    render(<GameTable initialMatch={matchAwaiting(roundNumber)} createGame={createGame} />)

    fireEvent.click(screen.getByRole('button', { name: `Inizia smazzata ${roundNumber}` }))

    expect(createGame.mock.calls.at(-1)).toEqual([
      { roundNumber, startingPlayerId: `player-${roundNumber}` },
    ])
    expect(screen.getByText(`Smazzata ${roundNumber}/4`)).toBeInTheDocument()
    expect(turnBanner()).toHaveTextContent(starter)
    expect(timelineItems()).toHaveLength(0)
    expectHumanGameplayLocked()

    advanceOneStep()

    expect(timelineTypes()).toEqual(firstStep.events.map(({ type }) => type))
    expect(timelineItems()[0]).toHaveTextContent(new RegExp(`^${starter} `))
  })

  it('locks human gameplay and hides bot hands and stock while the fresh-round chain is pending', () => {
    let expected: GameState = dealInitialState(deck, { startingPlayerId: 'player-2' })
    let progress: BotChainProgress = INITIAL_BOT_CHAIN_PROGRESS
    const everPublicLabels = new Set<string>()
    render(<GameTable initialMatch={matchAwaiting(2)} createGame={rotatingRound} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))
    const humanHandSize = expected.players.find(({ id }) => id === 'player-1')!.hand.length

    for (let step = 0; step < 50; step += 1) {
      const next = playNextBotChainStep(expected, 'player-1', progress)
      if (!next) break

      expectHumanGameplayLocked()
      const itemsBefore = timelineItems().length
      const pileBefore = drawPileButton().getAttribute('aria-label')
      const humanCard = within(screen.getByLabelText('Carte di You')).getAllByRole('img')[0]!
      fireEvent.click(drawPileButton())
      fireEvent.click(discardPileButton())
      fireEvent.click(humanCard)
      fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
      fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
      expect(drawPileButton()).toHaveAttribute('aria-label', pileBefore)
      expect(timelineItems()).toHaveLength(itemsBefore)
      expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText(`${humanHandSize} carte`))
        .toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      // Cards collected from the face-up discard pile were legitimately public before.
      for (const label of publicCardLabels(expected)) everPublicLabels.add(label)
      for (const hidden of [...botHandCards(expected), ...expected.drawPile, ...expected.pozzetti.flat()]) {
        if (!everPublicLabels.has(cardLabel(hidden))) expectNotRendered(hidden)
      }

      advanceOneStep()
      expected = next.state
      progress = next.progress
    }

    expect(vi.getTimerCount()).toBe(0)
    expect(turnBanner()).toHaveTextContent('You')
  })

  it('returns normal controls to the human after the fresh-round chain with the full-chain events', () => {
    const round2 = dealInitialState(deck, { startingPlayerId: 'player-2' })
    const expectedChain = playBotsUntilHumanTurnWithTrace(round2, 'player-1')
    expect(expectedChain.state.round).toMatchObject({ status: 'in-progress', turn: { currentPlayerId: 'player-1' } })
    render(<GameTable initialMatch={matchAwaiting(2)} createGame={rotatingRound} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    for (let step = 0; step < 50 && vi.getTimerCount() > 0; step += 1) {
      const before = timelineItems().length
      advanceOneStep()
      expect(timelineItems().length - before).toBeGreaterThanOrEqual(1)
      expect(timelineItems().length - before).toBeLessThanOrEqual(2)
    }

    expect(timelineTypes()).toEqual(expectedChain.events.map(({ type }) => type))
    expect(timelineItems().map((item) => item.textContent?.split(' ')[0]))
      .toEqual(expectedChain.events.map(({ playerId }) => playerNames[playerId]))
    expect(turnBanner()).toHaveTextContent('You')
    expect(screen.queryByText('Bot in gioco…')).not.toBeInTheDocument()
    expect(drawPileButton()).toHaveAccessibleName(`Pesca dal tallone, ${expectedChain.state.drawPile.length} carte rimaste`)

    fireEvent.click(drawPileButton())

    expect(screen.getByText('Gioco')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mano di You' })).getByText('12 carte')).toBeInTheDocument()
    const selectable = within(screen.getByLabelText('Carte di You')).getAllByRole('button')[0]!
    fireEvent.click(selectable)
    expect(selectable).toHaveAttribute('aria-pressed', 'true')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([2, 3, 4] as const)(
    'requires confirmation to leave pending smazzata %i and keeps it intact when cancelled',
    (roundNumber: MatchRoundNumber) => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const createGame = vi.fn(rotatingRound)
      const onLeaveMatch = vi.fn()
      const { unmount } = render(
        <GameTable
          initialMatch={matchAwaiting(roundNumber as 2 | 3 | 4)}
          createGame={createGame}
          onLeaveMatch={onLeaveMatch}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: `Inizia smazzata ${roundNumber}` }))
      advanceOneStep()
      expect(timelineItems()).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(1)
      const bannerBefore = turnBanner().textContent
      const pileBefore = drawPileButton().getAttribute('aria-label')

      fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

      expect(confirm).toHaveBeenCalledOnce()
      expect(onLeaveMatch).not.toHaveBeenCalled()
      expect(createGame).toHaveBeenCalledOnce()
      expect(screen.getByText(`Smazzata ${roundNumber}/4`)).toBeInTheDocument()
      expect(turnBanner().textContent).toBe(bannerBefore)
      expect(drawPileButton()).toHaveAttribute('aria-label', pileBefore)
      expect(timelineItems()).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(1)

      advanceOneStep()
      expect(timelineItems().length).toBeGreaterThan(1)

      confirm.mockReturnValue(true)
      fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

      expect(onLeaveMatch).toHaveBeenCalledOnce()
      expect(createGame).toHaveBeenCalledOnce()
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})

/** Runs the chain-step primitive from a session until it yields control, collecting every step. */
const stepTrace = (
  state: GameState,
  progress: BotChainProgress = INITIAL_BOT_CHAIN_PROGRESS,
) => {
  const steps: { state: GameState; events: readonly BotPublicActionEvent[]; progress: BotChainProgress }[] = []
  let current = state
  let currentProgress = progress
  for (let next = playNextBotChainStep(current, 'player-1', currentProgress); next;
    next = playNextBotChainStep(current, 'player-1', currentProgress)) {
    steps.push(next)
    current = next.state
    currentProgress = next.progress
  }
  return { steps, state: current, events: steps.flatMap(({ events }) => events) }
}

const speedRadio = (label: 'Normale' | 'Veloce') => screen.getByRole('radio', { name: label })

const completeNowButton = () => screen.queryByRole('button', { name: 'Completa subito' })

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const discardKingOfHearts = () => {
  fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
  fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
}

const timelineTexts = () => timelineItems().map((item) => item.textContent)

const expectTimelineMatches = (events: readonly BotPublicActionEvent[]) => {
  expect(timelineTypes()).toEqual(events.map(({ type }) => type))
  expect(timelineItems().map((item) => item.textContent?.split(' ')[0]))
    .toEqual(events.map(({ playerId }) => playerNames[playerId]))
}

/** Rendered table and timeline, excluding the header playback controls. */
/**
 * M24 visual-feedback attributes are transient presentation of the latest step (immediate
 * completion deliberately clears them), so they are excluded from the committed-outcome
 * comparison.
 */
const withoutFeedbackCues = (html: string) => html.replace(/ data-feedback(?:-cycle)?="[^"]*"/g, '')

const renderedOutcome = () => {
  const table = screen.queryByRole('region', { name: 'Tavolo di Burraco' })
  return [
    withoutFeedbackCues(
      table?.innerHTML ?? document.querySelector('main')!.innerHTML.replace(/<header[\s\S]*?<\/header>/, ''),
    ),
    screen.getByRole('region', { name: 'Cronologia bot' }).innerHTML,
  ]
}

type PlaybackMode = 'normal' | 'fast' | 'immediate'

/** Drives the pending chain to its endpoint with one playback mode. */
const finishPlayback = (mode: PlaybackMode) => {
  if (mode === 'immediate') {
    fireEvent.click(completeNowButton()!)
  } else {
    for (let step = 0; step < 100 && vi.getTimerCount() > 0; step += 1) advance(BOT_PLAYBACK_DELAYS_MS[mode])
  }
  expect(vi.getTimerCount()).toBe(0)
}

const selectMode = (mode: PlaybackMode) => {
  if (mode === 'fast') fireEvent.click(speedRadio('Veloce'))
}

describe('GameTable bot playback speed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('offers exactly two speeds from one delay mapping, defaulting to normal at 550 ms', () => {
    expect(BOT_PLAYBACK_DELAYS_MS).toEqual({ normal: 550, fast: 150 })
    expect(BOT_STEP_DELAY_MS).toBe(BOT_PLAYBACK_DELAYS_MS.normal)
    render(<GameTable initialState={pendingBotState()} />)

    const group = screen.getByRole('group', { name: 'Velocità bot' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(speedRadio('Normale')).toBeChecked()
    expect(speedRadio('Veloce')).not.toBeChecked()

    advance(549)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
  })

  it('changes no game or timeline state when the speed changes with no bot pending', () => {
    render(<GameTable initialState={chainState()} />)
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('ace', 'spades')) }))
    const before = renderedOutcome()
    expect(completeNowButton()).not.toBeInTheDocument()

    fireEvent.click(speedRadio('Veloce'))

    expect(speedRadio('Veloce')).toBeChecked()
    expect(renderedOutcome()).toEqual(before)
    expect(screen.getByRole('button', { name: cardLabel(card('ace', 'spades')) }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(vi.getTimerCount()).toBe(0)

    fireEvent.click(speedRadio('Normale'))
    expect(renderedOutcome()).toEqual(before)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['normal', 'fast'] as const)('commits exactly one step per %s delay', (speed) => {
    const delay = BOT_PLAYBACK_DELAYS_MS[speed]
    const state = chainState()
    const expected = stepTrace(discardCard(state, 'player-1', card('king', 'hearts').id))
    render(<GameTable initialState={state} />)
    selectMode(speed)
    discardKingOfHearts()

    let committedEvents = 0
    for (const step of expected.steps) {
      advance(delay - 1)
      expect(timelineItems()).toHaveLength(committedEvents)
      advance(1)
      committedEvents += step.events.length
      expect(timelineItems()).toHaveLength(committedEvents)
    }

    expectTimelineMatches(expected.events)
    expect(turnBanner()).toHaveTextContent('You')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reschedules a partly elapsed normal step to 150 ms after switching to fast', () => {
    render(<GameTable initialState={pendingBotState()} />)
    advance(300)
    expect(vi.getTimerCount()).toBe(1)

    fireEvent.click(speedRadio('Veloce'))

    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 6 carte rimaste')
    expect(vi.getTimerCount()).toBe(1)
    advance(149)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
    // The cancelled normal timer would have fired here, 550 ms after it was scheduled.
    advance(100)
    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 5 carte rimaste')
  })

  it('reschedules a partly elapsed fast step to 550 ms after switching to normal', () => {
    render(<GameTable initialState={pendingBotState()} />)
    fireEvent.click(speedRadio('Veloce'))
    advance(100)

    fireEvent.click(speedRadio('Normale'))

    expect(timelineItems()).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(1)
    // The cancelled fast timer would have fired 50 ms after the change.
    advance(549)
    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 6 carte rimaste')
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])
  })

  it('never leaves duplicate callbacks after repeated speed toggles', () => {
    const state = pendingBotState()
    const expected = stepTrace(state)
    render(<GameTable initialState={state} />)

    for (const label of ['Veloce', 'Normale', 'Veloce', 'Normale', 'Veloce'] as const) {
      advance(100)
      fireEvent.click(speedRadio(label))
      expect(vi.getTimerCount()).toBe(1)
      expect(timelineItems()).toHaveLength(0)
    }

    advance(149)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineItems()).toHaveLength(expected.steps[0]!.events.length)
    expect(vi.getTimerCount()).toBe(1)

    finishPlayback('fast')
    expectTimelineMatches(expected.events)
  })

  it.each([2, 3, 4] as const)('keeps the selected speed after Inizia smazzata %i', (roundNumber) => {
    const firstStep = playNextBotChainStep(
      dealInitialState(deck, { startingPlayerId: `player-${roundNumber}` }),
      'player-1',
    )!
    render(<GameTable initialMatch={matchAwaiting(roundNumber)} createGame={rotatingRound} />)
    fireEvent.click(speedRadio('Veloce'))

    fireEvent.click(screen.getByRole('button', { name: `Inizia smazzata ${roundNumber}` }))

    expect(speedRadio('Veloce')).toBeChecked()
    expect(timelineItems()).toHaveLength(0)
    expect(completeNowButton()).toBeInTheDocument()
    advance(149)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(firstStep.events.map(({ type }) => type))
  })

  it('uses a shell-owned speed preference when one is provided', () => {
    const onPlaybackSpeedChange = vi.fn()
    const { rerender } = render(
      <GameTable initialState={pendingBotState()} playbackSpeed="fast" onPlaybackSpeedChange={onPlaybackSpeedChange} />,
    )
    expect(speedRadio('Veloce')).toBeChecked()
    advance(149)
    expect(timelineItems()).toHaveLength(0)
    advance(1)
    expect(timelineTypes()).toEqual(['draw-stock'])

    fireEvent.click(speedRadio('Normale'))
    expect(onPlaybackSpeedChange).toHaveBeenCalledExactlyOnceWith('normal')
    // The owner decides; until it re-renders with the new value the table keeps fast.
    expect(speedRadio('Veloce')).toBeChecked()

    rerender(
      <GameTable initialState={pendingBotState()} playbackSpeed="normal" onPlaybackSpeedChange={onPlaybackSpeedChange} />,
    )
    expect(speedRadio('Normale')).toBeChecked()
    advance(549)
    expect(timelineItems()).toHaveLength(1)
    advance(1)
    expect(timelineItems().length).toBeGreaterThan(1)
  })
})

describe('GameTable immediate bot completion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    botStepSpy.limits = undefined
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('shows Completa subito only while a bot chain is pending', () => {
    render(<GameTable initialState={chainState()} />)
    expect(completeNowButton()).not.toBeInTheDocument()

    discardKingOfHearts()
    expect(completeNowButton()).toBeEnabled()

    fireEvent.click(completeNowButton()!)
    expect(turnBanner()).toHaveTextContent('You')
    expect(completeNowButton()).not.toBeInTheDocument()
  })

  it('completes the whole chain after zero delayed steps with the full-chain trace', () => {
    const state = chainState()
    const afterHuman = discardCard(state, 'player-1', card('king', 'hearts').id)
    const expected = playBotsUntilHumanTurnWithTrace(afterHuman, 'player-1')
    render(<GameTable initialState={state} />)
    discardKingOfHearts()
    expect(timelineItems()).toHaveLength(0)

    fireEvent.click(completeNowButton()!)

    expectTimelineMatches(expected.events)
    expect(new Set(expected.events.map(({ playerId }) => playerId)))
      .toEqual(new Set(['player-2', 'player-3', 'player-4']))
    expect(turnBanner()).toHaveTextContent('You')
    expect(screen.queryByText('Bot in gioco…')).not.toBeInTheDocument()
    expect(drawPileButton()).toHaveAccessibleName(`Pesca dal tallone, ${expected.state.drawPile.length} carte rimaste`)
    expect(drawPileButton()).toBeEnabled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('continues from the partial chain and current progress through the chain-step primitive', () => {
    const state = chainState()
    const afterHuman = discardCard(state, 'player-1', card('king', 'hearts').id)
    const full = stepTrace(afterHuman)
    const delayedSteps = 4
    const partial = full.steps[delayedSteps - 1]!
    expect(partial.progress).not.toEqual(INITIAL_BOT_CHAIN_PROGRESS)
    const remaining = stepTrace(partial.state, partial.progress)
    render(<GameTable initialState={state} />)
    discardKingOfHearts()
    for (let step = 0; step < delayedSteps; step += 1) advanceOneStep()
    const committedBefore = timelineTexts()
    expect(committedBefore).toHaveLength(full.steps.slice(0, delayedSteps).flatMap(({ events }) => events).length)
    chainStepSpy.mockClear()

    fireEvent.click(completeNowButton()!)

    // One primitive call per remaining committed step plus the final call yielding control.
    expect(chainStepSpy).toHaveBeenCalledTimes(remaining.steps.length + 1)
    expect(chainStepSpy.mock.calls[0]![0]).toEqual(partial.state)
    expect(chainStepSpy.mock.calls[0]![2]).toEqual(partial.progress)
    expect(timelineTexts().slice(0, committedBefore.length)).toEqual(committedBefore)
    expect(timelineItems()).toHaveLength(committedBefore.length + remaining.events.length)
    expectTimelineMatches(full.events)
    expect(turnBanner()).toHaveTextContent('You')
  })

  it('cancels a pending delayed step so it cannot fire after immediate completion', () => {
    const state = chainState()
    const expected = stepTrace(discardCard(state, 'player-1', card('king', 'hearts').id))
    render(<GameTable initialState={state} />)
    discardKingOfHearts()
    advanceOneStep()
    advance(BOT_STEP_DELAY_MS - 1)
    expect(vi.getTimerCount()).toBe(1)

    fireEvent.click(completeNowButton()!)
    const completed = renderedOutcome()
    chainStepSpy.mockClear()

    expect(vi.getTimerCount()).toBe(0)
    advance(BOT_STEP_DELAY_MS * 10)
    expect(chainStepSpy).not.toHaveBeenCalled()
    expect(renderedOutcome()).toEqual(completed)
    expectTimelineMatches(expected.events)
  })

  it('stops when a bot closes the round and keeps the terminal event on the completed-round screen', () => {
    const discarded = card('king', 'spades')
    render(<GameTable initialState={botClosureState()} />)

    fireEvent.click(completeNowButton()!)

    expect(screen.getByRole('heading', { name: 'Ha chiuso North' })).toBeInTheDocument()
    expect(timelineTypes()).toEqual(['discard'])
    expect(timelineItems()[0]).toHaveTextContent(`North scarta ${cardLabel(discarded)}.`)
    expect(completeNowButton()).not.toBeInTheDocument()
    flushFocusSelectionChange()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves pozzetto side-effect events in order without revealing the pozzetto', () => {
    const base = chainState()
    const state: InProgressGameState = {
      ...base,
      players: base.players.map((player) => player.id === 'player-2'
        ? { ...player, hand: [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')] }
        : player),
      round: {
        status: 'in-progress',
        turn: { currentPlayerId: 'player-2', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
      },
    }
    const expected = stepTrace(state)
    expect(expected.events.slice(0, 2).map(({ type }) => type)).toEqual(['play-meld', 'take-pozzetto'])
    render(<GameTable initialState={state} />)

    fireEvent.click(completeNowButton()!)

    expectTimelineMatches(expected.events)
    expect(timelineItems()[1]).toHaveTextContent('North prende il pozzetto al volo.')
    const everPublic = new Set([
      ...[state, ...expected.steps.map((step) => step.state)].flatMap((seen) => [...publicCardLabels(seen)]),
    ])
    const final = expected.state
    for (const hidden of [...botHandCards(final), ...final.drawPile, ...final.pozzetti.flat()]) {
      if (!everPublic.has(cardLabel(hidden))) expectNotRendered(hidden)
    }
  })

  it.each(['normal', 'fast', 'immediate'] as const)(
    'reaches the same final table and timeline in %s mode from the same pending session',
    (mode) => {
      const reference = (() => {
        const { unmount } = render(<GameTable initialMatch={matchAwaiting(3)} createGame={rotatingRound} />)
        fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 3' }))
        finishPlayback('normal')
        const outcome = renderedOutcome()
        unmount()
        return outcome
      })()
      const expected = stepTrace(dealInitialState(deck, { startingPlayerId: 'player-3' }))
      render(<GameTable initialMatch={matchAwaiting(3)} createGame={rotatingRound} />)
      fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 3' }))
      selectMode(mode)
      advanceOneStep()

      finishPlayback(mode)

      expect(renderedOutcome()).toEqual(reference)
      expectTimelineMatches(expected.events)
    },
  )
})

describe('GameTable playback safety, reset and hidden information', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    botStepSpy.limits = undefined
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('enforces the existing chain safety limit with the current progress in immediate completion', () => {
    const state = chainState()
    const afterHuman = discardCard(state, 'player-1', card('king', 'hearts').id)
    const steps = stepTrace(afterHuman).steps
    const partnerStart = steps.findIndex((step) => step.events[0]!.playerId === 'player-3')
    expect(steps.slice(partnerStart).some((step) => step.events[0]!.playerId === 'player-4')).toBe(true)
    botStepSpy.limits = { maxBotTurns: 2 }
    render(<GameTable initialState={state} />)
    discardKingOfHearts()
    for (let step = 0; step <= partnerStart; step += 1) advanceOneStep()
    expect(turnBanner()).toHaveTextContent('Partner')

    // Restarting from fresh counters would let Partner and South finish within two turns.
    expect(() => fireEvent.click(completeNowButton()!))
      .toThrow(new BotAutomationError('Bot chain exceeded the 2-turn safety limit.'))
  })

  it('enforces the same chain safety limit in delayed playback', () => {
    botStepSpy.limits = { maxBotTurns: 2 }
    render(<GameTable initialState={chainState()} />)
    discardKingOfHearts()

    expect(() => {
      for (let step = 0; step < 50 && vi.getTimerCount() > 0; step += 1) advanceOneStep()
    }).toThrow(new BotAutomationError('Bot chain exceeded the 2-turn safety limit.'))
  })

  it.each(['normal', 'fast', 'immediate'] as const)(
    'keeps human gameplay locked until the chain ends in %s mode',
    (mode) => {
      render(<GameTable initialMatch={matchAwaiting(2)} createGame={rotatingRound} />)
      fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))
      selectMode(mode)
      const humanHandSize = within(screen.getByLabelText('Carte di You')).getAllByRole('img').length

      const attemptHumanActions = () => {
        expectHumanGameplayLocked()
        const itemsBefore = timelineItems().length
        const pileBefore = drawPileButton().getAttribute('aria-label')
        fireEvent.click(drawPileButton())
        fireEvent.click(discardPileButton())
        fireEvent.click(within(screen.getByLabelText('Carte di You')).getAllByRole('img')[0]!)
        fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
        fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
        expect(drawPileButton()).toHaveAttribute('aria-label', pileBefore)
        expect(timelineItems()).toHaveLength(itemsBefore)
        expect(within(screen.getByLabelText('Carte di You')).getAllByRole('img')).toHaveLength(humanHandSize)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      }

      if (mode === 'immediate') {
        attemptHumanActions()
        advanceOneStep()
        attemptHumanActions()
        fireEvent.click(completeNowButton()!)
      } else {
        for (let step = 0; step < 50 && vi.getTimerCount() > 0; step += 1) {
          attemptHumanActions()
          advance(BOT_PLAYBACK_DELAYS_MS[mode])
        }
      }

      expect(turnBanner()).toHaveTextContent('You')
      expect(drawPileButton()).toBeEnabled()
    },
  )

  it.each(['normal', 'fast', 'immediate'] as const)(
    'never renders hidden bot-hand, stock or pozzetto identities in %s mode',
    (mode) => {
      const expected = stepTrace(dealInitialState(deck, { startingPlayerId: 'player-2' }))
      const everPublic = new Set<string>()
      const expectHiddenNotRendered = (state: GameState) => {
        for (const label of publicCardLabels(state)) everPublic.add(label)
        for (const hidden of [...botHandCards(state), ...state.drawPile, ...state.pozzetti.flat()]) {
          if (!everPublic.has(cardLabel(hidden))) expectNotRendered(hidden)
        }
      }
      render(<GameTable initialMatch={matchAwaiting(2)} createGame={rotatingRound} />)
      fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))
      selectMode(mode)

      if (mode === 'immediate') {
        for (const step of expected.steps) for (const label of publicCardLabels(step.state)) everPublic.add(label)
        fireEvent.click(completeNowButton()!)
      } else {
        for (const step of expected.steps) {
          advance(BOT_PLAYBACK_DELAYS_MS[mode])
          expectHiddenNotRendered(step.state)
        }
      }

      flushFocusSelectionChange()
      expect(vi.getTimerCount()).toBe(0)
      expectHiddenNotRendered(expected.state)
      for (const event of expected.events) {
        if (event.type === 'draw-stock') expect(Object.keys(event)).toEqual(['type', 'playerId'])
      }
      expectTimelineMatches(expected.events)
    },
  )
})
