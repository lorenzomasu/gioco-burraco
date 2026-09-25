import { createBurracoDeck } from '../game/cards/deck'
import type { Card, Rank, Suit } from '../game/cards/types'
import type { MatchState } from '../game/match'
import { validateMeld, type ValidatedMeld } from '../game/melds'
import type { InProgressGameState, Player, PlayerId } from '../game/state/types'

type CardSpec = readonly [Card['rank'], Suit | null]

const PLAYER_NAMES: Readonly<Record<PlayerId, string>> = {
  'player-1': 'You',
  'player-2': 'North',
  'player-3': 'Partner',
  'player-4': 'South',
}

const run = (suit: Suit, ranks: readonly Rank[]): readonly CardSpec[] => ranks.map((rank) => [rank, suit])
const group = (rank: Rank, suits: readonly Suit[]): readonly CardSpec[] => suits.map((suit) => [rank, suit])

/** Seven melds per team, including long sequences with a wildcard, groups, a pinella and Burraco. */
const TEAM_1_MELDS: readonly (readonly CardSpec[])[] = [
  [
    ...run('hearts', ['three', 'four', 'five', 'six', 'seven']),
    ['joker', null],
    ...run('hearts', ['nine', 'ten', 'jack', 'queen', 'king', 'ace']),
  ],
  group('king', ['spades', 'clubs', 'diamonds']),
  group('queen', ['spades', 'clubs', 'diamonds', 'hearts']),
  [...group('seven', ['spades', 'clubs', 'diamonds']), ['two', 'clubs']],
  run('clubs', ['three', 'four', 'five', 'six', 'seven', 'eight', 'nine']),
  run('diamonds', ['nine', 'ten', 'jack', 'queen', 'king']),
  group('five', ['spades', 'clubs', 'diamonds']),
]

const TEAM_2_MELDS: readonly (readonly CardSpec[])[] = [
  [
    ...run('spades', ['three', 'four', 'five', 'six']),
    ['two', 'spades'],
    ...run('spades', ['eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace']),
  ],
  group('jack', ['hearts', 'clubs', 'diamonds']),
  group('ten', ['spades', 'hearts', 'diamonds', 'clubs']),
  [...group('four', ['spades', 'hearts', 'diamonds']), ['joker', null]],
  run('diamonds', ['three', 'four', 'five', 'six', 'seven', 'eight']),
  group('six', ['spades', 'clubs', 'hearts']),
  group('ace', ['spades', 'clubs', 'diamonds']),
]

/** The human holds a fourth king and the next club, so two own melds can be extended. */
const HUMAN_HAND: readonly CardSpec[] = [
  ['king', 'hearts'], ['eight', 'spades'], ['ten', 'clubs'], ['three', 'diamonds'], ['jack', 'spades'],
]

/**
 * A committed, save-valid mid-round stress table: both teams have many simultaneous public
 * melds (long wildcard sequences included), both pozzetti are taken, every physical card
 * exists exactly once and the human is in the action phase.
 */
export const denseMeldState = (): InProgressGameState => {
  const unused = [...createBurracoDeck()]
  const take = ([rank, suit]: CardSpec): Card => {
    const index = unused.findIndex((card) => card.rank === rank && card.suit === suit)
    if (index < 0) throw new Error(`No unused ${rank} of ${suit ?? 'joker'}`)
    return unused.splice(index, 1)[0]!
  }
  const meld = (specs: readonly CardSpec[]): ValidatedMeld => {
    const result = validateMeld(specs.map(take))
    if (!result.valid) throw new Error(`Invalid stress meld: ${result.reason}`)
    return result.meld
  }
  const team1 = TEAM_1_MELDS.map(meld)
  const team2 = TEAM_2_MELDS.map(meld)
  const humanHand = HUMAN_HAND.map(take)
  const botHand = () => unused.splice(0, 6)
  const hands: Readonly<Record<PlayerId, readonly Card[]>> = {
    'player-1': humanHand,
    'player-2': botHand(),
    'player-3': botHand(),
    'player-4': botHand(),
  }
  const discardPile = unused.splice(0, 4)
  const players: readonly Player[] = (['player-1', 'player-2', 'player-3', 'player-4'] as const).map((id, index) => ({
    id,
    name: PLAYER_NAMES[id],
    teamId: index % 2 === 0 ? 'team-1' : 'team-2',
    hand: hands[id],
  }))
  return {
    players,
    teams: [
      { id: 'team-1', playerIds: ['player-1', 'player-3'], melds: team1, hasTakenPozzetto: true },
      { id: 'team-2', playerIds: ['player-2', 'player-4'], melds: team2, hasTakenPozzetto: true },
    ],
    drawPile: unused,
    discardPile,
    pozzetti: [[], []],
    round: {
      status: 'in-progress',
      turn: { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

export const denseMeldMatch = (): MatchState => ({
  status: 'in-progress',
  currentRoundNumber: 1,
  currentRound: denseMeldState(),
  roundResults: [],
})
