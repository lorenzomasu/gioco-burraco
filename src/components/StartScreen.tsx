import { useState, type FormEvent } from 'react'
import type { MatchSetup } from '../shell/matchSetup'

type StartScreenProps = Readonly<{
  initialName?: string
  onStart: (setup: MatchSetup) => void
}>

const MAX_NAME_LENGTH = 24

export function StartScreen({ initialName = '', onStart }: StartScreenProps) {
  const [name, setName] = useState(initialName)
  const trimmedName = name.trim()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedName) return
    onStart({ humanPlayerName: trimmedName })
  }

  return (
    <main className="start-screen">
      <section className="start-panel" aria-labelledby="start-title">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">B</span>
          <div>
            <span className="section-kicker">Partita locale</span>
            <h1 id="start-title">Burraco</h1>
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
      </section>
    </main>
  )
}
