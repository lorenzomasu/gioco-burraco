import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Rank, Suit } from '../cards/types'
import { classifyBurraco, validateMeld, type ValidatedMeld } from '../melds'
import type { CompletedGameState, PlayerId, TeamId } from '../state/types'
import { calculateRoundScore } from './calculateRoundScore'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (deckNumber: 1 | 2 = 1, jokerNumber = 1): Card =>
  deck.find((candidate) => candidate.id === `deck-${deckNumber}-joker-${jokerNumber}`)!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const sequence = (ranks: readonly Rank[], suit: Suit): ValidatedMeld =>
  validatedMeld(ranks.map((rank) => card(rank, suit)))

const noneMeld = (): ValidatedMeld => sequence(['three', 'four', 'five'], 'clubs')
const cleanBurraco = (): ValidatedMeld =>
  sequence(['three', 'four', 'five', 'six', 'seven', 'eight', 'nine'], 'spades')
const semiCleanBurraco = (): ValidatedMeld => validatedMeld([
  card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts'),
  card('six', 'hearts'), card('seven', 'hearts'), card('eight', 'hearts'),
  card('nine', 'hearts'), joker(1, 1),
])
const dirtyBurraco = (): ValidatedMeld => validatedMeld([
  card('three', 'diamonds'), card('four', 'diamonds'), joker(1, 2),
  card('six', 'diamonds'), card('seven', 'diamonds'), card('eight', 'diamonds'),
  card('nine', 'diamonds'),
])

type StateOptions = Readonly<{
  team1Melds?: readonly ValidatedMeld[]
  team2Melds?: readonly ValidatedMeld[]
  hands?: Partial<Record<PlayerId, readonly Card[]>>
  team1TookPozzetto?: boolean
  team2TookPozzetto?: boolean
  closingTeamId?: TeamId
}>

const completedState = ({
  team1Melds = [],
  team2Melds = [],
  hands = {},
  team1TookPozzetto = true,
  team2TookPozzetto = false,
  closingTeamId = 'team-1',
}: StateOptions = {}): CompletedGameState => ({
  players: [
    { id: 'player-1', name: 'You', teamId: 'team-1', hand: hands['player-1'] ?? [] },
    { id: 'player-2', name: 'North', teamId: 'team-2', hand: hands['player-2'] ?? [] },
    { id: 'player-3', name: 'Partner', teamId: 'team-1', hand: hands['player-3'] ?? [] },
    { id: 'player-4', name: 'South', teamId: 'team-2', hand: hands['player-4'] ?? [] },
  ],
  teams: [
    {
      id: 'team-1',
      playerIds: ['player-1', 'player-3'],
      melds: team1Melds,
      hasTakenPozzetto: team1TookPozzetto,
    },
    {
      id: 'team-2',
      playerIds: ['player-2', 'player-4'],
      melds: team2Melds,
      hasTakenPozzetto: team2TookPozzetto,
    },
  ],
  drawPile: [],
  discardPile: [],
  pozzetti: [[], []],
  round: {
    status: 'completed',
    ending: 'closure',
    closedByPlayerId: closingTeamId === 'team-1' ? 'player-1' : 'player-2',
    closingTeamId,
  },
})

const scoreFor = (state: CompletedGameState, teamId: TeamId) =>
  calculateRoundScore(state).teams.find((score) => score.teamId === teamId)!

describe('calculateRoundScore', () => {
  it('sums every physical meld card without using its semantic represented rank', () => {
    const naturalPinella = sequence(['ace', 'two', 'three'], 'clubs')
    const wildcardPinella = validatedMeld([
      card('queen', 'clubs'), card('queen', 'diamonds'), card('two', 'hearts'),
    ])
    const wildcardJoker = validatedMeld([
      card('king', 'clubs'), card('king', 'diamonds'), joker(),
    ])
    const physicalDuplicates = validatedMeld([
      card('three', 'spades', 1), card('three', 'spades', 2), card('three', 'hearts'),
    ])

    expect(naturalPinella.cards.find(({ card: physical }) => physical.rank === 'two')?.role)
      .toBe('natural')
    expect(wildcardPinella.activeWildcard).toMatchObject({
      card: card('two', 'hearts'),
      role: 'wildcard',
    })
    expect(scoreFor(completedState({
      team1Melds: [naturalPinella, wildcardPinella, wildcardJoker, physicalDuplicates],
    }), 'team-1').meldCardPoints).toBe(145)
  })

  it.each([
    ['none', noneMeld, 0],
    ['clean', cleanBurraco, 200],
    ['semi-clean', semiCleanBurraco, 150],
    ['dirty', dirtyBurraco, 100],
  ] as const)('awards the %s Burraco bonus derived by classifyBurraco', (kind, makeMeld, bonus) => {
    const meld = makeMeld()
    expect(classifyBurraco(meld)).toBe(kind)
    expect(scoreFor(completedState({ team1Melds: [meld] }), 'team-1').burracoBonus)
      .toBe(bonus)
  })

  it('accumulates the bonus for every Burraco', () => {
    const score = scoreFor(completedState({
      team1Melds: [cleanBurraco(), semiCleanBurraco(), dirtyBurraco(), noneMeld()],
    }), 'team-1')

    expect(score.burracoBonus).toBe(450)
  })

  it('awards 100 closing points exclusively to the recorded closing team', () => {
    const result = calculateRoundScore(completedState({
      closingTeamId: 'team-2',
      team2TookPozzetto: true,
    }))

    expect(result.teams).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamId: 'team-1', closingBonus: 0 }),
      expect.objectContaining({ teamId: 'team-2', closingBonus: 100 }),
    ]))
  })

  it('awards no closing bonus after draw-pile exhaustion and keeps every other component', () => {
    const state: CompletedGameState = {
      ...completedState({
        team1Melds: [cleanBurraco()],
        team2Melds: [dirtyBurraco()],
        hands: {
          'player-1': [card('king', 'hearts'), joker(2, 1)],
          'player-2': [card('two', 'clubs')],
          'player-3': [card('ace', 'diamonds')],
        },
      }),
      round: { status: 'completed', ending: 'draw-pile-exhausted', lastDiscardPlayerId: 'player-1' },
    }

    // team-1: 3♠–7♠ (5 each) + 8♠ 9♠ (10 each) = 45, clean +200, hand K♥ 10 + joker 30 + A♦ 15 = 55.
    // team-2: 3♦ 4♦ 6♦ 7♦ (5 each) + joker 30 + 8♦ 9♦ (10 each) = 70, dirty +100,
    // hand pinella 20, and 100 for the pozzetto it did not take while team-1 did.
    expect(calculateRoundScore(state).teams).toEqual([
      {
        teamId: 'team-1',
        meldCardPoints: 45,
        burracoBonus: 200,
        closingBonus: 0,
        handPenalty: 55,
        pozzettoPenalty: 0,
        total: 190,
      },
      {
        teamId: 'team-2',
        meldCardPoints: 70,
        burracoBonus: 100,
        closingBonus: 0,
        handPenalty: 20,
        pozzettoPenalty: 100,
        total: 50,
      },
    ])
  })

  it('combines the cards left in both teammates hands and subtracts them from total', () => {
    const score = scoreFor(completedState({
      closingTeamId: 'team-2',
      team2TookPozzetto: true,
      hands: {
        'player-1': [card('ace', 'clubs'), card('five', 'clubs')],
        'player-3': [joker(2, 1)],
      },
    }), 'team-1')

    expect(score.handPenalty).toBe(50)
    expect(score.total).toBe(-50)
  })

  it('penalizes only a team that missed the pozzetto when the other team took one', () => {
    const result = calculateRoundScore(completedState({
      team1TookPozzetto: false,
      team2TookPozzetto: true,
      closingTeamId: 'team-2',
    }))

    expect(result.teams).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamId: 'team-1', pozzettoPenalty: 100 }),
      expect.objectContaining({ teamId: 'team-2', pozzettoPenalty: 0 }),
    ]))
  })

  it('does not apply the fixed pozzetto penalty when neither team took one', () => {
    const result = calculateRoundScore(completedState({
      team1TookPozzetto: false,
      team2TookPozzetto: false,
    }))

    expect(result.teams.every((score) => score.pozzettoPenalty === 0)).toBe(true)
  })

  it('counts an acquired but unplayed pozzetto only once through the player hand', () => {
    const unplayedPozzetto = [
      card('ace', 'clubs'), card('two', 'clubs'), card('king', 'clubs'), joker(2, 1),
    ]
    const score = scoreFor(completedState({
      hands: { 'player-1': unplayedPozzetto },
      closingTeamId: 'team-2',
      team2TookPozzetto: true,
    }), 'team-1')

    expect(score.handPenalty).toBe(75)
    expect(score.pozzettoPenalty).toBe(0)
    expect(score.total).toBe(-75)
  })

  it('returns a complete numerical breakdown for both teams', () => {
    const state = completedState({
      team1Melds: [cleanBurraco(), dirtyBurraco()],
      team2Melds: [validatedMeld([
        card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts'),
      ])],
      hands: {
        'player-3': [card('ace', 'hearts')],
        'player-2': [joker(2, 1)],
        'player-4': [card('two', 'spades', 2)],
      },
    })

    expect(calculateRoundScore(state)).toEqual({
      teams: [
        {
          teamId: 'team-1',
          meldCardPoints: 115,
          burracoBonus: 300,
          closingBonus: 100,
          handPenalty: 15,
          pozzettoPenalty: 0,
          total: 500,
        },
        {
          teamId: 'team-2',
          meldCardPoints: 30,
          burracoBonus: 0,
          closingBonus: 0,
          handPenalty: 50,
          pozzettoPenalty: 100,
          total: -120,
        },
      ],
    })
  })

  it('does not mutate any part of the completed state', () => {
    const state = completedState({
      team1Melds: [cleanBurraco(), dirtyBurraco()],
      hands: {
        'player-2': [card('two', 'spades')],
        'player-3': [card('ace', 'hearts')],
      },
    })
    const before = structuredClone(state)
    const players = state.players
    const teams = state.teams

    calculateRoundScore(state)

    expect(state).toEqual(before)
    expect(state.players).toBe(players)
    expect(state.teams).toBe(teams)
  })
})
