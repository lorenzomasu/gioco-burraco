import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { dealInitialState, getPlayer } from '../engine/startGame'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TurnPhase } from '../state/types'
import { BotAutomationError, playBotsUntilHumanTurn, playBotTurn } from './playBotTurn'

const deck = createBurracoDeck()

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card => {
  const found = deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )
  if (!found) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return found
}

const joker = (): Card => {
  const found = deck.find((candidate) => candidate.rank === 'joker')
  if (!found) throw new Error('Missing test joker')
  return found
}

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const defaultPozzetti = (): readonly [Pozzetto, Pozzetto] => [
  [
    card('ace', 'clubs'), card('three', 'diamonds'), card('five', 'hearts'),
    card('seven', 'spades'), card('nine', 'clubs'), card('jack', 'diamonds'),
    card('king', 'hearts'), card('four', 'spades'), card('six', 'clubs'),
    card('eight', 'diamonds'), card('queen', 'spades'),
  ],
  [card('ace', 'diamonds')],
]

const stateFor = ({
  playerId = 'player-2',
  hand,
  phase = 'action',
  drawPile = [],
  discardPile = [],
  melds = [],
  hasTakenPozzetto = false,
  pozzetti = defaultPozzetti(),
}: {
  playerId?: PlayerId
  hand: readonly Card[]
  phase?: TurnPhase
  drawPile?: readonly Card[]
  discardPile?: readonly Card[]
  melds?: readonly ValidatedMeld[]
  hasTakenPozzetto?: boolean
  pozzetti?: readonly [Pozzetto, Pozzetto]
}): InProgressGameState => {
  const initial = dealInitialState(deck)
  const teamId = getPlayer(initial, playerId).teamId
  return {
    ...initial,
    players: initial.players.map((player) => ({
      ...player,
      hand: player.id === playerId ? hand : [],
    })),
    teams: initial.teams.map((team) => ({
      ...team,
      melds: team.id === teamId ? melds : [],
      hasTakenPozzetto: team.id === teamId ? hasTakenPozzetto : false,
    })),
    drawPile,
    discardPile,
    pozzetti,
    round: {
      status: 'in-progress',
      turn: phase === 'mustDraw'
        ? { currentPlayerId: playerId, phase }
        : {
            currentPlayerId: playerId,
            phase,
            acquisition: { source: 'drawPile', cardIds: [] },
          },
    },
  }
}

const teamForPlayer = (state: GameState, playerId: PlayerId) => {
  const player = getPlayer(state, playerId)
  return state.teams.find((team) => team.id === player.teamId)!
}

describe('deterministic bot turns', () => {
  it('produces exactly the same result from exactly the same state', () => {
    const state = stateFor({
      hand: [card('three', 'clubs'), card('five', 'hearts'), card('seven', 'spades')],
    })

    expect(playBotTurn(state, 'player-2')).toEqual(playBotTurn(state, 'player-2'))
  })

  it('rejects a request to operate another player and preserves the input', () => {
    const state = stateFor({ hand: [card('king', 'spades')] })
    const before = structuredClone(state)

    expect(() => playBotTurn(state, 'player-3')).toThrowError(BotAutomationError)
    expect(state).toEqual(before)
  })

  it('draws from the draw pile, then legally discards and advances the turn', () => {
    const drawn = card('king', 'spades')
    const firstInHand = card('three', 'clubs')
    const state = stateFor({
      hand: [firstInHand, card('five', 'hearts')],
      phase: 'mustDraw',
      drawPile: [drawn],
    })

    const next = playBotTurn(state, 'player-2')

    expect(next.drawPile).toEqual([])
    expect(next.discardPile.at(-1)).toBe(firstInHand)
    expect(getPlayer(next, 'player-2').hand).toContain(drawn)
    expect(next.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: 'player-3', phase: 'mustDraw' },
    })
  })

  it('falls back to collecting the discard pile when the draw pile is empty', () => {
    const collected = card('queen', 'hearts')
    const state = stateFor({
      hand: [card('three', 'clubs'), card('five', 'hearts')],
      phase: 'mustDraw',
      discardPile: [collected],
    })

    const next = playBotTurn(state, 'player-2')

    expect(getPlayer(next, 'player-2').hand).toContain(collected)
    expect(next.round.status).toBe('in-progress')
    if (next.round.status === 'in-progress') {
      expect(next.round.turn.currentPlayerId).toBe('player-3')
    }
  })

  it('extends its team meld one card at a time through the engine', () => {
    const existing = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    const extension = card('seven', 'spades')
    const state = stateFor({ hand: [extension, card('king', 'spades')], melds: [existing] })

    const next = playBotTurn(state, 'player-2')

    expect(teamForPlayer(next, 'player-2').melds[0]!.cards.map(({ card: placed }) => placed.id))
      .toContain(extension.id)
    expect(next.discardPile.at(-1)?.rank).toBe('king')
  })

  it('finds and plays an obvious new meld while preserving physical card IDs', () => {
    const group = [
      card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'),
    ]
    const state = stateFor({ hand: [...group, card('king', 'spades')] })

    const next = playBotTurn(state, 'player-2')
    const playedIds = teamForPlayer(next, 'player-2').melds[0]!.cards.map(({ card: placed }) => placed.id)

    expect(playedIds).toEqual(expect.arrayContaining(group.map(({ id }) => id)))
    expect(new Set(playedIds).size).toBe(3)
  })

  it('finds an obvious sequence through the shared meld validator', () => {
    const sequence = [card('five', 'spades'), card('six', 'spades'), card('seven', 'spades')]
    const state = stateFor({ hand: [...sequence, card('king', 'hearts')] })

    const next = playBotTurn(state, 'player-2')
    const meld = teamForPlayer(next, 'player-2').melds[0]!

    expect(meld.type).toBe('sequence')
    expect(meld.cards.map(({ card: placed }) => placed.id))
      .toEqual(expect.arrayContaining(sequence.map(({ id }) => id)))
  })

  it('does not commit invalid meld candidates', () => {
    const state = stateFor({
      hand: [card('three', 'clubs'), card('five', 'hearts'), card('seven', 'spades')],
    })

    const next = playBotTurn(state, 'player-2')

    expect(teamForPlayer(next, 'player-2').melds).toEqual([])
    expect(next.discardPile).toHaveLength(1)
  })

  it('rejects a greedy meld that would leave no legal final discard', () => {
    const state = stateFor({
      hand: [
        card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts'), joker(),
      ],
      hasTakenPozzetto: true,
    })

    const next = playBotTurn(state, 'player-2')

    expect(teamForPlayer(next, 'player-2').melds).toEqual([])
    expect(next.round.status).toBe('in-progress')
    expect(next.discardPile).toHaveLength(1)
  })

  it('takes a pozzetto al volo and continues the same turn before discarding', () => {
    const firstHand = [
      card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts'),
    ]
    const pozzetti = defaultPozzetti()
    const state = stateFor({ hand: firstHand, pozzetti })

    const next = playBotTurn(state, 'player-2')

    expect(teamForPlayer(next, 'player-2').hasTakenPozzetto).toBe(true)
    expect(teamForPlayer(next, 'player-2').melds.length).toBeGreaterThan(0)
    expect(next.pozzetti[0]).toEqual([])
    expect(next.round.status).toBe('in-progress')
    if (next.round.status === 'in-progress') {
      expect(next.round.turn.currentPlayerId).toBe('player-3')
    }
    expect(getPlayer(next, 'player-2').hand.length).toBeLessThan(pozzetti[0].length)
  })

  it('stops cleanly when the bot legally closes the round', () => {
    const burraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
    ])
    const state = stateFor({
      hand: [card('king', 'spades')],
      melds: [burraco],
      hasTakenPozzetto: true,
    })

    const next = playBotTurn(state, 'player-2')

    expect(next.round).toEqual({
      status: 'completed',
      closedByPlayerId: 'player-2',
      closingTeamId: 'team-2',
    })
  })

  it('fails deterministically when a configured progress guard is reached', () => {
    const state = stateFor({ hand: [card('king', 'spades')] })

    expect(() => playBotTurn(state, 'player-2', { maxActionsPerTurn: 0 }))
      .toThrowError('exceeded the 0-action safety limit')
    expect(() => playBotsUntilHumanTurn(state, 'player-1', { maxBotTurns: 0 }))
      .toThrowError('exceeded the 0-turn safety limit')
  })
})
