import type { Ref } from 'react'
import type { RoundScore as RoundScoreValue } from '../game/scoring'
import type { CompletedGameState, PlayerId } from '../game/state/types'

type RoundScoreProps = Readonly<{
  game: CompletedGameState
  score: RoundScoreValue
  /** Programmatic focus target announcing the completed smazzata (never in the tab order). */
  headingRef?: Ref<HTMLHeadingElement>
}>

const signed = (value: number): string => value > 0 ? `+${value}` : `${value}`

export function RoundScore({ game, score, headingRef }: RoundScoreProps) {
  const round = game.round
  const playerName = (playerId: PlayerId): string =>
    game.players.find((player) => player.id === playerId)?.name ?? playerId

  return (
    <section className="round-complete" aria-labelledby="round-complete-title">
      <span className="round-complete__emblem" aria-hidden="true">♠ ♥ ♦ ♣</span>
      <span className="round-complete__eyebrow">Smazzata conclusa</span>
      {round.ending === 'closure' ? (
        <>
          <h1 id="round-complete-title" ref={headingRef} tabIndex={-1}>Ha chiuso {playerName(round.closedByPlayerId)}</h1>
          <p>La Squadra {round.closingTeamId === 'team-1' ? '1' : '2'} ottiene il bonus di chiusura.</p>
        </>
      ) : (
        <>
          <h1 id="round-complete-title" ref={headingRef} tabIndex={-1}>Tallone esaurito</h1>
          <p>
            L’ultimo scarto è di {playerName(round.lastDiscardPlayerId)}. Nessuna squadra
            ottiene il bonus di chiusura.
          </p>
        </>
      )}

      <div className="score-grid">
        {score.teams.map((teamScore) => {
          const closedRound = round.ending === 'closure' && round.closingTeamId === teamScore.teamId
          return (
            <article
              className={`score-card${closedRound ? ' score-card--closing' : ''}`}
              key={teamScore.teamId}
              aria-label={`Punteggio smazzata squadra ${teamScore.teamId === 'team-1' ? '1' : '2'}`}
            >
              <header>
                <span className="score-card__team">
                  Squadra {teamScore.teamId === 'team-1' ? '1' : '2'}
                  {closedRound && <span className="score-card__tag">Chiusura</span>}
                </span>
                <strong className={teamScore.total < 0 ? 'score-card__total--negative' : undefined}>
                  {signed(teamScore.total)}
                </strong>
              </header>
              <dl>
                <div><dt>Carte calate</dt><dd>{signed(teamScore.meldCardPoints)}</dd></div>
                <div><dt>Bonus Burraco</dt><dd>{signed(teamScore.burracoBonus)}</dd></div>
                <div><dt>Bonus chiusura</dt><dd>{signed(teamScore.closingBonus)}</dd></div>
                <div className="score-row--penalty"><dt>Carte in mano</dt><dd>−{teamScore.handPenalty}</dd></div>
                <div className="score-row--penalty"><dt>Pozzetto</dt><dd>−{teamScore.pozzettoPenalty}</dd></div>
              </dl>
            </article>
          )
        })}
      </div>
    </section>
  )
}
