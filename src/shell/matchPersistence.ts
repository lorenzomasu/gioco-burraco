import { DEFAULT_BOT_DIFFICULTY, isBotDifficulty } from '../game/bot/difficulty'
import { createBurracoDeck } from '../game/cards/deck'
import type { Card } from '../game/cards/types'
import { isMatchRoundCount, type MatchState } from '../game/match'
import { validateMeld } from '../game/melds'
import { calculateRoundScore, type TeamRoundScore } from '../game/scoring'
import type { GameState } from '../game/state/types'
import { HUMAN_PLAYER_ID, type MatchSetup } from './matchSetup'

/** The single browser-storage key holding the one active local match. */
export const MATCH_SAVE_STORAGE_KEY = 'gioco-burraco:active-match'

/**
 * The current save wire-format version. Version 2 added the configured match length and
 * version 3 the bot difficulty. The only other accepted versions are the released legacy
 * versions 1 (always four smazzate) and 2 (explicit length), both normal difficulty and
 * normalized on load; any other version is rejected, never reinterpreted.
 */
export const MATCH_SAVE_SCHEMA_VERSION = 3

/** The released pre-M34 wire-format version, restored as a four-smazzate normal save. */
export const LEGACY_MATCH_SAVE_SCHEMA_VERSION = 1

/** The released M34 wire-format version, restored with its length and normal difficulty. */
export const LENGTH_ONLY_MATCH_SAVE_SCHEMA_VERSION = 2

/**
 * The complete resumable wire format: the onboarding setup needed to recreate future-round
 * factories, and the authoritative committed match. Transient UI machinery is never stored.
 */
export type MatchSaveEnvelope = Readonly<{
  version: typeof MATCH_SAVE_SCHEMA_VERSION
  setup: MatchSetup
  match: MatchState
}>

export type MatchSaveLoadResult =
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'restored'; save: MatchSaveEnvelope }>
  /** A stored save existed but was invalid, stale or unsupported; removal was attempted. */
  | Readonly<{ status: 'discarded' }>
  /** Storage could not be read at all. */
  | Readonly<{ status: 'unavailable' }>

/** Resolves browser-local storage; accessing it can itself throw (for example when blocked). */
export const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Builds the JSON wire representation. Only the setup fields and the match are written. */
export const serializeMatchSave = (setup: MatchSetup, match: MatchState): string => {
  const envelope: MatchSaveEnvelope = {
    version: MATCH_SAVE_SCHEMA_VERSION,
    setup: {
      humanPlayerName: setup.humanPlayerName,
      roundCount: setup.roundCount,
      botDifficulty: setup.botDifficulty,
    },
    match,
  }
  return JSON.stringify(envelope)
}

/** Parses and validates a stored wire string; `null` for anything that is not a resumable save. */
export const parseMatchSave = (raw: string): MatchSaveEnvelope | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return normalizeMatchSave(parsed)
}

/** Reads the active save. Invalid saves are removed when possible; no failure escapes. */
export const loadMatchSave = (storage: Storage | null = getBrowserStorage()): MatchSaveLoadResult => {
  if (!storage) return { status: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(MATCH_SAVE_STORAGE_KEY)
  } catch {
    return { status: 'unavailable' }
  }
  if (raw === null) return { status: 'none' }
  const save = parseMatchSave(raw)
  if (save) return { status: 'restored', save }
  clearMatchSave(storage)
  return { status: 'discarded' }
}

/** Writes the active save; returns whether the write succeeded. */
export const saveMatch = (
  setup: MatchSetup,
  match: MatchState,
  storage: Storage | null = getBrowserStorage(),
): boolean => {
  if (!storage) return false
  try {
    storage.setItem(MATCH_SAVE_STORAGE_KEY, serializeMatchSave(setup, match))
    return true
  } catch {
    return false
  }
}

/** Removes the active save; returns whether the removal succeeded. */
export const clearMatchSave = (storage: Storage | null = getBrowserStorage()): boolean => {
  if (!storage) return false
  try {
    storage.removeItem(MATCH_SAVE_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------
// Runtime validation. Stored data is `unknown` until every structure the application reads
// has been checked; nothing is cast to `MatchState` on trust. Beyond shape, the guards
// enforce locally verifiable invariants by reusing the engine's own deterministic
// primitives (meld validation, round scoring) instead of a second rules implementation.
// They do not replay the match or prove that the state is reachable.
// ---------------------------------------------------------------------------------------

type UnknownRecord = Readonly<Record<string, unknown>>

const PLAYER_SEATS = [
  { id: 'player-1', teamId: 'team-1' },
  { id: 'player-2', teamId: 'team-2' },
  { id: 'player-3', teamId: 'team-1' },
  { id: 'player-4', teamId: 'team-2' },
] as const
const TEAM_SEATS = [
  { id: 'team-1', playerIds: ['player-1', 'player-3'] },
  { id: 'team-2', playerIds: ['player-2', 'player-4'] },
] as const
const PLAYER_IDS: readonly unknown[] = PLAYER_SEATS.map(({ id }) => id)
const TEAM_IDS: readonly unknown[] = TEAM_SEATS.map(({ id }) => id)
const SCORE_FIELDS = [
  'meldCardPoints', 'burracoBonus', 'closingBonus', 'handPenalty', 'pozzettoPenalty', 'total',
] as const

/** Canonical physical cards by identity: a stored card must match its real face exactly. */
const CANONICAL_CARDS: ReadonlyMap<string, Card> = new Map(createBurracoDeck().map((card) => [card.id, card]))

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isOneOf = (value: unknown, allowed: readonly unknown[]): boolean => allowed.includes(value)

const isRoundNumber = (value: unknown, roundCount: number): value is 1 | 2 | 3 | 4 =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= roundCount

/** Structural equality of JSON-compatible values, independent of object key order. */
const jsonEqual = (first: unknown, second: unknown): boolean => {
  if (first === second) return true
  if (Array.isArray(first)) {
    return Array.isArray(second)
      && first.length === second.length
      && first.every((item, index) => jsonEqual(item, second[index]))
  }
  if (!isRecord(first) || !isRecord(second)) return false
  const keys = Object.keys(first)
  return keys.length === Object.keys(second).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(second, key) && jsonEqual(first[key], second[key]))
}

/**
 * Collects every physical card placed in the state: each must be canonical, appear once,
 * and together they must form the complete two-deck universe.
 */
class CardLedger {
  private readonly ids = new Set<string>()

  accept(value: unknown): boolean {
    if (!isRecord(value) || typeof value.id !== 'string') return false
    const canonical = CANONICAL_CARDS.get(value.id)
    if (!canonical || this.ids.has(value.id)) return false
    if (value.deckNumber !== canonical.deckNumber || value.rank !== canonical.rank || value.suit !== canonical.suit) {
      return false
    }
    this.ids.add(value.id)
    return true
  }

  acceptAll(value: unknown): boolean {
    return Array.isArray(value) && value.every((card) => this.accept(card))
  }

  isComplete(): boolean {
    return this.ids.size === CANONICAL_CARDS.size
  }
}

/**
 * A stored meld is always exactly the engine's stateless validation of its physical cards:
 * `playMeld` stores `validateMeld`, and `validateMeldExtension` (the extension gate, which
 * may reposition a wildcard) also returns `validateMeld` of the combined cards.
 * Re-validating therefore rejects impossible roles, represented ranks, ace positions and
 * active wildcards without restricting any legitimate extension result.
 */
const isMeld = (value: unknown, ledger: CardLedger): boolean => {
  if (!isRecord(value) || !Array.isArray(value.cards)) return false
  const cards: Card[] = []
  for (const placement of value.cards) {
    if (!isRecord(placement) || !ledger.accept(placement.card)) return false
    cards.push(CANONICAL_CARDS.get((placement.card as UnknownRecord).id as string)!)
  }
  const validation = validateMeld(cards)
  return validation.valid && jsonEqual(validation.meld, value)
}

const isPlayers = (value: unknown, ledger: CardLedger): boolean =>
  Array.isArray(value)
  && value.length === PLAYER_SEATS.length
  && value.every((player, index) =>
    isRecord(player)
    && player.id === PLAYER_SEATS[index]!.id
    && player.teamId === PLAYER_SEATS[index]!.teamId
    && typeof player.name === 'string'
    && ledger.acceptAll(player.hand))

const isTeams = (value: unknown, ledger: CardLedger): boolean =>
  Array.isArray(value)
  && value.length === TEAM_SEATS.length
  && value.every((team, index) =>
    isRecord(team)
    && team.id === TEAM_SEATS[index]!.id
    && Array.isArray(team.playerIds)
    && team.playerIds.length === 2
    && team.playerIds.every((id, seat) => id === TEAM_SEATS[index]!.playerIds[seat])
    && typeof team.hasTakenPozzetto === 'boolean'
    && Array.isArray(team.melds)
    && team.melds.every((meld) => isMeld(meld, ledger)))

const isTurn = (value: unknown): boolean => {
  if (!isRecord(value) || !isOneOf(value.currentPlayerId, PLAYER_IDS)) return false
  if (value.phase === 'mustDraw') return true
  if (value.phase !== 'action' || !isRecord(value.acquisition)) return false
  const { acquisition } = value
  if (!Array.isArray(acquisition.cardIds)) return false
  if (acquisition.source === 'drawPile') return true
  return acquisition.source === 'discardPile' && typeof acquisition.canRediscardSingleCollectedCard === 'boolean'
}

const isRoundState = (value: unknown): value is UnknownRecord => {
  if (!isRecord(value)) return false
  if (value.status === 'in-progress') return isTurn(value.turn)
  if (value.status !== 'completed') return false
  if (value.ending === 'closure') {
    return isOneOf(value.closedByPlayerId, PLAYER_IDS) && isOneOf(value.closingTeamId, TEAM_IDS)
  }
  return value.ending === 'draw-pile-exhausted' && isOneOf(value.lastDiscardPlayerId, PLAYER_IDS)
}

/**
 * Cards acquired this turn are distinct canonical cards that the current player still
 * holds or has since played into their own team's melds (the turn ends at the discard).
 */
const hasConsistentAcquisition = (state: GameState): boolean => {
  if (state.round.status !== 'in-progress' || state.round.turn.phase !== 'action') return true
  const { currentPlayerId, acquisition } = state.round.turn
  const player = state.players.find(({ id }) => id === currentPlayerId)!
  const team = state.teams.find(({ id }) => id === player.teamId)!
  const reachable = new Set([
    ...player.hand.map(({ id }) => id),
    ...team.melds.flatMap((meld) => meld.cards.map(({ card }) => card.id)),
  ])
  const cardIds: readonly unknown[] = acquisition.cardIds
  return new Set(cardIds).size === cardIds.length
    && cardIds.every((id) => typeof id === 'string' && CANONICAL_CARDS.has(id) && reachable.has(id))
}

const isGameState = (value: unknown): value is GameState => {
  if (!isRecord(value)) return false
  const ledger = new CardLedger()
  return isPlayers(value.players, ledger)
    && isTeams(value.teams, ledger)
    && ledger.acceptAll(value.drawPile)
    && ledger.acceptAll(value.discardPile)
    && Array.isArray(value.pozzetti)
    && value.pozzetti.length === 2
    && value.pozzetti.every((pozzetto) => ledger.acceptAll(pozzetto))
    && ledger.isComplete()
    && isRoundState(value.round)
    && hasConsistentAcquisition(value as unknown as GameState)
}

/** Every component is a finite number and the total follows the round-scoring formula. */
const isTeamRoundScore = (value: unknown, teamId: string): boolean => {
  if (!isRecord(value) || value.teamId !== teamId) return false
  if (!SCORE_FIELDS.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]))) return false
  const score = value as unknown as TeamRoundScore
  return score.total === score.meldCardPoints + score.burracoBonus + score.closingBonus
    - score.handPenalty - score.pozzettoPenalty
}

const isSettledRoundResult = (value: unknown, roundNumber: number): value is UnknownRecord =>
  isRecord(value)
  && value.roundNumber === roundNumber
  && isOneOf(value.ending, ['closure', 'draw-pile-exhausted'])
  && isRecord(value.score)
  && Array.isArray(value.score.teams)
  && value.score.teams.length === TEAM_SEATS.length
  && value.score.teams.every((teamScore, index) => isTeamRoundScore(teamScore, TEAM_SEATS[index]!.id))

/** The settled result of the still-visible completed round must be its actual score. */
const matchesCompletedRoundScore = (round: GameState, result: UnknownRecord): boolean => {
  if (round.round.status !== 'completed') return true
  try {
    return result.ending === round.round.ending
      && jsonEqual(calculateRoundScore({ ...round, round: round.round }), result.score)
  } catch {
    return false
  }
}

/**
 * An active, resumable match of a supported configured length: in progress, with exactly
 * one settled result per finished round (the current round included once it has
 * completed). A completed match, or one beyond its configured length, is stale.
 */
const isActiveMatchState = (value: unknown): value is MatchState => {
  if (!isRecord(value) || value.status !== 'in-progress' || !isMatchRoundCount(value.roundCount)) return false
  const { roundCount, currentRoundNumber, currentRound } = value
  if (!isRoundNumber(currentRoundNumber, roundCount)) return false
  if (!isGameState(currentRound)) return false
  const roundCompleted = currentRound.round.status === 'completed'
  // A completed final round always completes the match, so it can no longer be active.
  if (roundCompleted && currentRoundNumber === roundCount) return false

  const { roundResults } = value
  const expectedResults = roundCompleted ? currentRoundNumber : currentRoundNumber - 1
  if (!Array.isArray(roundResults) || roundResults.length !== expectedResults) return false
  if (!roundResults.every((result, index) => isSettledRoundResult(result, index + 1))) return false
  return !roundCompleted || matchesCompletedRoundScore(currentRound, roundResults.at(-1) as UnknownRecord)
}

const isMatchSetup = (value: unknown): value is MatchSetup =>
  isRecord(value)
  && typeof value.humanPlayerName === 'string'
  && value.humanPlayerName.length > 0
  && value.humanPlayerName === value.humanPlayerName.trim()
  && isMatchRoundCount(value.roundCount)
  && isBotDifficulty(value.botDifficulty)

/** Validates an already-parsed value as a current-version, active, internally consistent save. */
export const isMatchSaveEnvelope = (value: unknown): value is MatchSaveEnvelope => {
  if (!isRecord(value) || value.version !== MATCH_SAVE_SCHEMA_VERSION) return false
  if (!isMatchSetup(value.setup) || !isActiveMatchState(value.match)) return false
  if (value.setup.roundCount !== value.match.roundCount) return false
  const human = value.match.currentRound.players.find(({ id }) => id === HUMAN_PLAYER_ID)
  return human?.name === value.setup.humanPlayerName
}

const LEGACY_ROUND_COUNT = 4

const hasOwn = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

/**
 * The released version-1 save has no length or difficulty fields and always meant four
 * smazzate against the normal bots. Its setup and match must carry exactly the version-1
 * fields; they are given round count 4 and normal difficulty, then pass the full current
 * validation.
 */
const migrateVersion1MatchSave = (value: UnknownRecord): unknown => {
  const { setup, match } = value
  if (!isRecord(setup) || !isRecord(match)) return null
  if (hasOwn(setup, 'roundCount') || hasOwn(setup, 'botDifficulty')) return null
  if (hasOwn(match, 'roundCount')) return null
  return {
    version: MATCH_SAVE_SCHEMA_VERSION,
    setup: { ...setup, roundCount: LEGACY_ROUND_COUNT, botDifficulty: DEFAULT_BOT_DIFFICULTY },
    match: { roundCount: LEGACY_ROUND_COUNT, ...match },
  }
}

/**
 * The released version-2 save carries its configured length but no difficulty and always
 * meant the normal bots. It is given normal difficulty and then passes the full current
 * validation, so every version-2 check (including the length checks) still applies.
 */
const migrateVersion2MatchSave = (value: UnknownRecord): unknown => {
  const { setup } = value
  if (!isRecord(setup) || hasOwn(setup, 'botDifficulty')) return null
  return {
    ...value,
    version: MATCH_SAVE_SCHEMA_VERSION,
    setup: { ...setup, botDifficulty: DEFAULT_BOT_DIFFICULTY },
  }
}

/**
 * Accepts a current-version save as is, or a valid released version-1 or version-2 save
 * normalized to the current in-memory shape; `null` for everything else.
 */
export const normalizeMatchSave = (value: unknown): MatchSaveEnvelope | null => {
  if (isRecord(value) && value.version === LEGACY_MATCH_SAVE_SCHEMA_VERSION) {
    const migrated = migrateVersion1MatchSave(value)
    return isMatchSaveEnvelope(migrated) ? migrated : null
  }
  if (isRecord(value) && value.version === LENGTH_ONLY_MATCH_SAVE_SCHEMA_VERSION) {
    const migrated = migrateVersion2MatchSave(value)
    return isMatchSaveEnvelope(migrated) ? migrated : null
  }
  return isMatchSaveEnvelope(value) ? value : null
}
