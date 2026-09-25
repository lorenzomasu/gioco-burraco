import { drawCard, takeDiscardPile } from '../engine/turn'
import type { GameState, InProgressGameState, PlayerId } from '../state/types'
import {
  burracoRank,
  generateActionCandidates,
  generateDiscardCandidates,
  type BotActionCandidate,
  type BotDiscardCandidate,
} from './candidates'
import { DEFAULT_BOT_DIFFICULTY, type BotDifficulty } from './difficulty'

export type BotDrawSource = 'drawPile' | 'discardPile'

const compareNumbersDescending = (first: number, second: number): number => second - first

const compareBooleansDescending = (first: boolean, second: boolean): number =>
  compareNumbersDescending(Number(first), Number(second))

/** Normal profile: the pre-M35 strategic ordering. */
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

/** Normal profile: the pre-M35 strategic ordering. */
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

/** Easy profile: volume and cost only, without closure/pozzetto/Burraco weighting. */
const compareEasyActions = (first: BotActionCandidate, second: BotActionCandidate): number => {
  const comparisons = [
    compareNumbersDescending(first.cardsPlayed, second.cardsPlayed),
    first.wildcardsPlayed - second.wildcardsPlayed,
    compareNumbersDescending(first.pointsPlayed, second.pointsPlayed),
  ]
  return comparisons.find((comparison) => comparison !== 0) ?? first.tieBreak.localeCompare(second.tieBreak)
}

/** Easy profile: keep wildcards, shed points; no own-meld, future-meld or opponent reasoning. */
const compareEasyDiscards = (first: BotDiscardCandidate, second: BotDiscardCandidate): number => {
  const comparisons = [
    Number(first.isWildcard) - Number(second.isWildcard),
    compareNumbersDescending(first.points, second.points),
  ]
  return comparisons.find((comparison) => comparison !== 0) ?? first.tieBreak.localeCompare(second.tieBreak)
}

const ACTION_COMPARATORS: Readonly<Record<BotDifficulty, typeof compareActions>> = {
  easy: compareEasyActions,
  normal: compareActions,
}

const DISCARD_COMPARATORS: Readonly<Record<BotDifficulty, typeof compareDiscards>> = {
  easy: compareEasyDiscards,
  normal: compareDiscards,
}

export const chooseBestAction = (
  state: InProgressGameState,
  playerId: PlayerId,
  difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY,
): BotActionCandidate | null =>
  [...generateActionCandidates(state, playerId)].sort(ACTION_COMPARATORS[difficulty])[0] ?? null

export const chooseBestDiscard = (
  state: InProgressGameState,
  playerId: PlayerId,
  difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY,
): BotDiscardCandidate | null =>
  [...generateDiscardCandidates(state, playerId)].sort(DISCARD_COMPARATORS[difficulty])[0] ?? null

/**
 * Chooses from public information only. In particular this function checks stock
 * availability but never reads, simulates, or ranks the stock's hidden cards. The easy
 * profile draws from any non-empty stock without evaluating the discard pile.
 */
export const chooseDrawSource = (
  state: InProgressGameState,
  playerId: PlayerId,
  difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY,
): BotDrawSource => {
  if (state.drawPile.length === 0) return 'discardPile'
  if (difficulty === 'easy') return 'drawPile'
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
  difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY,
): InProgressGameState => chooseDrawSource(state, playerId, difficulty) === 'discardPile'
  ? takeDiscardPile(state, playerId)
  : drawCard(state, playerId)
