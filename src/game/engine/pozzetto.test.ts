import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TeamId, TurnAcquisition } from '../state/types'
import { extendMeld } from './extendMeld'
import { playMeld } from './playMeld'
import { dealInitialState, getPlayer } from './startGame'
import { discardCard } from './turn'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

/** A stock above the unplayable threshold, so ordinary discards keep the round in progress. */
const playableDrawPile = (): readonly Card[] => [
  card('king', 'clubs', 2), card('queen', 'diamonds', 2), card('jack', 'hearts', 2),
]

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const pozzettiExcluding = (...groups: readonly (readonly Card[])[]): readonly [Pozzetto, Pozzetto] => {
  const excludedIds = new Set(groups.flat().map(({ id }) => id))
  const available = deck.filter(({ id }) => !excludedIds.has(id))
  return [available.slice(0, 11), available.slice(11, 22)]
}

const stateFor = ({
  hand,
  playerId = 'player-1',
  melds = [],
  pozzetti = pozzettiExcluding(hand, ...melds.map((meld) => meld.cards.map(({ card: placed }) => placed))),
  hasTakenPozzetto = false,
  discardPile = [],
  acquisition = { source: 'drawPile' as const, cardIds: [] },
}: {
  hand: readonly Card[]
  playerId?: PlayerId
  melds?: readonly ValidatedMeld[]
  pozzetti?: readonly [Pozzetto, Pozzetto]
  hasTakenPozzetto?: boolean
  discardPile?: readonly Card[]
  acquisition?: TurnAcquisition
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
    drawPile: playableDrawPile(),
    discardPile,
    pozzetti,
    round: {
      ...initial.round,
      turn: { currentPlayerId: playerId, phase: 'action', acquisition },
    },
  }
}

const teamById = (state: GameState, teamId: TeamId) => state.teams.find((team) => team.id === teamId)!

const cardsInState = (state: GameState): readonly Card[] => [
  ...state.players.flatMap((player) => player.hand),
  ...state.teams.flatMap((team) => team.melds.flatMap((meld) => meld.cards.map(({ card: placed }) => placed))),
  ...state.drawPile,
  ...state.discardPile,
  ...state.pozzetti.flat(),
]

describe('pozzetto lifecycle', () => {
  it('takes the first available pozzetto immediately after playing the entire first hand', () => {
    const hand = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const state = stateFor({ hand })
    const before = structuredClone(state)
    const firstPozzetto = state.pozzetti[0]

    const next = playMeld(state, 'player-1', hand.map(({ id }) => id))

    expect(getPlayer(next, 'player-1').hand).toEqual(firstPozzetto)
    expect(getPlayer(next, 'player-1').hand.every((placed, index) => placed === firstPozzetto[index])).toBe(true)
    expect(next.pozzetti).toEqual([[], state.pozzetti[1]])
    expect(teamById(next, 'team-1').hasTakenPozzetto).toBe(true)
    expect(next.round.turn).toBe(state.round.turn)
    expect(next.round.turn).toEqual({
      currentPlayerId: 'player-1',
      phase: 'action',
      acquisition: { source: 'drawPile', cardIds: [] },
    })
    expect(state).toEqual(before)
  })

  it('takes a pozzetto al volo after extending a meld with every residual hand card', () => {
    const existing = validatedMeld([
      card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'),
    ])
    const addition = card('nine', 'spades')
    const state = stateFor({ hand: [addition], melds: [existing] })
    const firstPozzetto = state.pozzetti[0]

    const next = extendMeld(state, 'player-1', 0, [addition.id])

    expect(getPlayer(next, 'player-1').hand).toEqual(firstPozzetto)
    expect(teamById(next, 'team-1').melds[0]!.cards).toHaveLength(4)
    expect(teamById(next, 'team-1').hasTakenPozzetto).toBe(true)
    expect(next.pozzetti).toEqual([[], state.pozzetti[1]])
    expect(next.round.turn).toBe(state.round.turn)
  })

  it('takes a pozzetto with the discard and ends the turn normally', () => {
    const lastCard = card('king', 'spades')
    const previousDiscard = card('ace', 'hearts')
    const state = stateFor({ hand: [lastCard], discardPile: [previousDiscard] })
    const before = structuredClone(state)
    const firstPozzetto = state.pozzetti[0]

    const next = discardCard(state, 'player-1', lastCard.id)

    expect(next.discardPile).toEqual([previousDiscard, lastCard])
    expect(next.discardPile.at(-1)).toBe(lastCard)
    expect(getPlayer(next, 'player-1').hand).toEqual(firstPozzetto)
    expect(teamById(next, 'team-1').hasTakenPozzetto).toBe(true)
    expect(next.pozzetti).toEqual([[], state.pozzetti[1]])
    expect(next.round.status).toBe('in-progress')
    if (next.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
    expect(next.round.turn).toEqual({ currentPlayerId: 'player-2', phase: 'mustDraw' })
    expect(state).toEqual(before)
  })

  it.each([
    ['a joker', joker()],
    ['a pinella', card('two', 'clubs')],
  ])('allows taking the pozzetto by discarding %s', (_, lastCard) => {
    const state = stateFor({ hand: [lastCard] })

    const next = discardCard(state, 'player-1', lastCard.id)

    expect(next.discardPile).toEqual([lastCard])
    expect(getPlayer(next, 'player-1').hand).toEqual(state.pozzetti[0])
    expect(teamById(next, 'team-1').hasTakenPozzetto).toBe(true)
  })

  it('rejects emptying the second hand through a meld instead of a final discard', () => {
    const hand = [card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts')]
    const state = stateFor({ hand, playerId: 'player-3', hasTakenPozzetto: true })
    const before = structuredClone(state)

    expect(() => playMeld(state, 'player-3', hand.map(({ id }) => id))).toThrowError(
      expect.objectContaining({ code: 'CANNOT_CLOSE_WITHOUT_DISCARD' }),
    )

    expect(state).toEqual(before)
  })

  it('assigns the remaining pozzetto to the second team to finish its first hand', () => {
    const team1Hand = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
    const team2Hand = [card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts')]
    const pozzetti = pozzettiExcluding(team1Hand, team2Hand)
    const initial = stateFor({ hand: team1Hand, pozzetti })
    const afterTeam1 = playMeld(initial, 'player-1', team1Hand.map(({ id }) => id))
    const team2Turn: InProgressGameState = {
      ...afterTeam1,
      players: afterTeam1.players.map((player) => player.id === 'player-2'
        ? { ...player, hand: team2Hand }
        : player),
      round: {
        ...afterTeam1.round,
        turn: {
          currentPlayerId: 'player-2',
          phase: 'action',
          acquisition: { source: 'drawPile', cardIds: [] },
        },
      },
    }

    const afterTeam2 = playMeld(team2Turn, 'player-2', team2Hand.map(({ id }) => id))

    expect(getPlayer(afterTeam1, 'player-1').hand).toEqual(pozzetti[0])
    expect(getPlayer(afterTeam2, 'player-2').hand).toEqual(pozzetti[1])
    expect(afterTeam2.pozzetti).toEqual([[], []])
    expect(afterTeam2.teams.map(({ hasTakenPozzetto }) => hasTakenPozzetto)).toEqual([true, true])
  })

  it('does not take a pozzetto while cards remain in hand', () => {
    const meldCards = [card('jack', 'clubs'), card('jack', 'diamonds'), card('jack', 'hearts')]
    const retained = card('ace', 'spades')
    const state = stateFor({ hand: [...meldCards, retained] })

    const next = playMeld(state, 'player-1', meldCards.map(({ id }) => id))

    expect(getPlayer(next, 'player-1').hand).toEqual([retained])
    expect(next.pozzetti).toBe(state.pozzetti)
    expect(next.teams.find((team) => team.id === 'team-1')?.hasTakenPozzetto).toBe(false)
  })

  it('leaves hand, teams, pozzetti and turn untouched after an invalid playMeld', () => {
    const hand = [card('three', 'spades'), card('seven', 'hearts'), card('king', 'clubs')]
    const state = stateFor({ hand })
    const before = structuredClone(state)

    expect(() => playMeld(state, 'player-1', hand.map(({ id }) => id))).toThrow()

    expect(state).toEqual(before)
  })

  it('leaves hand, teams, pozzetti and turn untouched after an invalid extendMeld', () => {
    const existing = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    const invalidAddition = card('eight', 'spades')
    const state = stateFor({ hand: [invalidAddition], melds: [existing] })
    const before = structuredClone(state)

    expect(() => extendMeld(state, 'player-1', 0, [invalidAddition.id])).toThrow()

    expect(state).toEqual(before)
  })

  it('does not take a pozzetto when the collected single card cannot be rediscarded', () => {
    const collected = card('five', 'clubs')
    const state = stateFor({
      hand: [collected],
      acquisition: {
        source: 'discardPile',
        cardIds: [collected.id],
        canRediscardSingleCollectedCard: false,
      },
    })
    const before = structuredClone(state)

    expect(() => discardCard(state, 'player-1', collected.id)).toThrowError(
      expect.objectContaining({ code: 'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD' }),
    )
    expect(state).toEqual(before)
  })

  it('preserves every unique physical card across an immutable pozzetto transition', () => {
    const hand = [card('ten', 'clubs'), card('ten', 'diamonds'), card('ten', 'hearts')]
    const state = stateFor({ hand })
    const beforeCards = cardsInState(state)
    const beforeIds = beforeCards.map(({ id }) => id).sort()
    const snapshot = structuredClone(state)

    const next = playMeld(state, 'player-1', hand.map(({ id }) => id))
    const afterCards = cardsInState(next)

    expect(new Set(beforeIds).size).toBe(beforeIds.length)
    expect(afterCards.map(({ id }) => id).sort()).toEqual(beforeIds)
    expect(new Set(afterCards.map(({ id }) => id)).size).toBe(afterCards.length)
    expect(state).toEqual(snapshot)
  })

  it('surfaces an impossible missing-pozzetto state as an internal invariant violation', () => {
    const hand = [card('six', 'clubs'), card('six', 'diamonds'), card('six', 'hearts')]
    const state = stateFor({ hand, pozzetti: [[], []] })
    const before = structuredClone(state)

    expect(() => playMeld(state, 'player-1', hand.map(({ id }) => id))).toThrow(
      'Invariant violation: no pozzetto is available for team team-1.',
    )
    expect(state).toEqual(before)
  })
})
