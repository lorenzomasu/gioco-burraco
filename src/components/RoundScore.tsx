import { calculateRoundScore } from '../game/scoring'
import type { CompletedGameState } from '../game/state/types'

type RoundScoreProps = Readonly<{
  game: CompletedGameState
}>

const signed = (value: number): string => value > 0 ? `+${value}` : `${value}`

export function RoundScore({ game }: RoundScoreProps) {
  const score = calculateRoundScore(game)
  const closer = game.players.find((player) => player.id === game.round.closedByPlayerId)
  const closingTeam = game.round.closingTeamId === 'team-1' ? '1' : '2'

  return (
    <section className="round-complete" aria-labelledby="round-complete-title">
      <span className="round-complete__eyebrow">Smazzata conclusa</span>
      <h1 id="round-complete-title">Ha chiuso {closer?.name ?? game.round.closedByPlayerId}</h1>
      <p>La Squadra {closingTeam} ottiene il bonus di chiusura.</p>

      <div className="score-grid">
        {score.teams.map((teamScore) => (
          <article className="score-card" key={teamScore.teamId}>
            <header>
              <span>Squadra {teamScore.teamId === 'team-1' ? '1' : '2'}</span>
              <strong>{signed(teamScore.total)}</strong>
            </header>
            <dl>
              <div><dt>Carte calate</dt><dd>{signed(teamScore.meldCardPoints)}</dd></div>
              <div><dt>Bonus Burraco</dt><dd>{signed(teamScore.burracoBonus)}</dd></div>
              <div><dt>Bonus chiusura</dt><dd>{signed(teamScore.closingBonus)}</dd></div>
              <div className="score-row--penalty"><dt>Carte in mano</dt><dd>−{teamScore.handPenalty}</dd></div>
              <div className="score-row--penalty"><dt>Pozzetto</dt><dd>−{teamScore.pozzettoPenalty}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
