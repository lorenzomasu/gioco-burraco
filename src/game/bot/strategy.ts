import { drawCard, takeDiscardPile } from '../engine/turn'
import type { GameState, InProgressGameState, PlayerId } from '../state/types'
import {
  burracoRank,
  generateActionCandidates,
  generateDiscardCandidates,
  type BotActionCandidate,
  type BotDiscardCandidate,
} from './candidates'

export type BotDrawSource = 'drawPile' | 'discardPile'

const compareNumbersDescending = (first: number, second: number): number => second - first

const compareBooleansDescending = (first: boolean, second: boolean): number =>
  compareNumbersDescending(Number(first), Number(second))

const compareActions = (first: BotActionCandidate, second: BotActionCandidate): number => {
  const comparisons = [
    compareBooleansDescending(first.enablesClosure, second.enablesClosure),
    compareBooleansDescending(first.takesPozzetto, second.takesPozzetto),
    compareNumbersDescending(
      burracoRank(first.burracoAfter) - burracoRank(first.burracoBefore),
      burracoRank(second.burracoAfter) - burracoRank(second.burracoBefore),
    ),
    compareNumbersDescending(burracoRank(first.burracoAfter), burracoRank(second.burracoAfter)),
    compareNumbersDescending(first.cardsPlayed, second.cardsPlayed),
    first.wildcardsPlayed - second.wildcardsPlayed,
    compareNumbersDescending(first.pointsPlayed, second.pointsPlayed),
  ]
  return comparisons.find((comparison) => comparison !== 0) ?? first.tieBreak.localeCompare(second.tieBreak)
}

const compareDiscards = (first: BotDiscardCandidate, second: BotDiscardCandidate): number => {
  const comparisons = [
    compareBooleansDescending(first.closesRound, second.closesRound),
    Number(first.isWildcard) - Number(second.isWildcard),
    Number(first.extendsOwnMeld) - Number(second.extendsOwnMeld),
    first.futureMeldCount - second.futureMeldCount,
    Number(first.helpsOpponent) - Number(second.helpsOpponent),
    compareNumbersDescending(first.points, second.points),
  ]
  return comparisons.find((comparison) => comparison !== 0) ?? first.tieBreak.localeCompare(second.tieBreak)
}

export const chooseBestAction = (
  state: InProgressGameState,
  playerId: PlayerId,
): BotActionCandidate | null =>
  [...generateActionCandidates(state, playerId)].sort(compareActions)[0] ?? null

export const chooseBestDiscard = (
  state: InProgressGameState,
  playerId: PlayerId,
): BotDiscardCandidate | null =>
  [...generateDiscardCandidates(state, playerId)].sort(compareDiscards)[0] ?? null

/**
 * Chooses from public information only. In particular this function checks stock
 * availability but never reads, simulates, or ranks the stock's hidden cards.
 */
export const chooseDrawSource = (
  state: InProgressGameState,
  playerId: PlayerId,
): BotDrawSource => {
  if (state.drawPile.length === 0) return 'discardPile'
  if (state.discardPile.length === 0) return 'drawPile'

  const collected = takeDiscardPile(state, playerId)
  const collectedIds = new Set(state.discardPile.map(({ id }) => id))
  const usefulDiscardAction = generateActionCandidates(collected, playerId).some((candidate) =>
    candidate.cardIds.some((cardId) => collectedIds.has(cardId)),
  )
  return usefulDiscardAction ? 'discardPile' : 'drawPile'
}

export const acquireForBot = (
  state: InProgressGameState,
  playerId: PlayerId,
): InProgressGameState => chooseDrawSource(state, playerId) === 'discardPile'
  ? takeDiscardPile(state, playerId)
  : drawCard(state, playerId)
