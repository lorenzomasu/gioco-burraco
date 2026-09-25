/**
 * M39 (experimental): iPhone-first architecture/feel spike. A representative portrait table,
 * touch hand, bottom actions, a sheet, FLIP motion and native haptics on deterministic
 * prototype state. It is not the production table and applies no Burraco rules.
 */
import { useLayoutEffect, useReducer, useRef, useState, type PointerEvent } from 'react'
import { cardLabel } from '../components/cardPresentation'
import { createSpikeHaptics, type SpikeHaptics } from './haptics'
import { flyFrom, type Box } from './motion'
import { canDiscard, createSpikeFixture, spikeReducer, type SpikeSeat } from './prototypeState'
import { SpikeCard } from './SpikeCard'

type Flight = Readonly<{ cardId: string; from: Box }>
type SheetTab = 'settings' | 'history' | 'help'

const SHEET_TABS: readonly (readonly [SheetTab, string])[] = [
  ['settings', 'Impostazioni'],
  ['history', 'Storico'],
  ['help', 'Aiuto'],
]
/** A downward drag on the sheet handle beyond this many CSS pixels dismisses it. */
const SHEET_DISMISS_DRAG_PX = 80

const rectOf = (element: Element | null): Box | null => {
  if (!element) return null
  const { left, top, width, height } = element.getBoundingClientRect()
  return { left, top, width, height }
}

const Seat = ({ seat }: Readonly<{ seat: SpikeSeat }>) => (
  <div className={`spike-seat spike-seat--${seat.id}`} aria-label={`${seat.name}, ${seat.cardCount} carte`}>
    <span className="spike-seat__backs" aria-hidden="true" />
    <span className="spike-seat__name">{seat.name}</span>
    <span className="spike-seat__count" aria-hidden="true">{seat.cardCount}</span>
  </div>
)

export function IosSpikeApp({ haptics = createSpikeHaptics() }: Readonly<{ haptics?: SpikeHaptics }>) {
  const [state, dispatch] = useReducer(spikeReducer, undefined, createSpikeFixture)
  const [sheetTab, setSheetTab] = useState<SheetTab | null>(null)
  const [sheetDrag, setSheetDrag] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const stockRef = useRef<HTMLButtonElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const flightRef = useRef<Flight | null>(null)
  const dragStartRef = useRef<number | null>(null)

  const cardElement = (cardId: string) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-spike-card="${cardId}"]`) ?? null

  // FLIP: after React placed the card in its destination region, fly it in from its source.
  useLayoutEffect(() => {
    const flight = flightRef.current
    if (!flight) return
    flightRef.current = null
    const element = cardElement(flight.cardId)
    if (!element) return
    if (handRef.current?.contains(element)) element.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
    flyFrom(element, flight.from)
  }, [state])

  const toggle = (cardId: string) => {
    haptics('select')
    dispatch({ type: 'toggle', cardId })
  }

  const draw = () => {
    const [next] = state.stock
    if (!next) return
    const from = rectOf(stockRef.current)
    if (from) flightRef.current = { cardId: next.id, from }
    haptics('draw')
    setAnnouncement(`Pescata: ${cardLabel(next)}`)
    dispatch({ type: 'draw' })
  }

  const discard = () => {
    if (!canDiscard(state)) return
    const [cardId] = state.selectedIds
    const card = state.hand.find((candidate) => candidate.id === cardId)
    if (!card) return
    const from = rectOf(cardElement(cardId))
    if (from) flightRef.current = { cardId, from }
    haptics('discard')
    setAnnouncement(`Scartata: ${cardLabel(card)}`)
    dispatch({ type: 'discard' })
  }

  const openSheet = () => {
    haptics('sheet')
    setSheetTab('settings')
  }
  const closeSheet = () => {
    setSheetDrag(0)
    setSheetTab(null)
  }

  const onHandlePointerDown = (event: PointerEvent<HTMLElement>) => {
    dragStartRef.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onHandlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return
    setSheetDrag(Math.max(0, event.clientY - dragStartRef.current))
  }
  const onHandlePointerUp = () => {
    if (dragStartRef.current === null) return
    dragStartRef.current = null
    if (sheetDrag > SHEET_DISMISS_DRAG_PX) closeSheet()
    else setSheetDrag(0)
  }

  const topDiscard = state.discardPile.at(-1)
  const sheetOpen = sheetTab !== null
  const [partner] = state.seats.filter((seat) => seat.role === 'partner')
  const opponents = state.seats.filter((seat) => seat.role === 'opponent')

  return (
    <div className="spike-app" ref={rootRef} data-ios-spike="">
      <header className="spike-topbar">
        <div className="spike-topbar__round">Smazzata {state.round.current}/{state.round.total}</div>
        <div className="spike-topbar__score" aria-label={`Noi ${state.score.us}, Loro ${state.score.them}`}>
          <span><small>Noi</small> {state.score.us}</span>
          <span><small>Loro</small> {state.score.them}</span>
        </div>
        <button type="button" className="spike-icon-button" aria-label="Menu" aria-expanded={sheetOpen} onClick={openSheet}>
          <span aria-hidden="true">☰</span>
        </button>
      </header>

      <main className="spike-table" aria-label="Tavolo">
        {partner && <Seat seat={partner} />}
        <div className="spike-table__middle">
          {opponents[0] && <Seat seat={opponents[0]} />}
          <div className="spike-piles">
            <button
              ref={stockRef}
              type="button"
              className="spike-stock"
              aria-label={`Tallone, ${state.stock.length} carte. Pesca`}
              disabled={state.stock.length === 0}
              onClick={draw}
            >
              <span className="spike-stock__count" aria-hidden="true">{state.stock.length}</span>
            </button>
            <button
              type="button"
              className="spike-discard"
              aria-label={topDiscard ? `Pozzo, in cima ${cardLabel(topDiscard)}` : 'Pozzo vuoto'}
              disabled={!canDiscard(state)}
              onClick={discard}
            >
              {topDiscard && <SpikeCard key={topDiscard.id} card={topDiscard} />}
            </button>
          </div>
          {opponents[1] && <Seat seat={opponents[1]} />}
        </div>
        <section className="spike-melds" aria-label="I nostri giochi">
          <h2>I nostri giochi</h2>
          <div className="spike-meld">
            {state.ownMeld.map((card) => <SpikeCard key={card.id} card={card} />)}
          </div>
        </section>
      </main>

      <section className="spike-hand-area" aria-label="La tua mano">
        <div className="spike-hand" ref={handRef}>
          {state.hand.map((card) => (
            <SpikeCard
              key={card.id}
              card={card}
              size="hand"
              selected={state.selectedIds.includes(card.id)}
              onTap={toggle}
            />
          ))}
        </div>
      </section>

      <nav className="spike-actions" aria-label="Azioni">
        <button type="button" className="spike-action" disabled={state.stock.length === 0} onClick={draw}>Pesca</button>
        <button type="button" className="spike-action spike-action--primary" disabled={!canDiscard(state)} onClick={discard}>
          Scarta
        </button>
      </nav>

      <p className="spike-live" role="status" aria-live="polite">{announcement}</p>

      <div className={`spike-sheet-layer${sheetOpen ? ' spike-sheet-layer--open' : ''}`} inert={!sheetOpen}>
        <button type="button" className="spike-sheet-backdrop" aria-label="Chiudi pannello" tabIndex={-1} onClick={closeSheet} />
        <div
          className="spike-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Pannello"
          style={sheetDrag ? { transform: `translateY(${sheetDrag}px)`, transition: 'none' } : undefined}
        >
          <div
            className="spike-sheet__handle"
            aria-hidden="true"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
          />
          <div className="spike-segmented" role="tablist">
            {SHEET_TABS.map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={sheetTab === tab}
                onClick={() => { haptics('select'); setSheetTab(tab) }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="spike-sheet__body" role="tabpanel">
            {sheetTab === 'history' && <p>Smazzata 1: Noi 640 · Loro 520 (dati di prototipo).</p>}
            {sheetTab === 'help' && <p>Tocca le carte per selezionarle, poi pesca e scarta. Nessuna regola è applicata in questo prototipo.</p>}
            {(sheetTab === 'settings' || sheetTab === null) && (
              <button type="button" className="spike-action" onClick={() => { dispatch({ type: 'reset' }); closeSheet() }}>
                Ricomincia prototipo
              </button>
            )}
          </div>
          <button type="button" className="spike-action" onClick={closeSheet}>Chiudi</button>
          <p className="spike-sheet__note">Spike M39 · prototipo, non gameplay reale</p>
        </div>
      </div>
    </div>
  )
}
