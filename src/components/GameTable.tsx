import { useState } from 'react'
import { GameRuleError } from '../game/engine/errors'
import { extendMeld } from '../game/engine/extendMeld'
import { playMeld } from '../game/engine/playMeld'
import { startGame } from '../game/engine/startGame'
import { discardCard, drawCard, takeDiscardPile } from '../game/engine/turn'
import type { GameState, Player, PlayerId } from '../game/state/types'
import { sortCardsForDisplay } from './cardPresentation'
import { MeldArea } from './MeldArea'
import { PlayerSeat } from './PlayerSeat'
import { PlayingCard } from './PlayingCard'
import { RoundScore } from './RoundScore'

type GameTableProps = Readonly<{
  initialState?: GameState
  createGame?: () => GameState
}>

const playerOrder: readonly PlayerId[] = ['player-1', 'player-2', 'player-3', 'player-4']

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

export function GameTable({ initialState, createGame = startGame }: GameTableProps) {
  const [game, setGame] = useState<GameState>(() => initialState ?? createGame())
  const [selectedCardIds, setSelectedCardIds] = useState<ReadonlySet<string>>(() => new Set())
  const [ruleError, setRuleError] = useState<string | null>(null)

  const resetTransientState = () => {
    setSelectedCardIds(new Set())
    setRuleError(null)
  }

  const beginNewGame = () => {
    setGame(createGame())
    resetTransientState()
  }

  const commitAction = (action: () => GameState) => {
    try {
      const nextGame = action()
      setGame(nextGame)
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
      <button type="button" className="button button--new" onClick={beginNewGame}>Nuova partita</button>
    </header>
  )

  if (game.round.status === 'completed') {
    return (
      <main className="game-shell">
        {shellHeader}
        <RoundScore game={{ ...game, round: game.round }} />
      </main>
    )
  }

  const round = game.round
  const activePlayer = game.players.find((player) => player.id === round.turn.currentPlayerId)
  if (!activePlayer) throw new Error(`Missing current player: ${round.turn.currentPlayerId}`)
  const activeTeam = game.teams.find((team) => team.id === activePlayer.teamId)
  if (!activeTeam) throw new Error(`Missing active team: ${activePlayer.teamId}`)
  const seats = relativeSeats(game.players, activePlayer.id)
  const isActionPhase = round.turn.phase === 'action'
  const selectedIds = [...selectedCardIds]
  const sortedHand = sortCardsForDisplay(activePlayer.hand)
  const untouchedPozzetti = game.pozzetti.filter((pozzetto) => pozzetto.length > 0).length
  const discardTop = game.discardPile.at(-1)

  return (
    <main className="game-shell">
      {shellHeader}
      <section className="table-surface" aria-label="Tavolo di Burraco">
        <PlayerSeat player={seats.top} position="top" />
        <PlayerSeat player={seats.left} position="left" />
        <PlayerSeat player={seats.right} position="right" />

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
              onClick={() => commitAction(() => drawCard(game, activePlayer.id))}
              disabled={round.turn.phase !== 'mustDraw' || game.drawPile.length === 0}
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
              onClick={() => commitAction(() => takeDiscardPile(game, activePlayer.id))}
              disabled={round.turn.phase !== 'mustDraw' || !discardTop}
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
                onExtend={(meldIndex) => commitAction(() => extendMeld(game, activePlayer.id, meldIndex, selectedIds))}
              />
            ))}
          </div>
        </div>

        <section className="active-player" aria-label={`Mano di ${activePlayer.name}`}>
          <header className="active-player__header">
            <div>
              <span className="section-kicker">Giocatore attivo · Squadra {activePlayer.teamId === 'team-1' ? '1' : '2'}</span>
              <h1>{activePlayer.name}</h1>
            </div>
            <span className="hand-count">{activePlayer.hand.length} carte</span>
          </header>

          <div className="hand" aria-label={`Carte di ${activePlayer.name}`}>
            {sortedHand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedCardIds.has(card.id)}
                onToggle={toggleCard}
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
              onClick={() => commitAction(() => playMeld(game, activePlayer.id, selectedIds))}
            >
              Cala
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={!isActionPhase || selectedCardIds.size !== 1}
              onClick={() => commitAction(() => discardCard(game, activePlayer.id, selectedIds[0]!))}
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
