import { isJoker, isPinella, type Card } from '../cards/types'
import { extendMeld } from '../engine/extendMeld'
import { GameRuleError } from '../engine/errors'
import { playMeld } from '../engine/playMeld'
import { discardCard } from '../engine/turn'
import {
  classifyBurraco,
  validateMeld,
  validateMeldExtension,
  type BurracoClassification,
} from '../melds'
import { cardValue } from '../scoring'
import type { GameState, InProgressGameState, Player, PlayerId, Team } from '../state/types'

export const MAX_MELD_SEEDS = 2_048
export const MAX_ACTION_CANDIDATES = 256
const MAX_ACTION_CANDIDATES_PER_KIND = MAX_ACTION_CANDIDATES / 2

export type BotActionCandidate = Readonly<{
  kind: 'extend' | 'meld'
  state: InProgressGameState
  cardIds: readonly string[]
  cardsPlayed: number
  pointsPlayed: number
  wildcardsPlayed: number
  enablesClosure: boolean
  takesPozzetto: boolean
  burracoBefore: BurracoClassification
  burracoAfter: BurracoClassification
  tieBreak: string
}>

export type BotDiscardCandidate = Readonly<{
  card: Card
  state: GameState
  closesRound: boolean
  extendsOwnMeld: boolean
  futureMeldCount: number
  isWildcard: boolean
  helpsOpponent: boolean
  points: number
  tieBreak: string
}>

export const playerById = (state: GameState, playerId: PlayerId): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Game state does not contain player: ${playerId}.`)
  return player
}

export const teamForPlayer = (state: GameState, playerId: PlayerId): Team => {
  const player = playerById(state, playerId)
  const team = state.teams.find((candidate) => candidate.id === player.teamId)
  if (!team) throw new Error(`Game state does not contain team: ${player.teamId}.`)
  return team
}

export const tryEngineAction = <T>(action: () => T): T | null => {
  try {
    return action()
  } catch (error) {
    if (error instanceof GameRuleError) return null
    throw error
  }
}

const isWildcard = (card: Card): boolean => isJoker(card) || isPinella(card)

/** Only an ordinary closure counts: a draw-pile exhaustion ends the round without a bonus. */
const isClosedRound = (state: GameState | null): boolean =>
  state?.round.status === 'completed' && state.round.ending === 'closure'

const classificationValue: Readonly<Record<BurracoClassification, number>> = {
  none: 0,
  dirty: 1,
  'semi-clean': 2,
  clean: 3,
}

const compareGrowthCards = (
  first: Readonly<{ card: Card; classification: BurracoClassification }>,
  second: Readonly<{ card: Card; classification: BurracoClassification }>,
): number => {
  const classificationDifference = classificationValue[second.classification]
    - classificationValue[first.classification]
  if (classificationDifference !== 0) return classificationDifference
  const wildcardDifference = Number(isWildcard(first.card)) - Number(isWildcard(second.card))
  if (wildcardDifference !== 0) return wildcardDifference
  const pointDifference = cardValue(second.card) - cardValue(first.card)
  if (pointDifference !== 0) return pointDifference
  return first.card.id.localeCompare(second.card.id)
}

const hasLegalDiscard = (state: InProgressGameState, playerId: PlayerId): boolean =>
  playerById(state, playerId).hand.some((card) =>
    tryEngineAction(() => discardCard(state, playerId, card.id)) !== null,
  )

/**
 * A newly acquired pozzetto becomes visible only after committing the move. Its
 * hidden card identities must therefore never participate in candidate ranking.
 */
const hasPubliclyKnownContinuation = (
  before: InProgressGameState,
  after: InProgressGameState,
  playerId: PlayerId,
): boolean => {
  const tookPozzetto = !teamForPlayer(before, playerId).hasTakenPozzetto
    && teamForPlayer(after, playerId).hasTakenPozzetto
  return tookPozzetto || hasLegalDiscard(after, playerId)
}

const actionCandidate = ({
  kind,
  before,
  after,
  playerId,
  cards,
  meldIndex,
}: Readonly<{
  kind: BotActionCandidate['kind']
  before: InProgressGameState
  after: InProgressGameState
  playerId: PlayerId
  cards: readonly Card[]
  meldIndex: number
}>): BotActionCandidate => {
  const teamBefore = teamForPlayer(before, playerId)
  const teamAfter = teamForPlayer(after, playerId)
  const resultingMeld = teamAfter.melds[meldIndex]!
  const previousMeld = kind === 'extend' ? teamBefore.melds[meldIndex] : undefined
  const sortedIds = cards.map(({ id }) => id).sort()
  const takesPozzetto = !teamBefore.hasTakenPozzetto && teamAfter.hasTakenPozzetto
  const enablesClosure = !takesPozzetto && playerById(after, playerId).hand.some((card) =>
    isClosedRound(tryEngineAction(() => discardCard(after, playerId, card.id))),
  )

  return {
    kind,
    state: after,
    cardIds: sortedIds,
    cardsPlayed: cards.length,
    pointsPlayed: cards.reduce((total, card) => total + cardValue(card), 0),
    wildcardsPlayed: cards.filter(isWildcard).length,
    enablesClosure,
    takesPozzetto,
    burracoBefore: previousMeld ? classifyBurraco(previousMeld) : 'none',
    burracoAfter: classifyBurraco(resultingMeld),
    tieBreak: `${kind}:${String(meldIndex).padStart(3, '0')}:${sortedIds.join(',')}`,
  }
}

export const generateExtensionCandidates = (
  state: InProgressGameState,
  playerId: PlayerId,
): readonly BotActionCandidate[] => {
  const player = playerById(state, playerId)
  const team = teamForPlayer(state, playerId)
  const candidates: BotActionCandidate[] = []

  for (let meldIndex = 0; meldIndex < team.melds.length; meldIndex += 1) {
    for (const card of player.hand) {
      if (candidates.length >= MAX_ACTION_CANDIDATES_PER_KIND) return candidates
      const next = tryEngineAction(() => extendMeld(state, playerId, meldIndex, [card.id]))
      if (!next || !hasPubliclyKnownContinuation(state, next, playerId)) continue
      candidates.push(actionCandidate({
        kind: 'extend', before: state, after: next, playerId, cards: [card], meldIndex,
      }))
    }
  }

  return candidates
}

const threeCardCombinations = function* (
  hand: Player['hand'],
): Generator<readonly [number, number, number]> {
  let generated = 0
  for (let first = 0; first < hand.length - 2; first += 1) {
    for (let second = first + 1; second < hand.length - 1; second += 1) {
      for (let third = second + 1; third < hand.length; third += 1) {
        if (generated >= MAX_MELD_SEEDS) return
        generated += 1
        yield [first, second, third]
      }
    }
  }
}

export const generateNewMeldCandidates = (
  state: InProgressGameState,
  playerId: PlayerId,
): readonly BotActionCandidate[] => {
  const hand = playerById(state, playerId).hand
  const candidates: BotActionCandidate[] = []
  const seenSelections = new Set<string>()

  for (const indexes of threeCardCombinations(hand)) {
    if (candidates.length >= MAX_ACTION_CANDIDATES_PER_KIND) break
    const selected = indexes.map((index) => hand[index]!)
    if (!validateMeld(selected).valid) continue

    while (true) {
      const selectionKey = selected.map(({ id }) => id).sort().join(',')
      if (!seenSelections.has(selectionKey)) {
        seenSelections.add(selectionKey)
        const next = tryEngineAction(() => playMeld(state, playerId, selected.map(({ id }) => id)))
        if (next && hasPubliclyKnownContinuation(state, next, playerId)) {
          const meldIndex = teamForPlayer(next, playerId).melds.length - 1
          candidates.push(actionCandidate({
            kind: 'meld', before: state, after: next, playerId, cards: [...selected], meldIndex,
          }))
          if (candidates.length >= MAX_ACTION_CANDIDATES_PER_KIND) break
        }
      }

      const selectedIds = new Set(selected.map(({ id }) => id))
      const growthOptions = hand
        .filter((card) => !selectedIds.has(card.id))
        .map((card) => {
          const validation = validateMeld([...selected, card])
          return validation.valid ? { card, classification: classifyBurraco(validation.meld) } : null
        })
        .filter((option): option is NonNullable<typeof option> => option !== null)
        .sort(compareGrowthCards)
      const growth = growthOptions[0]
      if (!growth) break
      selected.push(growth.card)
    }
  }

  return candidates
}

export const generateActionCandidates = (
  state: InProgressGameState,
  playerId: PlayerId,
): readonly BotActionCandidate[] => [
  ...generateExtensionCandidates(state, playerId),
  ...generateNewMeldCandidates(state, playerId),
].slice(0, MAX_ACTION_CANDIDATES)

const canExtendMeld = (meld: Team['melds'][number], card: Card): boolean =>
  validateMeldExtension(meld, [card]).valid

const futureMeldCount = (hand: readonly Card[], target: Card): number => {
  const others = hand.filter((card) => card.id !== target.id)
  let count = 0
  for (let first = 0; first < others.length - 1; first += 1) {
    for (let second = first + 1; second < others.length; second += 1) {
      if (validateMeld([target, others[first]!, others[second]!]).valid) count += 1
    }
  }
  return count
}

export const generateDiscardCandidates = (
  state: InProgressGameState,
  playerId: PlayerId,
): readonly BotDiscardCandidate[] => {
  const player = playerById(state, playerId)
  const ownTeam = teamForPlayer(state, playerId)
  const opponentMelds = state.teams
    .filter((team) => team.id !== ownTeam.id)
    .flatMap((team) => team.melds)

  return player.hand.flatMap((card) => {
    const next = tryEngineAction(() => discardCard(state, playerId, card.id))
    if (!next) return []
    return [{
      card,
      state: next,
      closesRound: isClosedRound(next),
      extendsOwnMeld: ownTeam.melds.some((meld) => canExtendMeld(meld, card)),
      futureMeldCount: futureMeldCount(player.hand, card),
      isWildcard: isWildcard(card),
      helpsOpponent: opponentMelds.some((meld) => canExtendMeld(meld, card)),
      points: cardValue(card),
      tieBreak: card.id,
    }]
  })
}

export const burracoRank = (classification: BurracoClassification): number =>
  classificationValue[classification]
