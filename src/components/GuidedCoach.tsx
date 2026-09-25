import { useId } from 'react'
import type { Coaching } from './guidedCoaching'

type GuidedCoachProps = Readonly<{
  coaching: Coaching
  onDismiss: () => void
}>

/**
 * Non-modal contextual coach (M36). It sits beside the turn status, blocks nothing and is
 * not a live region: the turn banner keeps announcing turn changes and rule errors keep
 * their own alert, so ordinary selection changes are never re-announced here.
 */
export function GuidedCoach({ coaching, onDismiss }: GuidedCoachProps) {
  const headingId = useId()
  return (
    <section className="guided-coach" aria-labelledby={headingId}>
      <div className="guided-coach__header">
        <h2 id={headingId} className="guided-coach__title">Guida contestuale</h2>
        <button type="button" className="button button--ghost button--small guided-coach__dismiss" onClick={onDismiss}>
          Nascondi guida
        </button>
      </div>
      <p className="guided-coach__now">{coaching.now}</p>
      {coaching.context && <p className="guided-coach__context">{coaching.context}</p>}
      {/* Native disclosure keeps the coach compact enough for the hand to stay in view. */}
      {(coaching.unavailable.length > 0 || coaching.reminder) && (
        <details className="guided-coach__details">
          <summary>Comandi disattivati e chiusura</summary>
          {coaching.unavailable.length > 0 && (
            <ul className="guided-coach__unavailable" aria-label="Azioni non ancora disponibili">
              {coaching.unavailable.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          {coaching.reminder && <p className="guided-coach__reminder">{coaching.reminder}</p>}
        </details>
      )}
    </section>
  )
}
