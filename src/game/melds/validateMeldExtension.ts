import type { Card } from '../cards/types'
import { invalidMeld, type MeldValidationResult, type ValidatedMeld } from './types'
import { validateMeld } from './validateMeld'

/**
 * Validates cards added to a stored meld while preserving the table position of
 * an already-active sequence wildcard. New-meld validation intentionally remains
 * stateless; only this existing-meld boundary considers the prior semantics.
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

  const previousWildcard = existingMeld.activeWildcard
  if (previousWildcard === null) return validation

  const resultingPlacement = validation.meld.cards.find(
    (placement) => placement.card.id === previousWildcard.card.id,
  )
  const remainsInPreviousPosition = resultingPlacement?.role === 'wildcard'
    && resultingPlacement.representedRank === previousWildcard.representedRank
  if (remainsInPreviousPosition) return validation

  if (previousWildcard.representedRank === null) {
    return invalidMeld('WILDCARD_POSITION_LOCKED')
  }

  const exactReplacementWasAdded = addedCards.some((card) =>
    card.rank === previousWildcard.representedRank && card.suit === existingMeld.suit,
  )
  return exactReplacementWasAdded ? validation : invalidMeld('WILDCARD_POSITION_LOCKED')
}
