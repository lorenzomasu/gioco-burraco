import { createBurracoDeck } from '../cards/deck'
import { shuffleDeck, type RandomSource } from '../cards/shuffle'
import type { Card, Deck } from '../cards/types'
import type { GameState, InProgressGameState, Player, PlayerId, Team } from '../state/types'

const PLAYER_DEFINITIONS: readonly Omit<Player, 'hand'>[] = [
  { id: 'player-1', name: 'You', teamId: 'team-1' },
  { id: 'player-2', name: 'North', teamId: 'team-2' },
  { id: 'player-3', name: 'Partner', teamId: 'team-1' },
  { id: 'player-4', name: 'South', teamId: 'team-2' },
]

const TEAMS: readonly Team[] = [
  { id: 'team-1', playerIds: ['player-1', 'player-3'], melds: [], hasTakenPozzetto: false },
  { id: 'team-2', playerIds: ['player-2', 'player-4'], melds: [], hasTakenPozzetto: false },
]

export const HAND_SIZE = 11
export const POZZETTO_SIZE = 11
export const INITIAL_DECK_SIZE = 108

/** The standalone single-round starter when no caller requests another one. */
export const DEFAULT_STARTING_PLAYER_ID: PlayerId = 'player-1'

export type RoundSetupOptions = Readonly<{
  /** Initial turn owner. Turn metadata only: it never changes the deal. */
  startingPlayerId?: PlayerId
  /**
   * Display names overriding the defaults per seat. Presentation metadata only: IDs,
   * teams, the deal and turn order never depend on them.
   */
  playerNames?: Readonly<Partial<Record<PlayerId, string>>>
}>

/**
 * Applies the deterministic, digital dealing order to an already ordered deck.
 * Shuffling deliberately belongs to the caller so this operation is independently testable.
 */
export const dealInitialState = (
  orderedDeck: Deck,
  { startingPlayerId = DEFAULT_STARTING_PLAYER_ID, playerNames = {} }: RoundSetupOptions = {},
): InProgressGameState => {
  if (orderedDeck.length !== INITIAL_DECK_SIZE) {
    throw new RangeError(`Initial deal requires exactly ${INITIAL_DECK_SIZE} cards.`)
  }
  if (!PLAYER_DEFINITIONS.some(({ id }) => id === startingPlayerId)) {
    throw new RangeError(`Unknown starting player: ${startingPlayerId}`)
  }

  let cursor = 0
  const hands: Card[][] = PLAYER_DEFINITIONS.map(() => [])
  for (let cardNumber = 0; cardNumber < HAND_SIZE; cardNumber += 1) {
    for (const hand of hands) hand.push(orderedDeck[cursor++]!)
  }

  const pozzetti: [Card[], Card[]] = [[], []]
  for (let cardNumber = 0; cardNumber < POZZETTO_SIZE * 2; cardNumber += 1) {
    pozzetti[cardNumber % 2].push(orderedDeck[cursor++]!)
  }
  const openingDiscard = orderedDeck[cursor++]!

  const players = PLAYER_DEFINITIONS.map((definition, index) => ({
    ...definition,
    name: playerNames[definition.id] ?? definition.name,
    hand: hands[index],
  }))
  return {
    players,
    teams: TEAMS,
    drawPile: orderedDeck.slice(cursor),
    discardPile: [openingDiscard],
    pozzetti,
    round: { status: 'in-progress', turn: { currentPlayerId: startingPlayerId, phase: 'mustDraw' } },
  }
}

/** Starts only the initial round layout. Subsequent player actions are future commands. */
export const startGame = (random?: RandomSource, options?: RoundSetupOptions): InProgressGameState =>
  dealInitialState(shuffleDeck(createBurracoDeck(), random), options)

export const getPlayer = (state: GameState, playerId: PlayerId): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Unknown player: ${playerId}`)
  return player
}
