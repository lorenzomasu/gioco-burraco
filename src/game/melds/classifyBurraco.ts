import type { ValidatedMeld } from './types'

export type BurracoClassification = 'none' | 'clean' | 'semi-clean' | 'dirty'

const MIN_BURRACO_SIZE = 7
const SEMI_CLEAN_GROUP_SIZE = 8
const MIN_NATURALS_ON_SEQUENCE_SIDE = 7

/** Classifies the current semantic state of an already-valid table meld. */
export const classifyBurraco = (
  meld: ValidatedMeld,
): BurracoClassification => {
  if (meld.cards.length < MIN_BURRACO_SIZE) return 'none'

  const wildcardIndex = meld.cards.findIndex((placement) => placement.role === 'wildcard')
  if (wildcardIndex < 0) return 'clean'

  if (meld.type === 'group') {
    return meld.cards.length === SEMI_CLEAN_GROUP_SIZE ? 'semi-clean' : 'dirty'
  }

  const cardsBeforeWildcard = wildcardIndex
  const cardsAfterWildcard = meld.cards.length - wildcardIndex - 1
  const wildcardIsAtEnd = cardsBeforeWildcard === 0 || cardsAfterWildcard === 0
  const naturalSideSize = Math.max(cardsBeforeWildcard, cardsAfterWildcard)

  return wildcardIsAtEnd && naturalSideSize >= MIN_NATURALS_ON_SEQUENCE_SIDE
    ? 'semi-clean'
    : 'dirty'
}
