import type { Card } from '../cards/types'
import { invalidMeld, type MeldValidationResult, type ValidatedMeld } from './types'
import { validateMeld } from './validateMeld'

/**
 * Validates cards added to a stored meld. The complete resulting set of physical cards
 * is revalidated by the stateless meld validator and must keep the stored meld type (and,
 * for a sequence, its suit). The deterministic result is authoritative: an already-active
 * sequence wildcard may be reinterpreted to another represented rank, and a same-suit
 * pinella may switch between natural and wildcard roles, whenever the final sequence is
 * valid (M33.2 flexible same-sequence repositioning).
 */
export const validateMeldExtension = (
  existingMeld: ValidatedMeld,
  addedCards: readonly Card[],
): MeldValidationResult => {
  if (addedCards.length === 0) return invalidMeld('EMPTY_EXTENSION')

  const existingCards = existingMeld.cards.map((placement) => placement.card)
  const validation = validateMeld([...existingCards, ...addedCards])
  if (!validation.valid) return validation

  if (validation.meld.type !== existingMeld.type) return invalidMeld('NOT_A_VALID_MELD')
  if (existingMeld.type === 'group') return validation
  if (validation.meld.type !== 'sequence' || validation.meld.suit !== existingMeld.suit) {
    return invalidMeld('NOT_A_VALID_MELD')
  }

  return validation
}
