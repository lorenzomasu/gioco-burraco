import type { Player } from '../game/state/types'
import type { CueAttributes } from './tableFeedback'

type PlayerSeatProps = Readonly<{
  player: Player
  position: 'top' | 'left' | 'right'
  bot?: boolean
  active?: boolean
  /** Transient presentation cue for a new turn or a committed bot step; purely visual. */
  cue?: CueAttributes
}>

export function PlayerSeat({ player, position, bot = false, active = false, cue }: PlayerSeatProps) {
  return (
    <section
      className={`player-seat player-seat--${position}${active ? ' player-seat--active' : ''}`}
      aria-label={`Giocatore ${player.name}`}
      aria-current={active ? 'true' : undefined}
      {...cue}
    >
      {active && <span className="turn-badge player-seat__turn">Di turno</span>}
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
