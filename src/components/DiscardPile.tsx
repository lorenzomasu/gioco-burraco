import { useLayoutEffect, useRef, useState } from 'react'
import type { Card } from '../game/cards/types'
import { PlayingCard } from './PlayingCard'
import type { CueAttributes } from './tableFeedback'
import type { DropState } from './useHandDrag'

type DiscardPileProps = Readonly<{
  /** The engine's face-up pile, oldest first; the final element is the top card. */
  cards: readonly Card[]
  /** Whether the existing whole-pile collection is currently legal for the human. */
  canCollect: boolean
  onCollect: () => void
  /** Transient presentation cue of the latest committed change; purely visual. */
  cue?: CueAttributes
  /**
   * Direct-discard destination state: `null` when the pile is not a valid destination
   * (outside the human action phase), otherwise whether a drag is idle, in progress or
   * currently over the pile. Pointer intent only; discarding stays the engine command.
   */
  dropState?: DropState | null
}>

const cardCount = (count: number) => `${count} ${count === 1 ? 'carta' : 'carte'}`

/**
 * The complete face-up discard pile as a table spread, rendered in the stored engine order
 * (oldest → newest) and never sorted. The cards are informative only: collection stays a
 * single native button for the whole pile, kept outside the card list so every card keeps
 * its own accessible description. Scroll position is local presentation state.
 */
export function DiscardPile({ cards, canCollect, onCollect, cue, dropState = null }: DiscardPileProps) {
  const spreadRef = useRef<HTMLOListElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const topCardId = cards.at(-1)?.id

  // Only a new top card (first render, resume, or a committed discard) brings the newest
  // card into view; unrelated renders leave a manual scroll through the pile untouched.
  useLayoutEffect(() => {
    const spread = spreadRef.current
    if (!spread || topCardId === undefined) return
    spread.scrollLeft = spread.scrollWidth
  }, [topCardId])

  // The spread becomes a keyboard-reachable scroll surface only while it overflows.
  useLayoutEffect(() => {
    const spread = spreadRef.current
    // An empty pile has no spread, so nothing is left to scroll.
    if (!spread) {
      setOverflowing(false)
      return
    }
    const measure = () => setOverflowing(spread.scrollWidth > spread.clientWidth + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(spread)
    return () => observer.disconnect()
  }, [cards.length])

  return (
    <div
      className="discard-pile"
      role="group"
      aria-label="Monte degli scarti"
      data-drop-target={dropState ? 'discard' : undefined}
      data-drop-state={dropState && dropState !== 'idle' ? dropState : undefined}
      {...cue}
    >
      <div className="discard-pile__header">
        <strong>Scarti</strong>
        <span className="discard-pile__count">{cardCount(cards.length)}</span>
        {/* A text affordance for the local scroll, independent of hover or scrollbar styling. */}
        {overflowing && <span className="discard-pile__hint">‹ scorri per i precedenti</span>}
      </div>

      {cards.length === 0 ? (
        <p className="discard-pile__empty">Monte degli scarti vuoto</p>
      ) : (
        <ol
          ref={spreadRef}
          className="discard-spread"
          role="list"
          aria-label="Carte scartate, dalla più vecchia alla più recente"
          tabIndex={overflowing ? 0 : undefined}
        >
          {cards.map((card, index) => {
            const isTop = index === cards.length - 1
            return (
              <li key={card.id} className={`discard-spread__item${isTop ? ' discard-spread__item--top' : ''}`}>
                <PlayingCard card={card} compact />
                {isTop && <span className="discard-spread__top-tag">In cima</span>}
              </li>
            )
          })}
        </ol>
      )}

      <button
        type="button"
        className="button button--small button--ghost discard-pile__collect"
        onClick={onCollect}
        disabled={!canCollect}
        aria-label={`Raccogli tutto il monte degli scarti, ${cardCount(cards.length)}`}
      >
        Raccogli tutto
      </button>

      {/* Pointer affordance only; «Scarta e passa» stays the accessible discard control.
          Rendered last so it paints above the cards without a z-index of its own. */}
      {dropState && dropState !== 'idle' && (
        <span className="drop-label" aria-hidden="true">
          {dropState === 'active' ? 'Rilascia per scartare' : 'Scarta qui'}
        </span>
      )}
    </div>
  )
}
