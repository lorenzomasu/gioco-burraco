import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundContext } from '../audio/SoundContext'
import type { SoundCue } from '../audio/soundEffects'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import { dealInitialState } from '../game/engine/startGame'
import type { InProgressGameState } from '../game/state/types'
import { cardLabel } from './cardPresentation'
import { BOT_PLAYBACK_DELAYS_MS, BOT_SIGNIFICANT_STEP_DELAYS_MS, GameTable } from './GameTable'

/**
 * Commits exactly one pending normal bot step, whichever cadence applies: the longer
 * significant-change delay is shorter than two ordinary delays.
 */
const ONE_NORMAL_STEP_MS = BOT_SIGNIFICANT_STEP_DELAYS_MS.normal

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) => candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber)!

const drawPhaseState = (): InProgressGameState => ({
  ...dealInitialState(deck),
  round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
})

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

let requests: SoundCue[][] = []
const withSound = (table: ReactNode) => (
  <SoundContext value={(cues) => {
    requests.push([...cues])
  }}
  >
    {table}
  </SoundContext>
)
const select = (target: Card) => fireEvent.click(screen.getByRole('button', { name: cardLabel(target) }))
const discardSelected = () => fireEvent.click(screen.getByRole('button', { name: 'Scarta e passa' }))

beforeEach(() => {
  vi.useFakeTimers()
  requests = []
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('GameTable M31 sound requests', () => {
  it('stays silent on mount, including a restored table with a pending bot', () => {
    render(withSound(<GameTable initialState={botPozzettoState()} />))
    expect(requests).toEqual([])
  })

  it('requests UI-only selection sounds without committing or saving anything', () => {
    const onMatchChange = vi.fn()
    render(withSound(<GameTable initialState={automaticSequenceState()} onMatchChange={onMatchChange} />))

    select(card('king', 'hearts'))
    select(card('king', 'hearts'))

    expect(requests).toEqual([['selection'], ['selection']])
    expect(onMatchChange).toHaveBeenCalledOnce()
  })

  it('requests the committed action sound once, however often the table re-renders', () => {
    const { rerender } = render(withSound(<GameTable initialState={drawPhaseState()} />))

    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    rerender(withSound(<GameTable initialState={drawPhaseState()} />))
    rerender(withSound(<GameTable initialState={drawPhaseState()} playbackSpeed="fast" />))

    expect(requests).toEqual([['draw']])
  })

  it('requests the invalid sound for an engine rejection and nothing committed', () => {
    render(withSound(<GameTable initialState={automaticSequenceState()} />))
    select(card('king', 'hearts'))
    select(card('ace', 'spades'))
    requests = []

    fireEvent.click(screen.getByRole('button', { name: 'Cala' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(requests).toEqual([['invalid']])
  })

  it('sounds each committed bot step from its cue and marks the returning human turn', () => {
    render(withSound(<GameTable initialState={automaticSequenceState()} />))
    select(card('king', 'hearts'))
    requests = []
    discardSelected()
    expect(requests).toEqual([['discard', 'turn']])

    act(() => {
      vi.advanceTimersByTime(ONE_NORMAL_STEP_MS)
    })
    expect(requests.at(-1)).toEqual(['draw'])
    act(() => {
      vi.advanceTimersByTime(ONE_NORMAL_STEP_MS)
    })
    expect(requests.at(-1)).toEqual(['discard', 'turn'])
    for (let step = 0; step < 4; step += 1) {
      act(() => {
        vi.advanceTimersByTime(ONE_NORMAL_STEP_MS)
      })
    }
    expect(requests.at(-1)).toEqual(['discard', 'human-turn'])
    expect(requests.every((cues) => cues.length <= 2)).toBe(true)
  })

  it('sounds a bot meld with its pozzetto accent', () => {
    render(withSound(<GameTable initialState={botPozzettoState()} />))
    act(() => {
      vi.advanceTimersByTime(ONE_NORMAL_STEP_MS)
    })
    expect(requests).toEqual([['play', 'pozzetto']])
  })

  it('thins bot-to-bot turn cues in fast playback without changing its cadence', () => {
    render(withSound(<GameTable initialState={automaticSequenceState()} playbackSpeed="fast" />))
    select(card('king', 'hearts'))
    discardSelected()
    requests = []

    for (let step = 0; step < 2; step += 1) {
      act(() => {
        vi.advanceTimersByTime(BOT_PLAYBACK_DELAYS_MS.fast)
      })
    }

    expect(requests).toEqual([['draw'], ['discard']])
  })

  it('suppresses intermediate bot sounds on Completa subito and plays one final accent', () => {
    render(withSound(<GameTable initialState={automaticSequenceState()} />))
    select(card('king', 'hearts'))
    discardSelected()
    requests = []

    fireEvent.click(screen.getByRole('button', { name: 'Completa subito' }))
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(requests).toEqual([['human-turn']])
  })
})
