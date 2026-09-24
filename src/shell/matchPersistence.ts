import { createBurracoDeck } from '../game/cards/deck'
import { RANKS, SUITS, type Card } from '../game/cards/types'
import type { MatchState } from '../game/match'
import { HUMAN_PLAYER_ID, type MatchSetup } from './matchSetup'

/** The single browser-storage key holding the one active local match. */
export const MATCH_SAVE_STORAGE_KEY = 'gioco-burraco:active-match'

/** The current save wire-format version. Any other version is rejected, never reinterpreted. */
export const MATCH_SAVE_SCHEMA_VERSION = 1

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
    setup: { humanPlayerName: setup.humanPlayerName },
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
  return isMatchSaveEnvelope(parsed) ? parsed : null
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
// has been checked; nothing is cast to `MatchState` on trust.
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
const ACE_POSITIONS: readonly unknown[] = ['none', 'low', 'high']
const SCORE_FIELDS = [
  'meldCardPoints', 'burracoBonus', 'closingBonus', 'handPenalty', 'pozzettoPenalty', 'total',
] as const

/** Canonical physical cards by identity: a stored card must match its real face exactly. */
const CANONICAL_CARDS: ReadonlyMap<string, Card> = new Map(createBurracoDeck().map((card) => [card.id, card]))

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isOneOf = (value: unknown, allowed: readonly unknown[]): boolean => allowed.includes(value)

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isRoundNumber = (value: unknown): value is 1 | 2 | 3 | 4 => isOneOf(value, [1, 2, 3, 4])

/** Collects every physical card seen in the state so identity uniqueness can be checked. */
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
}

/** A card placement inside a meld; its card is recorded by the caller. */
const isMeldPlacement = (value: unknown): value is UnknownRecord => {
  if (!isRecord(value) || !isRecord(value.card)) return false
  if (value.role === 'natural') return true
  return value.role === 'wildcard' && (value.representedRank === null || isOneOf(value.representedRank, RANKS))
}

const isMeld = (value: unknown, ledger: CardLedger): boolean => {
  if (!isRecord(value) || !Array.isArray(value.cards) || value.cards.length === 0) return false
  if (value.type === 'group') {
    if (!isOneOf(value.rank, RANKS) || value.rank === 'two') return false
  } else if (value.type === 'sequence') {
    if (!isOneOf(value.suit, SUITS) || !isOneOf(value.acePosition, ACE_POSITIONS)) return false
  } else {
    return false
  }
  if (!value.cards.every(isMeldPlacement)) return false
  if (!value.cards.every((placement) => ledger.accept((placement as UnknownRecord).card))) return false

  const active = value.activeWildcard
  if (active === null) return true
  // The active wildcard is a copy of one of the meld's own wildcard placements.
  if (!isMeldPlacement(active) || active.role !== 'wildcard') return false
  const activeCard = active.card as UnknownRecord
  return value.cards.some((placement) => {
    const record = placement as UnknownRecord
    return record.role === 'wildcard' && (record.card as UnknownRecord).id === activeCard.id
  })
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
  if (!isStringArray(acquisition.cardIds)) return false
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

const isGameState = (value: unknown): value is UnknownRecord => {
  if (!isRecord(value)) return false
  const ledger = new CardLedger()
  return isPlayers(value.players, ledger)
    && isTeams(value.teams, ledger)
    && ledger.acceptAll(value.drawPile)
    && ledger.acceptAll(value.discardPile)
    && Array.isArray(value.pozzetti)
    && value.pozzetti.length === 2
    && value.pozzetti.every((pozzetto) => ledger.acceptAll(pozzetto))
    && isRoundState(value.round)
}

const isTeamRoundScore = (value: unknown, teamId: string): boolean =>
  isRecord(value)
  && value.teamId === teamId
  && SCORE_FIELDS.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]))

const isSettledRoundResult = (value: unknown, roundNumber: number): value is UnknownRecord =>
  isRecord(value)
  && value.roundNumber === roundNumber
  && isOneOf(value.ending, ['closure', 'draw-pile-exhausted'])
  && isRecord(value.score)
  && Array.isArray(value.score.teams)
  && value.score.teams.length === TEAM_SEATS.length
  && value.score.teams.every((teamScore, index) => isTeamRoundScore(teamScore, TEAM_SEATS[index]!.id))

/**
 * An active, resumable match: in progress, with exactly one settled result per finished
 * round (the current round included once it has completed). A completed match is stale.
 */
const isActiveMatchState = (value: unknown): value is MatchState => {
  if (!isRecord(value) || value.status !== 'in-progress' || !isRoundNumber(value.currentRoundNumber)) return false
  const { currentRoundNumber } = value
  if (!isGameState(value.currentRound)) return false
  const round = value.currentRound.round as UnknownRecord
  const roundCompleted = round.status === 'completed'
  // A completed fourth round always completes the match, so it can no longer be active.
  if (roundCompleted && currentRoundNumber === 4) return false

  const { roundResults } = value
  const expectedResults = roundCompleted ? currentRoundNumber : currentRoundNumber - 1
  if (!Array.isArray(roundResults) || roundResults.length !== expectedResults) return false
  if (!roundResults.every((result, index) => isSettledRoundResult(result, index + 1))) return false
  return !roundCompleted || (roundResults.at(-1) as UnknownRecord).ending === round.ending
}

const isMatchSetup = (value: unknown): value is MatchSetup =>
  isRecord(value)
  && typeof value.humanPlayerName === 'string'
  && value.humanPlayerName.length > 0
  && value.humanPlayerName === value.humanPlayerName.trim()

/** Validates an already-parsed value as a supported, active, internally consistent save. */
export const isMatchSaveEnvelope = (value: unknown): value is MatchSaveEnvelope => {
  if (!isRecord(value) || value.version !== MATCH_SAVE_SCHEMA_VERSION) return false
  if (!isMatchSetup(value.setup) || !isActiveMatchState(value.match)) return false
  const human = value.match.currentRound.players.find(({ id }) => id === HUMAN_PLAYER_ID)
  return human?.name === value.setup.humanPlayerName
}
