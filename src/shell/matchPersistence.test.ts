import { describe, expect, it, vi } from 'vitest'
import { playBotStep, playBotTurn } from '../game/bot'
import { createSeededRandom } from '../game/cards/shuffle'
import { startMatch, updateCurrentRound, type MatchState } from '../game/match'
import type { GameState } from '../game/state/types'
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

const setup: MatchSetup = { humanPlayerName: 'Lorenzo' }

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

/** Round 1 completed by draw-pile exhaustion and settled: the between-round state. */
const betweenRoundMatch = (): MatchState => {
  const match = startMatch(createSetupRoundFactory(setup, createSeededRandom(5)))
  const short = { ...match.currentRound, drawPile: match.currentRound.drawPile.slice(0, 3) }
  const completed = playTurns(short, 20)
  if (completed.round.status !== 'completed') throw new Error('Fixture round did not end.')
  return updateCurrentRound(match, completed)
}

/** Parsed wire object, so tests can corrupt individual fields. */
const wire = (match: MatchState = activeMatch()): Record<string, any> => JSON.parse(serializeMatchSave(setup, match))

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
  it('uses one explicit version-1 envelope holding only the setup and the match', () => {
    expect(MATCH_SAVE_SCHEMA_VERSION).toBe(1)
    const match = activeMatch()
    const extendedSetup = { humanPlayerName: 'Lorenzo', ignored: () => 1 } as unknown as MatchSetup

    const envelope = JSON.parse(serializeMatchSave(extendedSetup, match))

    expect(Object.keys(envelope)).toEqual(['version', 'setup', 'match'])
    expect(envelope.version).toBe(1)
    expect(envelope.setup).toEqual({ humanPlayerName: 'Lorenzo' })
    expect(Object.keys(envelope.match).sort()).toEqual(['currentRound', 'currentRoundNumber', 'roundResults', 'status'])
  })

  it('round-trips an active match with melds, acquisition state and pozzetti without loss', () => {
    const match = activeMatch()
    expect(match.currentRound.teams.some((team) => team.melds.length > 0)).toBe(true)
    expect(match.currentRound.round).toMatchObject({ status: 'in-progress', turn: { phase: 'action' } })

    const restored = parseMatchSave(serializeMatchSave(setup, match))

    expect(restored).toEqual({ version: 1, setup, match })
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

    expect(parseMatchSave(serializeMatchSave(setup, match))).toEqual({ version: 1, setup, match })
  })
})

describe('match save validation', () => {
  it('rejects malformed JSON and non-object roots', () => {
    expect(parseMatchSave('{"version":1,')).toBeNull()
    expect(parseMatchSave('')).toBeNull()
    for (const root of [null, 1, 'save', [], true]) expect(parseWire(root)).toBeNull()
  })

  it('rejects any version other than the supported one', () => {
    for (const version of [0, 2, '1', null, undefined]) {
      expect(parseWire({ ...wire(), version })).toBeNull()
    }
    const { version: _omitted, ...withoutVersion } = wire()
    expect(parseWire(withoutVersion)).toBeNull()
  })

  it('rejects missing or invalid setup', () => {
    const base = wire()
    for (const invalid of [undefined, null, {}, { humanPlayerName: '' }, { humanPlayerName: ' Lorenzo ' }, { humanPlayerName: 7 }]) {
      expect(parseWire({ ...base, setup: invalid })).toBeNull()
    }
  })

  it('rejects a setup name inconsistent with the saved player-1', () => {
    expect(parseWire({ ...wire(), setup: { humanPlayerName: 'Giulia' } })).toBeNull()
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
    expect(isMatchSaveEnvelope({ version: 1, setup, match: {} })).toBe(false)
    expect(isMatchSaveEnvelope(wire())).toBe(true)
  })
})

describe('match save storage operations', () => {
  it('saves under the stable key and loads the same save back', () => {
    const storage = createMemoryStorage()
    const match = activeMatch()

    expect(saveMatch(setup, match, storage)).toBe(true)

    expect(storage.length).toBe(1)
    expect(JSON.parse(storage.getItem(MATCH_SAVE_STORAGE_KEY)!).version).toBe(1)
    expect(loadMatchSave(storage)).toEqual({ status: 'restored', save: { version: 1, setup, match } })
  })

  it('reports no save when storage is empty', () => {
    expect(loadMatchSave(createMemoryStorage())).toEqual({ status: 'none' })
  })

  it('discards invalid, unsupported and stale saves and attempts their removal', () => {
    const between = wire(betweenRoundMatch())
    for (const raw of [
      'not json',
      JSON.stringify({ ...wire(), version: 2 }),
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
