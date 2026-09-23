import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Rank, Suit } from '../cards/types'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, PlayerId, TeamId } from '../state/types'
import { GameRuleError, type GameErrorCode } from './errors'
import { extendMeld } from './extendMeld'
import { dealInitialState, getPlayer } from './startGame'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (deckNumber: 1 | 2 = 1, occurrence = 0): Card =>
  deck.filter((candidate) => candidate.rank === 'joker' && candidate.deckNumber === deckNumber)[occurrence]!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const stateFor = (
  hand: readonly Card[],
  melds: readonly ValidatedMeld[],
  playerId: PlayerId = 'player-1',
  phase: 'mustDraw' | 'action' = 'action',
): GameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === playerId ? { ...player, hand } : player),
    teams: initial.teams.map((team) => team.id === getPlayer(initial, playerId).teamId
      ? { ...team, melds }
      : team),
    round: {
      ...initial.round,
      turn: phase === 'action'
        ? { currentPlayerId: playerId, phase, acquisition: { source: 'drawPile', cardIds: [] } }
        : { currentPlayerId: playerId, phase },
    },
  }
}

const teamById = (state: GameState, teamId: TeamId) => state.teams.find((team) => team.id === teamId)!

const expectRuleError = (action: () => unknown, code: GameErrorCode): void => {
  try {
    action()
    throw new Error('Expected a GameRuleError')
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError)
    expect(error).toMatchObject({ code })
  }
}

describe('extendMeld', () => {
  it('extends a group with one natural and removes only that physical card', () => {
    const existing = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    const added = card('seven', 'spades', 2)
    const equivalentRetained = card('seven', 'spades', 1)
    const untouched = card('king', 'clubs')
    const state = stateFor([equivalentRetained, added, untouched], [existing])

    const next = extendMeld(state, 'player-1', 0, [added.id])
    const extended = teamById(next, 'team-1').melds[0]!

    expect(getPlayer(next, 'player-1').hand).toEqual([equivalentRetained, untouched])
    expect(extended).toMatchObject({ type: 'group', rank: 'seven' })
    expect(extended.cards.find((placement) => placement.card.id === added.id)?.card).toBe(added)
    expect(extended.cards.some((placement) => placement.card.id === equivalentRetained.id)).toBe(false)
  })

  it.each([
    ['lower', card('four', 'spades'), ['four', 'five', 'six', 'seven']],
    ['upper', card('eight', 'spades'), ['five', 'six', 'seven', 'eight']],
  ] as const)('extends a sequence at the %s end', (_, added, expectedRanks) => {
    const existing = validatedMeld([
      card('five', 'spades'), card('six', 'spades'), card('seven', 'spades'),
    ])
    const next = extendMeld(stateFor([added], [existing]), 'player-1', 0, [added.id])
    const extended = teamById(next, 'team-1').melds[0]!

    expect(extended.cards.map((placement) => placement.role === 'natural'
      ? placement.card.rank
      : placement.representedRank)).toEqual(expectedRanks)
  })

  it('extends a meld with multiple cards in one atomic command', () => {
    const existing = validatedMeld([
      card('six', 'hearts'), card('seven', 'hearts'), card('eight', 'hearts'),
    ])
    const additions = [card('four', 'hearts'), card('five', 'hearts'), card('nine', 'hearts')]

    const next = extendMeld(stateFor(additions, [existing]), 'player-1', 0, additions.map(({ id }) => id))

    expect(getPlayer(next, 'player-1').hand).toEqual([])
    expect(teamById(next, 'team-1').melds[0]!.cards).toHaveLength(6)
  })

  it('lets a player extend a shared meld originally supplied by their teammate', () => {
    const shared = validatedMeld([
      card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'),
    ])
    const addition = card('nine', 'spades')
    const state = stateFor([addition], [shared], 'player-3')

    const next = extendMeld(state, 'player-3', 0, [addition.id])

    expect(getPlayer(next, 'player-1').teamId).toBe(getPlayer(next, 'player-3').teamId)
    expect(teamById(next, 'team-1').melds[0]!.cards).toHaveLength(4)
    expect(teamById(next, 'team-2')).toBe(teamById(state, 'team-2'))
  })

  it('replaces only the selected meld and preserves all other meld references', () => {
    const first = validatedMeld([
      card('four', 'clubs'), card('four', 'diamonds'), card('four', 'hearts'),
    ])
    const selected = validatedMeld([
      card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts'),
    ])
    const last = validatedMeld([
      card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'),
    ])
    const addition = card('queen', 'spades')
    const state = stateFor([addition], [first, selected, last])

    const next = extendMeld(state, 'player-1', 1, [addition.id])
    const melds = teamById(next, 'team-1').melds

    expect(melds[0]).toBe(first)
    expect(melds[1]).not.toBe(selected)
    expect(melds[2]).toBe(last)
  })

  it('stores exactly the complete result returned by revalidating every physical card', () => {
    const originalCards = [card('three', 'diamonds'), card('four', 'diamonds'), card('five', 'diamonds')]
    const additions = [card('six', 'diamonds'), card('seven', 'diamonds')]
    const expected = validateMeld([...originalCards, ...additions])
    if (!expected.valid) throw new Error('Expected a valid extension')
    const state = stateFor(additions, [validatedMeld(originalCards)])

    const next = extendMeld(state, 'player-1', 0, additions.map(({ id }) => id))

    expect(teamById(next, 'team-1').melds[0]).toEqual(expected.meld)
  })

  it('allows full revalidation to recalculate an existing wildcard represented rank', () => {
    const wild = joker()
    const existing = validatedMeld([card('three', 'clubs'), wild, card('five', 'clubs')])
    expect(existing.activeWildcard?.representedRank).toBe('four')
    const naturalFour = card('four', 'clubs')

    const next = extendMeld(stateFor([naturalFour], [existing]), 'player-1', 0, [naturalFour.id])
    const extended = teamById(next, 'team-1').melds[0]!

    expect(extended.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'two' })
    expect(extended.activeWildcard?.card).toBe(wild)
    expect(extended.cards.find((placement) => placement.card.id === naturalFour.id)?.role).toBe('natural')
  })

  it('keeps the current action turn and its acquisition data unchanged', () => {
    const existing = validatedMeld([
      card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts'),
    ])
    const addition = card('ten', 'spades')
    const state = stateFor([addition], [existing])

    const next = extendMeld(state, 'player-1', 0, [addition.id])

    expect(next.round).toBe(state.round)
    expect(next.round.turn).toBe(state.round.turn)
    expect(next.round.turn.phase).toBe('action')
  })

  it.each([
    {
      name: 'a non-current player',
      code: 'NOT_CURRENT_PLAYER' as const,
      build: () => {
        const existing = validatedMeld([
          card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
        ])
        const addition = card('seven', 'spades')
        return { state: stateFor([addition], [existing]), playerId: 'player-2' as const, index: 0, ids: [addition.id] }
      },
    },
    {
      name: 'the draw phase',
      code: 'INVALID_TURN_PHASE' as const,
      build: () => {
        const existing = validatedMeld([
          card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
        ])
        const addition = card('seven', 'spades')
        return {
          state: stateFor([addition], [existing], 'player-1', 'mustDraw'),
          playerId: 'player-1' as const,
          index: 0,
          ids: [addition.id],
        }
      },
    },
    {
      name: 'an empty card selection',
      code: 'EMPTY_CARD_SELECTION' as const,
      build: () => ({
        state: stateFor([], [validatedMeld([
          card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
        ])]),
        playerId: 'player-1' as const,
        index: 0,
        ids: [],
      }),
    },
    {
      name: 'a card outside the hand',
      code: 'CARD_NOT_IN_HAND' as const,
      build: () => ({
        state: stateFor([], [validatedMeld([
          card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
        ])]),
        playerId: 'player-1' as const,
        index: 0,
        ids: [card('seven', 'spades').id],
      }),
    },
    {
      name: 'the same physical card twice',
      code: 'DUPLICATE_CARD_ID' as const,
      build: () => {
        const addition = card('seven', 'spades')
        return {
          state: stateFor([addition], [validatedMeld([
            card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
          ])]),
          playerId: 'player-1' as const,
          index: 0,
          ids: [addition.id, addition.id],
        }
      },
    },
    {
      name: 'an invalid group extension',
      code: 'INVALID_MELD' as const,
      build: () => {
        const addition = card('eight', 'spades')
        return {
          state: stateFor([addition], [validatedMeld([
            card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
          ])]),
          playerId: 'player-1' as const,
          index: 0,
          ids: [addition.id],
        }
      },
    },
    {
      name: 'an invalid sequence extension',
      code: 'INVALID_MELD' as const,
      build: () => {
        const addition = card('nine', 'spades')
        return {
          state: stateFor([addition], [validatedMeld([
            card('four', 'spades'), card('five', 'spades'), card('six', 'spades'),
          ])]),
          playerId: 'player-1' as const,
          index: 0,
          ids: [addition.id],
        }
      },
    },
    {
      name: 'an extension with too many active wildcards',
      code: 'INVALID_MELD' as const,
      build: () => {
        const secondWild = card('two', 'hearts')
        return {
          state: stateFor([secondWild], [validatedMeld([
            card('three', 'spades'), card('four', 'spades'), joker(),
          ])]),
          playerId: 'player-1' as const,
          index: 0,
          ids: [secondWild.id],
        }
      },
    },
    {
      name: 'an invalid multi-card extension',
      code: 'INVALID_MELD' as const,
      build: () => {
        const additions = [card('three', 'diamonds'), card('nine', 'diamonds')]
        return {
          state: stateFor(additions, [validatedMeld([
            card('five', 'diamonds'), card('six', 'diamonds'), card('seven', 'diamonds'),
          ])]),
          playerId: 'player-1' as const,
          index: 0,
          ids: additions.map(({ id }) => id),
        }
      },
    },
  ])('rejects $name atomically', ({ code, build }) => {
    const { state, playerId, index, ids } = build()
    const before = structuredClone(state)
    const oldPlayers = state.players
    const oldTeams = state.teams

    expectRuleError(() => extendMeld(state, playerId, index, ids), code)

    expect(state).toEqual(before)
    expect(state.players).toBe(oldPlayers)
    expect(state.teams).toBe(oldTeams)
  })

  it.each([-1, 1, 0.5, Number.NaN])('rejects nonexistent meld index %s explicitly', (index) => {
    const existing = validatedMeld([
      card('king', 'clubs'), card('king', 'diamonds'), card('king', 'hearts'),
    ])
    const addition = card('king', 'spades')
    const state = stateFor([addition], [existing])

    expectRuleError(() => extendMeld(state, 'player-1', index, [addition.id]), 'MELD_NOT_FOUND')
    expect(getPlayer(state, 'player-1').hand).toEqual([addition])
    expect(teamById(state, 'team-1').melds[0]).toBe(existing)
  })

  it('updates only the new state while preserving the original arrays and meld', () => {
    const existing = validatedMeld([
      card('jack', 'clubs'), card('jack', 'diamonds'), card('jack', 'hearts'),
    ])
    const addition = card('jack', 'spades')
    const untouched = card('ace', 'clubs')
    const state = stateFor([addition, untouched], [existing])
    const oldHand = getPlayer(state, 'player-1').hand
    const oldMelds = teamById(state, 'team-1').melds

    const next = extendMeld(state, 'player-1', 0, [addition.id])

    expect(getPlayer(state, 'player-1').hand).toBe(oldHand)
    expect(getPlayer(state, 'player-1').hand).toEqual([addition, untouched])
    expect(teamById(state, 'team-1').melds).toBe(oldMelds)
    expect(teamById(state, 'team-1').melds[0]).toBe(existing)
    expect(getPlayer(next, 'player-1').hand).toEqual([untouched])
    expect(teamById(next, 'team-1').melds[0]).not.toBe(existing)
  })
})
