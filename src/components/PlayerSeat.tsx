import type { Player } from '../game/state/types'

type PlayerSeatProps = Readonly<{
  player: Player
  position: 'top' | 'left' | 'right'
  bot?: boolean
}>

export function PlayerSeat({ player, position, bot = false }: PlayerSeatProps) {
  return (
    <section className={`player-seat player-seat--${position}`} aria-label={`Giocatore ${player.name}`}>
      <span className="player-seat__avatar" aria-hidden="true">{player.name.charAt(0)}</span>
      <span className="player-seat__details">
        <strong>{player.name}{bot ? ' · Bot' : ''}</strong>
        <span>Squadra {player.teamId === 'team-1' ? '1' : '2'}</span>
      </span>
      <span className="player-seat__cards" aria-label={`${player.hand.length} carte in mano`}>
        <span className="mini-card" aria-hidden="true" />
        {player.hand.length}
      </span>
    </section>
  )
}
