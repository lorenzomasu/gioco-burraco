import { useState } from 'react'
import { playBotsUntilHumanTurn } from '../game/bot'
import { GameRuleError } from '../game/engine/errors'
import { extendMeld } from '../game/engine/extendMeld'
import { playMeld } from '../game/engine/playMeld'
import { startGame } from '../game/engine/startGame'
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
} from '../game/match'
import type { GameState, InProgressGameState, Player, PlayerId } from '../game/state/types'
import { sortCardsForDisplay } from './cardPresentation'
import { MeldArea } from './MeldArea'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import { RoundScore } from './RoundScore'

type GameTableProps = Readonly<{
  initialMatch?: MatchState
  initialState?: GameState
  createGame?: () => InProgressGameState
}>

const playerOrder: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']
const humanPlayerId: PlayerId = 'player-1'

const prepareMatchForUi = (match: MatchState): MatchState => {
  const synchronized = synchronizeMatch(match)
  if (synchronized.status === 'completed') return synchronized
  const automatedRound = playBotsUntilHumanTurn(synchronized.currentRound, humanPlayerId)
  return updateCurrentRound(synchronized, automatedRound)
}

const relativeSeats = (players: readonly Player[], activeId: PlayerId) => {
  const activeIndex = playerOrder.indexOf(activeId)
  const byOffset = (offset: number) => players.find(
    (player) => player.id === playerOrder[(activeIndex + offset) % playerOrder.length],
  )!
  return { right: byOffset(1), top: byOffset(2), left: byOffset(3) }
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

export function GameTable({ initialMatch, initialState, createGame = startGame }: GameTableProps) {
  const [match, setMatch] = useState<MatchState>(() => {
    const startingMatch: MatchState = initialMatch ?? (initialState
      ? {
          status: 'in-progress',
          currentRoundNumber: 1,
          currentRound: initialState,
          roundResults: [],
        }
      : startMatch(createGame))
    return prepareMatchForUi(startingMatch)
  })
  const [selectedCardIds, setSelectedCardIds] = useState<ReadonlySet<string>>(() => new Set())
  const [ruleError, setRuleError] = useState<string | null>(null)
  const game = match.currentRound

  const resetTransientState = () => {
    setSelectedCardIds(new Set())
    setRuleError(null)
  }

  const beginNewMatch = () => {
    setMatch(prepareMatchForUi(startMatch(createGame)))
    resetTransientState()
  }

  const beginNextRound = () => {
    setMatch(prepareMatchForUi(advanceMatch(match, createGame)))
    resetTransientState()
  }

  const commitAction = (action: () => GameState) => {
    try {
      const nextGame = playBotsUntilHumanTurn(action(), humanPlayerId)
      setMatch(updateCurrentRound(match, nextGame))
      resetTransientState()
    } catch (error) {
      if (!(error instanceof GameRuleError)) throw error
      setRuleError(italianErrorMessages[error.code] ?? error.message)
    }
  }

  const toggleCard = (cardId: string) => {
    setSelectedCardIds((current) => {
      const next = new Set(current)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const shellHeader = (
    <header className="game-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">B</span>
        <div>
          <span className="section-kicker">Tavolo locale</span>
          <strong>Burraco</strong>
        </div>
      </div>
      <div className="game-header__actions">
        <strong className="round-indicator">Smazzata {match.currentRoundNumber}/{MATCH_ROUND_COUNT}</strong>
        <button type="button" className="button button--new" onClick={beginNewMatch}>Nuova partita</button>
      </div>
    </header>
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
        <RoundScore game={{ ...game, round: game.round }} score={currentResult.score} />
        <section className="match-summary" aria-labelledby="match-summary-title">
          <span className="round-complete__eyebrow">
            {outcome ? 'Partita conclusa' : `Dopo ${match.currentRoundNumber} smazzate`}
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
            <div className="final-result">
              <h3>Risultato finale</h3>
              <p>Match Points <strong>{outcome.matchPoints}</strong></p>
              <div className="victory-points" aria-label="Victory Points">
                {outcome.victoryPoints.map((teamResult) => (
                  <div key={teamResult.teamId}>
                    <span>Squadra {teamResult.teamId === 'team-1' ? '1' : '2'}</span>
                    <strong>{teamResult.victoryPoints} VP</strong>
                  </div>
                ))}
              </div>
              <p>{outcome.leadingTeamId
                ? `Prima la Squadra ${outcome.leadingTeamId === 'team-1' ? '1' : '2'}.`
                : 'Parità esatta.'}</p>
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
  const seats = relativeSeats(game.players, humanPlayerId)
  const isHumanTurn = activePlayer.id === humanPlayerId
  const isActionPhase = isHumanTurn && round.turn.phase === 'action'
  const selectedIds = [...selectedCardIds]
  const sortedHand = sortCardsForDisplay(humanPlayer.hand)
  const untouchedPozzetti = game.pozzetti.filter((pozzetto) => pozzetto.length > 0).length
  const discardTop = game.discardPile.at(-1)

  return (
    <main className="game-shell">
      {shellHeader}
      <section className="table-surface" aria-label="Tavolo di Burraco">
        <PlayerSeat player={seats.top} position="top" bot />
        <PlayerSeat player={seats.left} position="left" bot />
        <PlayerSeat player={seats.right} position="right" bot />

        <div className="table-center">
          <div className="turn-banner" aria-live="polite">
            <span className="turn-banner__pulse" aria-hidden="true" />
            <div>
              <span>Turno di</span>
              <strong>{activePlayer.name}</strong>
            </div>
            <div className="turn-banner__phase">
              <span>Fase</span>
              <strong>{round.turn.phase === 'mustDraw' ? 'Pesca' : 'Gioco'}</strong>
            </div>
          </div>

          <div className="pile-zone" aria-label="Tallone e monte degli scarti">
            <button
              type="button"
              className="pile-control"
              onClick={() => commitAction(() => drawCard(game, humanPlayerId))}
              disabled={!isHumanTurn || round.turn.phase !== 'mustDraw' || game.drawPile.length === 0}
              aria-label={`Pesca dal tallone, ${game.drawPile.length} carte rimaste`}
            >
              <span className="card-back" aria-hidden="true"><span>B</span></span>
              <strong>Tallone</strong>
              <span>{game.drawPile.length} carte</span>
            </button>

            <div className="pozzetti-counter">
              <span>Pozzetti</span>
              <strong>{untouchedPozzetti}</strong>
              <small>ancora disponibili</small>
            </div>

            <button
              type="button"
              className="pile-control"
              onClick={() => commitAction(() => takeDiscardPile(game, humanPlayerId))}
              disabled={!isHumanTurn || round.turn.phase !== 'mustDraw' || !discardTop}
              aria-label={discardTop
                ? `Raccogli il monte degli scarti, ${game.discardPile.length} ${game.discardPile.length === 1 ? 'carta' : 'carte'}`
                : 'Monte degli scarti vuoto'}
            >
              <span className="pile-control__card">
                {discardTop ? <PlayingCard card={discardTop} compact /> : <span className="empty-card" aria-hidden="true">—</span>}
              </span>
              <strong>Scarti</strong>
              <span>{game.discardPile.length} {game.discardPile.length === 1 ? 'carta' : 'carte'}</span>
            </button>
          </div>

          <div className="team-areas">
            {game.teams.map((team) => (
              <MeldArea
                key={team.id}
                team={team}
                activeTeam={team.id === activeTeam.id}
                canExtend={isActionPhase && selectedCardIds.size > 0}
                onExtend={(meldIndex) => commitAction(() => extendMeld(game, humanPlayerId, meldIndex, selectedIds))}
              />
            ))}
          </div>
        </div>

        <section className="active-player" aria-label={`Mano di ${humanPlayer.name}`}>
          <header className="active-player__header">
            <div>
              <span className="section-kicker">Giocatore umano · Squadra {humanPlayer.teamId === 'team-1' ? '1' : '2'}</span>
              <h1>{humanPlayer.name}</h1>
            </div>
            <span className="hand-count">{humanPlayer.hand.length} carte</span>
          </header>

          <div className="hand" aria-label={`Carte di ${humanPlayer.name}`}>
            {sortedHand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedCardIds.has(card.id)}
                onToggle={isHumanTurn ? toggleCard : undefined}
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
              onClick={() => commitAction(() => playMeld(game, humanPlayerId, selectedIds))}
            >
              Cala
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={!isActionPhase || selectedCardIds.size !== 1}
              onClick={() => commitAction(() => discardCard(game, humanPlayerId, selectedIds[0]!))}
            >
              Scarta e passa
            </button>
          </div>

          {ruleError && (
            <div className="rule-error" role="alert">
              <span aria-hidden="true">!</span>
              <p><strong>Mossa non valida</strong>{ruleError}</p>
              <button type="button" onClick={() => setRuleError(null)} aria-label="Chiudi messaggio di errore">×</button>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
