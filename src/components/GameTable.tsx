import { useEffect, useRef, useState } from 'react'
import {
  BotAutomationError,
  INITIAL_BOT_CHAIN_PROGRESS,
  playNextBotChainStep,
  type BotChainProgress,
  type BotPublicActionEvent,
} from '../game/bot'
import { GameRuleError } from '../game/engine/errors'
import { extendMeld } from '../game/engine/extendMeld'
import { playMeld } from '../game/engine/playMeld'
import { discardCard, drawCard, takeDiscardPile } from '../game/engine/turn'
import {
  advanceMatch,
  calculateCumulativeScores,
  getFinalMatchOutcome,
  MATCH_ROUND_COUNT,
  startMatch,
  synchronizeMatch,
  updateCurrentRound,
  type MatchState,
  type RoundFactory,
} from '../game/match'
import type { GameState, Player, PlayerId, Team } from '../game/state/types'
import { BotActionTimeline } from './BotActionTimeline'
import { sortCardsForDisplay } from './cardPresentation'
import { DiscardPile } from './DiscardPile'
import { MeldArea } from './MeldArea'
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

type GameTableProps = Readonly<{
  initialMatch?: MatchState
  initialState?: GameState
  createGame?: RoundFactory
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
}>

const playerOrder: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']
const humanPlayerId: PlayerId = 'player-1'

/** Transient presentation preference for bot playback; never part of game or match state. */
export type BotPlaybackSpeed = 'normal' | 'fast'

/** The single authoritative presentation delay between committed bot steps, per speed. */
export const BOT_PLAYBACK_DELAYS_MS: Readonly<Record<BotPlaybackSpeed, number>> = {
  normal: 550,
  fast: 150,
}

/** The default (normal) presentation delay between committed bot steps. */
export const BOT_STEP_DELAY_MS = BOT_PLAYBACK_DELAYS_MS.normal

/** Native confirmation shown before an in-progress match is discarded. */
export const LEAVE_MATCH_CONFIRMATION = 'Vuoi abbandonare la partita in corso? Punteggi e carte andranno persi.'

const playbackSpeedLabels: Readonly<Record<BotPlaybackSpeed, string>> = {
  normal: 'Normale',
  fast: 'Veloce',
}

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
}>

/** Starts a fresh session without resolving any pending bot; playback steps it later. */
const freshSession = (match: MatchState): GameTableSession => ({
  match: synchronizeMatch(match),
  botEvents: [],
  botProgress: INITIAL_BOT_CHAIN_PROGRESS,
  feedback: null,
  automationFailed: false,
})

const hasPendingBot = (match: MatchState): boolean =>
  match.status === 'in-progress'
  && match.currentRound.round.status === 'in-progress'
  && match.currentRound.round.turn.currentPlayerId !== humanPlayerId

/** Whether the session may still commit bot steps: a bot is pending and automation has not failed. */
const canPlayBots = (session: GameTableSession): boolean =>
  !session.automationFailed && hasPendingBot(session.match)

/** Commits exactly one pending bot action and appends only that action's public events. */
const advanceBotPlayback = (session: GameTableSession): GameTableSession => {
  const step = playNextBotChainStep(session.match.currentRound, humanPlayerId, session.botProgress)
  if (!step) return session
  return {
    match: updateCurrentRound(session.match, step.state),
    botEvents: [...session.botEvents, ...step.events],
    botProgress: step.progress,
    feedback: botStepFeedback(session.match.currentRound, step.state, step.events, session.feedback),
    automationFailed: false,
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
const completeBotPlayback = (session: GameTableSession): GameTableSession => {
  let current = session
  let next = guardBotAutomation(current, advanceBotPlayback)
  while (next !== current && !next.automationFailed) {
    current = next
    next = guardBotAutomation(current, advanceBotPlayback)
  }
  // A failure keeps every step committed before it, exactly as delayed playback would.
  if (next.automationFailed) current = next
  // Immediate completion skips every intermediate cue: nothing cosmetic is left pending.
  return current === session ? current : { ...current, feedback: null }
}

/**
 * Visual-only seat mapping around the human, who sits at the bottom: the teammate on the
 * left, the opponent who plays next on the right and the other opponent on top. Player
 * IDs, teams and turn order are never changed by it.
 */
const tableSeats = (players: readonly Player[], human: Player) => {
  const humanIndex = playerOrder.indexOf(human.id)
  const othersInTurnOrder = [1, 2, 3].map((offset) => players.find(
    (player) => player.id === playerOrder[(humanIndex + offset) % playerOrder.length],
  )!)
  const teammate = othersInTurnOrder.find((player) => player.teamId === human.teamId)
  const opponents = othersInTurnOrder.filter((player) => player.teamId !== human.teamId)
  if (!teammate || opponents.length !== 2) throw new Error('Unexpected table seating.')
  return { left: teammate, right: opponents[0]!, top: opponents[1]! }
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
  onLeaveMatch,
  playbackSpeed: controlledPlaybackSpeed,
  onPlaybackSpeedChange,
  onMatchChange,
  focusContextOnMount = false,
}: GameTableProps) {
  const [session, setSession] = useState<GameTableSession>(() => {
    const startingMatch: MatchState = initialMatch ?? (initialState
      ? {
          status: 'in-progress',
          currentRoundNumber: 1,
          currentRound: initialState,
          roundResults: [],
        }
      : startMatch(createGame))
    return freshSession(startingMatch)
  })
  const [selectedCardIds, setSelectedCardIds] = useState<ReadonlySet<string>>(() => new Set())
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [localPlaybackSpeed, setLocalPlaybackSpeed] = useState<BotPlaybackSpeed>('normal')
  // Visual disclosure state only; the history log stays mounted either way.
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const playbackSpeed = controlledPlaybackSpeed ?? localPlaybackSpeed
  const setPlaybackSpeed = onPlaybackSpeedChange ?? setLocalPlaybackSpeed
  const { match, botEvents, feedback } = session
  const game = match.currentRound
  const isBotPlaying = hasPendingBot(match)
  const { automationFailed } = session

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
    // A failed session is never rescheduled, not even by a speed change.
    if (!canPlayBots(session)) return
    const scheduledSession = session
    const timer = setTimeout(() => {
      // A callback scheduled for a replaced session must never mutate the new one.
      setSession((current) => current === scheduledSession
        ? guardBotAutomation(current, advanceBotPlayback)
        : current)
    }, BOT_PLAYBACK_DELAYS_MS[playbackSpeed])
    // A speed change cancels the pending step and reschedules it with the new delay.
    return () => clearTimeout(timer)
  }, [session, playbackSpeed])

  const completeBotsNow = () => {
    // Replacing the session cancels any pending delayed step.
    setSession((current) => canPlayBots(current) ? completeBotPlayback(current) : current)
  }

  const resetTransientState = () => {
    setSelectedCardIds(new Set())
    setRuleError(null)
  }

  /**
   * Discarding an in-progress match needs explicit confirmation; a completed match is
   * left directly. Cancelling changes nothing. Leaving unmounts the table, whose effect
   * cleanup cancels any pending bot step.
   */
  const leaveMatch = () => {
    if (!onLeaveMatch) return
    if (match.status === 'in-progress' && !window.confirm(LEAVE_MATCH_CONFIRMATION)) return
    onLeaveMatch()
  }

  const beginNextRound = () => {
    setSession(freshSession(advanceMatch(match, createGame)))
    resetTransientState()
  }

  const commitAction = (action: () => GameState, cue: HumanAction) => {
    if (isBotPlaying) return
    try {
      const next = action()
      // The cue is derived only once the engine has committed the action.
      setSession({
        match: updateCurrentRound(match, next),
        botEvents,
        botProgress: INITIAL_BOT_CHAIN_PROGRESS,
        feedback: humanActionFeedback(game, next, cue, session.feedback),
        automationFailed: false,
      })
      resetTransientState()
    } catch (error) {
      if (!(error instanceof GameRuleError)) throw error
      setRuleError(italianErrorMessages[error.code] ?? error.message)
    }
  }

  const toggleCard = (cardId: string) => {
    if (isBotPlaying) return
    setSelectedCardIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const completeNowButton = isBotPlaying && !automationFailed && (
    <button type="button" className="button button--ghost button--compact" onClick={completeBotsNow}>Completa subito</button>
  )

  // Slim application bar: match context and secondary controls stay visible but never
  // compete with the table.
  const shellHeader = (
    <header className="game-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">B</span>
        <strong>Burraco</strong>
      </div>
      <strong className="round-indicator">Smazzata {match.currentRoundNumber}/{MATCH_ROUND_COUNT}</strong>
      <div className="game-header__actions">
        <fieldset className="playback-controls">
          <legend>Velocità bot</legend>
          {(['normal', 'fast'] as const).map((speed) => (
            <label key={speed} className="playback-controls__option">
              <input
                type="radio"
                name="bot-playback-speed"
                value={speed}
                checked={playbackSpeed === speed}
                onChange={() => setPlaybackSpeed(speed)}
              />
              {playbackSpeedLabels[speed]}
            </label>
          ))}
        </fieldset>
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
    const cumulativeScores = calculateCumulativeScores(match)
    const outcome = match.status === 'completed' ? getFinalMatchOutcome(match) : null

    return (
      <main className="game-shell">
        {shellHeader}
        <RoundScore game={{ ...game, round: game.round }} score={currentResult.score} headingRef={resultHeadingRef} />
        {history}
        <section className="match-summary" aria-labelledby="match-summary-title">
          <span className="round-complete__eyebrow">
            {outcome ? 'Partita conclusa' : `Dopo ${match.currentRoundNumber} smazzate`}
          </span>
          {/* Decorative progress; the eyebrow and the header state the round in text. */}
          <span className="round-track" aria-hidden="true">
            {Array.from({ length: MATCH_ROUND_COUNT }, (_, index) => (
              <span
                key={index}
                className={`round-track__step${index < match.currentRoundNumber ? ' round-track__step--done' : ''}`}
              />
            ))}
          </span>
          <h2 id="match-summary-title">Punteggio cumulativo</h2>
          <div className="cumulative-score" aria-label="Punti cumulativi">
            {cumulativeScores.map((teamScore) => (
              <div key={teamScore.teamId}>
                <span>Squadra {teamScore.teamId === 'team-1' ? '1' : '2'}</span>
                <strong>{teamScore.total}</strong>
              </div>
            ))}
          </div>

          {outcome ? (
            <div
              className={`final-result ${outcome.leadingTeamId ? 'final-result--leader' : 'final-result--tie'}`}
            >
              <h3>Risultato finale</h3>
              {/* Emphasis follows only the domain outcome: one leading team or an exact tie. */}
              <p className="final-result__outcome">
                <span className="final-result__icon" aria-hidden="true">{outcome.leadingTeamId ? '♛' : '='}</span>
                {outcome.leadingTeamId
                  ? `Prima la Squadra ${outcome.leadingTeamId === 'team-1' ? '1' : '2'}.`
                  : 'Parità esatta.'}
              </p>
              <p className="final-result__match-points">Match Points <strong>{outcome.matchPoints}</strong></p>
              <div className="victory-points" aria-label="Victory Points">
                {outcome.victoryPoints.map((teamResult) => (
                  <div
                    key={teamResult.teamId}
                    className={teamResult.teamId === outcome.leadingTeamId ? 'victory-points__team--leader' : undefined}
                  >
                    <span>Squadra {teamResult.teamId === 'team-1' ? '1' : '2'}</span>
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
      </main>
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
  const teamNumber = (teamId: string) => teamId === 'team-1' ? '1' : '2'
  const activeRole = activePlayer.id === humanPlayerId ? 'Tu' : seatRelationLabels[relationOf(activePlayer)]
  const isHumanTurn = activePlayer.id === humanPlayerId
  const isActionPhase = isHumanTurn && round.turn.phase === 'action'
  const selectedIds = [...selectedCardIds]
  const sortedHand = sortCardsForDisplay(humanPlayer.hand)
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
      )}
      feedback={feedback}
    />
  )
  const ownTeam = game.teams.find((team) => team.id === humanPlayer.teamId)!
  const opponentTeam = game.teams.find((team) => team.id !== humanPlayer.teamId)!

  return (
    <main className="game-shell">
      {shellHeader}
      <section className="table-surface" aria-label="Tavolo di Burraco">
        {seat(seats.top, 'top')}
        {seat(seats.left, 'left')}
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
              <p className="turn-guidance">{guidance}</p>
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
              />
            </div>
          </div>

          {meldArea(ownTeam, 'own')}
        </div>

        <section
          className="active-player"
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
            className="hand"
            aria-label={`Carte di ${humanPlayer.name}`}
            {...cueAttributes(feedback, isHumanCue && cuedAction === 'collect-discard-pile' && 'collect')}
          >
            {sortedHand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedCardIds.has(card.id)}
                onToggle={isHumanTurn ? toggleCard : undefined}
                cue={cueAttributes(feedback, receivedCardIds.has(card.id) && 'received')}
              />
            ))}
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
              )}
            >
              Cala
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={!isActionPhase || selectedCardIds.size !== 1}
              onClick={() => commitAction(() => discardCard(game, humanPlayerId, selectedIds[0]!), { type: 'discard' })}
            >
              Scarta e passa
            </button>
          </div>

          {ruleError && (
            <div className="rule-error" role="alert">
              <span aria-hidden="true">!</span>
              <p><strong>Mossa non valida</strong>{ruleError}</p>
              <button
                type="button"
                className="rule-error__dismiss"
                onClick={() => setRuleError(null)}
                aria-label="Chiudi messaggio di errore"
              >
                ×
              </button>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
