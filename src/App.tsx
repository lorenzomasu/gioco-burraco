import { startGame } from './game/engine/startGame'

const initialGame = startGame()

export default function App() {
  return (
    <main className="table">
      <p className="eyebrow">BURRACO · MILESTONE 1</p>
      <h1>Il tavolo è pronto.</h1>
      <p>Partita inizializzata: {initialGame.drawPile.length} carte nel tallone.</p>
    </main>
  )
}
