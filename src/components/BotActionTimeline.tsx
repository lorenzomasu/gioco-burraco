import type { BotPublicActionEvent } from '../game/bot'
import type { Player } from '../game/state/types'
import { cardLabel } from './cardPresentation'

type BotActionTimelineProps = Readonly<{
  events: readonly BotPublicActionEvent[]
  players: readonly Player[]
}>

const eventDescription = (
  event: BotPublicActionEvent,
  playerName: string,
): string => {
  switch (event.type) {
    case 'draw-stock':
      return `${playerName} pesca dal tallone.`
    case 'collect-discard-pile':
      return `${playerName} raccoglie il monte degli scarti (${event.cardCount} ${event.cardCount === 1 ? 'carta' : 'carte'}).`
    case 'play-meld':
      return `${playerName} apre la calata ${event.meldIndex + 1}: ${event.cards.map(cardLabel).join('; ')}.`
    case 'extend-meld':
      return `${playerName} lega alla calata ${event.meldIndex + 1}: ${event.cards.map(cardLabel).join('; ')}.`
    case 'discard':
      return `${playerName} scarta ${cardLabel(event.card)}.`
    case 'take-pozzetto':
      return `${playerName} prende il pozzetto ${event.mode === 'flight' ? 'al volo' : 'con lo scarto'}.`
  }
}

export function BotActionTimeline({ events, players }: BotActionTimelineProps) {
  const playerNames = new Map(players.map((player) => [player.id, player.name]))

  return (
    <section className="bot-timeline" aria-labelledby="bot-timeline-title">
      <div className="bot-timeline__header">
        <span className="section-kicker">Azioni pubbliche</span>
        <h2 id="bot-timeline-title">Cronologia bot</h2>
      </div>
      {/*
        The log container stays mounted so each appended event is announced on its own;
        removals (a fresh smazzata) are not announced.
      */}
      <div
        className="bot-timeline__log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-labelledby="bot-timeline-title"
      >
        {events.length > 0 && (
          <ol className="bot-timeline__list">
            {events.map((event, index) => (
              <li key={index} data-event-type={event.type}>
                {eventDescription(event, playerNames.get(event.playerId) ?? event.playerId)}
              </li>
            ))}
          </ol>
        )}
      </div>
      {events.length === 0 && (
        <p className="bot-timeline__empty">Nessuna azione automatica in questa smazzata.</p>
      )}
    </section>
  )
}
