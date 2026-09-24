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

export type BotStepAction = 'acquire' | 'meld' | 'extend' | 'discard'

export type BotStepResult = TracedBotExecution & Readonly<{
  action: BotStepAction
}>

const requireCurrentBot = (state: GameState, playerId: PlayerId): InProgressGameState => {
  if (state.round.status === 'completed') {
    throw new BotAutomationError(`Cannot run bot ${playerId}: the round is already completed.`)
  }
  if (state.round.turn.currentPlayerId !== playerId) {
    throw new BotAutomationError(
      `Cannot run bot ${playerId}: the current player is ${state.round.turn.currentPlayerId}.`,
    )
  }
  return { ...state, round: state.round }
}

/**
 * Commits exactly one bot action for the current player: one acquisition, one meld,
 * one extension, or one discard. A pozzetto taken by that action is reported as a
 * side-effect event immediately after the triggering action event.
 */
export const playBotStep = (state: GameState, playerId: PlayerId): BotStepResult => {
  const current = requireCurrentBot(state, playerId)

  if (current.round.turn.phase === 'mustDraw') {
    const discardCount = current.discardPile.length
    const acquired = acquireForBot(current, playerId)
    if (acquired.round.turn.phase !== 'action') {
      throw new BotAutomationError(`Bot ${playerId} did not enter the action phase after acquiring cards.`)
    }
    return {
      action: 'acquire',
      state: acquired,
      events: [acquired.round.turn.acquisition.source === 'drawPile'
        ? { type: 'draw-stock', playerId }
        : { type: 'collect-discard-pile', playerId, cardCount: discardCount }],
    }
  }

  const action = chooseBestAction(current, playerId)
  if (action) {
    return { action: action.kind, state: action.state, events: actionEvents(current, action, playerId) }
  }

  return { action: 'discard', ...discardForBot(current, playerId) }
}

/** Per-turn safety counter for a bot turn that has already started. */
export type ActiveBotTurn = Readonly<{
  playerId: PlayerId
  actions: number
}>

type GuardedBotTurnStep = Readonly<{
  step: BotStepResult
  /** The still-active turn after this step, or null once control has left the bot. */
  turn: ActiveBotTurn | null
}>

/**
 * Applies the per-turn safety guards around one committed bot step. This is the
 * single guarded primitive shared by the single-turn, full-chain, and stepwise APIs.
 */
const playGuardedBotTurnStep = (
  state: GameState,
  playerId: PlayerId,
  turn: ActiveBotTurn | null,
  limits: BotRunLimits,
): GuardedBotTurnStep => {
  const current = requireCurrentBot(state, playerId)
  const actions = turn?.actions ?? 0
  if (current.round.turn.phase !== 'action' && turn !== null) {
    throw new BotAutomationError(`Bot ${playerId} unexpectedly left the action phase without ending its turn.`)
  }
  const maximumActions = limits.maxActionsPerTurn ?? DEFAULT_MAX_ACTIONS_PER_TURN
  if (current.round.turn.phase === 'action' && actions >= maximumActions) {
    throw new BotAutomationError(`Bot ${playerId} exceeded the ${maximumActions}-action safety limit.`)
  }

  const step = playBotStep(current, playerId)
  const stillActive = step.state.round.status === 'in-progress'
    && step.state.round.turn.currentPlayerId === playerId
  return {
    step,
    turn: stillActive
      ? { playerId, actions: step.action === 'acquire' ? actions : actions + 1 }
      : null,
  }
}

/** Resolves exactly one current player's turn and reports only its committed public actions. */
export const playBotTurnWithTrace = (
  state: GameState,
  playerId: PlayerId,
  limits: BotRunLimits = {},
): TracedBotExecution => {
  if (state.round.status === 'completed') return { state, events: [] }
  requireCurrentBot(state, playerId)

  let current = state
  const events: BotPublicActionEvent[] = []
  let turn: ActiveBotTurn | null = null
  do {
    const guarded = playGuardedBotTurnStep(current, playerId, turn, limits)
    current = guarded.step.state
    events.push(...guarded.step.events)
    turn = guarded.turn
  } while (turn !== null)

  return { state: current, events }
}

/** State-only compatibility API for one deterministic bot turn. */
export const playBotTurn = (
  state: GameState,
  playerId: PlayerId,
  limits: BotRunLimits = {},
): GameState => playBotTurnWithTrace(state, playerId, limits).state

/** Safety counters carried between successive chain steps; transient, never part of `GameState`. */
export type BotChainProgress = Readonly<{
  botTurns: number
  activeTurn: ActiveBotTurn | null
}>

export const INITIAL_BOT_CHAIN_PROGRESS: BotChainProgress = { botTurns: 0, activeTurn: null }

export type BotChainStep = BotStepResult & Readonly<{
  progress: BotChainProgress
}>

/**
 * Commits exactly one action of the pending bot chain, or returns null when the
 * round is completed or control belongs to the human. Repeatedly applying this
 * function with the returned progress is the full-chain execution path.
 */
export const playNextBotChainStep = (
  state: GameState,
  humanPlayerId: PlayerId,
  progress: BotChainProgress = INITIAL_BOT_CHAIN_PROGRESS,
  limits: BotRunLimits = {},
): BotChainStep | null => {
  if (state.round.status !== 'in-progress' || state.round.turn.currentPlayerId === humanPlayerId) {
    return null
  }

  const botPlayerId = state.round.turn.currentPlayerId
  let { botTurns, activeTurn } = progress
  if (activeTurn?.playerId !== botPlayerId) {
    const maximumTurns = limits.maxBotTurns ?? DEFAULT_MAX_BOT_TURNS
    if (botTurns >= maximumTurns) {
      throw new BotAutomationError(`Bot chain exceeded the ${maximumTurns}-turn safety limit.`)
    }
    botTurns += 1
    activeTurn = null
  }

  const guarded = playGuardedBotTurnStep(state, botPlayerId, activeTurn, limits)
  return { ...guarded.step, progress: { botTurns, activeTurn: guarded.turn } }
}

/** Resolves consecutive non-human turns and concatenates their committed events. */
export const playBotsUntilHumanTurnWithTrace = (
  state: GameState,
  humanPlayerId: PlayerId,
  limits: BotRunLimits = {},
): TracedBotExecution => {
  let current = state
  const events: BotPublicActionEvent[] = []
  let progress = INITIAL_BOT_CHAIN_PROGRESS

  let step = playNextBotChainStep(current, humanPlayerId, progress, limits)
  while (step) {
    current = step.state
    events.push(...step.events)
    progress = step.progress
    step = playNextBotChainStep(current, humanPlayerId, progress, limits)
  }

  return { state: current, events }
}

/** State-only compatibility API for a deterministic consecutive-bot chain. */
export const playBotsUntilHumanTurn = (
  state: GameState,
  humanPlayerId: PlayerId,
  limits: BotRunLimits = {},
): GameState => playBotsUntilHumanTurnWithTrace(state, humanPlayerId, limits).state
