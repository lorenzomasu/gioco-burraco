import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundContext } from '../audio/SoundContext'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import { takeDiscardPile } from '../game/engine/turn'
import type { MatchState } from '../game/match'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { InProgressGameState } from '../game/state/types'
import { cardLabel, sortCardsForDisplay } from './cardPresentation'
import {
  GameTable,
  MULTI_CARD_DISCARD_MESSAGE,
  OUTSIDE_DROP_MESSAGE,
  REORDER_ONLY_DROP_MESSAGE,
} from './GameTable'
import { TOUCH_DRAG_DELAY_MS } from './useHandDrag'

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

const withHumanTurn = (
  hand: readonly Card[],
  phase: 'mustDraw' | 'action',
  options: Readonly<{
    teamOneMelds?: readonly ValidatedMeld[]
    teamTwoMelds?: readonly ValidatedMeld[]
    discardPile?: readonly Card[]
    teamOneTookPozzetto?: boolean
  }> = {},
): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, hand } : player),
    teams: initial.teams.map((team) => team.id === 'team-1'
      ? { ...team, melds: options.teamOneMelds ?? [], hasTakenPozzetto: options.teamOneTookPozzetto ?? false }
      : { ...team, melds: options.teamTwoMelds ?? [] }),
    discardPile: options.discardPile ?? initial.discardPile,
    round: {
      status: 'in-progress',
      turn: phase === 'action'
        ? { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } }
        : { currentPlayerId: 'player-1', phase: 'mustDraw' },
    },
  }
}

const matchOf = (round: InProgressGameState): MatchState => ({
  status: 'in-progress',
  currentRoundNumber: 1,
  currentRound: round,
  roundResults: [],
})

/** A deliberately unsorted hand: engine order differs from the display sort. */
const unsortedHand = [
  card('king', 'spades'), card('three', 'clubs'), card('seven', 'hearts'),
  card('five', 'clubs'), card('nine', 'diamonds'),
]

const handRegion = () => screen.getByLabelText('Carte di You')
const handButtons = () => within(handRegion()).getAllByRole('button')
const handLabels = () => handButtons().map((button) => button.getAttribute('aria-label'))
const handButton = (target: Card) => within(handRegion()).getByRole('button', { name: cardLabel(target) })
const labels = (cards: readonly Card[]) => cards.map(cardLabel)
const sortedLabels = (cards: readonly Card[]) => labels(sortCardsForDisplay(cards))

/** jsdom has no PointerEvent; this carries the fields the drag logic reads. */
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, { bubbles: true, cancelable: true, ...init })
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
    this.isPrimary = init.isPrimary ?? true
  }
}

/** The element the (mocked) browser hit test reports under the pointer. */
let elementUnderPointer: Element | null = null

/**
 * Hand cards are laid out 100 px apart (80 px wide) for the insertion hit test, so the
 * boundary before card `k` is reached at x = k * 100 - 10.
 */
const boundaryX = (boundary: number) => boundary * 100 - 10

const pointer = (target: EventTarget, type: string, x: number, y: number, pointerType = 'mouse') => {
  fireEvent(target as Element, new TestPointerEvent(type, { clientX: x, clientY: y, pointerType, button: 0 }))
}

/** Presses `source`, drags past the threshold over `over`, and optionally releases there. */
const startDrag = (source: HTMLElement, over: Element | null, x = 300) => {
  pointer(source, 'pointerdown', 0, 200)
  elementUnderPointer = over
  pointer(source, 'pointermove', x, 150)
}

const release = (source: HTMLElement, x = 300) => {
  pointer(source, 'pointerup', x, 150)
  // The browser's click that follows a real drag must not toggle the selection.
  fireEvent.click(source, { detail: 1 })
}

const dragTo = (source: HTMLElement, over: Element | null, x = 300) => {
  startDrag(source, over, x)
  release(source, x)
}

const dragToBoundary = (source: HTMLElement, boundary: number) => dragTo(source, handRegion(), boundaryX(boundary))

const discardGroup = () => screen.getByRole('group', { name: 'Monte degli scarti' })
const ownMeldArea = () => screen.getByRole('region', { name: 'Calate squadra 1' })
const newMeldTarget = () => within(ownMeldArea()).getByRole('group', { name: 'Nuova calata' })
const meldArticle = (team: 1 | 2, index: number) => screen.getByRole('article', { name: `Calata ${index} squadra ${team}` })
const dragProxy = () => document.querySelector('.drag-proxy')

beforeEach(() => {
  vi.useFakeTimers()
  elementUnderPointer = null
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => elementUnderPointer,
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = [...document.querySelectorAll('[data-hand-card]')].indexOf(this)
    const left = Math.max(index, 0) * 100
    return { left, right: left + 80, width: 80, top: 0, bottom: 100, height: 100, x: left, y: 0, toJSON: () => ({}) }
  })
})

afterEach(() => {
  // Removing the own property restores jsdom's (absent) hit test.
  delete (document as { elementFromPoint?: unknown }).elementFromPoint
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('GameTable hand presentation order (M29)', () => {
  it('seeds a fresh hand from the existing deterministic display sort', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    expect(handLabels()).toEqual(sortedLabels(unsortedHand))
  })

  it('reorders one dragged card in the rendered hand only, without a commit or save', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    expect(onMatchChange).toHaveBeenCalledOnce()

    dragToBoundary(handButton(sorted[0]!), 3)

    expect(handLabels()).toEqual(labels([sorted[1]!, sorted[2]!, sorted[0]!, sorted[3]!, sorted[4]!]))
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The trailing click of a real drag never toggles the selection.
    expect(handButtons().every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByText('5 carte')).toBeInTheDocument()
  })

  it('moves a selected set as one stable group and keeps it selected', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    // Selected in reverse visible order: the payload still follows the visible order.
    fireEvent.click(handButton(sorted[3]!))
    fireEvent.click(handButton(sorted[1]!))

    dragToBoundary(handButton(sorted[3]!), 0)

    expect(handLabels()).toEqual(labels([sorted[1]!, sorted[3]!, sorted[0]!, sorted[2]!, sorted[4]!]))
    expect(handButton(sorted[1]!)).toHaveAttribute('aria-pressed', 'true')
    expect(handButton(sorted[3]!)).toHaveAttribute('aria-pressed', 'true')
    expect(onMatchChange).toHaveBeenCalledOnce()
  })

  it('restores the deterministic sort with Ordina mano, keeping the selection and committing nothing', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    dragToBoundary(handButton(sorted[0]!), 5)
    fireEvent.click(handButton(sorted[2]!))
    expect(handLabels()).not.toEqual(sortedLabels(unsortedHand))

    fireEvent.click(screen.getByRole('button', { name: 'Ordina mano' }))

    expect(handLabels()).toEqual(sortedLabels(unsortedHand))
    expect(handButton(sorted[2]!)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1', { selector: '.selection-summary strong' })).toBeInTheDocument()
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-feedback]')).toBeNull()
  })

  it('keeps the manual order across selection and unrelated presentation rerenders', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    dragToBoundary(handButton(sorted[4]!), 0)
    const manual = handLabels()

    fireEvent.click(handButton(sorted[1]!))
    fireEvent.click(handButton(sorted[1]!))
    fireEvent.click(screen.getByRole('button', { name: /^Cronologia bot/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Veloce' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    // The last click raised an engine error (no selection) and still kept the order.
    expect(handLabels()).toEqual(manual)
  })

  it('appends a drawn card after the manually ordered survivors', () => {
    const state = withHumanTurn(unsortedHand, 'mustDraw')
    const drawn = state.drawPile[0]!
    render(<GameTable initialState={state} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    // Reordering is available in the draw phase too.
    dragToBoundary(handButton(sorted[0]!), 5)
    const manual = handLabels()

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))

    expect(handLabels()).toEqual([...manual, cardLabel(drawn)])
  })

  it('appends every collected discard in engine-hand order and keeps the survivor order', () => {
    const pile = [card('queen', 'hearts'), card('two', 'clubs'), card('ace', 'diamonds')]
    const state = withHumanTurn(unsortedHand, 'mustDraw', { discardPile: pile })
    render(<GameTable initialState={state} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    dragToBoundary(handButton(sorted[3]!), 1)
    const manual = handLabels()
    const engineHand = takeDiscardPile(state, 'player-1').players[0]!.hand
    const added = engineHand.filter((held) => !unsortedHand.includes(held))

    fireEvent.click(screen.getByRole('button', { name: /^Raccogli tutto il monte degli scarti/ }))

    expect(handLabels()).toEqual([...manual, ...labels(added)])
  })

  it('removes melded, extended and discarded cards without scrambling the survivors', () => {
    const hand = [
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
      card('nine', 'spades'), card('king', 'spades'), card('three', 'diamonds'), card('four', 'hearts'),
    ]
    const nines = validatedMeld([card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts')])
    render(<GameTable initialState={withHumanTurn(hand, 'action', { teamOneMelds: [nines] })} />)
    // Put the sevens at the end, the king first.
    dragToBoundary(handButton(card('king', 'spades')), 0)
    for (const seven of ['clubs', 'diamonds', 'hearts'] as const) fireEvent.click(handButton(card('seven', seven)))
    dragToBoundary(handButton(card('seven', 'clubs')), 7)
    const beforeMeld = handLabels()

    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
    const afterMeld = beforeMeld.filter((label) => !label!.startsWith('Sette'))
    expect(handLabels()).toEqual(afterMeld)

    fireEvent.click(handButton(card('nine', 'spades')))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))
    const afterExtension = afterMeld.filter((label) => label !== cardLabel(card('nine', 'spades')))
    expect(handLabels()).toEqual(afterExtension)

    fireEvent.click(handButton(card('three', 'diamonds')))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    // The hand is no longer playable during the bot turn, but it keeps the same order.
    const shown = within(handRegion()).getAllByRole('img').map((image) => image.getAttribute('aria-label'))
    expect(shown).toEqual(afterExtension.filter((label) => label !== cardLabel(card('three', 'diamonds'))))
  })

  it('reseeds the order for a new round and never carries it into a remounted session', () => {
    const tenOfClubs = card('ten', 'clubs')
    const kingOfSpades = card('king', 'spades')
    const burraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const closing = withHumanTurn([tenOfClubs, kingOfSpades], 'action', {
      teamOneMelds: [burraco],
      teamOneTookPozzetto: true,
    })
    const nextHand = [kingOfSpades, card('three', 'diamonds'), tenOfClubs]
    const createGame = vi.fn(() => withHumanTurn(nextHand, 'action'))
    const onMatchChange = vi.fn()
    const { unmount } = render(<GameTable initialState={closing} createGame={createGame} onMatchChange={onMatchChange} />)

    // Manual order K♠, 10♣ in round 1; then close by extending and discarding.
    dragToBoundary(handButton(kingOfSpades), 0)
    expect(handLabels()).toEqual(labels([kingOfSpades, tenOfClubs]))
    fireEvent.click(handButton(tenOfClubs))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))
    fireEvent.click(handButton(kingOfSpades))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expect(handLabels()).toEqual(sortedLabels(nextHand))

    // A manual order in round 2 is never part of the committed match that the shell saves.
    dragToBoundary(handButton(kingOfSpades), 0)
    expect(handLabels()[0]).toBe(cardLabel(kingOfSpades))
    const saved = onMatchChange.mock.lastCall![0] as MatchState
    expect(JSON.stringify(saved)).not.toMatch(/order|selected|drag/i)
    unmount()

    render(<GameTable initialMatch={saved} createGame={createGame} />)
    expect(handLabels()).toEqual(sortedLabels(nextHand))
  })
})

describe('GameTable direct manipulation (M29)', () => {
  it('keeps a below-threshold press as an ordinary click selection', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    const target = handButton(unsortedHand[0]!)

    pointer(target, 'pointerdown', 10, 10)
    elementUnderPointer = handRegion()
    pointer(target, 'pointermove', 13, 12)
    pointer(target, 'pointerup', 13, 12)
    fireEvent.click(target, { detail: 1 })

    expect(target).toHaveAttribute('aria-pressed', 'true')
    expect(dragProxy()).toBeNull()
    expect(handLabels()).toEqual(sortedLabels(unsortedHand))
  })

  it('drags the full selection from a selected card and only the card itself otherwise', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    const [first, second, third] = sortCardsForDisplay(unsortedHand)
    fireEvent.click(handButton(first!))
    fireEvent.click(handButton(third!))

    startDrag(handButton(third!), newMeldTarget())
    expect(dragProxy()).toHaveTextContent('2 carte')
    expect(document.querySelectorAll('.playing-card--dragging')).toHaveLength(2)
    expect(newMeldTarget()).toHaveAttribute('data-drop-state', 'active')
    pointer(handButton(third!), 'pointercancel', 300, 150)
    expect(dragProxy()).toBeNull()

    startDrag(handButton(second!), discardGroup())
    expect(dragProxy()).toHaveTextContent('1 carta')
    // The proxy is a count only: it never repeats a card identity.
    expect(dragProxy()!.textContent).not.toMatch(/di |Jolly/)
    expect(document.querySelectorAll('.playing-card--dragging')).toHaveLength(1)
    expect(handButton(second!)).toHaveClass('playing-card--dragging')
    pointer(handButton(second!), 'pointercancel', 300, 150)
  })

  it('cancels cleanly on pointer cancel, lost capture and session replacement, committing nothing', () => {
    const onMatchChange = vi.fn()
    const state = withHumanTurn(unsortedHand, 'action')
    render(<GameTable initialState={state} onMatchChange={onMatchChange} />)
    const source = handButton(unsortedHand[0]!)

    startDrag(source, discardGroup())
    pointer(source, 'pointercancel', 300, 150)
    pointer(source, 'pointerup', 300, 150)
    expect(dragProxy()).toBeNull()

    startDrag(source, discardGroup())
    // Handing an implicit touch capture over from a child to the card is not a loss.
    fireEvent(source.firstElementChild!, new Event('lostpointercapture', { bubbles: true }))
    expect(dragProxy()).not.toBeNull()
    fireEvent(source, new Event('lostpointercapture'))
    pointer(source, 'pointerup', 300, 150)
    expect(dragProxy()).toBeNull()
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('5 carte')).toBeInTheDocument()

    // A keyboard commit replaces the session mid-drag: the gesture is dropped, not replayed.
    fireEvent.click(handButton(unsortedHand[1]!))
    startDrag(handButton(unsortedHand[0]!), newMeldTarget())
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    expect(onMatchChange).toHaveBeenCalledTimes(2)
    expect(dragProxy()).toBeNull()
    pointer(window, 'pointerup', 300, 150)
    expect(onMatchChange).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('discards one dropped card through the engine with the same cue as «Scarta e passa»', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const discarded = unsortedHand[2]!
    expect(discardGroup()).toHaveAttribute('data-drop-target', 'discard')

    dragTo(handButton(discarded), discardGroup())

    expect(onMatchChange).toHaveBeenCalledTimes(2)
    const committed = onMatchChange.mock.lastCall![0] as MatchState
    expect(committed.currentRound.discardPile.at(-1)).toEqual(discarded)
    expect(within(discardGroup()).getByText('In cima').closest('li')).toContainElement(
      within(discardGroup()).getByRole('img', { name: cardLabel(discarded) }),
    )
    expect(discardGroup()).toHaveAttribute('data-feedback', 'discard')
    expect(screen.getByText('North')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a multi-card discard drop without calling the engine', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    fireEvent.click(handButton(sorted[0]!))
    fireEvent.click(handButton(sorted[1]!))
    dragToBoundary(handButton(sorted[1]!), 5)
    const manual = handLabels()

    dragTo(handButton(sorted[0]!), discardGroup())

    expect(screen.getByRole('alert')).toHaveTextContent(MULTI_CARD_DISCARD_MESSAGE)
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(handLabels()).toEqual(manual)
    expect(handButton(sorted[0]!)).toHaveAttribute('aria-pressed', 'true')
    expect(handButton(sorted[1]!)).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-feedback]')).toBeNull()
  })

  it('opens a new meld from the dropped payload through the engine', () => {
    const sevens = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const onMatchChange = vi.fn()
    render(
      <GameTable
        initialState={withHumanTurn([...sevens, card('king', 'spades')], 'action')}
        onMatchChange={onMatchChange}
      />,
    )
    for (const seven of sevens) fireEvent.click(handButton(seven))

    dragTo(handButton(sevens[1]!), newMeldTarget())

    const committed = onMatchChange.mock.lastCall![0] as MatchState
    expect(committed.currentRound.teams[0]!.melds[0]!.cards.map(({ card: placed }) => placed.id).sort())
      .toEqual(sevens.map(({ id }) => id).sort())
    expect(meldArticle(1, 1)).toHaveAttribute('data-feedback', 'meld-created')
    expect(handLabels()).toEqual(labels([card('king', 'spades')]))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the translated engine error for an invalid direct meld and keeps state, selection and order', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    dragToBoundary(handButton(sorted[4]!), 0)
    fireEvent.click(handButton(sorted[0]!))
    fireEvent.click(handButton(sorted[4]!))
    const manual = handLabels()

    dragTo(handButton(sorted[0]!), newMeldTarget())

    expect(screen.getByRole('alert')).toHaveTextContent('Le carte selezionate non formano una calata valida.')
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(handLabels()).toEqual(manual)
    expect(handButton(sorted[0]!)).toHaveAttribute('aria-pressed', 'true')
    expect(handButton(sorted[4]!)).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-feedback]')).toBeNull()
  })

  it('extends exactly the own-team meld that received the drop', () => {
    const sevens = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const nines = validatedMeld([card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts')])
    const nineOfSpades = card('nine', 'spades')
    const onMatchChange = vi.fn()
    render(
      <GameTable
        initialState={withHumanTurn([nineOfSpades, card('king', 'spades')], 'action', { teamOneMelds: [sevens, nines] })}
        onMatchChange={onMatchChange}
      />,
    )
    expect(meldArticle(1, 2)).toHaveAttribute('data-meld-index', '1')

    startDrag(handButton(nineOfSpades), meldArticle(1, 2))
    expect(meldArticle(1, 2)).toHaveAttribute('data-drop-state', 'active')
    expect(meldArticle(1, 1)).toHaveAttribute('data-drop-state', 'available')
    release(handButton(nineOfSpades))

    const melds = (onMatchChange.mock.lastCall![0] as MatchState).currentRound.teams[0]!.melds
    expect(melds[0]!.cards).toHaveLength(3)
    expect(melds[1]!.cards.map(({ card: placed }) => placed.id)).toContain(nineOfSpades.id)
    expect(meldArticle(1, 2)).toHaveAttribute('data-feedback', 'meld-extended')
    // The accessible fallback buttons stay available.
    expect(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' })).toBeInTheDocument()
  })

  it('extends the playtest sequence Jolly=4♦ … 8♦ with a dropped 10♦ and repositions the jolly', () => {
    const jolly = deck.find((candidate) => candidate.rank === 'joker')!
    const sequence = validatedMeld([
      jolly, card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
      card('eight', 'diamonds'),
    ])
    const ten = card('ten', 'diamonds')
    const onMatchChange = vi.fn()
    render(
      <GameTable
        initialState={withHumanTurn([ten, card('king', 'spades')], 'action', { teamOneMelds: [sequence] })}
        onMatchChange={onMatchChange}
      />,
    )
    expect(screen.getByText('Matta → 4')).toBeInTheDocument()

    dragTo(handButton(ten), meldArticle(1, 1))

    expect(screen.queryByText('Mossa non valida')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const meld = (onMatchChange.mock.lastCall![0] as MatchState).currentRound.teams[0]!.melds[0]!
    expect(meld.cards.map(({ card: placed }) => placed.id)).toContain(ten.id)
    expect(meld.activeWildcard).toEqual({ card: jolly, role: 'wildcard', representedRank: 'nine' })
    expect(meldArticle(1, 1)).toHaveAttribute('data-feedback', 'meld-extended')
    expect(screen.getByText('Matta → 9')).toBeInTheDocument()
  })

  it('shows the engine error for an invalid direct extension', () => {
    const sevens = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const onMatchChange = vi.fn()
    const king = card('king', 'spades')
    render(
      <GameTable
        initialState={withHumanTurn([king, card('three', 'hearts')], 'action', { teamOneMelds: [sevens] })}
        onMatchChange={onMatchChange}
      />,
    )

    dragTo(handButton(king), meldArticle(1, 1))

    expect(screen.getByRole('alert')).toHaveTextContent('Le carte selezionate non formano una calata valida.')
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(meldArticle(1, 1)).not.toHaveAttribute('data-feedback')
  })

  it('never turns opponent melds into destinations', () => {
    const opponentMeld = validatedMeld([card('eight', 'clubs'), card('eight', 'diamonds'), card('eight', 'hearts')])
    const eight = card('eight', 'spades')
    const onMatchChange = vi.fn()
    render(
      <GameTable
        initialState={withHumanTurn([eight, card('king', 'spades')], 'action', { teamTwoMelds: [opponentMeld] })}
        onMatchChange={onMatchChange}
      />,
    )
    const opponentArea = screen.getByRole('region', { name: 'Calate squadra 2' })
    expect(within(opponentArea).queryByRole('group', { name: 'Nuova calata' })).not.toBeInTheDocument()

    startDrag(handButton(eight), meldArticle(2, 1))
    expect(opponentArea.querySelector('[data-drop-target], [data-drop-state]')).toBeNull()
    release(handButton(eight))

    expect(screen.getByRole('alert')).toHaveTextContent(OUTSIDE_DROP_MESSAGE)
    expect(onMatchChange).toHaveBeenCalledOnce()
  })

  it('explains an outside drop immediately and commits no cue', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)

    dragTo(handButton(unsortedHand[0]!), null)

    expect(screen.getByRole('alert')).toHaveTextContent(OUTSIDE_DROP_MESSAGE)
    expect(onMatchChange).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-feedback]')).toBeNull()
    expect(handLabels()).toEqual(sortedLabels(unsortedHand))
  })

  it('offers no game destination outside the action phase', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'mustDraw')} onMatchChange={onMatchChange} />)
    expect(discardGroup()).not.toHaveAttribute('data-drop-target')
    expect(newMeldTarget()).not.toHaveAttribute('data-drop-target')
    expect(newMeldTarget()).toHaveTextContent('Disponibile nella tua fase di gioco.')

    dragTo(handButton(unsortedHand[0]!), discardGroup())

    expect(screen.getByRole('alert')).toHaveTextContent(REORDER_ONLY_DROP_MESSAGE)
    expect(onMatchChange).toHaveBeenCalledOnce()
  })

  it('offers no drag while bots play', () => {
    const state = withHumanTurn(unsortedHand, 'action')
    render(
      <GameTable
        initialState={{ ...state, round: { ...state.round, turn: { ...state.round.turn, currentPlayerId: 'player-2' } } }}
      />,
    )
    expect(within(handRegion()).queryAllByRole('button')).toHaveLength(0)
    expect(handRegion()).not.toHaveAttribute('data-drop-target')
    expect(screen.getByRole('button', { name: 'Ordina mano' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sposta a sinistra' })).toBeDisabled()
  })

  it('lets touch scroll unless the press rests for the drag delay first', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    const source = handButton(sorted[0]!)

    // Moving right away is a scroll: no drag starts and nothing is prevented.
    pointer(source, 'pointerdown', 10, 200, 'touch')
    elementUnderPointer = handRegion()
    pointer(source, 'pointermove', 60, 200, 'touch')
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS)
    })
    expect(source).not.toHaveClass('playing-card--armed')
    pointer(source, 'pointermove', boundaryX(3), 200, 'touch')
    expect(dragProxy()).toBeNull()
    pointer(source, 'pointerup', boundaryX(3), 200, 'touch')

    // Resting first arms the card; the same logic then reorders it.
    pointer(source, 'pointerdown', 10, 200, 'touch')
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS)
    })
    expect(source).toHaveClass('playing-card--armed')
    const touchMove = new Event('touchmove', { bubbles: true, cancelable: true })
    source.dispatchEvent(touchMove)
    expect(touchMove.defaultPrevented).toBe(true)
    pointer(source, 'pointermove', boundaryX(3), 200, 'touch')
    expect(dragProxy()).toHaveTextContent('1 carta')
    pointer(source, 'pointerup', boundaryX(3), 200, 'touch')
    fireEvent.click(source, { detail: 1 })

    expect(handLabels()).toEqual(labels([sorted[1]!, sorted[2]!, sorted[0]!, sorted[3]!, sorted[4]!]))
    expect(source).toHaveAttribute('aria-pressed', 'false')
  })

  it('removes every pointer listener on unmount', () => {
    const onMatchChange = vi.fn()
    const { unmount } = render(
      <GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />,
    )
    startDrag(handButton(unsortedHand[0]!), discardGroup())
    unmount()

    pointer(window, 'pointermove', 400, 100)
    pointer(window, 'pointerup', 400, 100)
    expect(onMatchChange).toHaveBeenCalledOnce()
  })
})

describe('GameTable hand accessibility and fallbacks (M29)', () => {
  it('keeps hand cards as named toggle buttons and adds no pointer-only tab stop', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    for (const held of unsortedHand) {
      expect(handButton(held)).toHaveAttribute('aria-pressed', 'false')
    }
    expect(newMeldTarget()).not.toHaveAttribute('tabindex')
    expect(newMeldTarget()).toHaveAccessibleDescription(/Trascina qui le carte oppure selezionale e premi «Cala»/)
    expect(discardGroup()).not.toHaveAttribute('tabindex')
    expect(handRegion()).not.toHaveAttribute('tabindex')
  })

  it('reorders the selection with keyboard-operable buttons and correct disabled states', () => {
    const onMatchChange = vi.fn()
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} onMatchChange={onMatchChange} />)
    const sorted = sortCardsForDisplay(unsortedHand)
    const left = screen.getByRole('button', { name: 'Sposta a sinistra' })
    const right = screen.getByRole('button', { name: 'Sposta a destra' })
    expect(left).toBeDisabled()
    expect(right).toBeDisabled()

    fireEvent.click(handButton(sorted[0]!))
    expect(left).toBeDisabled()
    expect(right).toBeEnabled()

    fireEvent.click(right)
    fireEvent.click(right)
    expect(handLabels()).toEqual(labels([sorted[1]!, sorted[2]!, sorted[0]!, sorted[3]!, sorted[4]!]))
    expect(left).toBeEnabled()

    fireEvent.click(handButton(sorted[3]!))
    // A group: [0] and [3] move together one step left (before [2]).
    fireEvent.click(left)
    expect(handLabels()).toEqual(labels([sorted[1]!, sorted[0]!, sorted[3]!, sorted[2]!, sorted[4]!]))
    fireEvent.click(left)
    expect(handLabels()).toEqual(labels([sorted[0]!, sorted[3]!, sorted[1]!, sorted[2]!, sorted[4]!]))
    expect(left).toBeDisabled()
    expect(handButton(sorted[0]!)).toHaveAttribute('aria-pressed', 'true')
    expect(handButton(sorted[3]!)).toHaveAttribute('aria-pressed', 'true')
    expect(onMatchChange).toHaveBeenCalledOnce()
  })

  it('still plays every action through the native buttons without any drag', () => {
    const sevens = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const extension = card('seven', 'spades')
    const last = card('king', 'spades')
    render(<GameTable initialState={withHumanTurn([...sevens, extension, card('three', 'hearts'), last], 'action')} />)

    for (const seven of sevens) fireEvent.click(handButton(seven))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))
    fireEvent.click(handButton(extension))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))
    expect(within(meldArticle(1, 1)).getAllByRole('img')).toHaveLength(4)
    fireEvent.click(handButton(last))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(within(discardGroup()).getByRole('img', { name: cardLabel(last) })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('GameTable direct manipulation and M30 motion', () => {
  let animated: HTMLElement[] = []

  beforeEach(() => {
    animated = []
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        animated.push(this)
        return { cancel: () => undefined, onfinish: null }
      },
    })
  })

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  })

  const flights = () => animated.map((proxy) => proxy.dataset.motionFlight)

  it('flies a dropped discard from its pre-commit hand position', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    const discarded = unsortedHand[2]!
    const index = handButtons().indexOf(handButton(discarded))

    dragTo(handButton(discarded), discardGroup())

    expect(flights()).toEqual(['hand-selection>discard'])
    // The 44 px proxy is centred on the 80 px card measured before the commit.
    expect(animated[0]!.style.left).toBe(`${index * 100 + 18}px`)
    expect(dragProxy()).toBeNull()
  })

  it('creates no flight for structural drop rejections or an engine-rejected drop', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    const sorted = sortCardsForDisplay(unsortedHand)

    dragTo(handButton(sorted[0]!), null)
    expect(screen.getByRole('alert')).toHaveTextContent(OUTSIDE_DROP_MESSAGE)
    fireEvent.click(handButton(sorted[0]!))
    fireEvent.click(handButton(sorted[1]!))
    dragTo(handButton(sorted[0]!), discardGroup())
    expect(screen.getByRole('alert')).toHaveTextContent(MULTI_CARD_DISCARD_MESSAGE)
    dragTo(handButton(sorted[0]!), newMeldTarget())
    expect(screen.getByRole('alert')).toHaveTextContent('Le carte selezionate non formano una calata valida.')

    expect(animated).toEqual([])
    expect(document.querySelector('.motion-proxy')).toBeNull()
  })

  it('keeps a hand reorder presentation-only, without any flight', () => {
    render(<GameTable initialState={withHumanTurn(unsortedHand, 'action')} />)
    dragToBoundary(handButton(sortCardsForDisplay(unsortedHand)[0]!), 3)
    expect(animated).toEqual([])
  })

  it('requests the M31 invalid sound for a structural drop refusal and none for a reorder', () => {
    const requests: string[][] = []
    render(
      <SoundContext value={(cues) => {
        requests.push([...cues])
      }}
      >
        <GameTable initialState={withHumanTurn(unsortedHand, 'action')} />
      </SoundContext>,
    )
    dragToBoundary(handButton(sortCardsForDisplay(unsortedHand)[0]!), 3)
    expect(requests).toEqual([])

    dragTo(handButton(unsortedHand[0]!), null)

    expect(screen.getByRole('alert')).toHaveTextContent(OUTSIDE_DROP_MESSAGE)
    expect(requests).toEqual([['invalid']])
  })
})
