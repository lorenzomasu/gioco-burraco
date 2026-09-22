import { isJoker, isPinella, type Card } from '../cards/types'
import { commonCandidateError, comparePhysicalCards, MAX_GROUP_NATURALS, MAX_GROUP_SIZE } from './shared'
import { invalidMeld, type MeldCardPlacement, type MeldValidationResult, type ValidatedGroup } from './types'

/** Validates a new same-rank combination. Twos never act naturally in a group. */
export const validateGroup = (cards: readonly Card[]): MeldValidationResult<ValidatedGroup> => {
  const commonError = commonCandidateError(cards, MAX_GROUP_SIZE)
  if (commonError) return invalidMeld(commonError)

  const wildcards = cards.filter((card) => isJoker(card) || isPinella(card)).sort(comparePhysicalCards)
  const naturals = cards.filter((card) => !isJoker(card) && !isPinella(card)).sort(comparePhysicalCards)

  if (naturals.length === 0) return invalidMeld('GROUP_CANNOT_BE_WILDCARDS_ONLY')
  if (naturals.length > MAX_GROUP_NATURALS) return invalidMeld('TOO_MANY_CARDS')
  if (wildcards.length > 1) return invalidMeld('TOO_MANY_WILDCARDS')

  const rank = naturals[0]!.rank
  if (rank === 'joker' || rank === 'two' || naturals.some((card) => card.rank !== rank)) {
    return invalidMeld('NOT_A_VALID_GROUP')
  }

  const naturalPlacements: MeldCardPlacement[] = naturals.map((card) => ({ card, role: 'natural' }))
  const activeWildcard = wildcards[0]
    ? { card: wildcards[0], role: 'wildcard' as const, representedRank: rank }
    : null

  return {
    valid: true,
    meld: {
      type: 'group',
      rank,
      cards: activeWildcard ? [...naturalPlacements, activeWildcard] : naturalPlacements,
      activeWildcard,
    },
  }
}
