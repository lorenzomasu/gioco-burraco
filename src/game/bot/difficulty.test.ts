import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import { createSeededRandom } from '../cards/shuffle'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { dealInitialState, getPlayer, startGame } from '../engine/startGame'
import { validateMeld, type ValidatedMeld } from '../melds'
import type { GameState, InProgressGameState, PlayerId, TurnPhase } from '../state/types'
import { generateActionCandidates, generateDiscardCandidates, type BotActionCandidate } from './candidates'
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY, isBotDifficulty, type BotDifficulty } from './difficulty'
import {
  BotAutomationError,
  INITIAL_BOT_CHAIN_PROGRESS,
  playBotStep,
  playBotsUntilHumanTurn,
  playBotsUntilHumanTurnWithTrace,
  playBotTurn,
  playBotTurnWithTrace,
  playNextBotChainStep,
  type BotPublicActionEvent,
  type BotRunLimits,
} from './playBotTurn'
import { acquireForBot, chooseBestAction, chooseBestDiscard, chooseDrawSource } from './strategy'

const deck = createBurracoDeck()

const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card => {
  const found = deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )
  if (!found) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return found
}

const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected valid test meld, received ${result.reason}`)
  return result.meld
}

const playableDrawPile = (): readonly Card[] => [
  card('king', 'clubs', 2), card('queen', 'diamonds', 2), card('jack', 'hearts', 2),
]

const defaultPozzetti = (): readonly [Pozzetto, Pozzetto] => [[
  card('ace', 'clubs'), card('three', 'diamonds'), card('five', 'hearts'),
  card('seven', 'spades'), card('nine', 'clubs', 2), card('jack', 'diamonds'),
  card('king', 'hearts', 2), card('four', 'spades'), card('six', 'clubs'),
  card('eight', 'diamonds'), card('queen', 'spades', 2),
], [card('ace', 'diamonds')]]

const stateFor = ({
  playerId = 'player-2',
  hand,
  phase = 'action',
  drawPile = playableDrawPile(),
  discardPile = [],
  melds = [],
  opponentMelds = [],
  hasTakenPozzetto = false,
  pozzetti = defaultPozzetti(),
}: {
  playerId?: PlayerId
  hand: readonly Card[]
  phase?: TurnPhase
  drawPile?: readonly Card[]
  discardPile?: readonly Card[]
  melds?: readonly ValidatedMeld[]
  opponentMelds?: readonly ValidatedMeld[]
  hasTakenPozzetto?: boolean
  pozzetti?: readonly [Pozzetto, Pozzetto]
}): InProgressGameState => {
  const initial = dealInitialState(deck)
  const teamId = getPlayer(initial, playerId).teamId
  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: player.id === playerId ? hand : [] })),
    teams: initial.teams.map((team) => ({
      ...team,
      melds: team.id === teamId ? melds : opponentMelds,
      hasTakenPozzetto: team.id === teamId ? hasTakenPozzetto : false,
    })),
    drawPile,
    discardPile,
    pozzetti,
    round: {
      status: 'in-progress',
      turn: phase === 'mustDraw'
        ? { currentPlayerId: playerId, phase }
        : { currentPlayerId: playerId, phase, acquisition: { source: 'drawPile', cardIds: [] } },
    },
  }
}

const withOpponentHands = (state: InProgressGameState, hands: Partial<Record<PlayerId, readonly Card[]>>) => ({
  ...state,
  players: state.players.map((player) => hands[player.id] ? { ...player, hand: hands[player.id]! } : player),
})

/** North can meld three nines; the visible nine on the discard pile would make it four. */
const usefulDiscardPileState = (): InProgressGameState => stateFor({
  hand: [card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts'), card('queen', 'spades')],
  phase: 'mustDraw',
  drawPile: [card('four', 'hearts'), ...playableDrawPile()],
  discardPile: [card('nine', 'spades')],
})

/** A near clean Burraco that the nine of clubs completes, beside a mediocre set of kings. */
const burracoVersusVolumeState = (): InProgressGameState => stateFor({
  hand: [
    card('king', 'clubs'), card('king', 'diamonds'), card('king', 'hearts'),
    card('nine', 'clubs'), card('three', 'spades'),
  ],
  melds: [validatedMeld([
    card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
    card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
  ])],
})

/** The easy action order, restated independently of the implementation. */
const easyTopTier = (candidates: readonly BotActionCandidate[]): readonly BotActionCandidate[] => {
  const maxCards = Math.max(...candidates.map(({ cardsPlayed }) => cardsPlayed))
  const byCards = candidates.filter(({ cardsPlayed }) => cardsPlayed === maxCards)
  const minWild = Math.min(...byCards.map(({ wildcardsPlayed }) => wildcardsPlayed))
  const byWild = byCards.filter(({ wildcardsPlayed }) => wildcardsPlayed === minWild)
  const maxPoints = Math.max(...byWild.map(({ pointsPlayed }) => pointsPlayed))
  return byWild.filter(({ pointsPlayed }) => pointsPlayed === maxPoints)
}

const firstTieBreak = <T extends { tieBreak: string }>(items: readonly T[]): T =>
  [...items].sort((first, second) => first.tieBreak.localeCompare(second.tieBreak))[0]!

const stepThroughTurn = (state: GameState, playerId: PlayerId, difficulty: BotDifficulty) => {
  let current = state
  const events: BotPublicActionEvent[] = []
  do {
    const step = playBotStep(current, playerId, difficulty)
    current = step.state
    events.push(...step.events)
  } while (current.round.status === 'in-progress' && current.round.turn.currentPlayerId === playerId)
  return { state: current, events }
}

const stepThroughChain = (
  state: GameState,
  humanPlayerId: PlayerId,
  difficulty: BotDifficulty,
  limits: BotRunLimits = {},
) => {
  let current = state
  let progress = INITIAL_BOT_CHAIN_PROGRESS
  const events: BotPublicActionEvent[] = []
  for (;;) {
    const step = playNextBotChainStep(current, humanPlayerId, progress, limits, difficulty)
    if (!step) break
    current = step.state
    progress = step.progress
    events.push(...step.events)
  }
  return { state: current, events }
}

const cardIdsOf = (state: GameState): readonly string[] => [
  ...state.players.flatMap(({ hand }) => hand),
  ...state.teams.flatMap(({ melds }) => melds.flatMap(({ cards }) => cards.map(({ card: placed }) => placed))),
  ...state.drawPile,
  ...state.discardPile,
  ...state.pozzetti.flat(),
].map(({ id }) => id).sort()

describe('bot difficulty domain', () => {
  it('supports exactly easy and normal, with normal as the default', () => {
    expect(BOT_DIFFICULTIES).toEqual(['easy', 'normal'])
    expect(DEFAULT_BOT_DIFFICULTY).toBe('normal')
  })

  it('accepts only the supported values at runtime', () => {
    expect(isBotDifficulty('easy')).toBe(true)
    expect(isBotDifficulty('normal')).toBe(true)
    for (const value of ['hard', 'expert', 'Easy', 'NORMAL', 'facile', 'normale', '', ' easy', undefined, null, 0, 1, true, {}, []]) {
      expect(isBotDifficulty(value)).toBe(false)
    }
  })
})

describe('normal profile preserves the pre-M35 decisions', () => {
  it('collects a discard pile with a concrete use and otherwise draws stock', () => {
    const useful = usefulDiscardPileState()
    expect(chooseDrawSource(useful, 'player-2')).toBe('discardPile')
    expect(chooseDrawSource(useful, 'player-2', 'normal')).toBe('discardPile')
    expect(chooseDrawSource({ ...useful, discardPile: [card('king', 'spades')] }, 'player-2', 'normal')).toBe('drawPile')
    expect(chooseDrawSource({ ...useful, discardPile: [] }, 'player-2', 'normal')).toBe('drawPile')
    expect(chooseDrawSource({ ...useful, drawPile: [] }, 'player-2', 'normal')).toBe('discardPile')
  })

  it('ranks Burraco improvement above cards played and falls back to the existing order when omitted', () => {
    const state = burracoVersusVolumeState()
    const action = chooseBestAction(state, 'player-2', 'normal')

    expect(action?.kind).toBe('extend')
    expect(action?.cardIds).toEqual([card('nine', 'clubs').id])
    expect(chooseBestAction(state, 'player-2')).toEqual(action)
  })

  it('ranks closure first even when a larger non-closing action exists', () => {
    const state = stateFor({
      hand: [card('king', 'clubs'), card('king', 'diamonds'), card('king', 'spades'), card('nine', 'clubs')],
      melds: [
        validatedMeld([
          card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts'),
          card('six', 'hearts'), card('seven', 'hearts'), card('eight', 'hearts'), card('nine', 'hearts'),
        ]),
        validatedMeld([
          card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
          card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'),
        ]),
      ],
      hasTakenPozzetto: true,
    })

    expect(chooseBestAction(state, 'player-2', 'normal')?.enablesClosure).toBe(true)
  })

  it('keeps own-meld, future-meld and opponent-meld discard criteria', () => {
    const futureMeld = stateFor({ hand: [card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts'), card('three', 'spades')] })
    expect(chooseBestDiscard(futureMeld, 'player-2', 'normal')?.card.rank).not.toBe('queen')

    const opponent = stateFor({
      hand: [card('king', 'spades'), card('four', 'hearts'), card('three', 'clubs')],
      opponentMelds: [validatedMeld([card('king', 'clubs'), card('king', 'diamonds'), card('king', 'hearts')])],
    })
    expect(chooseBestDiscard(opponent, 'player-2', 'normal')?.card).not.toBe(card('king', 'spades'))
    expect(chooseBestDiscard(opponent, 'player-2')).toEqual(chooseBestDiscard(opponent, 'player-2', 'normal'))
  })
})

describe('easy profile acquisition', () => {
  it('draws from a non-empty stock even when the discard pile has a concrete use', () => {
    const state = usefulDiscardPileState()

    expect(chooseDrawSource(state, 'player-2', 'easy')).toBe('drawPile')
    expect(acquireForBot(state, 'player-2', 'easy').round).toMatchObject({
      turn: { phase: 'action', acquisition: { source: 'drawPile' } },
    })
  })

  it('collects the discard pile only when the stock is empty', () => {
    const state = { ...usefulDiscardPileState(), drawPile: [] }

    expect(chooseDrawSource(state, 'player-2', 'easy')).toBe('discardPile')
    expect(acquireForBot(state, 'player-2', 'easy').round).toMatchObject({
      turn: { phase: 'action', acquisition: { source: 'discardPile' } },
    })
  })

  it('chooses a different legal acquisition from normal on the same visible state', () => {
    const state = usefulDiscardPileState()

    expect(playBotStep(state, 'player-2', 'easy').events).toEqual([{ type: 'draw-stock', playerId: 'player-2' }])
    expect(playBotStep(state, 'player-2', 'normal').events)
      .toEqual([{ type: 'collect-discard-pile', playerId: 'player-2', cardCount: 1 }])
  })
})

describe('easy profile action ranking', () => {
  it('prefers more cards played over Burraco improvement, unlike normal', () => {
    const state = burracoVersusVolumeState()

    const easy = chooseBestAction(state, 'player-2', 'easy')

    expect(easy?.kind).toBe('meld')
    expect(easy?.cardIds).toEqual([card('king', 'clubs'), card('king', 'diamonds'), card('king', 'hearts')].map(({ id }) => id).sort())
    expect(chooseBestAction(state, 'player-2', 'normal')?.kind).toBe('extend')
  })

  it('breaks a cards-played tie with fewer wildcards', () => {
    const natural = card('six', 'clubs')
    const state = stateFor({
      hand: [joker(), natural, card('king', 'spades')],
      melds: [validatedMeld([card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs')])],
    })
    expect(generateActionCandidates(state, 'player-2').some(({ wildcardsPlayed }) => wildcardsPlayed > 0)).toBe(true)

    const action = chooseBestAction(state, 'player-2', 'easy')

    expect(action?.cardIds).toEqual([natural.id])
    expect(action?.wildcardsPlayed).toBe(0)
  })

  it('breaks the next tie with more points played', () => {
    const high = card('eight', 'hearts')
    const state = stateFor({
      hand: [card('four', 'hearts'), high, card('king', 'spades')],
      melds: [validatedMeld([card('five', 'hearts'), card('six', 'hearts'), card('seven', 'hearts')])],
    })

    expect(chooseBestAction(state, 'player-2', 'easy')?.cardIds).toEqual([high.id])
  })

  it('resolves a full tie with the existing deterministic tie-break', () => {
    const state = stateFor({
      hand: [card('eight', 'hearts'), card('eight', 'hearts', 2), card('king', 'spades')],
      melds: [validatedMeld([card('five', 'hearts'), card('six', 'hearts'), card('seven', 'hearts')])],
    })
    const tied = easyTopTier(generateActionCandidates(state, 'player-2'))
    expect(tied.length).toBeGreaterThan(1)

    const action = chooseBestAction(state, 'player-2', 'easy')

    expect(action?.tieBreak).toBe(firstTieBreak(tied).tieBreak)
    expect(chooseBestAction(state, 'player-2', 'easy')).toEqual(action)
  })

  it('selects only among the shared legal candidates', () => {
    const state = burracoVersusVolumeState()
    const candidates = generateActionCandidates(state, 'player-2')

    expect(candidates).toContainEqual(chooseBestAction(state, 'player-2', 'easy'))
    expect(chooseBestAction(state, 'player-2', 'easy')?.tieBreak).toBe(firstTieBreak(easyTopTier(candidates)).tieBreak)
  })
})

describe('easy profile discard ranking', () => {
  it('keeps a wildcard even when it has the most points', () => {
    const state = stateFor({ hand: [joker(), card('four', 'hearts'), card('three', 'clubs')] })

    expect(chooseBestDiscard(state, 'player-2', 'easy')?.isWildcard).toBe(false)
  })

  it('sheds the higher-value non-wildcard', () => {
    const high = card('ace', 'spades')
    const state = stateFor({ hand: [card('three', 'clubs'), high, card('six', 'hearts')] })

    expect(chooseBestDiscard(state, 'player-2', 'easy')?.card).toBe(high)
  })

  it('resolves an equal-points tie with the existing deterministic tie-break', () => {
    const state = stateFor({ hand: [card('king', 'spades'), card('queen', 'hearts'), card('three', 'clubs')] })
    const tied = generateDiscardCandidates(state, 'player-2').filter(({ points }) => points === 10)
    expect(tied).toHaveLength(2)

    expect(chooseBestDiscard(state, 'player-2', 'easy')?.tieBreak).toBe(firstTieBreak(tied).tieBreak)
  })

  it('ignores future-meld and opponent-meld criteria that normal uses', () => {
    const futureMeld = stateFor({ hand: [card('queen', 'clubs'), card('queen', 'diamonds'), card('queen', 'hearts'), card('three', 'spades')] })
    expect(chooseBestDiscard(futureMeld, 'player-2', 'easy')?.card.rank).toBe('queen')
    expect(chooseBestDiscard(futureMeld, 'player-2', 'normal')?.card.rank).not.toBe('queen')

    const risky = card('king', 'spades')
    const opponent = stateFor({
      hand: [risky, card('four', 'hearts'), card('three', 'clubs')],
      opponentMelds: [validatedMeld([card('king', 'clubs'), card('king', 'diamonds'), card('king', 'hearts')])],
    })
    expect(chooseBestDiscard(opponent, 'player-2', 'easy')?.card).toBe(risky)
    expect(chooseBestDiscard(opponent, 'player-2', 'normal')?.card).not.toBe(risky)
  })

  it('still closes the round naturally with the only legal final discard', () => {
    const state = stateFor({
      hand: [card('king', 'spades')],
      melds: [validatedMeld([
        card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
        card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
      ])],
      hasTakenPozzetto: true,
    })

    expect(playBotTurn(state, 'player-2', {}, 'easy').round).toMatchObject({ status: 'completed', ending: 'closure' })
  })
})

describe.each(BOT_DIFFICULTIES)('%s profile hidden-information boundary', (difficulty) => {
  it('ignores hidden stock identities and order', () => {
    const base = usefulDiscardPileState()
    const changed = { ...base, drawPile: [card('queen', 'spades'), card('ace', 'hearts'), card('five', 'clubs'), card('two', 'spades')] }

    expect(chooseDrawSource(changed, 'player-2', difficulty)).toBe(chooseDrawSource(base, 'player-2', difficulty))
  })

  it('ignores opponent hand identities', () => {
    const base = stateFor({ hand: [card('queen', 'clubs'), card('queen', 'diamonds'), card('three', 'spades'), card('ace', 'hearts')] })
    const first = withOpponentHands(base, { 'player-1': [card('three', 'hearts')], 'player-3': [card('six', 'spades')] })
    const second = withOpponentHands(base, { 'player-1': [joker(), card('ace', 'clubs', 2)], 'player-3': [card('queen', 'hearts')] })

    expect(chooseBestDiscard(second, 'player-2', difficulty)?.card.id).toBe(chooseBestDiscard(first, 'player-2', difficulty)?.card.id)
    expect(chooseBestAction(second, 'player-2', difficulty)?.cardIds).toEqual(chooseBestAction(first, 'player-2', difficulty)?.cardIds)
  })

  it('ignores unrevealed pozzetto identities', () => {
    const base = usefulDiscardPileState()
    const changed: InProgressGameState = {
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

    expect(chooseDrawSource(changed, 'player-2', difficulty)).toBe(chooseDrawSource(base, 'player-2', difficulty))
    expect(playBotStep(changed, 'player-2', difficulty).events).toEqual(playBotStep(base, 'player-2', difficulty).events)
  })
})

describe.each(BOT_DIFFICULTIES)('%s profile execution', (difficulty) => {
  it('is deterministic, preserves its input and physical card identity', () => {
    const state = usefulDiscardPileState()
    const before = structuredClone(state)

    const first = playBotTurnWithTrace(state, 'player-2', {}, difficulty)

    expect(state).toEqual(before)
    expect(playBotTurnWithTrace(state, 'player-2', {}, difficulty)).toEqual(first)
    expect(cardIdsOf(first.state)).toEqual(cardIdsOf(state))
  })

  it('keeps one profile through acquisition, repeated actions and discard', () => {
    const state = usefulDiscardPileState()

    const stepped = stepThroughTurn(state, 'player-2', difficulty)
    const traced = playBotTurnWithTrace(state, 'player-2', {}, difficulty)

    expect(stepped).toEqual(traced)
    expect(playBotTurn(state, 'player-2', {}, difficulty)).toEqual(traced.state)
    expect(traced.events[0]?.type).toBe(difficulty === 'easy' ? 'draw-stock' : 'collect-discard-pile')
  })

  it.each([1, 7, 42, 125, 200])('matches stepwise and full-chain execution for dealt seed %i', (seed) => {
    const dealt = startGame(createSeededRandom(seed))
    if (dealt.round.status !== 'in-progress') throw new Error('Expected an in-progress round')
    const humanPlayerId = dealt.round.turn.currentPlayerId
    const afterHuman = playBotTurn(dealt, humanPlayerId, {}, difficulty)

    const chained = stepThroughChain(afterHuman, humanPlayerId, difficulty)
    const traced = playBotsUntilHumanTurnWithTrace(afterHuman, humanPlayerId, {}, difficulty)

    expect(chained).toEqual(traced)
    expect(playBotsUntilHumanTurn(afterHuman, humanPlayerId, {}, difficulty)).toEqual(traced.state)
  })

  it('applies the unchanged safety limits', () => {
    const state = stateFor({ hand: [card('king', 'spades')] })
    expect(() => playNextBotChainStep(state, 'player-1', INITIAL_BOT_CHAIN_PROGRESS, { maxActionsPerTurn: 0 }, difficulty))
      .toThrowError('exceeded the 0-action safety limit')
    expect(() => playBotsUntilHumanTurnWithTrace(state, 'player-1', { maxBotTurns: 0 }, difficulty))
      .toThrowError(BotAutomationError)
    expect(() => playBotStep(state, 'player-3', difficulty)).toThrowError(BotAutomationError)
  })

  it('stops for the human turn and after a completed round', () => {
    const human = stateFor({ playerId: 'player-1', hand: [card('king', 'spades')] })
    expect(playNextBotChainStep(human, 'player-1', INITIAL_BOT_CHAIN_PROGRESS, {}, difficulty)).toBeNull()

    const closing = stateFor({
      hand: [card('king', 'spades')],
      melds: [validatedMeld([
        card('three', 'clubs'), card('four', 'clubs'), card('five', 'clubs'),
        card('six', 'clubs'), card('seven', 'clubs'), card('eight', 'clubs'), card('nine', 'clubs'),
      ])],
      hasTakenPozzetto: true,
    })
    const completed = playBotsUntilHumanTurn(closing, 'player-1', {}, difficulty)
    expect(completed.round.status).toBe('completed')
    expect(playNextBotChainStep(completed, 'player-1', INITIAL_BOT_CHAIN_PROGRESS, {}, difficulty)).toBeNull()
    expect(playBotTurnWithTrace(completed, 'player-2', {}, difficulty)).toEqual({ state: completed, events: [] })
  })
})

// ---------------------------------------------------------------------------------------
// Normal golden regression: digests of complete all-bot rounds (every public event plus
// the final state) recorded from the pre-M35 strategy. A normal profile that silently
// changed any acquisition, action or discard decision on these deals would fail here.
// ---------------------------------------------------------------------------------------

const PRE_M35_ALL_BOT_ROUND_DIGESTS: readonly (readonly [number, string])[] = [
  [1, 'f20c6604'], [2, '1af83af8'], [3, '2978c49e'], [4, 'ba3b1b47'], [5, 'f785adff'],
  [6, '7975e084'], [7, 'bc5332f2'], [8, '51299fbf'], [9, '3da94969'], [10, '2da1db85'],
  [11, '72f98783'], [12, '3caac637'], [13, '7e0f956f'], [14, '20281576'], [15, 'b8a34006'],
  [16, '82b451c8'], [17, '0917a164'], [18, '7b2edb9d'], [19, '4444fa21'], [20, '36774692'],
  [21, '516bddc3'], [22, 'bc9a0e82'], [23, '8a9fb3ae'], [24, '07072d6c'], [25, '918a3105'],
  [26, '8b85a62d'], [27, 'c7610157'], [28, '8f1ae558'], [29, 'b042777a'], [30, '8b7945b1'],
  [31, '658ab1de'], [32, '87a47ec9'], [33, '2d8536c3'], [34, '30c0ef5c'], [35, '2161c6e3'],
  [36, '5b058909'], [37, 'dc5d452e'], [38, 'aaa7060c'], [39, '417a5ab6'], [40, '05150eaf'],
]

const MAX_TURNS_PER_ROUND = 200
const SIMULATION_TIMEOUT_MS = 60_000

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const allBotRound = (seed: number, difficulty?: BotDifficulty) => {
  let state: GameState = startGame(createSeededRandom(seed))
  const events: BotPublicActionEvent[] = []
  let turns = 0
  while (state.round.status === 'in-progress' && turns < MAX_TURNS_PER_ROUND) {
    const traced = difficulty === undefined
      ? playBotTurnWithTrace(state, state.round.turn.currentPlayerId)
      : playBotTurnWithTrace(state, state.round.turn.currentPlayerId, {}, difficulty)
    state = traced.state
    events.push(...traced.events)
    turns += 1
  }
  return { state, digest: fnv1a(JSON.stringify({ events, state })) }
}

describe('all-bot rounds per difficulty', () => {
  it('reproduces the pre-M35 decisions exactly for the default and explicit normal profile', () => {
    for (const [seed, digest] of PRE_M35_ALL_BOT_ROUND_DIGESTS) {
      expect(allBotRound(seed).digest, `default, seed ${seed}`).toBe(digest)
      expect(allBotRound(seed, 'normal').digest, `normal, seed ${seed}`).toBe(digest)
    }
  }, SIMULATION_TIMEOUT_MS)

  it('completes every easy round deterministically with decisions that differ from normal', () => {
    const differing = PRE_M35_ALL_BOT_ROUND_DIGESTS.filter(([seed, digest]) => {
      const first = allBotRound(seed, 'easy')
      expect(first.state.round.status, `easy, seed ${seed}`).toBe('completed')
      expect(allBotRound(seed, 'easy').digest).toBe(first.digest)
      return first.digest !== digest
    })

    expect(differing.length).toBeGreaterThan(PRE_M35_ALL_BOT_ROUND_DIGESTS.length / 2)
  }, SIMULATION_TIMEOUT_MS)
})
