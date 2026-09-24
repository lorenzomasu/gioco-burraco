import type { Player } from '../game/state/types'
import type { CueAttributes } from './tableFeedback'

/** Visual table position of a bot seat around the human, who always sits at the bottom. */
export type SeatPosition = 'top' | 'left' | 'right'

/** The seat's relation to the human player, derived by the owner from team membership. */
export type SeatRelation = 'teammate' | 'opponent'

/** Text relation of a seat to the human player. */
export const seatRelationLabels: Readonly<Record<SeatRelation, string>> = {
  teammate: 'Compagno',
  opponent: 'Avversario',
}

type PlayerSeatProps = Readonly<{
  player: Player
  position: SeatPosition
  relation: SeatRelation
  bot?: boolean
  active?: boolean
  /** Transient presentation cue for a new turn or a committed bot step; purely visual. */
  cue?: CueAttributes
}>

export function PlayerSeat({ player, position, relation, bot = false, active = false, cue }: PlayerSeatProps) {
  return (
    <section
      className={`player-seat player-seat--${position} player-seat--${relation}${active ? ' player-seat--active' : ''}`}
      aria-label={`Giocatore ${player.name}`}
      aria-current={active ? 'true' : undefined}
      data-seat={position}
      {...cue}
    >
      {active && <span className="turn-badge player-seat__turn">Di turno</span>}
      <span className="player-seat__avatar" aria-hidden="true">{player.name.charAt(0)}</span>
      <span className="player-seat__details">
        <strong>{player.name}{bot ? ' · Bot' : ''}</strong>
        <span className="player-seat__role">
          {seatRelationLabels[relation]} · <span className="player-seat__team">Squadra {player.teamId === 'team-1' ? '1' : '2'}</span>
        </span>
      </span>
      <span className="player-seat__cards" aria-label={`${player.hand.length} carte in mano`}>
        <span className="mini-card" aria-hidden="true" />
        {player.hand.length}
      </span>
    </section>
  )
}
