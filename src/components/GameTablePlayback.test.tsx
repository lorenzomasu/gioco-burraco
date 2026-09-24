import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INITIAL_BOT_CHAIN_PROGRESS,
  playBotsUntilHumanTurnWithTrace,
  playNextBotChainStep,
  type BotChainProgress,
} from '../game/bot'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import { discardCard } from '../game/engine/turn'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { GameState, InProgressGameState, PlayerId } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { BOT_STEP_DELAY_MS, GameTable } from './GameTable'

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
      for (const extend of screen.queryAllByRole('button', { name: 'Aggiungi alla calata' })) {
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

  it('clears the previous match and step-plays a pending bot after Nuova partita', () => {
    const createGame = vi.fn(() => pendingBotState())
    render(<GameTable initialState={chainState()} createGame={createGame} />)
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    advanceOneStep()
    advanceOneStep()
    expect(timelineItems()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))

    expect(timelineItems()).toHaveLength(0)
    expect(turnBanner()).toHaveTextContent('North')
    expect(screen.getByText('Pesca')).toBeInTheDocument()

    advanceOneStep()

    expect(timelineTypes()).toEqual(['draw-stock'])
  })

  it('prevents a stale pending playback callback from mutating a fresh match', () => {
    const freshDrawPile = [
      card('two', 'spades', 2), card('three', 'spades', 2), card('four', 'spades', 2),
      card('five', 'spades', 2), card('six', 'spades', 2), card('seven', 'spades', 2),
      card('eight', 'spades', 2), card('nine', 'spades', 2),
    ]
    const createGame = vi.fn(() => pendingBotState(freshDrawPile))
    render(<GameTable initialState={chainState()} createGame={createGame} />)
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    // The old session's first bot step is just about to fire when the match is reset.
    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS - 1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Nuova partita' }))
    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(timelineItems()).toHaveLength(0)
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 8 carte rimaste')
    expect(screen.getByText('Pesca')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(BOT_STEP_DELAY_MS - 2)
    })
    expect(timelineItems()).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(timelineTypes()).toEqual(['draw-stock'])
    expect(drawPileButton()).toHaveAccessibleName('Pesca dal tallone, 7 carte rimaste')
    expect(seatCardCount('North')).toHaveAccessibleName('5 carte in mano')
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
