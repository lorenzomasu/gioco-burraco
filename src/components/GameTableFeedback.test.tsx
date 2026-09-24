import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playNextBotChainStep } from '../game/bot'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import type { MatchState } from '../game/match'
import { classifyBurraco, validateMeld, type ValidatedMeld } from '../game/melds'
import type { CompletedGameState, InProgressGameState, TeamId } from '../game/state/types'
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

const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const drawPhaseState = (): InProgressGameState => ({
  ...dealInitialState(deck),
  round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
})

/** Human action phase with a chosen hand and team-1 melds; bots hold small safe hands. */
const actionState = (
  hand: readonly Card[],
  teamOneMelds: readonly ValidatedMeld[] = [],
): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1' ? { ...player, hand } : player),
    teams: initial.teams.map((team) => team.id === 'team-1' ? { ...team, melds: teamOneMelds } : team),
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
      turn: {
        currentPlayerId: 'player-1',
        phase: 'action',
        acquisition: { source: 'drawPile', cardIds: [] },
      },
    },
  }
}

/** North (team 2) is in its action phase holding only a meld: it melds out and takes its pozzetto. */
const botPozzettoState = (): InProgressGameState => {
  const base = automaticSequenceState()
  return {
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

const cued = () => [...document.querySelectorAll<HTMLElement>('[data-feedback]')]
const cueOf = (element: Element) => element.getAttribute('data-feedback')
const cycleOf = (element: Element) => element.getAttribute('data-feedback-cycle')
const stock = () => screen.getByRole('button', { name: /^Pesca dal tallone/ })
const discardPile = () => screen.getByRole('button', { name: /[Mm]onte degli scarti/ })
const hand = () => screen.getByLabelText('Carte di You')
const humanArea = () => screen.getByRole('region', { name: 'Mano di You' })
const seat = (name: string) => screen.getByRole('region', { name: `Giocatore ${name}` })
const teamArea = (team: 1 | 2) => screen.getByRole('region', { name: `Calate squadra ${team}` })
const meld = (index: number, team: 1 | 2) => screen.getByRole('article', { name: `Calata ${index} squadra ${team}` })
const turnBanner = () => screen.getByText('Turno di').closest('.turn-banner')!
const advanceOneStep = () => act(() => {
  vi.advanceTimersByTime(BOT_STEP_DELAY_MS)
})

describe('GameTable M24 visual feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('starts without any cue, including on a restored or fresh table', () => {
    render(<GameTable initialState={drawPhaseState()} />)
    expect(cued()).toEqual([])
  })

  it('cues the stock and only the newly drawn card after a stock draw, with the state already committed', () => {
    const state = drawPhaseState()
    const drawn = state.drawPile[0]!
    render(<GameTable initialState={state} />)

    fireEvent.click(stock())

    expect(within(humanArea()).getByText('12 carte')).toBeInTheDocument()
    expect(cueOf(stock())).toBe('draw')
    const drawnButton = screen.getByRole('button', { name: cardLabel(drawn) })
    expect(cueOf(drawnButton)).toBe('received')
    expect(within(hand()).getAllByRole('button').filter((button) => cueOf(button) !== null)).toEqual([drawnButton])
    expect(cueOf(discardPile())).toBeNull()
    expect(cueOf(hand())).toBeNull()
    expect(cueOf(turnBanner())).toBe('phase')
    expect(document.activeElement).toBe(document.body)
  })

  it('cues the discard source and the whole hand after collecting the pile, without per-card cues', () => {
    render(<GameTable initialState={drawPhaseState()} />)

    fireEvent.click(discardPile())

    expect(screen.getByRole('button', { name: 'Monte degli scarti vuoto' })).toBeDisabled()
    expect(cueOf(discardPile())).toBe('collect')
    expect(cueOf(hand())).toBe('collect')
    expect(cueOf(stock())).toBeNull()
    expect(within(hand()).getAllByRole('button').some((button) => cueOf(button) !== null)).toBe(false)
  })

  it('cues the created meld after Cala and only the extended meld after an extension', () => {
    const existing = validatedMeld([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')])
    const newMeld = [card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts')]
    const extension = card('seven', 'spades')
    render(<GameTable initialState={actionState([...newMeld, extension, card('king', 'spades')], [existing])} />)

    for (const selected of newMeld) fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(cueOf(meld(2, 1))).toBe('meld-created')
    expect(cueOf(meld(1, 1))).toBeNull()
    const createdCycle = cycleOf(meld(2, 1))

    fireEvent.click(screen.getByRole('button', { name: cardLabel(extension) }))
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi alla calata 1 della squadra 1' }))

    expect(cueOf(meld(1, 1))).toBe('meld-extended')
    expect(cycleOf(meld(1, 1))).not.toBe(createdCycle)
    expect(cueOf(meld(2, 1))).toBeNull()
    expect(cueOf(discardPile())).toBeNull()
  })

  it('cues the new discard top and the next player after a discard', () => {
    const state = automaticSequenceState()
    render(<GameTable initialState={state} />)

    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

    expect(within(discardPile()).getByRole('img', { name: cardLabel(card('king', 'hearts')) })).toBeInTheDocument()
    expect(cueOf(discardPile())).toBe('discard')
    expect(cueOf(seat('North'))).toBe('turn')
    expect(seat('North')).toHaveAttribute('aria-current', 'true')
    expect(cueOf(turnBanner())).toBe('player')
    expect(cueOf(humanArea())).toBeNull()
  })

  it('never shows a success cue for a rejected engine action and keeps an earlier cue untouched', () => {
    const invalid = [card('three', 'clubs'), card('five', 'hearts'), card('seven', 'spades')]
    const { unmount } = render(<GameTable initialState={actionState([...invalid, card('king', 'diamonds')])} />)

    for (const selected of invalid) fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(cued()).toEqual([])
    unmount()

    const state = drawPhaseState()
    render(<GameTable initialState={state} />)
    fireEvent.click(stock())
    const before = cued().map((element) => [element, cueOf(element), cycleOf(element)])
    // Two cards can never form a meld, so the engine rejects this Cala.
    const [first, second] = state.players[0]!.hand
    fireEvent.click(screen.getByRole('button', { name: cardLabel(first!) }))
    fireEvent.click(screen.getByRole('button', { name: cardLabel(second!) }))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(cued().map((element) => [element, cueOf(element), cycleOf(element)])).toEqual(before)
  })

  it('cues each bot step only from public changes and never marks a hidden bot card', () => {
    render(<GameTable initialState={automaticSequenceState()} />)
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    const humanCycle = cycleOf(discardPile())

    advanceOneStep()

    // North drew from the stock: the pile and the acting seat, never a card face.
    expect(cueOf(stock())).toBe('draw')
    expect(cueOf(seat('North'))).toBe('bot-step')
    expect(cycleOf(seat('North'))).not.toBe(humanCycle)
    expect(cueOf(discardPile())).toBeNull()
    expect(cueOf(hand())).toBeNull()
    expect(document.querySelectorAll('.playing-card[data-feedback]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: cardLabel(card('king', 'clubs')) })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: cardLabel(card('king', 'clubs')) })).not.toBeInTheDocument()

    advanceOneStep()

    expect(cueOf(discardPile())).toBe('discard')
    expect(cueOf(stock())).toBeNull()
    expect(cueOf(seat('North'))).toBe('bot-step')
    expect(cueOf(seat('Partner'))).toBe('turn')
  })

  it('cues a bot meld and the first pozzetto acquisition while the durable text stays authoritative', () => {
    const state = botPozzettoState()
    const expected = playNextBotChainStep(state, 'player-1')!
    expect(expected.events.map(({ type }) => type)).toEqual(['play-meld', 'take-pozzetto'])
    render(<GameTable initialState={state} />)
    expect(teamArea(2)).toHaveTextContent('Pozzetto da prendere')

    advanceOneStep()

    expect(teamArea(2)).toHaveTextContent('Pozzetto preso')
    expect(cueOf(teamArea(2))).toBe('pozzetto')
    expect(cueOf(within(teamArea(2)).getByText(/Pozzetto preso/))).toBe('pozzetto')
    expect(cueOf(screen.getByText('Pozzetti').closest('.pozzetti-counter')!)).toBe('pozzetto')
    expect(cueOf(teamArea(1))).toBeNull()
    expect(cueOf(meld(1, 2))).toBe('meld-created')

    advanceOneStep()

    // The durable state stays taken, but the transition cue is not repeated.
    expect(teamArea(2)).toHaveTextContent('Pozzetto preso')
    expect(cueOf(teamArea(2))).toBeNull()
  })

  it('cues the human team when the human takes the pozzetto', () => {
    const meldCards = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    render(<GameTable initialState={actionState(meldCards)} />)

    for (const selected of meldCards) fireEvent.click(screen.getByRole('button', { name: cardLabel(selected) }))
    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(teamArea(1)).toHaveTextContent('Pozzetto preso')
    expect(cueOf(teamArea(1))).toBe('pozzetto')
    expect(cueOf(teamArea(2))).toBeNull()
  })

  it('leaves no cue after Completa subito and no pending timer once control returns', () => {
    render(<GameTable initialState={automaticSequenceState()} />)
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    advanceOneStep()
    expect(cued().length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))

    expect(screen.queryByRole('button', { name: 'Completa subito' })).not.toBeInTheDocument()
    expect(turnBanner()).toHaveTextContent('You')
    expect(cued()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts a new smazzata without any cue from the previous one', () => {
    render(<GameTable initialState={emptyCompletedRound()} createGame={() => dealInitialState(deck)} />)

    fireEvent.click(screen.getByRole('button', { name: 'Inizia smazzata 2' }))

    expect(screen.getByRole('region', { name: 'Tavolo di Burraco' })).toBeInTheDocument()
    expect(cued()).toEqual([])
  })

  it('keeps the turn live region mounted and focus in place while the turn cue replays', () => {
    render(<GameTable initialState={automaticSequenceState()} />)
    const banner = turnBanner()
    const speed = screen.getByRole('radio', { name: 'Normale' })
    speed.focus()
    fireEvent.click(screen.getByRole('button', { name: cardLabel(card('king', 'hearts')) }))
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))
    speed.focus()
    const cycles = [cycleOf(banner)]

    advanceOneStep()
    cycles.push(cycleOf(banner))

    expect(turnBanner()).toBe(banner)
    expect(banner).toHaveAttribute('aria-live', 'polite')
    expect(document.querySelectorAll('[aria-live="polite"][aria-atomic="true"]')).toHaveLength(1)
    expect(cycles).toEqual(['a', 'b'])
    expect(speed).toHaveFocus()
  })
})

describe('Burraco and result presentation', () => {
  const burracoTeamState = (melds: readonly ValidatedMeld[]): InProgressGameState => ({
    ...actionState([card('king', 'spades')], melds),
  })

  it('maps every Burraco badge to the unchanged domain classification and keeps its text label', () => {
    const clean = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'), card('six', 'clubs'),
      card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const semiClean = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'), card('six', 'spades'),
      card('seven', 'spades'), card('eight', 'spades'), card('nine', 'spades'), joker(),
    ])
    const dirty = validatedMeld([
      card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts'), card('six', 'hearts'),
      card('seven', 'hearts'), card('eight', 'hearts'), card('two', 'diamonds'),
    ])
    const plain = validatedMeld([card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts')])
    const melds = [clean, semiClean, dirty, plain]
    expect(melds.map(classifyBurraco)).toEqual(['clean', 'semi-clean', 'dirty', 'none'])
    render(<GameTable initialState={burracoTeamState(melds)} />)

    const expectations = [[1, 'clean', 'Pulito'], [2, 'semi-clean', 'Semipulito'], [3, 'dirty', 'Sporco']] as const
    for (const [index, classification, label] of expectations) {
      const article = meld(index, 1)
      expect(article).toHaveAttribute('data-burraco', classification)
      const badge = within(article).getByText(label)
      expect(badge).toHaveClass(`burraco-badge--${classification}`)
      expect(badge).toHaveTextContent(`Burraco ${label}`)
      expect(badge.querySelector('.burraco-badge__icon')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(meld(4, 1)).not.toHaveAttribute('data-burraco')
    expect(within(meld(4, 1)).queryByText(/Pulito|Semipulito|Sporco/)).not.toBeInTheDocument()
  })

  const completedMatch = (leadingTeam: TeamId | null): MatchState => {
    const [team1, team2] = leadingTeam === 'team-1' ? [100, 0] : leadingTeam === 'team-2' ? [0, 100] : [50, 50]
    const round = (roundNumber: 1 | 2 | 3 | 4) => ({
      roundNumber,
      ending: 'draw-pile-exhausted' as const,
      score: {
        teams: [
          { teamId: 'team-1' as const, meldCardPoints: 0, burracoBonus: 0, closingBonus: 0, handPenalty: 0, pozzettoPenalty: 0, total: team1 },
          { teamId: 'team-2' as const, meldCardPoints: 0, burracoBonus: 0, closingBonus: 0, handPenalty: 0, pozzettoPenalty: 0, total: team2 },
        ],
      },
    })
    return {
      status: 'completed',
      currentRoundNumber: 4,
      currentRound: emptyCompletedRound(),
      roundResults: [round(1), round(2), round(3), round(4)],
    }
  }

  it.each([
    ['team-1', 'Prima la Squadra 1.', 'Squadra 1'],
    ['team-2', 'Prima la Squadra 2.', 'Squadra 2'],
  ] as const)('emphasizes only the domain leading team (%s)', (leadingTeam, outcomeText, leaderLabel) => {
    render(<GameTable initialMatch={completedMatch(leadingTeam)} />)

    const finalResult = screen.getByRole('heading', { name: 'Risultato finale' }).parentElement!
    expect(finalResult).toHaveClass('final-result--leader')
    expect(within(finalResult).getByText(outcomeText)).toBeInTheDocument()
    const victoryPoints = screen.getByLabelText('Victory Points')
    const leaders = victoryPoints.querySelectorAll('.victory-points__team--leader')
    expect(leaders).toHaveLength(1)
    expect(leaders[0]).toHaveTextContent(leaderLabel)
  })

  it('preserves the exact tie without emphasizing either team', () => {
    render(<GameTable initialMatch={completedMatch(null)} />)

    const finalResult = screen.getByRole('heading', { name: 'Risultato finale' }).parentElement!
    expect(finalResult).toHaveClass('final-result--tie')
    expect(within(finalResult).getByText('Parità esatta.')).toBeInTheDocument()
    expect(screen.getByLabelText('Victory Points').querySelectorAll('.victory-points__team--leader')).toHaveLength(0)
    expect(within(finalResult).queryByText(/Prima la Squadra/)).not.toBeInTheDocument()
  })

  it('tags only the closing team on a closure result and keeps the round progress decorative', () => {
    const initial = emptyCompletedRound()
    const closure: CompletedGameState = {
      ...initial,
      round: { status: 'completed', ending: 'closure', closedByPlayerId: 'player-2', closingTeamId: 'team-2' },
    }
    render(<GameTable initialState={closure} />)

    const closing = screen.getByRole('article', { name: 'Punteggio smazzata squadra 2' })
    expect(closing).toHaveClass('score-card--closing')
    expect(within(closing).getByText('Chiusura')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Punteggio smazzata squadra 1' })).queryByText('Chiusura'))
      .not.toBeInTheDocument()
    expect(document.querySelector('.round-track')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelectorAll('.round-track__step--done')).toHaveLength(1)
  })
})
