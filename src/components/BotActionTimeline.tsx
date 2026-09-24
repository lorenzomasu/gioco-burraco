import { useRef, useState, type KeyboardEvent } from 'react'
import type { BotPublicActionEvent } from '../game/bot'
import type { Player } from '../game/state/types'
import { cardLabel } from './cardPresentation'

type BotActionTimelineProps = Readonly<{
  events: readonly BotPublicActionEvent[]
  players: readonly Player[]
  /** Whether the visual history is expanded; the owner may control it across views. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
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

/**
 * Compact disclosure for the public bot history. The `role="log"` node is always mounted and
 * stays in the accessibility tree: collapsing only clips it visually, so each appended event
 * is still announced exactly once and nothing is re-announced when the history is toggled.
 */
export function BotActionTimeline({
  events,
  players,
  expanded: controlledExpanded,
  onExpandedChange,
}: BotActionTimelineProps) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const expanded = controlledExpanded ?? localExpanded
  const setExpanded = onExpandedChange ?? setLocalExpanded
  const playerNames = new Map(players.map((player) => [player.id, player.name]))
  const describe = (event: BotPublicActionEvent) =>
    eventDescription(event, playerNames.get(event.playerId) ?? event.playerId)
  const latest = events.at(-1)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // Escape closes an open history and returns focus to its toggle.
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !expanded) return
    setExpanded(false)
    toggleRef.current?.focus()
  }

  return (
    <section
      className={`bot-timeline${expanded ? ' bot-timeline--expanded' : ''}`}
      aria-label="Cronologia bot"
      onKeyDown={closeOnEscape}
    >
      <h2 className="bot-timeline__heading">
        <button
          ref={toggleRef}
          type="button"
          className="bot-timeline__toggle"
          aria-expanded={expanded}
          aria-controls="bot-timeline-panel"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="bot-timeline__chevron" aria-hidden="true" />
          Cronologia bot
          <span className="bot-timeline__count">
            {events.length}
            <span className="visually-hidden"> {events.length === 1 ? 'azione' : 'azioni'}</span>
          </span>
        </button>
      </h2>
      {/* Visual-only preview of the newest entry; the log below already announces it. */}
      {!expanded && latest && (
        <p className="bot-timeline__latest" aria-hidden="true">{`Ultima: ${describe(latest)}`}</p>
      )}
      <div
        id="bot-timeline-panel"
        className={`bot-timeline__panel${expanded ? '' : ' bot-timeline__panel--collapsed'}`}
      >
        {/*
          The log container stays mounted so each appended event is announced on its own;
          removals (a fresh smazzata) are not announced.
        */}
        <div
          className="bot-timeline__log"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Cronologia bot"
        >
          {events.length > 0 && (
            <ol className="bot-timeline__list">
              {events.map((event, index) => (
                <li key={index} data-event-type={event.type}>
                  {describe(event)}
                </li>
              ))}
            </ol>
          )}
        </div>
        {events.length === 0 && (
          <p className="bot-timeline__empty">Nessuna azione automatica in questa smazzata.</p>
        )}
      </div>
    </section>
  )
}
