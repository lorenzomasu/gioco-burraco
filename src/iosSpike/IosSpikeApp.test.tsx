import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpikeHaptics } from './haptics'
import { IosSpikeApp } from './IosSpikeApp'

afterEach(() => {
  vi.resetModules()
  document.body.innerHTML = ''
})

const hand = () => within(screen.getByRole('region', { name: 'La tua mano' }))
const handCards = () => hand().getAllByRole('button')

describe('M39 iOS spike surface', () => {
  it('renders the representative portrait table, hand and actions', () => {
    render(<IosSpikeApp haptics={vi.fn()} />)
    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
    expect(screen.getByLabelText('Noi 1240, Loro 980')).toBeInTheDocument()
    for (const seat of ['Compagno, 9 carte', 'Bot Ovest, 11 carte', 'Bot Est, 11 carte']) {
      expect(screen.getByLabelText(seat)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /^Tallone, 92 carte/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pozzo, in cima Otto di quadri, mazzo 2' })).toBeDisabled()
    expect(within(screen.getByRole('region', { name: 'I nostri giochi' })).getAllByRole('img')).toHaveLength(4)
    expect(handCards()).toHaveLength(11)
    expect(screen.getByRole('button', { name: 'Scarta' })).toBeDisabled()
  })

  it('selects, draws and discards with the matching haptic cues', () => {
    const haptics = vi.fn()
    render(<IosSpikeApp haptics={haptics} />)

    const [first] = handCards()
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(haptics).toHaveBeenLastCalledWith('select')
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Pesca' }))
    expect(handCards()).toHaveLength(12)
    expect(haptics).toHaveBeenLastCalledWith('draw')
    expect(screen.getByRole('status')).toHaveTextContent('Pescata: Asso di fiori')

    fireEvent.click(handCards()[0])
    fireEvent.click(screen.getByRole('button', { name: 'Scarta' }))
    expect(haptics).toHaveBeenLastCalledWith('discard')
    expect(handCards()).toHaveLength(11)
    expect(screen.getByRole('button', { name: 'Pozzo, in cima Tre di fiori, mazzo 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scarta' })).toBeDisabled()
  })

  it('discards the selected card by tapping the discard pile, and draws by tapping the stock', () => {
    render(<IosSpikeApp haptics={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Tallone/ }))
    expect(handCards()).toHaveLength(12)
    fireEvent.click(handCards()[1])
    fireEvent.click(screen.getByRole('button', { name: /^Pozzo, in cima/ }))
    expect(screen.getByRole('button', { name: 'Pozzo, in cima Sette di fiori, mazzo 1' })).toBeInTheDocument()
  })

  it('opens and dismisses the sheet, and switches its sections', () => {
    render(<IosSpikeApp haptics={vi.fn()} />)
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: 'Pannello' })
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Aiuto' }))
    expect(within(sheet).getByRole('tab', { name: 'Aiuto' })).toHaveAttribute('aria-selected', 'true')
    expect(sheet).toHaveTextContent('Nessuna regola è applicata')

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi pannello', hidden: true }))
    expect(menu).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menu)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Pannello' })).getByRole('button', { name: 'Chiudi' }))
    expect(menu).toHaveAttribute('aria-expanded', 'false')
  })

  it('resets the prototype from the sheet', () => {
    render(<IosSpikeApp haptics={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pesca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ricomincia prototipo' }))
    expect(handCards()).toHaveLength(11)
  })

  it('stays fully usable with the real haptics bridge absent (browser preview)', () => {
    render(<IosSpikeApp haptics={createSpikeHaptics()} />)
    fireEvent.click(handCards()[0])
    fireEvent.click(screen.getByRole('button', { name: 'Scarta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pesca' }))
    expect(handCards()).toHaveLength(11)
  })

  it('the spike entrypoint renders the spike, not the production app, and registers no worker', async () => {
    const register = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
    document.body.innerHTML = '<div id="root"></div>'

    await import('./main')

    expect(await screen.findByRole('region', { name: 'La tua mano' })).toBeInTheDocument()
    expect(document.querySelector('[data-ios-spike]')).not.toBeNull()
    expect(screen.queryByRole('heading', { level: 1, name: 'Burraco' })).not.toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })
})
