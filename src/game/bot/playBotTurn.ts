import type { Card } from '../cards/types'
import type { GameState, InProgressGameState, PlayerId } from '../state/types'
import { playerById, teamForPlayer, type BotActionCandidate } from './candidates'
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

export type BotPublicActionEvent =
  | Readonly<{ type: 'draw-stock'; playerId: PlayerId }>
  | Readonly<{ type: 'collect-discard-pile'; playerId: PlayerId; cardCount: number }>
  | Readonly<{
      type: 'play-meld'
      playerId: PlayerId
      cards: readonly Card[]
      meldIndex: number
    }>
  | Readonly<{
      type: 'extend-meld'
      playerId: PlayerId
      cards: readonly Card[]
      meldIndex: number
    }>
  | Readonly<{ type: 'discard'; playerId: PlayerId; card: Card }>
  | Readonly<{
      type: 'take-pozzetto'
      playerId: PlayerId
      mode: 'flight' | 'discard'
    }>

export type TracedBotExecution = Readonly<{
  state: GameState
  events: readonly BotPublicActionEvent[]
}>

const tookPozzetto = (
  before: GameState,
  after: GameState,
  playerId: PlayerId,
): boolean => !teamForPlayer(before, playerId).hasTakenPozzetto
  && teamForPlayer(after, playerId).hasTakenPozzetto

const cardsFromCurrentHand = (
  state: InProgressGameState,
  playerId: PlayerId,
  cardIds: readonly string[],
): readonly Card[] => {
  const handById = new Map(playerById(state, playerId).hand.map((card) => [card.id, card]))
  return cardIds.map((cardId) => {
    const card = handById.get(cardId)
    if (!card) throw new BotAutomationError(`Bot ${playerId} selected a card outside its hand: ${cardId}.`)
    return card
  })
}

const actionEvents = (
  before: InProgressGameState,
  action: BotActionCandidate,
  playerId: PlayerId,
): readonly BotPublicActionEvent[] => {
  const event: BotPublicActionEvent = action.kind === 'meld'
    ? {
        type: 'play-meld',
        playerId,
        cards: cardsFromCurrentHand(before, playerId, action.cardIds),
        meldIndex: action.meldIndex,
      }
    : {
        type: 'extend-meld',
        playerId,
        cards: cardsFromCurrentHand(before, playerId, action.cardIds),
        meldIndex: action.meldIndex,
      }
  return tookPozzetto(before, action.state, playerId)
    ? [event, { type: 'take-pozzetto', playerId, mode: 'flight' }]
    : [event]
}

const discardForBot = (
  state: InProgressGameState,
  playerId: PlayerId,
): TracedBotExecution => {
  const discard = chooseBestDiscard(state, playerId)
  if (discard) {
    const events: BotPublicActionEvent[] = [{ type: 'discard', playerId, card: discard.card }]
    if (tookPozzetto(state, discard.state, playerId)) {
      events.push({ type: 'take-pozzetto', playerId, mode: 'discard' })
    }
    return { state: discard.state, events }
  }
  throw new BotAutomationError(`Bot ${playerId} has no legal discard in the current action phase.`)
}

/** Resolves exactly one current player's turn and reports only its committed public actions. */
export const playBotTurnWithTrace = (
  state: GameState,
  playerId: PlayerId,
  limits: BotRunLimits = {},
): TracedBotExecution => {
  if (state.round.status === 'completed') return { state, events: [] }
  if (state.round.turn.currentPlayerId !== playerId) {
    throw new BotAutomationError(
      `Cannot run bot ${playerId}: the current player is ${state.round.turn.currentPlayerId}.`,
    )
  }

  let current: InProgressGameState = { ...state, round: state.round }
  const events: BotPublicActionEvent[] = []
  if (current.round.turn.phase === 'mustDraw') {
    const discardCount = current.discardPile.length
    current = acquireForBot(current, playerId)
    if (current.round.turn.phase !== 'action') {
      throw new BotAutomationError(`Bot ${playerId} did not enter the action phase after acquiring cards.`)
    }
    events.push(current.round.turn.acquisition.source === 'drawPile'
      ? { type: 'draw-stock', playerId }
      : { type: 'collect-discard-pile', playerId, cardCount: discardCount })
  }

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
      const beforeAction = current
      current = action.state
      events.push(...actionEvents(beforeAction, action, playerId))
      actionCount += 1
      continue
    }

    const discarded = discardForBot(current, playerId)
    return { state: discarded.state, events: [...events, ...discarded.events] }
  }

  return { state: current, events }
}

/** State-only compatibility API for one deterministic bot turn. */
export const playBotTurn = (
  state: GameState,
  playerId: PlayerId,
  limits: BotRunLimits = {},
): GameState => playBotTurnWithTrace(state, playerId, limits).state

/** Resolves consecutive non-human turns and concatenates their committed events. */
export const playBotsUntilHumanTurnWithTrace = (
  state: GameState,
  humanPlayerId: PlayerId,
  limits: BotRunLimits = {},
): TracedBotExecution => {
  let current = state
  const events: BotPublicActionEvent[] = []
  const maximumTurns = limits.maxBotTurns ?? DEFAULT_MAX_BOT_TURNS
  let botTurns = 0

  while (current.round.status === 'in-progress' && current.round.turn.currentPlayerId !== humanPlayerId) {
    if (botTurns >= maximumTurns) {
      throw new BotAutomationError(`Bot chain exceeded the ${maximumTurns}-turn safety limit.`)
    }
    const botPlayerId = current.round.turn.currentPlayerId
    const turn = playBotTurnWithTrace(current, botPlayerId, limits)
    current = turn.state
    events.push(...turn.events)
    botTurns += 1
  }

  return { state: current, events }
}

/** State-only compatibility API for a deterministic consecutive-bot chain. */
export const playBotsUntilHumanTurn = (
  state: GameState,
  humanPlayerId: PlayerId,
  limits: BotRunLimits = {},
): GameState => playBotsUntilHumanTurnWithTrace(state, humanPlayerId, limits).state
