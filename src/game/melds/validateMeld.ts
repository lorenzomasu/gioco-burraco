import type { Card } from '../cards/types'
import { MAX_SEQUENCE_SIZE, commonCandidateError } from './shared'
import type { MeldValidationResult } from './types'
import { invalidMeld } from './types'
import { validateGroup } from './validateGroup'
import { validateSequence } from './validateSequence'

/** Group-first is the documented deterministic tie-break for a theoretically dual-valid set. */
export const validateMeld = (cards: readonly Card[]): MeldValidationResult => {
  const commonError = commonCandidateError(cards, MAX_SEQUENCE_SIZE)
  if (commonError) return invalidMeld(commonError)

  const groupResult = validateGroup(cards)
  if (groupResult.valid) return groupResult

  const sequenceResult = validateSequence(cards)
  if (sequenceResult.valid) return sequenceResult

  const priorityReasons = [
    'DUPLICATE_CARD_ID',
    'TOO_MANY_WILDCARDS',
    'GROUP_CANNOT_BE_WILDCARDS_ONLY',
    'INVALID_ACE_USAGE',
  ] as const
  const reason = priorityReasons.find((candidate) =>
    groupResult.reason === candidate || sequenceResult.reason === candidate,
  )
  return invalidMeld(reason ?? 'NOT_A_VALID_MELD')
}
