import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Rank, Suit } from '../cards/types'
import { validateMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TeamId } from '../state/types'
import { GameRuleError, type GameErrorCode } from './errors'
import { dealInitialState, getPlayer } from './startGame'
import { playMeld } from './playMeld'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

const stateFor = (
  hand: readonly Card[],
  playerId: PlayerId = 'player-1',
  phase: 'mustDraw' | 'action' = 'action',
): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => player.id === playerId ? { ...player, hand } : player),
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

describe('playMeld', () => {
  it('plays a valid group for the player team and removes only its physical cards', () => {
    const group = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const untouched = card('king', 'spades')
    const state = stateFor([...group, untouched])

    const next = playMeld(state, 'player-1', group.map(({ id }) => id))

    expect(getPlayer(next, 'player-1').hand).toEqual([untouched])
    expect(teamById(next, 'team-1').melds).toHaveLength(1)
    expect(teamById(next, 'team-1').melds[0]).toMatchObject({ type: 'group', rank: 'seven' })
    expect(teamById(next, 'team-2').melds).toEqual([])
  })

  it('distinguishes equivalent faces by physical card ID', () => {
    const retainedCopy = card('seven', 'clubs', 1)
    const playedCopy = card('seven', 'clubs', 2)
    const playedCards = [playedCopy, card('seven', 'diamonds'), card('seven', 'hearts')]
    const state = stateFor([retainedCopy, ...playedCards])

    const next = playMeld(state, 'player-1', playedCards.map(({ id }) => id))
    const storedCardIds = teamById(next, 'team-1').melds[0]!.cards.map(({ card: placed }) => placed.id)

    expect(getPlayer(next, 'player-1').hand).toEqual([retainedCopy])
    expect(storedCardIds).toContain(playedCopy.id)
    expect(storedCardIds).not.toContain(retainedCopy.id)
  })

  it('plays a valid sequence and preserves the action turn', () => {
    const sequence = [card('five', 'spades'), card('three', 'spades'), card('four', 'spades')]
    const state = stateFor(sequence)

    const next = playMeld(state, 'player-1', sequence.map(({ id }) => id))

    expect(teamById(next, 'team-1').melds[0]).toMatchObject({ type: 'sequence', suit: 'spades' })
    expect(next.round.turn).toEqual(state.round.turn)
    expect(next.round.turn.phase).toBe('action')
  })

  it('stores the validator result including wildcard role and represented rank', () => {
    const wild = joker()
    const cards = [card('three', 'spades'), wild, card('five', 'spades')]
    const expected = validateMeld(cards)
    if (!expected.valid) throw new Error('Expected the test meld to be valid')

    const next = playMeld(stateFor(cards), 'player-1', cards.map(({ id }) => id))
    const stored = teamById(next, 'team-1').melds[0]!

    expect(stored).toEqual(expected.meld)
    expect(stored.activeWildcard).toEqual({ card: wild, role: 'wildcard', representedRank: 'four' })
  })

  it('puts both partners contributions in their shared team meld collection', () => {
    const existingCards = [card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts')]
    const existing = validateMeld(existingCards)
    if (!existing.valid) throw new Error('Expected the existing test meld to be valid')
    const partnerCards = [card('jack', 'clubs'), card('jack', 'diamonds'), card('jack', 'hearts')]
    const base = stateFor(partnerCards, 'player-3')
    const state: InProgressGameState = {
      ...base,
      teams: base.teams.map((team) => team.id === 'team-1'
        ? { ...team, melds: [existing.meld] }
        : team),
    }

    const next = playMeld(state, 'player-3', partnerCards.map(({ id }) => id))

    expect(getPlayer(next, 'player-1').teamId).toBe('team-1')
    expect(getPlayer(next, 'player-3').teamId).toBe('team-1')
    expect(teamById(next, 'team-1').melds).toHaveLength(2)
    expect(teamById(next, 'team-1').melds[0]).toBe(existing.meld)
    expect(teamById(next, 'team-2')).toBe(teamById(state, 'team-2'))
  })

  it.each([
    {
      name: 'an invalid combination',
      code: 'INVALID_MELD' as const,
      makeState: () => stateFor([card('three', 'spades'), card('seven', 'hearts'), card('king', 'clubs')]),
      playerId: 'player-1' as const,
      ids: [card('three', 'spades').id, card('seven', 'hearts').id, card('king', 'clubs').id],
    },
    {
      name: 'a card outside the hand',
      code: 'CARD_NOT_IN_HAND' as const,
      makeState: () => stateFor([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]),
      playerId: 'player-1' as const,
      ids: [card('seven', 'clubs').id, card('seven', 'diamonds').id, card('seven', 'spades').id],
    },
    {
      name: 'the same physical card more than once',
      code: 'DUPLICATE_CARD_ID' as const,
      makeState: () => stateFor([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]),
      playerId: 'player-1' as const,
      ids: [card('seven', 'clubs').id, card('seven', 'clubs').id, card('seven', 'hearts').id],
    },
    {
      name: 'a non-current player',
      code: 'NOT_CURRENT_PLAYER' as const,
      makeState: () => stateFor([card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]),
      playerId: 'player-2' as const,
      ids: [card('seven', 'clubs').id, card('seven', 'diamonds').id, card('seven', 'hearts').id],
    },
    {
      name: 'the draw phase',
      code: 'INVALID_TURN_PHASE' as const,
      makeState: () => stateFor(
        [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')],
        'player-1',
        'mustDraw',
      ),
      playerId: 'player-1' as const,
      ids: [card('seven', 'clubs').id, card('seven', 'diamonds').id, card('seven', 'hearts').id],
    },
  ])('rejects $name atomically', ({ code, makeState, playerId, ids }) => {
    const state = makeState()
    const before = structuredClone(state)

    expectRuleError(() => playMeld(state, playerId, ids), code)

    expect(state).toEqual(before)
  })

  it('leaves the previous hand and table intact while updating only the new state', () => {
    const cards = [card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts')]
    const untouched = card('ace', 'spades')
    const state = stateFor([...cards, untouched])
    const oldHand = getPlayer(state, 'player-1').hand
    const oldTeamMelds = teamById(state, 'team-1').melds

    const next = playMeld(state, 'player-1', cards.map(({ id }) => id))

    expect(getPlayer(state, 'player-1').hand).toBe(oldHand)
    expect(getPlayer(state, 'player-1').hand).toEqual([...cards, untouched])
    expect(teamById(state, 'team-1').melds).toBe(oldTeamMelds)
    expect(teamById(state, 'team-1').melds).toEqual([])
    expect(getPlayer(next, 'player-1').hand).toEqual([untouched])
    expect(teamById(next, 'team-1').melds).toHaveLength(1)
  })
})
