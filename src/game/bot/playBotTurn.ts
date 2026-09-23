import type { GameState, InProgressGameState, PlayerId } from '../state/types'
import { acquireForBot, chooseBestAction, chooseBestDiscard } from './strategy'

const DEFAULT_MAX_ACTIONS_PER_TURN = 128
const DEFAULT_MAX_BOT_TURNS = 16

export class BotAutomationError extends Error {
  readonly name = 'BotAutomationError'

  constructor(message: string) {
    super(message)
  }
}

export type BotRunLimits = Readonly<{
  maxActionsPerTurn?: number
  maxBotTurns?: number
}>

const discardForBot = (state: InProgressGameState, playerId: PlayerId): GameState => {
  const discard = chooseBestDiscard(state, playerId)
  if (discard) return discard.state
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
  if (current.round.turn.phase === 'mustDraw') current = acquireForBot(current, playerId)

  const maximumActions = limits.maxActionsPerTurn ?? DEFAULT_MAX_ACTIONS_PER_TURN
  let actionCount = 0
  while (current.round.status === 'in-progress' && current.round.turn.currentPlayerId === playerId) {
    if (current.round.turn.phase !== 'action') {
      throw new BotAutomationError(`Bot ${playerId} unexpectedly left the action phase without ending its turn.`)
    }
    if (actionCount >= maximumActions) {
      throw new BotAutomationError(`Bot ${playerId} exceeded the ${maximumActions}-action safety limit.`)
    }

    const action = chooseBestAction(current, playerId)
    if (action) {
      current = action.state
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
