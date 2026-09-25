import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePlaySounds } from '../audio/SoundContext'
import {
  BotAutomationError,
  DEFAULT_BOT_DIFFICULTY,
  INITIAL_BOT_CHAIN_PROGRESS,
  playNextBotChainStep,
  type BotChainProgress,
  type BotDifficulty,
  type BotPublicActionEvent,
} from '../game/bot'
import { GameRuleError, type GameErrorCode } from '../game/engine/errors'
import { extendMeld } from '../game/engine/extendMeld'
import { playMeld } from '../game/engine/playMeld'
import { discardCard, drawCard, takeDiscardPile } from '../game/engine/turn'
import {
  advanceMatch,
  calculateCumulativeScores,
  DEFAULT_MATCH_ROUND_COUNT,
  getFinalMatchOutcome,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
  type MatchRoundCount,
  type MatchState,
  type RoundFactory,
} from '../game/match'
import type { GameState, Player, PlayerId, Team } from '../game/state/types'
import { BotActionTimeline } from './BotActionTimeline'
import { BotSpeedControl } from './BotSpeedControl'
import { Dialog } from './Dialog'
import { DiscardPile } from './DiscardPile'
import { GuidedCoach } from './GuidedCoach'
import { deriveCoaching } from './guidedCoaching'
import {
  canShiftCards,
  inVisibleOrder,
  moveCardsToBoundary,
  reconcileHandOrder,
  shiftCards,
  sortedHandOrder,
  type HandOrder,
  type ShiftDirection,
} from './handOrder'
import { MeldArea } from './MeldArea'
import { MotionLayer, type CapturedMotionSource, type MotionRect } from './MotionLayer'
import { PlayerSeat, seatRelationLabels, type SeatPosition, type SeatRelation } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import { RoundScore } from './RoundScore'
import {
  botStepFeedback,
  cueAttributes,
  humanActionFeedback,
  type HumanAction,
  type TableFeedback,
} from './tableFeedback'
import { finalAccentSounds, soundsForFeedback } from './tableSound'
import { useHandDrag, type DropTarget } from './useHandDrag'

type GameTableProps = Readonly<{
  initialMatch?: MatchState
  initialState?: GameState
  createGame?: RoundFactory
  /** Length of a freshly started match; a provided `initialMatch` keeps its own. */
  roundCount?: MatchRoundCount
  /**
   * The match's one bot strategy profile, used for every bot seat and every step (delayed
   * playback and «Completa subito» alike); normal when omitted.
   */
  botDifficulty?: BotDifficulty
  /**
   * Leaves the mounted match (the app shell returns to onboarding). The match actions
   * are offered only when the owner provides it.
   */
  onLeaveMatch?: () => void
  /** Optional shell-owned speed preference; the table keeps its own when omitted. */
  playbackSpeed?: BotPlaybackSpeed
  onPlaybackSpeedChange?: (speed: BotPlaybackSpeed) => void
  /**
   * Notified after each committed `MatchState` (including the initial one) so the shell
   * can persist it. Transient-only changes such as selection, errors, bot timeline or
   * playback speed never trigger it.
   */
  onMatchChange?: (match: MatchState) => void
  /**
   * Moves keyboard focus to the table's context (turn status) once mounted, used when the
   * match replaces onboarding. Later round/result replacements always move focus.
   */
  focusContextOnMount?: boolean
  /**
   * Shell-owned header controls (the app-level Help and Settings entries). A standalone
   * table without them shows its own bot-speed control instead.
   */
  shellActions?: ReactNode
  /**
   * Shell-owned contextual guidance (M36). When provided and enabled, the active match
   * shows the non-modal coach with a dismiss control; otherwise the compact one-line
   * guidance is kept. A standalone table without it stays compact.
   */
  guidance?: Readonly<{ enabled: boolean; onDismiss: () => void }>
}>

const playerOrder: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']
const humanPlayerId: PlayerId = 'player-1'

const humanHand = (game: GameState) => game.players.find(({ id }) => id === humanPlayerId)?.hand ?? []

/** Transient presentation preference for bot playback; never part of game or match state. */
export type BotPlaybackSpeed = 'normal' | 'fast'

/**
 * The ordinary presentation delay before the next committed bot step, per speed. Normal
 * playback is slow enough to follow one public action at a time (M33.1).
 */
export const BOT_PLAYBACK_DELAYS_MS: Readonly<Record<BotPlaybackSpeed, number>> = {
  normal: 900,
  fast: 150,
}

/**
 * The longer delay after a significant public change (a meld play or extension, a discard
 * or player hand-off, a newly reached Burraco or a pozzetto acquisition). Fast playback
 * keeps its short cadence.
 */
export const BOT_SIGNIFICANT_STEP_DELAYS_MS: Readonly<Record<BotPlaybackSpeed, number>> = {
  normal: 1200,
  fast: 150,
}

/**
 * Whether the latest committed change is significant for pacing. It reads only the
 * presentation cue already derived from committed public facts, never bot internals.
 */
const isSignificantChange = (feedback: TableFeedback | null): boolean =>
  feedback !== null && (
    feedback.action?.type === 'play-meld'
    || feedback.action?.type === 'extend-meld'
    || feedback.action?.type === 'discard'
    || feedback.turnChange === 'player'
    || feedback.pozzettoTeamIds.length > 0
    || feedback.burracoMelds.length > 0
  )

/**
 * The single authoritative presentation delay before the next committed bot step: the
 * ordinary cadence, or the longer one after a significant change. With no cue (a mounted,
 * restored or fresh round) the ordinary cadence applies.
 */
export const botPlaybackDelay = (speed: BotPlaybackSpeed, feedback: TableFeedback | null): number =>
  isSignificantChange(feedback) ? BOT_SIGNIFICANT_STEP_DELAYS_MS[speed] : BOT_PLAYBACK_DELAYS_MS[speed]

/**
 * Longest decorative card flight. A bot flight is also kept inside its playback delay, so
 * motion never stretches the cadence; playback never waits for it either way.
 */
export const MOTION_FLIGHT_MS = 380

const motionDuration = (feedback: TableFeedback | null, speed: BotPlaybackSpeed): number =>
  feedback?.actorId ? Math.min(MOTION_FLIGHT_MS, Math.round(BOT_PLAYBACK_DELAYS_MS[speed] * 0.8)) : MOTION_FLIGHT_MS

/** Union viewport rectangle of the human's own moved cards, measured before the view updates. */
const unionRect = (elements: readonly Element[]): MotionRect | null => {
  if (elements.length === 0) return null
  const rects = elements.map((element) => element.getBoundingClientRect())
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return { left, top, width: right - left, height: bottom - top }
}

/** The default (normal) ordinary presentation delay between committed bot steps. */
export const BOT_STEP_DELAY_MS = BOT_PLAYBACK_DELAYS_MS.normal

/** In-app confirmation text shown before an in-progress match is discarded. */
export const LEAVE_MATCH_CONFIRMATION = 'Vuoi abbandonare la partita in corso? Punteggi e carte andranno persi.'

/** Interaction-level rejection of a multi-card drop on the discard pile; no engine call. */
export const MULTI_CARD_DISCARD_MESSAGE = 'Per scartare trascina una sola carta.'
/** Interaction-level rejection of a real drag released outside every valid destination. */
export const OUTSIDE_DROP_MESSAGE =
  'Rilascia le carte nella mano, sugli scarti, su «Nuova calata» o su una calata della tua squadra.'
/** The same rejection outside the action phase, when only reordering the hand is possible. */
export const REORDER_ONLY_DROP_MESSAGE = 'In questa fase puoi solo riordinare le carte rilasciandole nella mano.'

/**
 * Transient presentation order of the human hand for one round, keyed by physical card ID.
 * Never part of `GameState`, `MatchState` or the save; a new round starts a fresh order.
 */
type HandPresentation = Readonly<{ roundNumber: number; order: HandOrder }>

/** User-facing message shown when automatic bot play stops on a `BotAutomationError`. */
export const BOT_AUTOMATION_FAILURE_MESSAGE =
  'Il gioco automatico dei bot non può proseguire in questa partita. Puoi iniziarne una nuova con «Nuova partita».'

/**
 * Transient UI session. Bot events, playback safety counters, the visual feedback cue and
 * any bot automation failure live here, never in `GameState`, `MatchState` or the save.
 */
type GameTableSession = Readonly<{
  match: MatchState
  botEvents: readonly BotPublicActionEvent[]
  botProgress: BotChainProgress
  /** Presentation-only cue for the latest committed change; replaced with the session. */
  feedback: TableFeedback | null
  /** Set once bot automation failed; stops playback until the session is replaced. */
  automationFailed: boolean
  /**
   * Whether «Completa subito» produced this session: its intermediate steps had no cue, so
   * only the final committed state may sound once.
   */
  completedImmediately: boolean
}>

/** Starts a fresh session without resolving any pending bot; playback steps it later. */
const freshSession = (match: MatchState): GameTableSession => ({
  match: synchronizeMatch(match),
  botEvents: [],
  botProgress: INITIAL_BOT_CHAIN_PROGRESS,
  feedback: null,
  automationFailed: false,
  completedImmediately: false,
})

const hasPendingBot = (match: MatchState): boolean =>
  match.status === 'in-progress'
  && match.currentRound.round.status === 'in-progress'
  && match.currentRound.round.turn.currentPlayerId !== humanPlayerId

/** Whether the session may still commit bot steps: a bot is pending and automation has not failed. */
const canPlayBots = (session: GameTableSession): boolean =>
  !session.automationFailed && hasPendingBot(session.match)

/** Commits exactly one pending bot action and appends only that action's public events. */
const advanceBotPlayback = (session: GameTableSession, difficulty: BotDifficulty): GameTableSession => {
  const step = playNextBotChainStep(session.match.currentRound, humanPlayerId, session.botProgress, {}, difficulty)
  if (!step) return session
  return {
    match: updateCurrentRound(session.match, step.state),
    botEvents: [...session.botEvents, ...step.events],
    botProgress: step.progress,
    feedback: botStepFeedback(session.match.currentRound, step.state, step.events, session.feedback),
    automationFailed: false,
    completedImmediately: false,
  }
}

/**
 * The bot-automation presentation boundary. A `BotAutomationError` commits nothing: the
 * given session (its last committed match and public timeline) is kept and only marked
 * as failed. Any other error is a defect and propagates unchanged.
 */
const guardBotAutomation = (
  session: GameTableSession,
  play: (session: GameTableSession) => GameTableSession,
): GameTableSession => {
  try {
    return play(session)
  } catch (error) {
    if (!(error instanceof BotAutomationError)) throw error
    return { ...session, automationFailed: true }
  }
}

/**
 * Completes the pending bot chain synchronously from the current session by repeatedly
 * applying the same one-step progression used by delayed playback. It terminates when
 * control returns to the human or the round completes; the existing chain-step safety
 * limits raise `BotAutomationError` for a non-progressing chain.
 */
const completeBotPlayback = (session: GameTableSession, difficulty: BotDifficulty): GameTableSession => {
  const advance = (current: GameTableSession) => advanceBotPlayback(current, difficulty)
  let current = session
  let next = guardBotAutomation(current, advance)
  while (next !== current && !next.automationFailed) {
    current = next
    next = guardBotAutomation(current, advance)
  }
  // A failure keeps every step committed before it, exactly as delayed playback would.
  if (next.automationFailed) current = next
  // Immediate completion skips every intermediate cue: nothing cosmetic is left pending.
  return current === session ? current : { ...current, feedback: null, completedImmediately: true }
}

/**
 * Visual-only seat mapping around the human, who sits at the bottom, following the
 * existing clockwise turn order: the opponent who plays next on the left, the teammate
 * opposite on top and the remaining opponent on the right. Player IDs, teams and turn
 * order are never changed by it.
 */
const tableSeats = (players: readonly Player[], human: Player) => {
  const humanIndex = playerOrder.indexOf(human.id)
  const othersInTurnOrder = [1, 2, 3].map((offset) => players.find(
    (player) => player.id === playerOrder[(humanIndex + offset) % playerOrder.length],
  )!)
  const teammate = othersInTurnOrder.find((player) => player.teamId === human.teamId)
  const opponents = othersInTurnOrder.filter((player) => player.teamId !== human.teamId)
  if (!teammate || opponents.length !== 2) throw new Error('Unexpected table seating.')
  return { left: opponents[0]!, top: teammate, right: opponents[1]! }
}

type TurnGuidanceContext = Readonly<{
  isBotPlaying: boolean
  automationFailed: boolean
  phase: 'mustDraw' | 'action'
  canDrawStock: boolean
  canTakeDiscardPile: boolean
  hasTeamMelds: boolean
}>

/**
 * Concise help for operating the current phase of the digital table. It only restates
 * which rendered controls are enabled; legality stays with the engine.
 */
const turnGuidance = ({
  isBotPlaying,
  automationFailed,
  phase,
  canDrawStock,
  canTakeDiscardPile,
  hasTeamMelds,
}: TurnGuidanceContext): string => {
  if (automationFailed) return 'Il gioco automatico dei bot si è interrotto.'
  if (isBotPlaying) {
    return 'I bot giocano automaticamente. Attendi il tuo turno oppure usa «Completa subito» per concludere le loro mosse.'
  }
  if (phase === 'mustDraw') {
    if (canDrawStock && canTakeDiscardPile) {
      return 'Tocca a te: pesca una carta dal tallone oppure raccogli il monte degli scarti.'
    }
    if (canDrawStock) return 'Tocca a te: pesca una carta dal tallone. Il monte degli scarti è vuoto.'
    if (canTakeDiscardPile) return 'Tocca a te: il tallone è vuoto, raccogli il monte degli scarti.'
    return 'Nessuna pesca è disponibile.'
  }
  const meldHelp = hasTeamMelds
    ? 'Seleziona le carte per aprire una nuova calata con «Cala» o per aggiungerle a una calata della tua squadra.'
    : 'Seleziona le carte per aprire una nuova calata con «Cala».'
  return `${meldHelp} Per finire il turno seleziona una sola carta e premi «Scarta e passa».`
}

const italianErrorMessages: Readonly<Record<string, string>> = {
  NOT_CURRENT_PLAYER: 'Può agire soltanto il giocatore di turno.',
  INVALID_TURN_PHASE: 'Questa azione non è disponibile nella fase attuale.',
  DRAW_PILE_EMPTY: 'Il tallone è vuoto.',
  DISCARD_PILE_EMPTY: 'Il monte degli scarti è vuoto.',
  CARD_NOT_IN_HAND: 'La carta scelta non è nella mano attiva.',
  DUPLICATE_CARD_ID: 'La stessa carta fisica è stata selezionata più di una volta.',
  INVALID_MELD: 'Le carte selezionate non formano una calata valida.',
  EMPTY_CARD_SELECTION: 'Seleziona almeno una carta.',
  MELD_NOT_FOUND: 'La calata scelta non esiste.',
  CANNOT_REDISCARD_SINGLE_COLLECTED_CARD: 'Non puoi riscartare subito l’unica carta raccolta.',
  ROUND_COMPLETED: 'La smazzata è già conclusa.',
  CANNOT_CLOSE_WITHOUT_BURRACO: 'Per chiudere serve almeno un Burraco.',
  CANNOT_CLOSE_WITH_WILDCARD: 'Non puoi chiudere scartando un jolly o una pinella.',
  CANNOT_CLOSE_WITHOUT_DISCARD: 'La chiusura deve avvenire con lo scarto finale.',
}

export function GameTable({
  initialMatch,
  initialState,
  createGame,
  roundCount = DEFAULT_MATCH_ROUND_COUNT,
  botDifficulty = DEFAULT_BOT_DIFFICULTY,
  onLeaveMatch,
  playbackSpeed: controlledPlaybackSpeed,
  onPlaybackSpeedChange,
  onMatchChange,
  focusContextOnMount = false,
  shellActions,
  guidance: guidanceControl,
}: GameTableProps) {
  const [session, setSession] = useState<GameTableSession>(() => {
    const startingMatch: MatchState = initialMatch ?? (initialState
      ? {
          roundCount,
          status: 'in-progress',
          currentRoundNumber: 1,
          currentRound: initialState,
          roundResults: [],
        }
      : startMatch(createGame, roundCount))
    return freshSession(startingMatch)
  })
  const [selectedCardIds, setSelectedCardIds] = useState<ReadonlySet<string>>(() => new Set())
  const [ruleError, setRuleError] = useState<string | null>(null)
  // Code of the engine rejection behind `ruleError`, for contextual coaching only.
  const [rejectionCode, setRejectionCode] = useState<GameErrorCode | null>(null)
  const [localPlaybackSpeed, setLocalPlaybackSpeed] = useState<BotPlaybackSpeed>('normal')
  // Visual disclosure state only; the history log stays mounted either way.
  const [historyExpanded, setHistoryExpanded] = useState(false)
  // Transient in-app abandonment confirmation; never saved, never a domain state.
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const leavingRef = useRef(false)
  const cancelLeaveRef = useRef<HTMLButtonElement>(null)
  // Seeded once per round from the deterministic display sort; later only reconciled.
  const [handPresentation, setHandPresentation] = useState<HandPresentation>(() => ({
    roundNumber: session.match.currentRoundNumber,
    order: sortedHandOrder(humanHand(session.match.currentRound)),
  }))
  const playbackSpeed = controlledPlaybackSpeed ?? localPlaybackSpeed
  const setPlaybackSpeed = onPlaybackSpeedChange ?? setLocalPlaybackSpeed
  const { match, botEvents, feedback } = session
  const game = match.currentRound
  const isBotPlaying = hasPendingBot(match)
  const { automationFailed } = session

  // Reconcile the presentation order with the committed hand during render: survivors keep
  // their visible order, new cards are appended in engine-hand order, and a new round (a
  // fresh session) reseeds from the deterministic sort. Only transient state is updated.
  const humanCards = humanHand(game)
  const handOrder = handPresentation.roundNumber === match.currentRoundNumber
    ? reconcileHandOrder(handPresentation.order, humanCards)
    : sortedHandOrder(humanCards)
  if (handOrder !== handPresentation.order) {
    setHandPresentation({ roundNumber: match.currentRoundNumber, order: handOrder })
  }
  const setHandOrder = (order: HandOrder) => {
    setHandPresentation((current) => current.order === order ? current : { ...current, order })
  }

  // Focus follows major replacements of the primary view (a fresh round or the
  // completed-round result), never ordinary card actions or bot timeline events.
  const turnStatusRef = useRef<HTMLDivElement>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const viewKey = `${match.currentRoundNumber}:${game.round.status}`
  const focusedViewRef = useRef<string | null>(focusContextOnMount ? null : viewKey)
  useEffect(() => {
    if (focusedViewRef.current === viewKey) return
    focusedViewRef.current = viewKey
    const target = game.round.status === 'completed' ? resultHeadingRef.current : turnStatusRef.current
    target?.focus()
  }, [viewKey, game.round.status])

  const onMatchChangeRef = useRef(onMatchChange)
  useEffect(() => {
    onMatchChangeRef.current = onMatchChange
  })

  // Runs only once a new match object has committed; a scheduled bot step that has not
  // fired yet has not produced one.
  useEffect(() => {
    onMatchChangeRef.current?.(session.match)
  }, [session.match])

  useEffect(() => {
    // A failed session is never rescheduled, not even by a speed change. While the
    // abandonment confirmation is open no bot step is scheduled, so the match cannot change
    // under it; closing it reschedules the pending step with the full delay.
    if (!canPlayBots(session) || confirmingLeave) return
    const scheduledSession = session
    const timer = setTimeout(() => {
      // A callback scheduled for a replaced session must never mutate the new one.
      setSession((current) => current === scheduledSession
        ? guardBotAutomation(current, (next) => advanceBotPlayback(next, botDifficulty))
        : current)
    }, botPlaybackDelay(playbackSpeed, session.feedback))
    // A speed change cancels the pending step and reschedules it with the new delay.
    return () => clearTimeout(timer)
  }, [session, playbackSpeed, confirmingLeave, botDifficulty])

  // Sounds follow committed presentation events exactly once: the M30 cue of a committed
  // change, or only the final state after «Completa subito». Mounting or restoring a match,
  // a fresh round and transient-only updates stay silent. Requests are fire-and-forget.
  const playSounds = usePlaySounds()
  const soundedSessionRef = useRef(session)
  useEffect(() => {
    const previous = soundedSessionRef.current
    if (previous === session) return
    soundedSessionRef.current = session
    if (previous.match === session.match) return
    const round = session.match.currentRound.round
    const facts = {
      roundCompleted: round.status === 'completed',
      matchCompleted: session.match.status === 'completed',
      humanTurn: round.status === 'in-progress' && round.turn.currentPlayerId === humanPlayerId,
      fastPlayback: playbackSpeed === 'fast',
    }
    if (session.feedback && session.feedback !== previous.feedback) {
      playSounds(soundsForFeedback(session.feedback, facts))
    } else if (session.completedImmediately) {
      playSounds(finalAccentSounds(facts))
    }
  }, [session, playbackSpeed, playSounds])

  const completeBotsNow = () => {
    // Replacing the session cancels any pending delayed step.
    setSession((current) => canPlayBots(current) ? completeBotPlayback(current, botDifficulty) : current)
  }

  /** Shows a refused action (engine or interaction-structural) with its UI-only sound. */
  const rejectAction = (message: string, code: GameErrorCode | null = null) => {
    setRuleError(message)
    setRejectionCode(code)
    playSounds(['invalid'])
  }

  const resetTransientState = () => {
    setSelectedCardIds(new Set())
    setRuleError(null)
    setRejectionCode(null)
  }

  /**
   * Discarding an in-progress match (between smazzate included) opens the in-app
   * confirmation; a completed match is left directly. Cancelling changes nothing. Leaving
   * unmounts the table, whose effect cleanup cancels any pending bot step.
   */
  const leaveMatch = () => {
    if (!onLeaveMatch) return
    if (match.status === 'in-progress') {
      setConfirmingLeave(true)
      return
    }
    onLeaveMatch()
  }

  const confirmLeave = () => {
    // A repeated activation before the table unmounts must not leave twice.
    if (leavingRef.current) return
    leavingRef.current = true
    setConfirmingLeave(false)
    onLeaveMatch?.()
  }

  const leaveDialog = confirmingLeave && (
    <Dialog
      title="Abbandonare la partita?"
      role="alertdialog"
      onClose={() => setConfirmingLeave(false)}
      initialFocusRef={cancelLeaveRef}
      className="dialog--confirm"
      actions={(
        <>
          <button ref={cancelLeaveRef} type="button" className="button button--ghost" onClick={() => setConfirmingLeave(false)}>
            Annulla
          </button>
          <button type="button" className="button button--danger" onClick={confirmLeave}>
            Abbandona partita
          </button>
        </>
      )}
    >
      <p>{LEAVE_MATCH_CONFIRMATION}</p>
      <p>Il salvataggio locale di questa partita verrà eliminato.</p>
    </Dialog>
  )

  const beginNextRound = () => {
    setSession(freshSession(advanceMatch(match, createGame)))
    resetTransientState()
  }

  // Pre-commit geometry of the human's moved cards, for the motion layer only.
  const motionSourceRef = useRef<CapturedMotionSource | null>(null)
  const handSectionRef = useRef<HTMLElement>(null)
  const captureHandSource = (cardIds: readonly string[]): MotionRect | null => {
    const section = handSectionRef.current
    if (!section || cardIds.length === 0) return null
    const elements = section.querySelectorAll('[data-motion-anchor="hand"] [data-hand-card]')
    const ids = new Set(cardIds)
    return unionRect(handOrder.flatMap((id, index) => ids.has(id) && elements[index] ? [elements[index]] : []))
  }

  const commitAction = (action: () => GameState, cue: HumanAction, movedCardIds: readonly string[] = []) => {
    if (isBotPlaying) return
    try {
      const next = action()
      // The cue is derived only once the engine has committed the action.
      const nextFeedback = humanActionFeedback(game, next, cue, session.feedback)
      // Geometry is read only after a successful commit, while the old view is still shown.
      const sourceRect = captureHandSource(movedCardIds)
      motionSourceRef.current = sourceRect ? { feedback: nextFeedback, rect: sourceRect } : null
      setSession({
        match: updateCurrentRound(match, next),
        botEvents,
        botProgress: INITIAL_BOT_CHAIN_PROGRESS,
        feedback: nextFeedback,
        automationFailed: false,
        completedImmediately: false,
      })
      resetTransientState()
    } catch (error) {
      if (!(error instanceof GameRuleError)) throw error
      rejectAction(italianErrorMessages[error.code] ?? error.message, error.code)
    }
  }

  const toggleCard = (cardId: string) => {
    if (isBotPlaying) return
    playSounds(['selection'])
    setSelectedCardIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const isHumanInPlay = game.round.status === 'in-progress' && game.round.turn.currentPlayerId === humanPlayerId
  const isHumanActionPhase = isHumanInPlay && game.round.status === 'in-progress' && game.round.turn.phase === 'action'

  /**
   * Turns a released drag into intent. A drop in the hand is a presentation-only reorder;
   * game drops reuse the exact commands and commit path of the equivalent buttons, and the
   * engine alone decides legality. Structural rejections call no engine command.
   */
  const dropCards = (payload: readonly string[], target: DropTarget | null) => {
    if (target?.kind === 'hand') {
      setHandOrder(moveCardsToBoundary(handOrder, payload, target.boundary))
      return
    }
    if (!target || !isHumanActionPhase) {
      rejectAction(isHumanActionPhase ? OUTSIDE_DROP_MESSAGE : REORDER_ONLY_DROP_MESSAGE)
      return
    }
    const teamId = game.players.find(({ id }) => id === humanPlayerId)!.teamId
    switch (target.kind) {
      case 'discard':
        if (payload.length !== 1) {
          rejectAction(MULTI_CARD_DISCARD_MESSAGE)
          return
        }
        commitAction(() => discardCard(game, humanPlayerId, payload[0]!), { type: 'discard' }, payload)
        return
      case 'new-meld':
        commitAction(() => playMeld(game, humanPlayerId, payload), { type: 'play-meld', teamId }, payload)
        return
      case 'meld':
        commitAction(
          () => extendMeld(game, humanPlayerId, target.meldIndex, payload),
          { type: 'extend-meld', teamId, meldIndex: target.meldIndex },
          payload,
        )
    }
  }

  const handDrag = useHandDrag({
    enabled: isHumanInPlay,
    sessionKey: session,
    // A selected card drags the whole selection in visible order; any other card alone.
    resolvePayload: (cardId) => selectedCardIds.has(cardId) ? inVisibleOrder(handOrder, selectedCardIds) : [cardId],
    onDrop: dropCards,
  })

  const completeNowButton = isBotPlaying && !automationFailed && (
    <button type="button" className="button button--ghost button--compact" onClick={completeBotsNow}>Completa subito</button>
  )

  const humanTeamId = game.players.find(({ id }) => id === humanPlayerId)!.teamId
  const teamName = (teamId: string) => teamId === humanTeamId ? 'La tua squadra' : 'Avversari'
  const teamNumberOf = (teamId: string) => teamId === 'team-1' ? '1' : '2'
  // Settled rounds only (`calculateCumulativeScores`); a round in play has no partial score.
  const cumulativeScores = calculateCumulativeScores(match)
  const orientedScores = [...cumulativeScores].sort((a, b) =>
    Number(b.teamId === humanTeamId) - Number(a.teamId === humanTeamId))

  // Slim application bar: match context and secondary controls stay visible but never
  // compete with the table.
  const shellHeader = (
    <header className="game-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">B</span>
        <strong>Burraco</strong>
      </div>
      <strong className="round-indicator">Smazzata {match.currentRoundNumber}/{match.roundCount}</strong>
      {game.round.status === 'in-progress' && (
        <div className="match-score" role="group" aria-label="Punteggio della partita">
          {orientedScores.map((teamScore) => (
            <span key={teamScore.teamId} className="match-score__team">
              {teamName(teamScore.teamId)} <small>(Sq. {teamNumberOf(teamScore.teamId)})</small>{' '}
              <strong>{teamScore.total}</strong>
            </span>
          ))}
          <small className="match-score__note">
            {match.roundResults.length === 0
              ? 'nessuna smazzata conclusa'
              : `dopo ${match.roundResults.length} ${match.roundResults.length === 1 ? 'smazzata' : 'smazzate'}`}
          </small>
        </div>
      )}
      <div className="game-header__actions">
        {shellActions ?? <BotSpeedControl speed={playbackSpeed} onChange={setPlaybackSpeed} />}
        {onLeaveMatch && (
          <button type="button" className="button button--new button--compact" onClick={leaveMatch}>Nuova partita</button>
        )}
      </div>
    </header>
  )

  const history = (
    <BotActionTimeline
      events={botEvents}
      players={game.players}
      expanded={historyExpanded}
      onExpandedChange={setHistoryExpanded}
    />
  )

  if (game.round.status === 'completed') {
    const currentResult = match.roundResults.find(
      ({ roundNumber }) => roundNumber === match.currentRoundNumber,
    )
    if (!currentResult) throw new Error(`Missing result for round ${match.currentRoundNumber}.`)
    const outcome = match.status === 'completed' ? getFinalMatchOutcome(match) : null
    // Win/loss/tie is read only from the domain outcome relative to the human's team.
    const humanOutcome = outcome
      ? outcome.leadingTeamId === null ? 'tie' : outcome.leadingTeamId === humanTeamId ? 'won' : 'lost'
      : null
    const teamMembers = (teamId: string) => game.players
      .filter((player) => player.teamId === teamId)
      .map((player) => player.id === humanPlayerId ? `${player.name} (tu)` : player.name)
      .join(' e ')

    return (
      <>
        <main className="game-shell" inert={confirmingLeave}>
          {shellHeader}
          <RoundScore game={{ ...game, round: game.round }} score={currentResult.score} headingRef={resultHeadingRef} />
          <section className="match-summary" aria-labelledby="match-summary-title">
            <span className="round-complete__eyebrow">
              {outcome ? 'Partita conclusa' : `Smazzata ${match.currentRoundNumber} di ${match.roundCount} conclusa`}
            </span>
            {/* Decorative progress; the eyebrow and the header state the round in text. */}
            <span className="round-track" aria-hidden="true">
              {Array.from({ length: match.roundCount }, (_, index) => (
                <span
                  key={index}
                  className={`round-track__step${index < match.currentRoundNumber ? ' round-track__step--done' : ''}`}
                />
              ))}
            </span>

            {outcome && (
              <div className={`final-result final-result--${humanOutcome} ${outcome.leadingTeamId ? 'final-result--leader' : 'final-result--tie'}`}>
                <h3>Risultato finale</h3>
                <p className="final-result__headline">
                  {humanOutcome === 'won' ? 'Hai vinto la partita!' : humanOutcome === 'lost' ? 'Hanno vinto gli avversari.' : 'Partita pari.'}
                </p>
                {/* Emphasis follows only the domain outcome: one leading team or an exact tie. */}
                <p className="final-result__outcome">
                  <span className="final-result__icon" aria-hidden="true">{outcome.leadingTeamId ? '♛' : '='}</span>
                  {outcome.leadingTeamId
                    ? `Prima la Squadra ${teamNumberOf(outcome.leadingTeamId)}.`
                    : 'Parità esatta.'}
                </p>
              </div>
            )}

            <h2 id="match-summary-title">Punteggio cumulativo</h2>
            <div className="cumulative-score" aria-label="Punti cumulativi">
              {orientedScores.map((teamScore) => (
                <div key={teamScore.teamId} className={teamScore.teamId === humanTeamId ? 'cumulative-score__team--own' : undefined}>
                  <span>
                    {teamName(teamScore.teamId)} · Squadra {teamNumberOf(teamScore.teamId)}
                    <small className="cumulative-score__members">{teamMembers(teamScore.teamId)}</small>
                  </span>
                  <strong>{teamScore.total}</strong>
                </div>
              ))}
            </div>

            {outcome ? (
              <div className="final-result__points">
                <p className="final-result__match-points">Match Points <strong>{outcome.matchPoints}</strong></p>
                <div className="victory-points" aria-label="Victory Points">
                  {outcome.victoryPoints.map((teamResult) => (
                    <div
                      key={teamResult.teamId}
                      className={teamResult.teamId === outcome.leadingTeamId ? 'victory-points__team--leader' : undefined}
                    >
                      <span>{teamName(teamResult.teamId)} · Squadra {teamNumberOf(teamResult.teamId)}</span>
                      <strong>{teamResult.victoryPoints} VP</strong>
                    </div>
                  ))}
                </div>
                {onLeaveMatch && (
                  <button type="button" className="button button--primary match-summary__action" onClick={leaveMatch}>
                    Gioca ancora
                  </button>
                )}
              </div>
            ) : (
              <button type="button" className="button button--primary match-summary__action" onClick={beginNextRound}>
                Inizia smazzata {match.currentRoundNumber + 1}
              </button>
            )}
          </section>
          {/* The bot history stays available but secondary to the progression. */}
          <div className="round-history">{history}</div>
        </main>
        {leaveDialog}
      </>
    )
  }

  const round = game.round
  const activePlayer = game.players.find((player) => player.id === round.turn.currentPlayerId)
  if (!activePlayer) throw new Error(`Missing current player: ${round.turn.currentPlayerId}`)
  const activeTeam = game.teams.find((team) => team.id === activePlayer.teamId)
  if (!activeTeam) throw new Error(`Missing active team: ${activePlayer.teamId}`)
  const humanPlayer = game.players.find((player) => player.id === humanPlayerId)
  if (!humanPlayer) throw new Error(`Missing human player: ${humanPlayerId}`)
  const seats = tableSeats(game.players, humanPlayer)
  const relationOf = (player: Player): SeatRelation =>
    player.teamId === humanPlayer.teamId ? 'teammate' : 'opponent'
  const teamNumber = teamNumberOf
  const activeRole = activePlayer.id === humanPlayerId ? 'Tu' : seatRelationLabels[relationOf(activePlayer)]
  const isHumanTurn = activePlayer.id === humanPlayerId
  const isActionPhase = isHumanTurn && round.turn.phase === 'action'
  const selectedIds = [...selectedCardIds]
  const cardsById = new Map(humanPlayer.hand.map((card) => [card.id, card]))
  const visibleHand = handOrder.map((id) => cardsById.get(id)!)
  const { drag } = handDrag
  const draggedIds = new Set(drag?.payload)
  const dragTarget = drag?.target ?? null
  const insertBoundary = dragTarget?.kind === 'hand' ? dragTarget.boundary : null
  const canShift = (direction: ShiftDirection) => isHumanTurn && canShiftCards(handOrder, selectedCardIds, direction)
  // Presentation-only: neither control touches the match, the save or the selection.
  const shiftSelection = (direction: ShiftDirection) => setHandOrder(shiftCards(handOrder, selectedCardIds, direction))
  const sortHand = () => setHandOrder(sortedHandOrder(humanPlayer.hand))
  const dropState = (active: boolean) => !drag ? 'idle' as const : active ? 'active' as const : 'available' as const
  // Public availability only: the count of non-empty pozzetti, never their contents.
  const untouchedPozzetti = game.pozzetti.filter((pozzetto) => pozzetto.length > 0).length
  const isDrawPhase = isHumanTurn && round.turn.phase === 'mustDraw'
  const canDrawStock = isDrawPhase && game.drawPile.length > 0
  const canTakeDiscardPile = isDrawPhase && game.discardPile.length > 0
  const guidance = turnGuidance({
    isBotPlaying,
    automationFailed,
    phase: round.turn.phase,
    canDrawStock,
    canTakeDiscardPile,
    hasTeamMelds: activeTeam.melds.length > 0,
  })
  // M36: the coach reads only public/presentation facts and the committed feedback cue.
  const coaching = guidanceControl?.enabled ? deriveCoaching({
    isBotPlaying,
    automationFailed,
    phase: round.turn.phase,
    canDrawStock,
    canTakeDiscardPile,
    selectedCount: selectedCardIds.size,
    hasTeamMelds: game.teams.some((team) => team.id === humanPlayer.teamId && team.melds.length > 0),
    rejectionCode,
    pozzettoTaken: {
      ownTeam: feedback?.pozzettoTeamIds.includes(humanPlayer.teamId) ?? false,
      opponentTeam: feedback?.pozzettoTeamIds.some((teamId) => teamId !== humanPlayer.teamId) ?? false,
    },
    burracoReached: {
      ownTeam: feedback?.burracoMelds.some(({ teamId }) => teamId === humanPlayer.teamId) ?? false,
      opponentTeam: feedback?.burracoMelds.some(({ teamId }) => teamId !== humanPlayer.teamId) ?? false,
    },
  }) : null
  // Presentation-only cues for the latest committed change (see `tableFeedback.ts`).
  const cuedAction = feedback?.action?.type
  const isHumanCue = feedback !== null && feedback.actorId === null
  const seatCue = (player: Player) => cueAttributes(
    feedback,
    (feedback?.turnChange === 'player' && player.id === activePlayer.id && 'turn')
      || (feedback?.actorId === player.id && 'bot-step'),
  )
  const receivedCardIds = new Set(feedback?.receivedCardIds)

  const seat = (player: Player, position: SeatPosition) => (
    <PlayerSeat
      player={player}
      position={position}
      relation={relationOf(player)}
      bot
      active={player.id === activePlayer.id}
      cue={seatCue(player)}
    />
  )
  const meldArea = (team: Team, placement: 'own' | 'opponent') => (
    <MeldArea
      key={team.id}
      team={team}
      owner={placement === 'own' ? 'La tua squadra' : 'Avversari'}
      activeTeam={team.id === activeTeam.id}
      canExtend={isActionPhase && selectedCardIds.size > 0}
      onExtend={(meldIndex) => commitAction(
        () => extendMeld(game, humanPlayerId, meldIndex, selectedIds),
        { type: 'extend-meld', teamId: humanPlayer.teamId, meldIndex },
        selectedIds,
      )}
      feedback={feedback}
      directTargets={placement === 'own'
        ? { enabled: isActionPhase, dragging: drag !== null, activeTarget: dragTarget }
        : undefined}
    />
  )
  const ownTeam = game.teams.find((team) => team.id === humanPlayer.teamId)!
  const opponentTeam = game.teams.find((team) => team.id !== humanPlayer.teamId)!

  return (
    <>
    <main className="game-shell" data-hand-dragging={drag ? '' : undefined} inert={confirmingLeave}>
      {shellHeader}
      <section className="table-surface" aria-label="Tavolo di Burraco">
        {/* Clockwise from the human: next player on the left, teammate opposite, then right. */}
        {seat(seats.left, 'left')}
        {seat(seats.top, 'top')}
        {seat(seats.right, 'right')}

        <div className="table-history">{history}</div>

        <div className="table-center">
          {meldArea(opponentTeam, 'opponent')}

          <div className="table-hub">
            <div className="turn-status" ref={turnStatusRef} tabIndex={-1}>
              {/* Only attributes change here, so the live region is never remounted to animate. */}
              <div
                className="turn-banner"
                aria-live="polite"
                aria-atomic="true"
                {...cueAttributes(feedback, feedback?.turnChange)}
              >
                <span className="turn-banner__pulse" aria-hidden="true" />
                <div>
                  <span>Turno di</span>
                  <strong>{activePlayer.name}</strong>
                  <small className="turn-banner__role">{activeRole} · Squadra {teamNumber(activePlayer.teamId)}</small>
                </div>
                <div className="turn-banner__phase">
                  <span>Fase</span>
                  <strong>{round.turn.phase === 'mustDraw' ? 'Pesca' : 'Gioco'}</strong>
                </div>
                {isBotPlaying && (
                  <div className="turn-banner__phase">
                    <span>Stato</span>
                    <strong>{automationFailed ? 'Bot fermi' : 'Bot in gioco…'}</strong>
                  </div>
                )}
              </div>
              {coaching && guidanceControl
                ? <GuidedCoach coaching={coaching} onDismiss={guidanceControl.onDismiss} />
                : <p className="turn-guidance">{guidance}</p>}
              {completeNowButton}
            </div>

            {automationFailed && (
              <div className="rule-error" role="alert">
                <span aria-hidden="true">!</span>
                <p><strong>Gioco automatico interrotto</strong>{BOT_AUTOMATION_FAILURE_MESSAGE}</p>
              </div>
            )}

            <div className="pile-zone" aria-label="Tallone e monte degli scarti">
              <button
                type="button"
                className="pile-control"
                data-motion-anchor="stock"
                onClick={() => commitAction(() => drawCard(game, humanPlayerId), { type: 'draw-stock' })}
                disabled={!canDrawStock}
                {...cueAttributes(feedback, cuedAction === 'draw-stock' && 'draw')}
                aria-label={`Pesca dal tallone, ${game.drawPile.length} carte rimaste`}
              >
                <span className="card-back" aria-hidden="true"><span>B</span></span>
                <strong>Tallone</strong>
                <span>{game.drawPile.length} carte</span>
              </button>

              <div
                className="pozzetti-counter"
                data-motion-anchor="pozzetti"
                {...cueAttributes(feedback, (feedback?.pozzettoTeamIds.length ?? 0) > 0 && 'pozzetto')}
              >
                {/* Face-down stacks derived only from the available count; no identity or owner. */}
                <span className="pozzetti-counter__stacks" aria-hidden="true">
                  {game.pozzetti.map((_, index) => (
                    <span
                      key={index}
                      className={`pozzetto-stack${index < untouchedPozzetti ? '' : ' pozzetto-stack--empty'}`}
                    />
                  ))}
                </span>
                <span>Pozzetti</span>
                <strong>{untouchedPozzetti}</strong>
                <small>ancora disponibili</small>
              </div>

              <DiscardPile
                cards={game.discardPile}
                canCollect={canTakeDiscardPile}
                onCollect={() => commitAction(() => takeDiscardPile(game, humanPlayerId), { type: 'collect-discard-pile' })}
                cue={cueAttributes(feedback, (cuedAction === 'collect-discard-pile' && 'collect') || (cuedAction === 'discard' && 'discard'))}
                dropState={isActionPhase ? dropState(dragTarget?.kind === 'discard') : null}
              />
            </div>
          </div>

          {meldArea(ownTeam, 'own')}
        </div>

        <section
          ref={handSectionRef}
          className={`active-player${isHumanTurn ? ' active-player--turn' : ''}`}
          aria-label={`Mano di ${humanPlayer.name}`}
          {...cueAttributes(feedback, feedback?.turnChange === 'player' && isHumanTurn && 'turn')}
        >
          <header className="active-player__header">
            <div>
              <span className="section-kicker">Tu · Squadra {teamNumber(humanPlayer.teamId)}</span>
              <h1>{humanPlayer.name}</h1>
            </div>
            <span className="active-player__status">
              {isHumanTurn && <span className="turn-badge">Di turno</span>}
              <span className="hand-count">{humanPlayer.hand.length} carte</span>
            </span>
          </header>

          <div
            ref={handDrag.handRef}
            className="hand"
            data-motion-anchor="hand"
            aria-label={`Carte di ${humanPlayer.name}`}
            data-drop-target={isHumanTurn ? 'hand' : undefined}
            data-drop-state={drag ? dropState(insertBoundary !== null) : undefined}
            {...cueAttributes(feedback, isHumanCue && cuedAction === 'collect-discard-pile' && 'collect')}
          >
            {visibleHand.map((card, index) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedCardIds.has(card.id)}
                onToggle={isHumanTurn ? toggleCard : undefined}
                cue={cueAttributes(feedback, receivedCardIds.has(card.id) && 'received')}
                handInteraction={isHumanTurn ? {
                  dragging: draggedIds.has(card.id),
                  armed: handDrag.armedCardId === card.id,
                  insertMarker: insertBoundary === index
                    ? 'before'
                    : insertBoundary === visibleHand.length && index === visibleHand.length - 1 ? 'after' : null,
                  onPointerDown: handDrag.onPointerDown,
                  onClickCapture: handDrag.onClickCapture,
                  onContextMenu: handDrag.onContextMenu,
                } : undefined}
              />
            ))}
          </div>

          {/* Presentation-only hand tools: never a game action, a save or a selection change. */}
          <div className="hand-tools" role="group" aria-label="Ordine della mano">
            <button type="button" className="button button--ghost button--small" onClick={sortHand}>
              Ordina mano
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              disabled={!canShift('left')}
              onClick={() => shiftSelection('left')}
              aria-label="Sposta a sinistra"
            >
              <span aria-hidden="true">←</span> Sposta
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              disabled={!canShift('right')}
              onClick={() => shiftSelection('right')}
              aria-label="Sposta a destra"
            >
              Sposta <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className="action-bar">
            <div className="selection-summary" aria-live="polite">
              <strong>{selectedCardIds.size}</strong>
              <span>{selectedCardIds.size === 1 ? 'carta selezionata' : 'carte selezionate'}</span>
            </div>
            <button
              type="button"
              className="button button--primary"
              disabled={!isActionPhase || selectedCardIds.size === 0}
              onClick={() => commitAction(
                () => playMeld(game, humanPlayerId, selectedIds),
                { type: 'play-meld', teamId: humanPlayer.teamId },
                selectedIds,
              )}
            >
              Cala
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={!isActionPhase || selectedCardIds.size !== 1}
              onClick={() => commitAction(
                () => discardCard(game, humanPlayerId, selectedIds[0]!),
                { type: 'discard' },
                selectedIds,
              )}
            >
              Scarta e passa
            </button>
          </div>

          {drag && (
            // A count badge following the pointer; it never shows card identities.
            <span
              className="drag-proxy"
              aria-hidden="true"
              style={{ left: drag.x, top: drag.y }}
            >
              {drag.payload.length === 1 ? '1 carta' : `${drag.payload.length} carte`}
            </span>
          )}

          {ruleError && (
            <div className="rule-error" role="alert">
              <span aria-hidden="true">!</span>
              <p><strong>Mossa non valida</strong>{ruleError}</p>
              <button
                type="button"
                className="rule-error__dismiss"
                onClick={() => {
                  setRuleError(null)
                  setRejectionCode(null)
                }}
                aria-label="Chiudi messaggio di errore"
              >
                ×
              </button>
            </div>
          )}
        </section>
      </section>
      <MotionLayer
        feedback={feedback}
        durationMs={motionDuration(feedback, playbackSpeed)}
        capturedSource={motionSourceRef}
      />
    </main>
    {leaveDialog}
    </>
  )
}
