import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { playNextBotChainStep } from '../game/bot'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { CompletedGameState, InProgressGameState } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { BOT_PLAYBACK_DELAYS_MS, BOT_STEP_DELAY_MS, GameTable, MOTION_FLIGHT_MS } from './GameTable'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) => candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber)!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const drawPhaseState = (): InProgressGameState => ({
  ...dealInitialState(deck),
  round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
})

const actionState = (hand: readonly Card[], teamOneMelds: readonly ValidatedMeld[] = []): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, hand } : player),
    teams: initial.teams.map((team) => team.id === 'team-1' ? { ...team, melds: teamOneMelds } : team),
    round: {
      status: 'in-progress',
      turn: { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

/** A short deterministic bot chain: North draws from the stock first. */
const automaticSequenceState = (): InProgressGameState => {
  const initial = dealInitialState(deck)
  const playerHands = new Map([
    ['player-1', [card('king', 'hearts'), card('ace', 'spades')]],
    ['player-2', [card('three', 'clubs'), card('five', 'hearts')]],
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
      turn: { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

const botPozzettoState = (): InProgressGameState => {
  const base = automaticSequenceState()
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

type FakeAnimation = Readonly<{
  element: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancel: Mock
}> & { onfinish: (() => void) | null }

let animations: FakeAnimation[] = []
let reducedMotion = false

/** Fixed layout per public anchor; every rectangle is 40×60 so centre deltas equal left/top deltas. */
const anchorPositions: Readonly<Record<string, readonly [number, number]>> = {
  stock: [100, 100],
  pozzetti: [200, 100],
  discard: [300, 100],
  hand: [200, 600],
  'seat-player-2': [600, 300],
  'seat-player-3': [300, 0],
  'seat-player-4': [0, 300],
  'meld-team-1-0': [400, 400],
  'meld-team-1-1': [500, 400],
  'meld-team-2-0': [400, 200],
}

const rect = (left: number, top: number) =>
  ({ left, top, width: 40, height: 60, right: left + 40, bottom: top + 60, x: left, y: top, toJSON: () => ({}) })

beforeEach(() => {
  vi.useFakeTimers()
  animations = []
  reducedMotion = false
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation: FakeAnimation = { element: this, keyframes, options, cancel: vi.fn(), onfinish: null }
      animations.push(animation)
      return animation
    },
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: reducedMotion && query.includes('reduce') }),
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const handIndex = [...document.querySelectorAll('[data-hand-card]')].indexOf(this)
    if (handIndex >= 0) return rect(handIndex * 50, 620)
    if (this.classList.contains('discard-spread__item--top')) return rect(320, 110)
    const position = anchorPositions[this.dataset.motionAnchor ?? '']
    return position ? rect(...position) : rect(0, 0)
  })
})

afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate
  delete (window as { matchMedia?: unknown }).matchMedia
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
})

const layer = () => document.querySelector<HTMLElement>('.motion-layer')!
const proxies = () => [...document.querySelectorAll<HTMLElement>('.motion-proxy')]
const flights = () => proxies().map((proxy) => proxy.dataset.motionFlight)
/** The 44×62 proxy is centred on the 40×60 source rectangle. */
const sourceLeft = (proxy: HTMLElement) => Number.parseFloat(proxy.style.left) + 2
const sourceTop = (proxy: HTMLElement) => Number.parseFloat(proxy.style.top) + 1
const lastTranslate = (animation: FakeAnimation) => animation.keyframes.at(-1)!.transform
const select = (target: Card) => fireEvent.click(screen.getByRole('button', { name: cardLabel(target) }))
const advanceOneStep = () => act(() => {
  vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
})

describe('GameTable M30 motion layer', () => {
  it('renders a decorative, empty, non-focusable layer and no flight on a fresh table', () => {
    render(<GameTable initialState={drawPhaseState()} />)
    expect(layer()).toHaveAttribute('aria-hidden', 'true')
    expect(layer()).toBeEmptyDOMElement()
    expect(animations).toEqual([])
  })

  it('flies a face-down card from the stock to the newly drawn card after the draw is committed', () => {
    const state = drawPhaseState()
    const drawn = state.drawPile[0]!
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))

    // The committed hand is already rendered; motion only decorates it.
    expect(screen.getByText('12 carte')).toBeInTheDocument()
    expect(flights()).toEqual(['stock>received-card'])
    const [proxy] = proxies()
    expect(proxy).toHaveClass('motion-proxy--back')
    expect(layer()).toContainElement(proxy!)
    expect([sourceLeft(proxy!), sourceTop(proxy!)]).toEqual([100, 100])
    const drawnIndex = [...document.querySelectorAll('[data-hand-card]')]
      .indexOf(screen.getByRole('button', { name: cardLabel(drawn) }))
    expect(lastTranslate(animations[0]!)).toContain(`translate(${drawnIndex * 50 - 100}px, 520px)`)
    expect(animations[0]!.options.duration).toBe(MOTION_FLIGHT_MS)
    expect(layer().innerHTML).not.toContain(drawn.id)
    expect(layer().querySelector('button, [tabindex], [aria-label]')).toBeNull()
  })

  it('flies the whole collected pile as one counted stack to the hand', () => {
    const state = drawPhaseState()
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: /^Raccogli tutto il monte degli scarti/ }))

    expect(flights()).toEqual(['discard>hand'])
    const [proxy] = proxies()
    // The spread is gone after collection, so the pile surface is the source.
    expect(sourceLeft(proxy!)).toBe(300)
    if (state.discardPile.length > 1) {
      expect(proxy).toHaveClass('motion-proxy--stack')
      expect(proxy).toHaveTextContent(String(state.discardPile.length))
    }
  })

  it('flies a discarded card from its pre-commit hand position to the new top card', () => {
    const state = automaticSequenceState()
    render(<GameTable initialState={state} />)
    // King of hearts sorts before the ace in the display order: it is the second hand card.
    const kingIndex = [...document.querySelectorAll('[data-hand-card]')]
      .indexOf(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    select(card('king', 'hearts'))

    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(flights()).toEqual(['hand-selection>discard'])
    expect(sourceLeft(proxies()[0]!)).toBe(kingIndex * 50)
    expect(lastTranslate(animations[0]!)).toContain(`translate(${320 - kingIndex * 50}px, -510px)`)
  })

  it('lands a new meld on the created meld and an extension on exactly the extended meld', () => {
    const existing = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const nines = [card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts')]
    const extension = card('seven', 'spades')
    render(<GameTable initialState={actionState([...nines, extension, card('king', 'spades')], [existing])} />)

    for (const nine of nines) select(nine)
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(flights()).toEqual(['hand-selection>meld'])
    expect(proxies()[0]).toHaveTextContent('3')
    const createdStart = sourceLeft(proxies()[0]!)
    expect(lastTranslate(animations[0]!)).toContain(`translate(${500 - createdStart}px`)

    select(extension)
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    // The earlier flight is replaced, never queued.
    expect(animations[0]!.cancel).toHaveBeenCalled()
    expect(flights()).toEqual(['hand-selection>meld'])
    const extendStart = sourceLeft(proxies()[0]!)
    expect(lastTranslate(animations[1]!)).toContain(`translate(${400 - extendStart}px`)
  })

  it('creates no flight for a rejected engine action', () => {
    const invalid = [card('three', 'clubs'), card('five', 'hearts'), card('seven', 'spades')]
    render(<GameTable initialState={actionState([...invalid, card('king', 'diamonds')])} />)
    for (const selected of invalid) select(selected)

    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(animations).toEqual([])
    expect(proxies()).toEqual([])
  })

  it('choreographs bot steps from the acting seat without any hidden identity', () => {
    const state = automaticSequenceState()
    render(<GameTable initialState={state} />)
    select(card('king', 'hearts'))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    advanceOneStep()
    expect(flights()).toEqual(['stock>seat'])
    expect(proxies()[0]).toHaveClass('motion-proxy--back')
    expect(lastTranslate(animations.at(-1)!)).toContain('translate(500px, 200px)')
    const hidden = [...state.drawPile, ...state.players.filter(({ id }) => id !== 'player-1').flatMap(({ hand }) => hand)]
    expect(hidden.filter((hiddenCard) => layer().innerHTML.includes(hiddenCard.id)
      || layer().innerHTML.includes(cardLabel(hiddenCard)))).toEqual([])

    advanceOneStep()
    expect(flights()).toEqual(['seat>discard'])
    expect(proxies()[0]).toHaveClass('motion-proxy--blank')
  })

  it('keeps bot flights inside the fast playback cadence', () => {
    render(<GameTable initialState={automaticSequenceState()} playbackSpeed="fast" />)
    select(card('king', 'hearts'))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    act(() => {
      vi.advanceTimersByTime(BOT_PLAYBACK_DELAYS_MS.fast)
    })

    expect(flights()).toEqual(['stock>seat'])
    expect(animations.at(-1)!.options.duration).toBeLessThan(BOT_PLAYBACK_DELAYS_MS.fast)
    // The next step fires on the unchanged cadence and replaces the unfinished flight.
    const first = animations.at(-1)!
    act(() => {
      vi.advanceTimersByTime(BOT_PLAYBACK_DELAYS_MS.fast)
    })
    expect(first.cancel).toHaveBeenCalled()
    expect(flights()).toEqual(['seat>discard'])
  })

  it('flies a bot meld to its exact public meld and the pozzetto face down to the seat', () => {
    const state = botPozzettoState()
    expect(playNextBotChainStep(state, 'player-1')!.events.map(({ type }) => type)).toEqual(['play-meld', 'take-pozzetto'])
    render(<GameTable initialState={state} />)

    advanceOneStep()

    expect(flights()).toEqual(['seat>meld', 'pozzetti>seat'])
    const pozzetto = proxies()[1]!
    expect(pozzetto).toHaveClass('motion-proxy--back')
    expect(pozzetto).toBeEmptyDOMElement()
    expect(lastTranslate(animations[0]!)).toContain('translate(-200px, -100px)')
    const unrevealed = state.pozzetti.flat()
    expect(unrevealed.filter((hidden) => layer().innerHTML.includes(hidden.id))).toEqual([])
  })

  it('emphasizes exactly the meld that newly reaches a Burraco', () => {
    const six = (['three', 'four', 'five', 'six', 'seven', 'eight'] as const).map((rank) => card(rank, 'clubs'))
    const other = validatedMeld([card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts')])
    const nine = card('nine', 'clubs')
    render(<GameTable initialState={actionState([nine, card('king', 'spades')], [validatedMeld(six), other])} />)
    select(nine)

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    const burraco = screen.getByRole('article', { name: 'Calata 1 squadra 1' })
    expect(burraco).toHaveAttribute('data-burraco-emphasis')
    expect(burraco.querySelector('.burraco-badge')).toHaveAttribute('data-feedback', 'burraco')
    expect(screen.getByRole('article', { name: 'Calata 2 squadra 1' })).not.toHaveAttribute('data-burraco-emphasis')
  })

  it('cancels pending flights on Completa subito and lands directly on the final state', () => {
    render(<GameTable initialState={automaticSequenceState()} />)
    select(card('king', 'hearts'))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    advanceOneStep()
    const running = animations.at(-1)!
    const count = animations.length

    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))

    expect(running.cancel).toHaveBeenCalled()
    expect(animations).toHaveLength(count)
    expect(proxies()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discards flights on unmount and never carries one into a new smazzata', () => {
    const { unmount } = render(<GameTable initialState={drawPhaseState()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    const running = animations[0]!
    unmount()
    expect(running.cancel).toHaveBeenCalled()
    expect(document.querySelector('.motion-proxy')).toBeNull()

    render(<GameTable initialState={emptyCompletedRound()} createGame={() => drawPhaseState()} />)
    expect(document.querySelector('.motion-layer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))
    expect(layer()).toBeEmptyDOMElement()
    expect(animations).toHaveLength(1)
  })

  it('skips every flight under reduced motion while the committed state and cues stay identical', () => {
    reducedMotion = true
    render(<GameTable initialState={drawPhaseState()} />)

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))

    expect(screen.getByText('12 carte')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pesca dal tallone/ })).toHaveAttribute('data-feedback', 'draw')
    expect(animations).toEqual([])
    expect(layer()).toBeEmptyDOMElement()
  })

  it('degrades to the static table when the Web Animations API is unavailable or fails', () => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate
    const { unmount } = render(<GameTable initialState={drawPhaseState()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(screen.getByText('12 carte')).toBeInTheDocument()
    expect(proxies()).toEqual([])
    unmount()

    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error('animation failure')
      },
    })
    render(<GameTable initialState={drawPhaseState()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(screen.getByText('12 carte')).toBeInTheDocument()
    expect(proxies()).toEqual([])
  })

  it('removes a proxy once its flight finishes', () => {
    render(<GameTable initialState={drawPhaseState()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    act(() => animations[0]!.onfinish?.())
    expect(proxies()).toEqual([])
  })
})
