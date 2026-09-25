import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { MatchSetup } from '../shell/matchSetup'

type StartScreenProps = Readonly<{
  initialName?: string
  /** Minimal non-blocking message, e.g. when a previous local save could not be restored. */
  notice?: string | null
  /**
   * Moves keyboard focus to the onboarding heading once mounted, used when onboarding
   * replaces a match whose invoking control disappeared. Off for the first page load.
   */
  focusOnMount?: boolean
  /** Shell-owned Help and Settings entries. */
  actions?: ReactNode
  onStart: (setup: MatchSetup) => void
}>

const MAX_NAME_LENGTH = 24

export function StartScreen({ initialName = '', notice = null, focusOnMount = false, actions, onStart }: StartScreenProps) {
  const [name, setName] = useState(initialName)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const trimmedName = name.trim()

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [focusOnMount])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedName) return
    onStart({ humanPlayerName: trimmedName })
  }

  return (
    <main className="start-screen">
      <section className="start-panel" aria-labelledby="start-title">
        {actions && <nav className="start-panel__actions" aria-label="Aiuto e impostazioni">{actions}</nav>}
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">B</span>
          <div>
            <span className="section-kicker">Partita locale</span>
            <h1 id="start-title" ref={headingRef} tabIndex={-1}>Burraco</h1>
          </div>
        </div>

        <p className="start-panel__intro">
          Giochi da solo contro il computer, direttamente in questo browser.
        </p>
        <ul className="start-panel__setup" aria-label="Configurazione della partita">
          <li><strong>1 giocatore umano</strong> — tu, in coppia con un bot compagno.</li>
          <li><strong>3 bot</strong> — il tuo compagno e due avversari.</li>
          <li><strong>4 smazzate</strong> — vince la squadra con il punteggio cumulativo migliore.</li>
        </ul>

        {notice && <p className="storage-notice storage-notice--inline" role="status">{notice}</p>}

        <form className="start-form" onSubmit={submit}>
          <label htmlFor="player-name">Il tuo nome</label>
          <input
            id="player-name"
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="button button--primary" disabled={!trimmedName}>
            Inizia partita
          </button>
        </form>
        <p className="start-panel__save-note">
          La partita in corso viene salvata solo in questo browser e riprende automaticamente
          quando riapri la pagina.
        </p>
      </section>
    </main>
  )
}
