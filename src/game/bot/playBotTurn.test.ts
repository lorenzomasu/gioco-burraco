import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { dealInitialState, getPlayer } from '../engine/startGame'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TurnPhase } from '../state/types'
import { BotAutomationError, playBotsUntilHumanTurn, playBotTurn } from './playBotTurn'
import { chooseBestAction, chooseBestDiscard, chooseDrawSource } from './strategy'

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

/** A stock above the unplayable threshold, so ordinary discards keep the round in progress. */
const playableDrawPile = (): readonly Card[] => [
  card('king', 'clubs', 2), card('queen', 'diamonds', 2), card('jack', 'hearts', 2),
]

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
  drawPile = playableDrawPile(),
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

  it('preserves the input while resolving a successful turn', () => {
    const state = stateFor({ hand: [card('king', 'spades'), card('four', 'hearts')] })
    const before = structuredClone(state)

    playBotTurn(state, 'player-2')

    expect(state).toEqual(before)
  })

  it('draws from the draw pile, then strategically discards and advances the turn', () => {
    const drawn = card('king', 'spades')
    const firstInHand = card('three', 'clubs')
    const state = stateFor({
      hand: [firstInHand, card('five', 'hearts')],
      phase: 'mustDraw',
      drawPile: [drawn, ...playableDrawPile()],
    })

    const next = playBotTurn(state, 'player-2')

    expect(next.drawPile).toEqual(playableDrawPile())
    expect(next.discardPile.at(-1)).toBe(drawn)
    expect(getPlayer(next, 'player-2').hand).toContain(firstInHand)
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
      drawPile: [],
      discardPile: [collected],
    })

    const next = playBotTurn(state, 'player-2')

    expect(getPlayer(next, 'player-2').hand).toContain(collected)
    expect(next.round).toEqual({
      status: 'completed',
      ending: 'draw-pile-exhausted',
      lastDiscardPlayerId: 'player-2',
    })
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
      ending: 'closure',
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

  it('chains all bot turns until control returns to the human player', () => {
    const base = stateFor({
      hand: [card('three', 'clubs'), card('four', 'hearts')],
      phase: 'mustDraw',
      drawPile: [card('king', 'clubs'), card('queen', 'diamonds'), card('jack', 'hearts'), ...playableDrawPile()],
    })
    const state: InProgressGameState = {
      ...base,
      players: base.players.map((player) => {
        if (player.id === 'player-3') {
          return { ...player, hand: [card('five', 'clubs'), card('six', 'hearts')] }
        }
        if (player.id === 'player-4') {
          return { ...player, hand: [card('seven', 'clubs'), card('eight', 'hearts')] }
        }
        return player
      }),
    }

    const next = playBotsUntilHumanTurn(state, 'player-1')

    expect(next.round.status).toBe('in-progress')
    if (next.round.status === 'in-progress') {
      expect(next.round.turn).toEqual({ currentPlayerId: 'player-1', phase: 'mustDraw' })
    }
  })

  it('lets player-3 extend the melds shared with the human team', () => {
    const sharedMeld = validatedMeld([
      card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts'),
    ])
    const extension = card('ten', 'spades')
    const state = stateFor({
      playerId: 'player-3',
      hand: [extension, card('four', 'hearts')],
      melds: [sharedMeld],
    })

    const next = playBotTurn(state, 'player-3')

    expect(teamForPlayer(next, 'player-1').melds[0]!.cards.map(({ card: placed }) => placed.id))
      .toContain(extension.id)
  })
})

describe('strategic acquisition without hidden information', () => {
  it('makes the same draw-source decision for different hidden stock cards and orders', () => {
    const base = stateFor({
      hand: [card('seven', 'clubs'), card('seven', 'diamonds'), card('king', 'spades')],
      phase: 'mustDraw',
      drawPile: [card('ace', 'clubs'), card('three', 'diamonds')],
      discardPile: [card('seven', 'hearts')],
    })
    const changedStock: InProgressGameState = {
      ...base,
      drawPile: [card('queen', 'spades'), card('four', 'hearts')],
    }

    expect(chooseDrawSource(base, 'player-2')).toBe('discardPile')
    expect(chooseDrawSource(changedStock, 'player-2')).toBe(chooseDrawSource(base, 'player-2'))
  })

  it('does not change strategy when only opponents hidden hands change', () => {
    const emptyOpponents = stateFor({
      hand: [card('five', 'clubs'), card('seven', 'diamonds'), card('king', 'spades')],
      phase: 'mustDraw',
      drawPile: [card('ace', 'clubs')],
      discardPile: [card('queen', 'hearts')],
    })
    const base: InProgressGameState = {
      ...emptyOpponents,
      players: emptyOpponents.players.map((player) => {
        if (player.id === 'player-1') {
          return { ...player, hand: [card('three', 'clubs'), card('six', 'hearts'), card('nine', 'spades')] }
        }
        if (player.id === 'player-3') {
          return { ...player, hand: [card('four', 'clubs'), card('eight', 'hearts')] }
        }
        return player
      }),
    }
    const changedHands: InProgressGameState = {
      ...base,
      players: base.players.map((player) => {
        if (player.id === 'player-1') {
          return { ...player, hand: [joker(), card('two', 'spades'), card('king', 'hearts')] }
        }
        if (player.id === 'player-3') {
          return { ...player, hand: [card('ace', 'diamonds'), card('queen', 'clubs')] }
        }
        return player
      }),
    }
    const actionBase: InProgressGameState = {
      ...base,
      round: {
        status: 'in-progress',
        turn: {
          currentPlayerId: 'player-2',
          phase: 'action',
          acquisition: { source: 'drawPile', cardIds: [] },
        },
      },
    }
    const changedActionHands: InProgressGameState = { ...actionBase, players: changedHands.players }

    expect(chooseDrawSource(base, 'player-2')).toBe('drawPile')
    expect(chooseDrawSource(changedHands, 'player-2')).toBe(chooseDrawSource(base, 'player-2'))
    expect(chooseBestDiscard(changedActionHands, 'player-2')?.card.id)
      .toBe(chooseBestDiscard(actionBase, 'player-2')?.card.id)
  })

  it('does not inspect the hidden contents of an unclaimed pozzetto', () => {
    const base = stateFor({
      hand: [card('nine', 'clubs'), card('nine', 'diamonds')],
      phase: 'mustDraw',
      drawPile: [card('ace', 'clubs')],
      discardPile: [card('nine', 'hearts')],
    })
    const changedPozzetto: InProgressGameState = {
      ...base,
      pozzetti: [
        base.pozzetti[0].map((_, index) => card(
          (['three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'] as const)[index]!,
          'hearts',
          2,
        )),
        base.pozzetti[1],
      ],
    }

    expect(chooseDrawSource(base, 'player-2')).toBe('discardPile')
    expect(chooseDrawSource(changedPozzetto, 'player-2')).toBe(chooseDrawSource(base, 'player-2'))
  })

  it('takes a discard pile that immediately enables a legal meld', () => {
    const state = stateFor({
      hand: [card('queen', 'clubs'), card('queen', 'diamonds'), card('five', 'spades')],
      phase: 'mustDraw',
      drawPile: [card('ace', 'clubs')],
      discardPile: [card('queen', 'hearts')],
    })

    expect(chooseDrawSource(state, 'player-2')).toBe('discardPile')
  })

  it('prefers the stock when the discard pile has no immediate concrete use', () => {
    const state = stateFor({
      hand: [card('three', 'clubs'), card('six', 'diamonds'), card('nine', 'hearts')],
      phase: 'mustDraw',
      drawPile: [card('ace', 'clubs')],
      discardPile: [card('king', 'spades'), card('jack', 'diamonds')],
    })

    expect(chooseDrawSource(state, 'player-2')).toBe('drawPile')
  })
})

describe('strategic action ranking', () => {
  it('prefers an action that enables immediate legal closure', () => {
    const burraco = validatedMeld([
      card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts'),
      card('six', 'hearts'), card('seven', 'hearts'), card('eight', 'hearts'),
      card('nine', 'hearts'),
    ])
    const nearBurraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
    ])
    const closingDiscard = card('nine', 'clubs')
    const kings = [card('king', 'clubs'), card('king', 'diamonds'), card('king', 'spades')]
    const state = stateFor({
      hand: [...kings, closingDiscard],
      melds: [burraco, nearBurraco],
      hasTakenPozzetto: true,
    })

    const action = chooseBestAction(state, 'player-2')

    expect(action?.kind).toBe('meld')
    expect(action?.cardIds).toEqual(kings.map(({ id }) => id).sort())
    expect(action?.enablesClosure).toBe(true)
    expect(playBotTurn(state, 'player-2').round.status).toBe('completed')
  })

  it('keeps preferring a real closure when every final-turn discard would exhaust the draw pile', () => {
    const burraco = validatedMeld([
      card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts'),
      card('six', 'hearts'), card('seven', 'hearts'), card('eight', 'hearts'),
      card('nine', 'hearts'),
    ])
    const nearBurraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
    ])
    const closingDiscard = card('nine', 'clubs')
    const kings = [card('king', 'clubs'), card('king', 'diamonds'), card('king', 'spades')]
    const state = stateFor({
      hand: [...kings, closingDiscard],
      melds: [burraco, nearBurraco],
      hasTakenPozzetto: true,
      drawPile: playableDrawPile().slice(1),
    })

    const action = chooseBestAction(state, 'player-2')

    expect(action?.cardIds).toEqual(kings.map(({ id }) => id).sort())
    expect(action?.enablesClosure).toBe(true)
    expect(playBotTurn(state, 'player-2').round).toMatchObject({ status: 'completed', ending: 'closure' })
  })

  it('prefers the move that completes a clean Burraco over a mediocre new meld', () => {
    const nearBurraco = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
      card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
    ])
    const completingCard = card('nine', 'clubs')
    const state = stateFor({
      hand: [
        card('king', 'clubs'), card('king', 'diamonds'), card('king', 'hearts'),
        completingCard, card('three', 'spades'),
      ],
      melds: [nearBurraco],
    })

    const action = chooseBestAction(state, 'player-2')

    expect(action?.kind).toBe('extend')
    expect(action?.cardIds).toEqual([completingCard.id])
    expect(action?.burracoAfter).toBe('clean')
  })

  it('preserves a wildcard when an equally sized natural extension exists', () => {
    const sequence = validatedMeld([
      card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
    ])
    const natural = card('six', 'clubs')
    const state = stateFor({ hand: [joker(), natural, card('king', 'spades')], melds: [sequence] })

    const action = chooseBestAction(state, 'player-2')

    expect(action?.cardIds).toEqual([natural.id])
    expect(action?.wildcardsPlayed).toBe(0)
  })
})

describe('strategic discard ranking', () => {
  it('does not discard the first card when it belongs to a future meld', () => {
    const useful = card('seven', 'clubs')
    const dead = card('king', 'spades')
    const state = stateFor({
      hand: [useful, dead, card('seven', 'diamonds'), card('seven', 'hearts')],
    })

    expect(chooseBestDiscard(state, 'player-2')?.card).toBe(dead)
  })

  it('avoids discarding a matta when a normal card is reasonable', () => {
    const normal = card('queen', 'spades')
    const state = stateFor({ hand: [joker(), normal, card('four', 'hearts')] })

    expect(chooseBestDiscard(state, 'player-2')?.card).not.toBe(joker())
    expect(chooseBestDiscard(state, 'player-2')?.card).toBe(normal)
  })

  it('prefers shedding a high-value card with equally low future utility', () => {
    const highValue = card('ace', 'spades')
    const state = stateFor({
      hand: [card('three', 'clubs'), highValue, card('six', 'hearts')],
    })

    expect(chooseBestDiscard(state, 'player-2')?.card).toBe(highValue)
  })

  it('avoids feeding an opponent visible meld when alternatives are otherwise equal', () => {
    const opponentMeld = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    const risky = card('seven', 'spades')
    const safe = card('eight', 'spades')
    const base = stateFor({ hand: [risky, safe, card('three', 'clubs')] })
    const state: InProgressGameState = {
      ...base,
      teams: base.teams.map((team) => team.id === 'team-1'
        ? { ...team, melds: [opponentMeld] }
        : team),
    }

    expect(chooseBestDiscard(state, 'player-2')?.card).toBe(safe)
  })
})
