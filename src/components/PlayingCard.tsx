import type { MouseEvent, PointerEvent } from 'react'
import type { Card } from '../game/cards/types'
import { cardLabel, isRedSuit, rankSymbols, suitSymbols } from './cardPresentation'
import type { CueAttributes } from './tableFeedback'

type PlayingCardProps = Readonly<{
  card: Card
  selected?: boolean
  onToggle?: (cardId: string) => void
  compact?: boolean
  annotation?: string
  /** Transient presentation cue (for example a newly drawn card); purely visual. */
  cue?: CueAttributes
  /** Direct-manipulation hooks of a hand card; they only collect pointer intent. */
  handInteraction?: HandCardInteraction
}>

/** Transient drag presentation and pointer handlers for one playable hand card. */
export type HandCardInteraction = Readonly<{
  /** Part of the active drag payload. */
  dragging: boolean
  /** A touch press that has rested long enough to be dragged. */
  armed: boolean
  /** Where the active hand reorder would insert the payload relative to this card. */
  insertMarker: 'before' | 'after' | null
  onPointerDown: (cardId: string, event: PointerEvent<HTMLElement>) => void
  onClickCapture: (event: MouseEvent<HTMLElement>) => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}>

const CardFace = ({ card, annotation }: Pick<PlayingCardProps, 'card' | 'annotation'>) => (
  <>
    <span className="playing-card__corner" aria-hidden="true">
      <span>{rankSymbols[card.rank]}</span>
      <span>{card.suit ? suitSymbols[card.suit] : '★'}</span>
    </span>
    <span className="playing-card__pip" aria-hidden="true">
      {card.suit ? suitSymbols[card.suit] : 'JOLLY'}
    </span>
    {annotation && <span className="playing-card__annotation">{annotation}</span>}
  </>
)

export function PlayingCard({
  card,
  selected = false,
  onToggle,
  compact = false,
  annotation,
  cue,
  handInteraction,
}: PlayingCardProps) {
  const className = [
    'playing-card',
    isRedSuit(card.suit) ? 'playing-card--red' : '',
    card.rank === 'joker' ? 'playing-card--joker' : '',
    selected ? 'playing-card--selected' : '',
    compact ? 'playing-card--compact' : '',
    annotation ? 'playing-card--annotated' : '',
    handInteraction?.dragging ? 'playing-card--dragging' : '',
    handInteraction?.armed ? 'playing-card--armed' : '',
    handInteraction?.insertMarker ? `playing-card--insert-${handInteraction.insertMarker}` : '',
  ].filter(Boolean).join(' ')

  if (onToggle) {
    return (
      <button
        type="button"
        className={className}
        aria-label={cardLabel(card)}
        aria-pressed={selected}
        onClick={() => onToggle(card.id)}
        {...(handInteraction && {
          'data-hand-card': '',
          onPointerDown: (event: PointerEvent<HTMLElement>) => handInteraction.onPointerDown(card.id, event),
          onClickCapture: handInteraction.onClickCapture,
          onContextMenu: handInteraction.onContextMenu,
          onDragStart: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
        })}
        {...cue}
      >
        <CardFace card={card} annotation={annotation} />
        {selected && <span className="playing-card__check" aria-hidden="true">✓</span>}
      </button>
    )
  }

  return (
    <div className={className} role="img" aria-label={`${cardLabel(card)}${annotation ? `, ${annotation}` : ''}`} {...cue}>
      <CardFace card={card} annotation={annotation} />
    </div>
  )
}
