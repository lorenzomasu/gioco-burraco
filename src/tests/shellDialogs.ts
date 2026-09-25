import { act, fireEvent, screen, within } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * Moving focus into or out of a dialog makes jsdom queue a zero-delay `selectionchange`
 * timer. Flushing it keeps fake-timer counts about application timers only; bot playback
 * delays are never zero, so no bot step can fire here.
 */
const flushFocusTimers = () => {
  if (vi.isFakeTimers()) act(() => {
    vi.advanceTimersByTime(0)
  })
}

const clickAndFlush = (element: HTMLElement) => {
  fireEvent.click(element)
  flushFocusTimers()
}

/** The in-app abandonment confirmation (M32), or `null` while it is closed. */
export const leaveDialog = () => screen.queryByRole('alertdialog', { name: 'Abbandonare la partita?' })

/** Presses «Nuova partita»; for an in-progress match this only opens the confirmation. */
export const requestLeave = () => clickAndFlush(screen.getByRole('button', { name: 'Nuova partita' }))

export const cancelLeave = () => clickAndFlush(within(leaveDialog()!).getByRole('button', { name: 'Annulla' }))

export const confirmLeave = () =>
  clickAndFlush(within(leaveDialog()!).getByRole('button', { name: 'Abbandona partita' }))

/** Requests and confirms leaving an in-progress match. */
export const leaveConfirmed = () => {
  requestLeave()
  confirmLeave()
}

export const settingsDialog = () => screen.queryByRole('dialog', { name: 'Impostazioni' })

export const openSettings = () => clickAndFlush(screen.getByRole('button', { name: 'Impostazioni' }))

export const closeDialog = (dialog: HTMLElement) => clickAndFlush(within(dialog).getByRole('button', { name: 'Chiudi' }))

/** Chooses a bot speed through the shared Settings surface and closes it again. */
export const chooseSpeedInSettings = (label: 'Normale' | 'Veloce') => {
  openSettings()
  clickAndFlush(within(settingsDialog()!).getByRole('radio', { name: label }))
  closeDialog(settingsDialog()!)
}
