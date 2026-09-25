import type { Card, Rank, Suit } from '../cards/types'

export const MELD_VALIDATION_REASONS = [
  'TOO_FEW_CARDS',
  'TOO_MANY_CARDS',
  'DUPLICATE_CARD_ID',
  'NOT_A_VALID_GROUP',
  'NOT_A_VALID_SEQUENCE',
  'NOT_A_VALID_MELD',
  'TOO_MANY_WILDCARDS',
  'INVALID_SEQUENCE_SUITS',
  'DUPLICATE_SEQUENCE_RANK',
  'INVALID_SEQUENCE_GAPS',
  'INVALID_ACE_USAGE',
  'GROUP_CANNOT_BE_WILDCARDS_ONLY',
  'EMPTY_EXTENSION',
] as const

export type MeldValidationReason = (typeof MELD_VALIDATION_REASONS)[number]

export type NaturalMeldCard = Readonly<{
  card: Card
  role: 'natural'
}>

/**
 * `representedRank` is null only for a free wildcard beyond a complete A-to-K run.
 * The physical card remains unchanged in `card`.
 */
export type WildcardMeldCard = Readonly<{
  card: Card
  role: 'wildcard'
  representedRank: Rank | null
}>

export type MeldCardPlacement = NaturalMeldCard | WildcardMeldCard

export type ValidatedGroup = Readonly<{
  type: 'group'
  rank: Exclude<Rank, 'two'>
  cards: readonly MeldCardPlacement[]
  activeWildcard: WildcardMeldCard | null
}>

export type AcePosition = 'none' | 'low' | 'high'

export type ValidatedSequence = Readonly<{
  type: 'sequence'
  suit: Suit
  cards: readonly MeldCardPlacement[]
  acePosition: AcePosition
  activeWildcard: WildcardMeldCard | null
}>

export type ValidatedMeld = ValidatedGroup | ValidatedSequence

export type MeldValidationResult<T extends ValidatedMeld = ValidatedMeld> =
  | Readonly<{ valid: true; meld: T }>
  | Readonly<{ valid: false; reason: MeldValidationReason }>

export const invalidMeld = <T extends ValidatedMeld>(
  reason: MeldValidationReason,
): MeldValidationResult<T> => ({ valid: false, reason })
