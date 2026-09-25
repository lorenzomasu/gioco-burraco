import { describe, expect, it, vi } from 'vitest'
import { playBotStep, playBotTurn } from '../game/bot'
import { createBurracoDeck } from '../game/cards/deck'
import { createSeededRandom } from '../game/cards/shuffle'
import type { Card, Rank, Suit } from '../game/cards/types'
import { drawCard } from '../game/engine/turn'
import { advanceMatch, startMatch, updateCurrentRound, type MatchRoundCount, type MatchState } from '../game/match'
import { validateMeld, validateMeldExtension, type ValidatedMeld } from '../game/melds'
import type { GameState, InProgressGameState } from '../game/state/types'
import { createMemoryStorage } from '../tests/memoryStorage'
import {
  clearMatchSave,
  isMatchSaveEnvelope,
  loadMatchSave,
  MATCH_SAVE_SCHEMA_VERSION,
  MATCH_SAVE_STORAGE_KEY,
  parseMatchSave,
  saveMatch,
  serializeMatchSave,
} from './matchPersistence'
import { createSetupRoundFactory, type MatchSetup } from './matchSetup'

const setup: MatchSetup = { humanPlayerName: 'Lorenzo', roundCount: 4 }

/** Plays whole turns for every seat (the human seat included) with the deterministic bot. */
const playTurns = (state: GameState, turns: number): GameState => {
  let current = state
  for (let turn = 0; turn < turns && current.round.status === 'in-progress'; turn += 1) {
    current = playBotTurn(current, current.round.turn.currentPlayerId)
  }
  return current
}

/** A real seeded round 1 advanced until melds, acquisitions and a discard history exist. */
const activeMatch = (): MatchState => {
  const match = startMatch(createSetupRoundFactory(setup, createSeededRandom(22)))
  let round = match.currentRound
  for (let turn = 0; turn < 40 && round.round.status === 'in-progress'; turn += 1) {
    round = playTurns(round, 1)
    if (round.teams.every((team) => team.melds.length > 0) && round.round.status === 'in-progress') break
  }
  if (round.round.status !== 'in-progress') throw new Error('Fixture round ended too early.')
  // Commit only the next acquisition so the saved turn is mid-turn and carries it.
  round = playBotStep(round, round.round.turn.currentPlayerId).state
  if (round.round.status !== 'in-progress' || round.round.turn.phase !== 'action') {
    throw new Error('Fixture turn is not in its action phase.')
  }
  return updateCurrentRound(match, round)
}

/**
 * A full-deck stock of three cards: the rest of the stock moves into the pozzetti, so
 * the round soon ends by draw-pile exhaustion while every physical card stays placed.
 */
const withShortStock = (state: InProgressGameState): InProgressGameState => {
  const cut = state.drawPile.slice(3)
  const half = Math.ceil(cut.length / 2)
  return {
    ...state,
    drawPile: state.drawPile.slice(0, 3),
    pozzetti: [[...state.pozzetti[0], ...cut.slice(0, half)], [...state.pozzetti[1], ...cut.slice(half)]],
  }
}

/** Completes the current fresh round quickly (short stock) and settles it. */
const completeCurrentRound = (match: MatchState): MatchState => {
  const short = withShortStock(match.currentRound as InProgressGameState)
  const completed = playTurns(short, 20)
  if (completed.round.status !== 'completed') throw new Error('Fixture round did not end.')
  return updateCurrentRound(match, completed)
}

/** Round 1 completed by draw-pile exhaustion and settled: the between-round state. */
const betweenRoundMatch = (): MatchState =>
  completeCurrentRound(startMatch(createSetupRoundFactory(setup, createSeededRandom(5))))

/**
 * A real match of the given length at `roundNumber`, either freshly dealt or completed
 * and settled (the between-round state).
 */
const matchAt = (roundCount: MatchRoundCount, roundNumber: number, completed: boolean): MatchState => {
  const factory = createSetupRoundFactory({ ...setup, roundCount }, createSeededRandom(5))
  let match = startMatch(factory, roundCount)
  while (match.currentRoundNumber < roundNumber) match = advanceMatch(completeCurrentRound(match), factory)
  return completed ? completeCurrentRound(match) : match
}

/** Parsed wire object, so tests can corrupt individual fields. */
const wire = (match: MatchState = activeMatch()): Record<string, any> =>
  JSON.parse(serializeMatchSave({ ...setup, roundCount: match.roundCount }, match))

/** The released pre-M34 version-1 wire shape: no length in the setup or the match. */
const legacyWire = (match: MatchState = activeMatch()): Record<string, any> => {
  const current = wire(match)
  delete current.setup.roundCount
  delete current.match.roundCount
  return { ...current, version: 1 }
}

const parseWire = (value: unknown) => parseMatchSave(JSON.stringify(value))

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const throwingStorage = (overrides: Partial<Record<'getItem' | 'setItem' | 'removeItem', boolean>>): Storage => {
  const storage = createMemoryStorage()
  const fail = () => {
    throw new DOMException('Storage refused', 'QuotaExceededError')
  }
  return {
    ...storage,
    getItem: overrides.getItem ? fail : storage.getItem,
    setItem: overrides.setItem ? fail : storage.setItem,
    removeItem: overrides.removeItem ? fail : storage.removeItem,
  } as Storage
}

describe('match save wire format', () => {
  it('uses one explicit version-2 envelope holding only the setup and the match', () => {
    expect(MATCH_SAVE_SCHEMA_VERSION).toBe(2)
    const match = activeMatch()
    const extendedSetup = { humanPlayerName: 'Lorenzo', roundCount: 4, ignored: () => 1 } as unknown as MatchSetup

    const envelope = JSON.parse(serializeMatchSave(extendedSetup, match))

    expect(Object.keys(envelope)).toEqual(['version', 'setup', 'match'])
    expect(envelope.version).toBe(2)
    expect(envelope.setup).toEqual({ humanPlayerName: 'Lorenzo', roundCount: 4 })
    expect(Object.keys(envelope.match).sort())
      .toEqual(['currentRound', 'currentRoundNumber', 'roundCount', 'roundResults', 'status'])
    expect(envelope.match.roundCount).toBe(4)
  })

  it('round-trips an active match with melds, acquisition state and pozzetti without loss', () => {
    const match = activeMatch()
    expect(match.currentRound.teams.some((team) => team.melds.length > 0)).toBe(true)
    expect(match.currentRound.round).toMatchObject({ status: 'in-progress', turn: { phase: 'action' } })

    const restored = parseMatchSave(serializeMatchSave(setup, match))

    expect(restored).toEqual({ version: 2, setup, match })
    const cardIds = (state: GameState) => [
      ...state.players.flatMap((player) => player.hand.map((card) => card.id)),
      ...state.teams.flatMap((team) => team.melds.flatMap((meld) => meld.cards.map(({ card }) => card.id))),
      ...state.drawPile.map((card) => card.id),
      ...state.discardPile.map((card) => card.id),
      ...state.pozzetti.flatMap((pozzetto) => pozzetto.map((card) => card.id)),
    ]
    expect(cardIds(restored!.match.currentRound)).toEqual(cardIds(match.currentRound))
    expect(cardIds(match.currentRound)).toHaveLength(108)
  })

  it('round-trips a settled between-round match', () => {
    const match = betweenRoundMatch()
    expect(match.roundResults).toHaveLength(1)
    expect(match.status).toBe('in-progress')

    expect(parseMatchSave(serializeMatchSave(setup, match))).toEqual({ version: 2, setup, match })
  })
})

describe('configured match length in saves', () => {
  it.each([2, 3, 4] as const)('writes and round-trips a %i-smazzate save without semantic loss', (roundCount) => {
    const configuredSetup: MatchSetup = { ...setup, roundCount }
    for (const match of [matchAt(roundCount, 1, false), matchAt(roundCount, 2, false), matchAt(roundCount, 1, true)]) {
      const raw = serializeMatchSave(configuredSetup, match)
      const envelope = JSON.parse(raw)

      expect(envelope.version).toBe(2)
      expect(envelope.setup.roundCount).toBe(roundCount)
      expect(envelope.match.roundCount).toBe(roundCount)
      expect(parseMatchSave(raw)).toEqual({ version: 2, setup: configuredSetup, match })
    }
  })

  it('restores a between-round save of a shorter match with its length and allows only the next round', () => {
    const storage = createMemoryStorage()
    const between = matchAt(3, 2, true)
    expect(saveMatch({ ...setup, roundCount: 3 }, between, storage)).toBe(true)

    const loaded = loadMatchSave(storage)
    if (loaded.status !== 'restored') throw new Error('Expected a restored save.')
    const factory = createSetupRoundFactory(loaded.save.setup, createSeededRandom(5))
    const third = advanceMatch(loaded.save.match, factory)

    expect(loaded.save.match).toEqual(between)
    expect(third).toMatchObject({ roundCount: 3, currentRoundNumber: 3 })
    expect(completeCurrentRound(third).status).toBe('completed')
  })

  it.each([undefined, null, 1, 5, 0, '4', 2.5])('rejects the unsupported length %s', (roundCount) => {
    const save = wire()
    save.setup.roundCount = roundCount
    save.match.roundCount = roundCount
    expect(parseWire(save)).toBeNull()
  })

  it('rejects a length that is missing from only the setup or only the match', () => {
    const withoutSetupLength = wire()
    delete withoutSetupLength.setup.roundCount
    const withoutMatchLength = wire()
    delete withoutMatchLength.match.roundCount

    expect(parseWire(withoutSetupLength)).toBeNull()
    expect(parseWire(withoutMatchLength)).toBeNull()
  })

  it('rejects a setup length that disagrees with the match length', () => {
    const save = wire(matchAt(3, 1, false))
    for (const roundCount of [2, 4]) {
      expect(parseWire({ ...save, setup: { ...save.setup, roundCount } })).toBeNull()
    }
  })

  it('rejects a current round beyond the configured length', () => {
    const save = wire(matchAt(4, 3, false))
    const withLength = (roundCount: number) => ({
      ...save,
      setup: { ...save.setup, roundCount },
      match: { ...save.match, roundCount },
    })

    expect(parseWire(withLength(3))).not.toBeNull()
    expect(parseWire(withLength(2))).toBeNull()
  })

  it('treats a completed configured final round as stale, but not an earlier one', () => {
    const between = wire(matchAt(3, 2, true))
    expect(parseWire(between)).not.toBeNull()

    const asTwoRounds = {
      ...between,
      setup: { ...between.setup, roundCount: 2 },
      match: { ...between.match, roundCount: 2 },
    }
    expect(parseWire(asTwoRounds)).toBeNull()
    expect(parseWire({ ...asTwoRounds, match: { ...asTwoRounds.match, status: 'completed' } })).toBeNull()
  })
})

describe('legacy version-1 saves', () => {
  it('restores a valid version-1 active save as a four-smazzate current save', () => {
    const match = activeMatch()
    expect(parseWire(legacyWire(match))).toEqual({ version: 2, setup, match })
  })

  it('restores a valid version-1 between-round save with its history as four smazzate', () => {
    const match = advanceMatch(betweenRoundMatch(), createSetupRoundFactory(setup, createSeededRandom(9)))
    const restored = parseWire(legacyWire(match))

    expect(restored).toEqual({ version: 2, setup, match })
    expect(restored!.match.roundCount).toBe(4)
  })

  it('writes only the current schema once a migrated save is saved again', () => {
    const storage = createMemoryStorage()
    storage.setItem(MATCH_SAVE_STORAGE_KEY, JSON.stringify(legacyWire()))

    const loaded = loadMatchSave(storage)
    if (loaded.status !== 'restored') throw new Error('Expected a restored legacy save.')
    expect(saveMatch(loaded.save.setup, loaded.save.match, storage)).toBe(true)

    const written = JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!)
    expect(written.version).toBe(2)
    expect(written.setup.roundCount).toBe(4)
    expect(written.match.roundCount).toBe(4)
  })

  it.each<[string, (save: Record<string, any>) => void]>([
    ['a card missing from the stock', (save) => save.match.currentRound.drawPile.pop()],
    ['an invalid setup name', (save) => { save.setup.humanPlayerName = ' Lorenzo ' }],
    ['a setup name inconsistent with player-1', (save) => { save.setup.humanPlayerName = 'Giulia' }],
    ['a fifth round', (save) => { save.match.currentRoundNumber = 5 }],
    ['a stray length in the setup', (save) => { save.setup.roundCount = 2 }],
    ['a stray length in the match', (save) => { save.match.roundCount = 4 }],
    ['a completed match', (save) => { save.match.status = 'completed' }],
  ])('still rejects a version-1 save with %s', (_label, corrupt) => {
    const save = legacyWire()
    expect(parseWire(save)).not.toBeNull()
    corrupt(save)
    expect(parseWire(save)).toBeNull()
  })

  it('treats a version-1 save with a completed fourth round as stale', () => {
    const between = legacyWire(betweenRoundMatch())
    const result = between.match.roundResults[0]
    const roundFour = {
      ...between.match,
      currentRoundNumber: 4,
      roundResults: [1, 2, 3, 4].map((roundNumber) => ({ ...result, roundNumber })),
    }
    expect(parseWire({ ...between, match: roundFour })).toBeNull()
  })

  it('never reinterprets a version-1 save as a shorter match', () => {
    const between = legacyWire(matchAt(4, 2, true))
    const restored = parseWire(between)

    expect(restored?.match).toMatchObject({ roundCount: 4, currentRoundNumber: 2, status: 'in-progress' })
    expect(restored?.setup.roundCount).toBe(4)
  })
})

describe('match save validation', () => {
  it('rejects malformed JSON and non-object roots', () => {
    expect(parseMatchSave('{"version":1,')).toBeNull()
    expect(parseMatchSave('')).toBeNull()
    for (const root of [null, 1, 'save', [], true]) expect(parseWire(root)).toBeNull()
  })

  it('rejects any version other than the current one and the legacy version 1', () => {
    for (const version of [0, 3, '2', '1', null, undefined]) {
      expect(parseWire({ ...wire(), version })).toBeNull()
    }
    const { version: _omitted, ...withoutVersion } = wire()
    expect(parseWire(withoutVersion)).toBeNull()
  })

  it('rejects missing or invalid setup', () => {
    const base = wire()
    for (const invalid of [undefined, null, {}, { humanPlayerName: '', roundCount: 4 }, { humanPlayerName: ' Lorenzo ', roundCount: 4 }, { humanPlayerName: 7, roundCount: 4 }]) {
      expect(parseWire({ ...base, setup: invalid })).toBeNull()
    }
  })

  it('rejects a setup name inconsistent with the saved player-1', () => {
    expect(parseWire({ ...wire(), setup: { humanPlayerName: 'Giulia', roundCount: 4 } })).toBeNull()
  })

  it.each<[string, (save: Record<string, any>) => void]>([
    ['missing match', (save) => delete save.match],
    ['missing current round', (save) => delete save.match.currentRound],
    ['invalid round number', (save) => { save.match.currentRoundNumber = 5 }],
    ['unknown match status', (save) => { save.match.status = 'paused' }],
    ['missing players', (save) => delete save.match.currentRound.players],
    ['reordered seats', (save) => save.match.currentRound.players.reverse()],
    ['player on the wrong team', (save) => { save.match.currentRound.players[1].teamId = 'team-1' }],
    ['non-array hand', (save) => { save.match.currentRound.players[0].hand = {} }],
    ['unknown card identity', (save) => { save.match.currentRound.drawPile[0].id = 'deck-3-ace-hearts' }],
    ['card face not matching its identity', (save) => { save.match.currentRound.drawPile[0].rank = 'joker' }],
    ['duplicated physical card', (save) => {
      const round = save.match.currentRound
      round.discardPile.push(round.drawPile[0])
    }],
    ['invalid meld type', (save) => {
      const team = save.match.currentRound.teams.find((candidate: any) => candidate.melds.length > 0)
      team.melds[0].type = 'run'
    }],
    ['meld placement without role', (save) => {
      const team = save.match.currentRound.teams.find((candidate: any) => candidate.melds.length > 0)
      delete team.melds[0].cards[0].role
    }],
    ['team with wrong partners', (save) => { save.match.currentRound.teams[0].playerIds = ['player-1', 'player-2'] }],
    ['three pozzetti', (save) => { save.match.currentRound.pozzetti.push([]) }],
    ['invalid turn phase', (save) => { save.match.currentRound.round.turn.phase = 'discard' }],
    ['unknown current player', (save) => { save.match.currentRound.round.turn.currentPlayerId = 'player-5' }],
    ['settled result for a round still in progress', (save) => {
      save.match.roundResults = [{ roundNumber: 1, ending: 'closure', score: { teams: [] } }]
    }],
  ])('rejects an invalid match structure: %s', (_label, corrupt) => {
    const save = wire()
    corrupt(save)
    expect(parseWire(save)).toBeNull()
  })

  it.each<[string, (save: Record<string, any>) => void]>([
    ['missing settled result', (save) => { save.match.roundResults = [] }],
    ['result with a wrong round number', (save) => { save.match.roundResults[0].roundNumber = 2 }],
    ['result ending unlike the round', (save) => {
      save.match.roundResults[0].ending = save.match.roundResults[0].ending === 'closure' ? 'draw-pile-exhausted' : 'closure'
    }],
    ['non-numeric score', (save) => { save.match.roundResults[0].score.teams[0].total = '10' }],
  ])('rejects an inconsistent between-round history: %s', (_label, corrupt) => {
    const save = wire(betweenRoundMatch())
    expect(parseWire(save)).not.toBeNull()
    corrupt(save)
    expect(parseWire(save)).toBeNull()
  })

  it('treats a completed or terminal match as stale rather than resumable', () => {
    const between = wire(betweenRoundMatch())
    expect(parseWire({ ...between, match: { ...between.match, status: 'completed' } })).toBeNull()

    const result = between.match.roundResults[0]
    const roundFour = {
      ...between.match,
      currentRoundNumber: 4,
      roundResults: [1, 2, 3, 4].map((roundNumber) => ({ ...result, roundNumber })),
    }
    expect(parseWire({ ...between, match: roundFour })).toBeNull()
    expect(parseWire({ ...between, match: { ...roundFour, status: 'completed' } })).toBeNull()
  })

  it('is a real runtime guard, not a cast', () => {
    expect(isMatchSaveEnvelope({ version: 2, setup, match: {} })).toBe(false)
    expect(isMatchSaveEnvelope(legacyWire())).toBe(false)
    expect(isMatchSaveEnvelope(wire())).toBe(true)
  })
})

const deck = createBurracoDeck()

const physical = (rank: Rank | 'joker', suit: Suit | null, deckNumber: 1 | 2 = 1): Card => {
  const found = deck.find((card) => card.rank === rank && card.suit === suit && card.deckNumber === deckNumber)
  if (!found) throw new Error(`Missing test card: ${rank} of ${suit}`)
  return found
}

const validMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

/**
 * Moves the meld's physical cards from wherever they are into a new team-1 meld, so the
 * card universe stays complete and the meld is the only thing under test.
 */
const withTeamMeld = (match: MatchState, meld: ValidatedMeld): MatchState => {
  const ids = new Set(meld.cards.map(({ card }) => card.id))
  const keep = (cards: readonly Card[]) => cards.filter(({ id }) => !ids.has(id))
  const round = match.currentRound
  const state: GameState = {
    ...round,
    players: round.players.map((player) => ({ ...player, hand: keep(player.hand) })),
    teams: round.teams.map((team, index) => index === 0 ? { ...team, melds: [...team.melds, meld] } : team),
    drawPile: keep(round.drawPile),
    discardPile: keep(round.discardPile),
    pozzetti: [keep(round.pozzetti[0]), keep(round.pozzetti[1])],
  }
  return { ...match, currentRound: state }
}

/** A fresh seeded round 1 (no melds yet), human to draw. */
const freshMatch = (): MatchState => startMatch(createSetupRoundFactory(setup, createSeededRandom(22)))

/** Hearts 5-6 with a joker: the joker is the single active wildcard of the sequence. */
const jokerSequence = () => validMeld([physical('five', 'hearts'), physical('six', 'hearts'), physical('joker', null)])

/** Parsed wire of a fresh match with one extra team-1 meld, and that meld's wire object. */
const meldWire = (meld: ValidatedMeld) => {
  const save = wire(withTeamMeld(freshMatch(), meld))
  const stored = save.match.currentRound.teams[0].melds.at(-1)
  return { save, stored }
}

describe('match save semantic invariants', () => {
  describe('complete physical-card universe', () => {
    it('accepts real saves, which place all 108 physical cards', () => {
      expect(parseWire(wire())).not.toBeNull()
      expect(parseWire(wire(betweenRoundMatch()))).not.toBeNull()
    })

    it.each<[string, (round: Record<string, any>) => void]>([
      ['a card missing from the stock', (round) => round.drawPile.pop()],
      ['a card missing from a hand', (round) => round.players[2].hand.pop()],
      ['an emptied pozzetto', (round) => { round.pozzetti[1] = [] }],
      ['a card missing from the discard pile', (round) => round.discardPile.pop()],
    ])('rejects a state with %s', (_label, corrupt) => {
      const save = wire()
      corrupt(save.match.currentRound)
      expect(parseWire(save)).toBeNull()
    })

    it('accepts a card moved between zones as long as each card appears exactly once', () => {
      const save = wire()
      const round = save.match.currentRound
      round.pozzetti[0].push(round.drawPile.pop())
      expect(parseWire(save)).not.toBeNull()
    })
  })

  describe('validated meld consistency', () => {
    it('accepts a synthetic meld equal to the engine validation of its cards', () => {
      const { save, stored } = meldWire(jokerSequence())
      expect(stored.activeWildcard).not.toBeNull()
      expect(parseWire(save)).not.toBeNull()
    })

    it('accepts a history-aware wildcard replacement result produced by the engine', () => {
      const existing = jokerSequence()
      const replaced = existing.activeWildcard!.representedRank!
      const extension = validateMeldExtension(existing, [physical(replaced, 'hearts')])
      if (!extension.valid) throw new Error(`Expected a valid extension, received ${extension.reason}`)
      expect(extension.meld.activeWildcard!.representedRank).not.toBe(replaced)

      expect(parseWire(meldWire(extension.meld).save)).not.toBeNull()
    })

    it('rejects an ordinary physical card represented as a wildcard', () => {
      const { save, stored } = meldWire(jokerSequence())
      const natural = stored.cards.find((placement: any) => placement.role === 'natural')
      natural.role = 'wildcard'
      natural.representedRank = natural.card.rank
      expect(parseWire(save)).toBeNull()
    })

    it('rejects a joker stored as a natural card', () => {
      const { save, stored } = meldWire(jokerSequence())
      const joker = stored.cards.find((placement: any) => placement.role === 'wildcard')
      joker.role = 'natural'
      delete joker.representedRank
      stored.activeWildcard = null
      expect(parseWire(save)).toBeNull()
    })

    it('rejects a pinella stored as a natural card in a group', () => {
      const group = validMeld([physical('nine', 'clubs'), physical('nine', 'diamonds'), physical('two', 'spades')])
      const { save, stored } = meldWire(group)
      expect(parseWire(save)).not.toBeNull()
      const pinella = stored.cards.find((placement: any) => placement.role === 'wildcard')
      pinella.role = 'natural'
      delete pinella.representedRank
      stored.activeWildcard = null
      expect(parseWire(save)).toBeNull()
    })

    it('rejects a represented rank inconsistent with the validated meld', () => {
      const { save, stored } = meldWire(jokerSequence())
      const joker = stored.cards.find((placement: any) => placement.role === 'wildcard')
      const wrongRank = joker.representedRank === 'four' ? 'seven' : 'four'
      joker.representedRank = wrongRank
      stored.activeWildcard.representedRank = wrongRank
      expect(parseWire(save)).toBeNull()
    })

    it('rejects an active wildcard that differs from the stored wildcard placement', () => {
      const cases: ((stored: any) => void)[] = [
        (stored) => { stored.activeWildcard = null },
        (stored) => { stored.activeWildcard.representedRank = 'king' },
        (stored) => {
          stored.activeWildcard.card = stored.cards.find((placement: any) => placement.role === 'natural').card
        },
      ]
      for (const corrupt of cases) {
        const { save, stored } = meldWire(jokerSequence())
        corrupt(stored)
        expect(parseWire(save)).toBeNull()
      }
    })

    it('rejects a meld whose placements are reordered or whose metadata is altered', () => {
      const cases: ((stored: any) => void)[] = [
        (stored) => stored.cards.reverse(),
        (stored) => { stored.acePosition = 'high' },
        (stored) => { stored.suit = 'spades' },
      ]
      for (const corrupt of cases) {
        const { save, stored } = meldWire(jokerSequence())
        corrupt(stored)
        expect(parseWire(save)).toBeNull()
      }
    })
  })

  describe('score self-consistency', () => {
    it('rejects a total that does not follow the scoring formula', () => {
      const save = wire(betweenRoundMatch())
      save.match.roundResults[0].score.teams[1].total += 10
      expect(parseWire(save)).toBeNull()
    })

    it('rejects a formula-consistent score that is not the completed round\'s actual score', () => {
      const save = wire(betweenRoundMatch())
      const team = save.match.roundResults[0].score.teams[0]
      team.meldCardPoints += 10
      team.total += 10
      expect(parseWire(save)).toBeNull()
    })

    it('checks the formula for earlier rounds once the next round has started', () => {
      const match = advanceMatch(betweenRoundMatch(), createSetupRoundFactory(setup, createSeededRandom(9)))
      const save = wire(match)
      expect(parseWire(save)).not.toBeNull()
      save.match.roundResults[0].score.teams[0].total -= 5
      expect(parseWire(save)).toBeNull()
    })
  })

  describe('acquisition card IDs', () => {
    /** Human drew from the stock; the drawn card is the recorded acquisition. */
    const afterHumanDraw = (): MatchState => {
      const match = freshMatch()
      return updateCurrentRound(match, drawCard(match.currentRound, 'player-1'))
    }

    it('accepts a drawn card still in hand and one already played into the team melds', () => {
      const match = afterHumanDraw()
      expect(parseWire(wire(match))).not.toBeNull()

      const round = match.currentRound
      if (round.round.status !== 'in-progress' || round.round.turn.phase !== 'action') throw new Error('Expected action phase.')
      const drawnId = round.round.turn.acquisition.cardIds[0]!
      const drawn = deck.find(({ id }) => id === drawnId)!
      if (drawn.rank === 'joker' || drawn.rank === 'two') throw new Error('Fixture drew a wildcard.')
      const partners = deck.filter((card) => card.rank === drawn.rank && card.id !== drawn.id).slice(0, 2)

      expect(parseWire(wire(withTeamMeld(match, validMeld([drawn, ...partners]))))).not.toBeNull()
    })

    it.each<[string, (turn: Record<string, any>, round: Record<string, any>) => void]>([
      ['a non-card ID', (turn) => { turn.acquisition.cardIds = ['not-a-card'] }],
      ['a non-string ID', (turn) => { turn.acquisition.cardIds = [7] }],
      ['a duplicated ID', (turn) => { turn.acquisition.cardIds = [turn.acquisition.cardIds[0], turn.acquisition.cardIds[0]] }],
      ['a card that is still in the stock', (turn, round) => { turn.acquisition.cardIds = [round.drawPile[0].id] }],
      ['a card held by another player', (turn, round) => { turn.acquisition.cardIds = [round.players[1].hand[0].id] }],
    ])('rejects an acquisition with %s', (_label, corrupt) => {
      const save = wire(afterHumanDraw())
      const round = save.match.currentRound
      corrupt(round.round.turn, round)
      expect(parseWire(save)).toBeNull()
    })
  })

  it('loadMatchSave discards a save violating any of these invariants', () => {
    const corruptions: ((save: Record<string, any>) => void)[] = [
      (save) => save.match.currentRound.drawPile.pop(),
      (save) => {
        const joker = save.match.currentRound.teams[0].melds.at(-1).cards.find((placement: any) => placement.role === 'wildcard')
        joker.representedRank = 'king'
      },
      (save) => { save.match.currentRound.round = { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'action', acquisition: { source: 'drawPile', cardIds: ['nope'] } } } },
    ]
    for (const corrupt of corruptions) {
      const save = meldWire(jokerSequence()).save
      corrupt(save)
      const storage = createMemoryStorage()
      storage.setItem(MATCH_SAVE_STORAGE_KEY, JSON.stringify(save))
      expect(loadMatchSave(storage)).toEqual({ status: 'discarded' })
      expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBeNull()
    }

    const scoreSave = wire(betweenRoundMatch())
    scoreSave.match.roundResults[0].score.teams[0].total += 1
    const storage = createMemoryStorage()
    storage.setItem(MATCH_SAVE_STORAGE_KEY, JSON.stringify(scoreSave))
    expect(loadMatchSave(storage)).toEqual({ status: 'discarded' })
  })
})

describe('match save storage operations', () => {
  it('saves under the stable key and loads the same save back', () => {
    const storage = createMemoryStorage()
    const match = activeMatch()

    expect(saveMatch(setup, match, storage)).toBe(true)

    expect(storage.length).toBe(1)
    expect(JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!).version).toBe(2)
    expect(loadMatchSave(storage)).toEqual({ status: 'restored', save: { version: 2, setup, match } })
  })

  it('reports no save when storage is empty', () => {
    expect(loadMatchSave(createMemoryStorage())).toEqual({ status: 'none' })
  })

  it('discards invalid, unsupported and stale saves and attempts their removal', () => {
    const between = wire(betweenRoundMatch())
    for (const raw of [
      'not json',
      JSON.stringify({ ...wire(), version: 3 }),
      JSON.stringify({ ...legacyWire(), version: 0 }),
      JSON.stringify({ ...between, match: { ...between.match, status: 'completed' } }),
    ]) {
      const storage = createMemoryStorage()
      storage.setItem(MATCH_SAVE_STORAGE_KEY, raw)
      const removeItem = vi.spyOn(storage, 'removeItem')

      expect(loadMatchSave(storage)).toEqual({ status: 'discarded' })

      expect(removeItem).toHaveBeenCalledExactlyOnceWith(MATCH_SAVE_STORAGE_KEY)
      expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBeNull()
    }
  })

  it('still discards an invalid save when its removal fails', () => {
    const storage = throwingStorage({ removeItem: true })
    storage.setItem(MATCH_SAVE_STORAGE_KEY, 'not json')

    expect(loadMatchSave(storage)).toEqual({ status: 'discarded' })
  })

  it('contains read, write and remove failures', () => {
    expect(loadMatchSave(throwingStorage({ getItem: true }))).toEqual({ status: 'unavailable' })
    expect(saveMatch(setup, activeMatch(), throwingStorage({ setItem: true }))).toBe(false)
    expect(clearMatchSave(throwingStorage({ removeItem: true }))).toBe(false)
  })

  it('treats missing storage as unavailable without throwing', () => {
    expect(loadMatchSave(null)).toEqual({ status: 'unavailable' })
    expect(saveMatch(setup, activeMatch(), null)).toBe(false)
    expect(clearMatchSave(null)).toBe(false)
  })

  it('clears only the active save', () => {
    const storage = createMemoryStorage()
    storage.setItem('other', 'kept')
    saveMatch(setup, activeMatch(), storage)

    expect(clearMatchSave(storage)).toBe(true)

    expect(storage.getItem(MATCH_SAVE_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('other')).toBe('kept')
  })

  it('never mutates the supplied setup or match', () => {
    const match = activeMatch()
    const snapshot = structuredClone({ setup, match })
    deepFreeze(match)
    const frozenSetup = deepFreeze({ ...setup })
    const storage = createMemoryStorage()

    expect(saveMatch(frozenSetup, match, storage)).toBe(true)
    serializeMatchSave(frozenSetup, match)
    clearMatchSave(storage)

    expect({ setup: frozenSetup, match }).toEqual(snapshot)
  })
})
