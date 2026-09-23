import { validateMeld } from '../melds'
import { extendMeld } from '../engine/extendMeld'
import { GameRuleError } from '../engine/errors'
import { playMeld } from '../engine/playMeld'
import { discardCard, drawCard, takeDiscardPile } from '../engine/turn'
import type { GameState, InProgressGameState, Player, PlayerId } from '../state/types'

const DEFAULT_MAX_ACTIONS_PER_TURN = 128
const DEFAULT_MAX_BOT_TURNS = 16

export class BotAutomationError extends Error {
  readonly name = 'BotAutomationError'

  constructor(message: string) {
    super(message)
  }
}

type BotRunLimits = Readonly<{
  maxActionsPerTurn?: number
  maxBotTurns?: number
}>

const playerById = (state: GameState, playerId: PlayerId): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new BotAutomationError(`Game state does not contain bot player: ${playerId}.`)
  return player
}

const tryEngineAction = <T>(action: () => T): T | null => {
  try {
    return action()
  } catch (error) {
    if (error instanceof GameRuleError) return null
    throw error
  }
}

const hasLegalDiscard = (state: InProgressGameState, playerId: PlayerId): boolean =>
  playerById(state, playerId).hand.some((card) =>
    tryEngineAction(() => discardCard(state, playerId, card.id)) !== null,
  )

const tryExtension = (state: InProgressGameState, playerId: PlayerId): InProgressGameState | null => {
  const player = playerById(state, playerId)
  const team = state.teams.find((candidate) => candidate.id === player.teamId)
  if (!team) throw new BotAutomationError(`Game state does not contain bot team: ${player.teamId}.`)

  for (let meldIndex = 0; meldIndex < team.melds.length; meldIndex += 1) {
    for (const card of player.hand) {
      const candidate = tryEngineAction(() => extendMeld(state, playerId, meldIndex, [card.id]))
      if (candidate && hasLegalDiscard(candidate, playerId)) return candidate
    }
  }
  return null
}

const threeCardCombinations = function* (hand: Player['hand']): Generator<readonly [number, number, number]> {
  for (let first = 0; first < hand.length - 2; first += 1) {
    for (let second = first + 1; second < hand.length - 1; second += 1) {
      for (let third = second + 1; third < hand.length; third += 1) {
        yield [first, second, third]
      }
    }
  }
}

const tryNewMeld = (state: InProgressGameState, playerId: PlayerId): InProgressGameState | null => {
  const hand = playerById(state, playerId).hand

  for (const indexes of threeCardCombinations(hand)) {
    const selected = indexes.map((index) => hand[index]!)
    if (!validateMeld(selected).valid) continue

    const selectedIds = new Set(selected.map((card) => card.id))
    let bestCandidate = tryEngineAction(() => playMeld(state, playerId, [...selectedIds]))
    if (bestCandidate && !hasLegalDiscard(bestCandidate, playerId)) bestCandidate = null

    for (const card of hand) {
      if (selectedIds.has(card.id)) continue
      const grownCards = hand.filter((candidate) => selectedIds.has(candidate.id)).concat(card)
      if (!validateMeld(grownCards).valid) continue

      selectedIds.add(card.id)
      const grownCandidate = tryEngineAction(() => playMeld(state, playerId, [...selectedIds]))
      if (grownCandidate && hasLegalDiscard(grownCandidate, playerId)) bestCandidate = grownCandidate
    }

    if (bestCandidate) return bestCandidate
  }
  return null
}

const drawForBot = (state: InProgressGameState, playerId: PlayerId): InProgressGameState => {
  try {
    return drawCard(state, playerId)
  } catch (error) {
    if (!(error instanceof GameRuleError) || error.code !== 'DRAW_PILE_EMPTY') throw error
    return takeDiscardPile(state, playerId)
  }
}

const discardForBot = (state: InProgressGameState, playerId: PlayerId): GameState => {
  for (const card of playerById(state, playerId).hand) {
    const next = tryEngineAction(() => discardCard(state, playerId, card.id))
    if (next) return next
  }
  throw new BotAutomationError(`Bot ${playerId} has no legal discard in the current action phase.`)
}

/** Resolves exactly one current player's turn using only public engine commands. */
export const playBotTurn = (
  state: GameState,
  playerId: PlayerId,
  limits: BotRunLimits = {},
): GameState => {
  if (state.round.status === 'completed') return state
  if (state.round.turn.currentPlayerId !== playerId) {
    throw new BotAutomationError(
      `Cannot run bot ${playerId}: the current player is ${state.round.turn.currentPlayerId}.`,
    )
  }

  let current: InProgressGameState = { ...state, round: state.round }
  if (current.round.turn.phase === 'mustDraw') current = drawForBot(current, playerId)

  const maximumActions = limits.maxActionsPerTurn ?? DEFAULT_MAX_ACTIONS_PER_TURN
  let actionCount = 0
  while (current.round.status === 'in-progress' && current.round.turn.currentPlayerId === playerId) {
    if (current.round.turn.phase !== 'action') {
      throw new BotAutomationError(`Bot ${playerId} unexpectedly left the action phase without ending its turn.`)
    }
    if (actionCount >= maximumActions) {
      throw new BotAutomationError(`Bot ${playerId} exceeded the ${maximumActions}-action safety limit.`)
    }

    const extension = tryExtension(current, playerId)
    if (extension) {
      current = extension
      actionCount += 1
      continue
    }

    const meld = tryNewMeld(current, playerId)
    if (meld) {
      current = meld
      actionCount += 1
      continue
    }

    return discardForBot(current, playerId)
  }

  return current
}

/** Resolves consecutive non-human turns until control returns to the human or the round closes. */
export const playBotsUntilHumanTurn = (
  state: GameState,
  humanPlayerId: PlayerId,
  limits: BotRunLimits = {},
): GameState => {
  let current = state
  const maximumTurns = limits.maxBotTurns ?? DEFAULT_MAX_BOT_TURNS
  let botTurns = 0

  while (current.round.status === 'in-progress' && current.round.turn.currentPlayerId !== humanPlayerId) {
    if (botTurns >= maximumTurns) {
      throw new BotAutomationError(`Bot chain exceeded the ${maximumTurns}-turn safety limit.`)
    }
    const botPlayerId = current.round.turn.currentPlayerId
    current = playBotTurn(current, botPlayerId, limits)
    botTurns += 1
  }

  return current
}
