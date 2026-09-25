import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

type DialogProps = Readonly<{
  title: string
  /** Escape and the close control call it; it must never confirm a destructive choice. */
  onClose: () => void
  children: ReactNode
  /** Footer controls; when omitted a single «Chiudi» button closes the dialog. */
  actions?: ReactNode
  /** Element focused on open; the dialog panel itself when omitted. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** `alertdialog` for a confirmation that interrupts the flow. */
  role?: 'dialog' | 'alertdialog'
  className?: string
}>

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal surface. The owner renders it beside a background marked `inert`, so
 * background controls cannot be reached while it is open. Opening moves focus inside,
 * Tab stays inside, Escape calls `onClose`, and closing returns focus to the control that
 * was focused before it opened when that control still exists.
 */
export function Dialog({ title, onClose, children, actions, initialFocusRef, role = 'dialog', className }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(initialFocusRef?.current ?? panelRef.current)?.focus()
    return () => {
      if (invoker?.isConnected) invoker.focus()
    }
  }, [initialFocusRef])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]!
    const last = focusable.at(-1)!
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        ref={panelRef}
        className={`dialog${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="dialog__title">{title}</h2>
        <div className="dialog__body">{children}</div>
        <div className="dialog__actions">
          {actions ?? (
            <button type="button" className="button button--primary" onClick={() => onCloseRef.current()}>
              Chiudi
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
