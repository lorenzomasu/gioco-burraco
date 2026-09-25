import type { Card } from '../game/cards/types'
import { cardLabel, isRedSuit, rankSymbols, suitSymbols } from '../components/cardPresentation'

type SpikeCardProps = Readonly<{
  card: Card
  size?: 'hand' | 'table'
  selected?: boolean
  onTap?: (cardId: string) => void
}>

const Face = ({ card }: Readonly<{ card: Card }>) => (
  <>
    <span className="spike-card__corner" aria-hidden="true">
      <span>{rankSymbols[card.rank]}</span>
      <span>{card.suit ? suitSymbols[card.suit] : '★'}</span>
    </span>
    <span className="spike-card__pip" aria-hidden="true">{card.suit ? suitSymbols[card.suit] : '★'}</span>
  </>
)

/** M39 (experimental): a touch-first card face; `data-spike-card` anchors FLIP motion. */
export function SpikeCard({ card, size = 'table', selected = false, onTap }: SpikeCardProps) {
  const className = [
    'spike-card',
    `spike-card--${size}`,
    isRedSuit(card.suit) ? 'spike-card--red' : '',
    selected ? 'spike-card--selected' : '',
  ].filter(Boolean).join(' ')

  if (onTap) {
    return (
      <button
        type="button"
        className={className}
        data-spike-card={card.id}
        aria-label={cardLabel(card)}
        aria-pressed={selected}
        onClick={() => onTap(card.id)}
      >
        <Face card={card} />
      </button>
    )
  }
  return (
    <div className={className} data-spike-card={card.id} role="img" aria-label={cardLabel(card)}>
      <Face card={card} />
    </div>
  )
}
