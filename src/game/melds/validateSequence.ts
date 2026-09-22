import { isJoker, isPinella, type Card, type Rank, type Suit } from '../cards/types'
import {
  ACE_HIGH_RANKS,
  ACE_LOW_RANKS,
  commonCandidateError,
  comparePhysicalCards,
  MAX_SEQUENCE_SIZE,
} from './shared'
import {
  invalidMeld,
  type AcePosition,
  type MeldCardPlacement,
  type MeldValidationReason,
  type MeldValidationResult,
  type ValidatedSequence,
  type WildcardMeldCard,
} from './types'

type TwoInterpretation = Readonly<{
  naturalTwo: Card | null
  activeWildcard: Card | null
}>

type SequenceResolution = Readonly<{
  placements: readonly MeldCardPlacement[]
  activeWildcard: WildcardMeldCard | null
  acePosition: AcePosition
  internalWildcard: boolean
  naturalTwoId: string | null
  orientationPriority: number
}>

const possibleTwoInterpretations = (
  twos: readonly Card[],
  jokers: readonly Card[],
  suit: Suit,
): readonly TwoInterpretation[] => {
  const sortedTwos = [...twos].sort(comparePhysicalCards)
  const candidates: TwoInterpretation[] = [{ naturalTwo: null, activeWildcard: null }]
  for (const naturalTwo of sortedTwos.filter((card) => card.suit === suit)) {
    candidates.push({ naturalTwo, activeWildcard: null })
  }

  return candidates.map(({ naturalTwo }) => {
    const activeCards = [...jokers, ...sortedTwos.filter((card) => card.id !== naturalTwo?.id)]
    return { naturalTwo, activeWildcard: activeCards.length === 1 ? activeCards[0]! : null }
  }).filter(({ naturalTwo, activeWildcard }) => {
    const activeCount = jokers.length + sortedTwos.length - (naturalTwo ? 1 : 0)
    return activeCount <= 1 && (activeCount === 0 || activeWildcard !== null)
  })
}

const acePositionFor = (ranks: readonly Rank[], placements: readonly MeldCardPlacement[]): AcePosition => {
  const aceIndex = placements.findIndex((placement) =>
    placement.role === 'natural' ? placement.card.rank === 'ace' : placement.representedRank === 'ace',
  )
  if (aceIndex < 0) return 'none'
  return ranks[0] === 'ace' ? 'low' : 'high'
}

const resolveAgainstRankOrder = (
  naturalCards: readonly Card[],
  wildcardCard: Card | null,
  rankOrder: readonly Rank[],
  orientationPriority: number,
  naturalTwoId: string | null,
): SequenceResolution | null => {
  const cardsByRank = new Map<Rank, Card>()
  for (const card of naturalCards) {
    if (card.rank === 'joker' || cardsByRank.has(card.rank)) return null
    cardsByRank.set(card.rank, card)
  }

  const naturalIndexes = naturalCards.map((card) => rankOrder.indexOf(card.rank as Rank))
  if (naturalIndexes.some((index) => index < 0)) return null

  if (wildcardCard === null) {
    const sortedIndexes = [...naturalIndexes].sort((first, second) => first - second)
    if (sortedIndexes.some((index, position) => position > 0 && index !== sortedIndexes[position - 1]! + 1)) {
      return null
    }
    const placements = sortedIndexes.map((index) => ({ card: cardsByRank.get(rankOrder[index]!)!, role: 'natural' as const }))
    return {
      placements,
      activeWildcard: null,
      acePosition: acePositionFor(rankOrder, placements),
      internalWildcard: false,
      naturalTwoId,
      orientationPriority,
    }
  }

  if (naturalCards.length === rankOrder.length) {
    if (cardsByRank.size !== rankOrder.length) return null
    const naturalPlacements = rankOrder.map((rank) => ({ card: cardsByRank.get(rank)!, role: 'natural' as const }))
    const activeWildcard: WildcardMeldCard = { card: wildcardCard, role: 'wildcard', representedRank: null }
    const placements = rankOrder[0] === 'ace'
      ? [...naturalPlacements, activeWildcard]
      : [activeWildcard, ...naturalPlacements]
    return {
      placements,
      activeWildcard,
      acePosition: acePositionFor(rankOrder, placements),
      internalWildcard: false,
      naturalTwoId,
      orientationPriority,
    }
  }

  const segmentLength = naturalCards.length + 1
  const possibleSegments: Array<Readonly<{ start: number; missingIndex: number; internal: boolean }>> = []
  for (let start = 0; start + segmentLength <= rankOrder.length; start += 1) {
    const indexes = Array.from({ length: segmentLength }, (_, offset) => start + offset)
    if (!naturalIndexes.every((index) => indexes.includes(index))) continue
    const missingIndexes = indexes.filter((index) => !naturalIndexes.includes(index))
    if (missingIndexes.length !== 1) continue
    const missingIndex = missingIndexes[0]!
    possibleSegments.push({
      start,
      missingIndex,
      internal: missingIndex > start && missingIndex < start + segmentLength - 1,
    })
  }
  if (possibleSegments.length === 0) return null

  const internal = possibleSegments.filter((candidate) => candidate.internal)
  const pool = internal.length > 0 ? internal : possibleSegments
  const naturalMinimum = Math.min(...naturalIndexes)
  const preferHighEnd = rankOrder[naturalMinimum] === 'ace'
  const chosen = [...pool].sort((first, second) => {
    if (first.internal !== second.internal) return first.internal ? -1 : 1
    return preferHighEnd
      ? second.missingIndex - first.missingIndex
      : first.missingIndex - second.missingIndex
  })[0]!

  const representedRank = rankOrder[chosen.missingIndex]!
  const activeWildcard: WildcardMeldCard = { card: wildcardCard, role: 'wildcard', representedRank }
  const placements = Array.from({ length: segmentLength }, (_, offset): MeldCardPlacement => {
    const rank = rankOrder[chosen.start + offset]!
    return rank === representedRank ? activeWildcard : { card: cardsByRank.get(rank)!, role: 'natural' }
  })
  return {
    placements,
    activeWildcard,
    acePosition: acePositionFor(rankOrder, placements),
    internalWildcard: chosen.internal,
    naturalTwoId,
    orientationPriority,
  }
}

const compareResolutions = (first: SequenceResolution, second: SequenceResolution): number => {
  if ((first.naturalTwoId !== null) !== (second.naturalTwoId !== null)) return first.naturalTwoId !== null ? -1 : 1
  if (first.internalWildcard !== second.internalWildcard) return first.internalWildcard ? -1 : 1
  return first.orientationPriority - second.orientationPriority
    || (first.naturalTwoId ?? '').localeCompare(second.naturalTwoId ?? '')
    || first.placements.map((placement) => placement.card.id).join('|')
      .localeCompare(second.placements.map((placement) => placement.card.id).join('|'))
}

const diagnoseSequenceFailure = (
  ordinaryCards: readonly Card[],
  twos: readonly Card[],
  jokers: readonly Card[],
  suit: Suit,
): MeldValidationReason => {
  const canHaveNaturalTwo = twos.some((card) => card.suit === suit)
  const minimumActiveWildcards = jokers.length + twos.length - (canHaveNaturalTwo ? 1 : 0)
  if (minimumActiveWildcards > 1) return 'TOO_MANY_WILDCARDS'

  const ordinaryRanks = ordinaryCards.map((card) => card.rank)
  if (new Set(ordinaryRanks).size !== ordinaryRanks.length) return 'DUPLICATE_SEQUENCE_RANK'

  const ranks = new Set([...ordinaryRanks, ...(canHaveNaturalTwo ? ['two' as const] : [])])
  if (ranks.has('ace') && ranks.has('two') && ranks.has('king')) return 'INVALID_ACE_USAGE'
  return 'INVALID_SEQUENCE_GAPS'
}

/**
 * Validates a new run by rank analysis. It evaluates only Ace-low/Ace-high order
 * and contextual natural-two choices; it never permutes the input cards.
 */
export const validateSequence = (cards: readonly Card[]): MeldValidationResult<ValidatedSequence> => {
  const commonError = commonCandidateError(cards, MAX_SEQUENCE_SIZE)
  if (commonError) return invalidMeld(commonError)

  const jokers = cards.filter(isJoker).sort(comparePhysicalCards)
  const twos = cards.filter(isPinella).sort(comparePhysicalCards)
  const ordinaryCards = cards.filter((card) => !isJoker(card) && !isPinella(card))
  const ordinarySuits = new Set(ordinaryCards.map((card) => card.suit))
  if (ordinarySuits.size !== 1 || ordinaryCards.length === 0) return invalidMeld('INVALID_SEQUENCE_SUITS')
  const suit = ordinaryCards[0]!.suit
  if (suit === null) return invalidMeld('INVALID_SEQUENCE_SUITS')

  const resolutions: SequenceResolution[] = []
  for (const interpretation of possibleTwoInterpretations(twos, jokers, suit)) {
    const naturalCards = interpretation.naturalTwo
      ? [...ordinaryCards, interpretation.naturalTwo]
      : ordinaryCards
    for (const [rankOrder, priority] of [[ACE_LOW_RANKS, 0], [ACE_HIGH_RANKS, 1]] as const) {
      const resolution = resolveAgainstRankOrder(
        naturalCards,
        interpretation.activeWildcard,
        rankOrder,
        priority,
        interpretation.naturalTwo?.id ?? null,
      )
      if (resolution) resolutions.push(resolution)
    }
  }

  const resolution = resolutions.sort(compareResolutions)[0]
  if (!resolution) return invalidMeld(diagnoseSequenceFailure(ordinaryCards, twos, jokers, suit))

  return {
    valid: true,
    meld: {
      type: 'sequence',
      suit,
      cards: resolution.placements,
      acePosition: resolution.acePosition,
      activeWildcard: resolution.activeWildcard,
    },
  }
}
