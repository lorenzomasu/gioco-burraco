import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { classifyBurraco, validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TeamId } from '../state/types'
import { GameRuleError, type GameErrorCode } from './errors'
import { extendMeld } from './extendMeld'
import { playMeld } from './playMeld'
import { dealInitialState, getPlayer } from './startGame'
import { discardCard, drawCard, takeDiscardPile } from './turn'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const cleanBurraco = (): ValidatedMeld => validatedMeld([
  card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
  card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'), card('nine', 'spades'),
])

const semiCleanBurraco = (): ValidatedMeld => validatedMeld([
  card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts'),
  card('six', 'hearts'), card('seven', 'hearts'), card('eight', 'hearts'), card('nine', 'hearts'), joker(),
])

const dirtyBurraco = (): ValidatedMeld => validatedMeld([
  card('three', 'diamonds'), card('four', 'diamonds'), joker(), card('six', 'diamonds'),
  card('seven', 'diamonds'), card('eight', 'diamonds'), card('nine', 'diamonds'),
])

const pozzettiExcluding = (...groups: readonly (readonly Card[])[]): readonly [Pozzetto, Pozzetto] => {
  const excludedIds = new Set(groups.flat().map(({ id }) => id))
  const available = deck.filter(({ id }) => !excludedIds.has(id))
  return [available.slice(0, 11), available.slice(11, 22)]
}

const stateFor = ({
  hand,
  melds = [cleanBurraco()],
  playerId = 'player-1',
  hasTakenPozzetto = true,
  discardPile = [],
}: {
  hand: readonly Card[]
  melds?: readonly ValidatedMeld[]
  playerId?: PlayerId
  hasTakenPozzetto?: boolean
  discardPile?: readonly Card[]
}): InProgressGameState => {
  const initial = dealInitialState(deck)
  const teamId = getPlayer(initial, playerId).teamId
  const meldCards = melds.flatMap((meld) => meld.cards.map((placement) => placement.card))

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
    drawPile: [],
    discardPile,
    pozzetti: pozzettiExcluding(hand, meldCards, discardPile),
    round: {
      status: 'in-progress',
      turn: {
        currentPlayerId: playerId,
        phase: 'action',
        acquisition: { source: 'drawPile', cardIds: [] },
      },
    },
  }
}

const teamById = (state: GameState, teamId: TeamId) =>
  state.teams.find((team) => team.id === teamId)!

const cardsInState = (state: GameState): readonly Card[] => [
  ...state.players.flatMap((player) => player.hand),
  ...state.teams.flatMap((team) =>
    team.melds.flatMap((meld) => meld.cards.map((placement) => placement.card)),
  ),
  ...state.drawPile,
  ...state.discardPile,
  ...state.pozzetti.flat(),
]

const expectRuleError = (action: () => unknown, code: GameErrorCode): void => {
  try {
    action()
    throw new Error('Expected a GameRuleError')
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError)
    expect(error).toMatchObject({ code })
  }
}

describe('round closure', () => {
  it.each([
    ['clean', cleanBurraco],
    ['semi-clean', semiCleanBurraco],
    ['dirty', dirtyBurraco],
  ] as const)('closes immutably with a %s Burraco and a normal final discard', (classification, makeMeld) => {
    const finalCard = card('king', 'clubs')
    const meld = makeMeld()
    expect(classifyBurraco(meld)).toBe(classification)
    const state = stateFor({ hand: [finalCard], melds: [meld] })
    const before = structuredClone(state)

    const next = discardCard(state, 'player-1', finalCard.id)

    expect(getPlayer(next, 'player-1').hand).toEqual([])
    expect(next.discardPile).toEqual([finalCard])
    expect(next.round).toEqual({
      status: 'completed',
      closedByPlayerId: 'player-1',
      closingTeamId: 'team-1',
    })
    expect(state).toEqual(before)
  })

  it('derives the closing team from the player who closes', () => {
    const finalCard = card('queen', 'clubs')
    const state = stateFor({ hand: [finalCard], playerId: 'player-2' })

    const next = discardCard(state, 'player-2', finalCard.id)

    expect(next.round).toEqual({
      status: 'completed',
      closedByPlayerId: 'player-2',
      closingTeamId: 'team-2',
    })
  })

  it('rejects closing without a Burraco and leaves the full state unchanged', () => {
    const finalCard = card('king', 'clubs')
    const shortMeld = validatedMeld([
      card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
    ])
    expect(classifyBurraco(shortMeld)).toBe('none')
    const state = stateFor({ hand: [finalCard], melds: [shortMeld] })
    const before = structuredClone(state)

    expectRuleError(
      () => discardCard(state, 'player-1', finalCard.id),
      'CANNOT_CLOSE_WITHOUT_BURRACO',
    )
    expect(state).toEqual(before)
  })

  it.each([
    ['a joker', joker()],
    ['a physical two used as the final discard', card('two', 'clubs')],
  ])('rejects closing with %s and leaves the full state unchanged', (_, finalCard) => {
    const state = stateFor({ hand: [finalCard] })
    const before = structuredClone(state)

    expectRuleError(
      () => discardCard(state, 'player-1', finalCard.id),
      'CANNOT_CLOSE_WITH_WILDCARD',
    )
    expect(state).toEqual(before)
  })

  it.each([
    ['a joker', joker()],
    ['a physical two used as the final discard', card('two', 'clubs')],
  ])('prioritizes the wildcard error for %s even without a Burraco', (_, finalCard) => {
    const state = stateFor({ hand: [finalCard], melds: [] })
    const before = structuredClone(state)

    expectRuleError(
      () => discardCard(state, 'player-1', finalCard.id),
      'CANNOT_CLOSE_WITH_WILDCARD',
    )
    expect(state).toEqual(before)
  })

  it.each([
    ['a joker', joker()],
    ['a pinella', card('two', 'clubs')],
    ['an ordinary card', card('king', 'clubs')],
  ])('keeps the M7 pozzetto-with-discard behavior for %s', (_, finalCard) => {
    const state = stateFor({ hand: [finalCard], melds: [], hasTakenPozzetto: false })
    const firstPozzetto = state.pozzetti[0]

    const next = discardCard(state, 'player-1', finalCard.id)

    expect(next.round.status).toBe('in-progress')
    if (next.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
    expect(next.round.turn).toEqual({ currentPlayerId: 'player-2', phase: 'mustDraw' })
    expect(next.discardPile).toEqual([finalCard])
    expect(getPlayer(next, 'player-1').hand).toEqual(firstPozzetto)
    expect(teamById(next, 'team-1').hasTakenPozzetto).toBe(true)
  })

  it('allows a normal wildcard discard when cards remain in the second hand', () => {
    const wild = joker()
    const retained = card('king', 'clubs')
    const state = stateFor({ hand: [wild, retained] })

    const next = discardCard(state, 'player-1', wild.id)

    expect(next.round.status).toBe('in-progress')
    expect(getPlayer(next, 'player-1').hand).toEqual([retained])
    expect(next.discardPile).toEqual([wild])
  })

  it('rejects playing the whole second hand as a new meld', () => {
    const hand = [card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts')]
    const state = stateFor({ hand })
    const before = structuredClone(state)

    expectRuleError(
      () => playMeld(state, 'player-1', hand.map(({ id }) => id)),
      'CANNOT_CLOSE_WITHOUT_DISCARD',
    )
    expect(state).toEqual(before)
  })

  it('rejects extending a meld with the whole second hand', () => {
    const existing = validatedMeld([
      card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts'),
    ])
    const addition = card('seven', 'spades')
    const state = stateFor({ hand: [addition], melds: [existing] })
    const before = structuredClone(state)

    expectRuleError(
      () => extendMeld(state, 'player-1', 0, [addition.id]),
      'CANNOT_CLOSE_WITHOUT_DISCARD',
    )
    expect(state).toEqual(before)
  })

  it('rejects every gameplay command after the round is completed', () => {
    const finalCard = card('king', 'clubs')
    const completed = discardCard(stateFor({ hand: [finalCard] }), 'player-1', finalCard.id)
    const before = structuredClone(completed)
    const commands = [
      () => drawCard(completed, 'player-1'),
      () => takeDiscardPile(completed, 'player-1'),
      () => discardCard(completed, 'player-1', finalCard.id),
      () => playMeld(completed, 'player-1', []),
      () => extendMeld(completed, 'player-1', 0, []),
    ]

    for (const command of commands) expectRuleError(command, 'ROUND_COMPLETED')
    expect(completed).toEqual(before)
  })

  it('preserves every unique physical card across a valid closure', () => {
    const finalCard = card('king', 'clubs')
    const previousDiscard = card('ace', 'clubs')
    const state = stateFor({ hand: [finalCard], discardPile: [previousDiscard] })
    const beforeCards = cardsInState(state)
    const beforeIds = beforeCards.map(({ id }) => id).sort()

    const next = discardCard(state, 'player-1', finalCard.id)
    const afterCards = cardsInState(next)
    const finalCardOccurrences = next.discardPile.filter(({ id }) => id === finalCard.id)

    expect(new Set(beforeIds).size).toBe(beforeIds.length)
    expect(afterCards.map(({ id }) => id).sort()).toEqual(beforeIds)
    expect(new Set(afterCards.map(({ id }) => id)).size).toBe(afterCards.length)
    expect(finalCardOccurrences).toEqual([finalCard])
  })
})
