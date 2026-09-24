import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * A direct-manipulation destination under the pointer. It only describes intent: the table
 * turns it into a presentation-only reorder or into one of the existing engine commands.
 */
export type DropTarget =
  | Readonly<{ kind: 'hand'; boundary: number }>
  | Readonly<{ kind: 'discard' }>
  | Readonly<{ kind: 'new-meld' }>
  | Readonly<{ kind: 'meld'; meldIndex: number }>

/**
 * Presentation state of a valid destination: no drag, a drag in progress, or a drag
 * currently over this destination.
 */
export type DropState = 'idle' | 'available' | 'active'

/** The active drag: its payload is fixed when the drag begins. Transient UI state only. */
export type HandDrag = Readonly<{
  payload: readonly string[]
  target: DropTarget | null
  x: number
  y: number
}>

/** Mouse/pen movement (px) that turns a press into a drag; below it a press stays a click. */
export const DRAG_THRESHOLD_PX = 6
/** Touch must rest this long on a card before it can be dragged; earlier movement scrolls. */
export const TOUCH_DRAG_DELAY_MS = 250
/** Touch movement tolerated while waiting for the drag delay. */
const TOUCH_SLOP_PX = 10

/** Attribute naming a drop destination; only elements that are currently valid carry it. */
export const DROP_TARGET_ATTRIBUTE = 'data-drop-target'
/** Attribute of hand card elements, used only to find the hand insertion boundary. */
export const HAND_CARD_ATTRIBUTE = 'data-hand-card'

type Gesture = {
  pointerId: number
  cardId: string
  element: HTMLElement
  startX: number
  startY: number
  /** Mouse/pen are armed at once; touch only after resting for the drag delay. */
  armed: boolean
  timer: ReturnType<typeof setTimeout> | null
  /** Set once the gesture has become a real drag. */
  payload: readonly string[] | null
  detach: () => void
}

/** Insertion boundary in the hand: the number of cards whose centre lies left of `x`. */
const handBoundary = (zone: Element, x: number): number => {
  const cards = [...zone.querySelectorAll(`[${HAND_CARD_ATTRIBUTE}]`)]
  return cards.filter((card) => {
    const rect = card.getBoundingClientRect()
    return rect.left + rect.width / 2 < x
  }).length
}

/** The destination element under the pointer, identified only by its own attributes. */
const resolveDropTarget = (x: number, y: number): DropTarget | null => {
  const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
  const zone = hit?.closest<HTMLElement>(`[${DROP_TARGET_ATTRIBUTE}]`)
  switch (zone?.getAttribute(DROP_TARGET_ATTRIBUTE)) {
    case 'hand':
      return { kind: 'hand', boundary: handBoundary(zone!, x) }
    case 'discard':
      return { kind: 'discard' }
    case 'new-meld':
      return { kind: 'new-meld' }
    case 'meld': {
      const meldIndex = Number(zone!.dataset.meldIndex)
      return Number.isInteger(meldIndex) && meldIndex >= 0 ? { kind: 'meld', meldIndex } : null
    }
    default:
      return null
  }
}

type HandDragOptions = Readonly<{
  /** Whether the hand may currently be dragged (the human's own turn). */
  enabled: boolean
  /** Any change (a committed state, a replaced round or session) cancels an active gesture. */
  sessionKey: unknown
  /** The payload for a drag starting on `cardId`, from the current visible hand. */
  resolvePayload: (cardId: string) => readonly string[]
  /** Called once when a real drag is released; `null` means no supported destination. */
  onDrop: (payload: readonly string[], target: DropTarget | null) => void
}>

/**
 * Pointer Events drag intent for hand cards (mouse, pen and touch share the same logic).
 * It never commits anything itself: it reports the payload and the destination element
 * that received the release. Cancellation (pointer cancel, lost capture, session change,
 * unmount) drops the gesture silently.
 */
export function useHandDrag({ enabled, sessionKey, resolvePayload, onDrop }: HandDragOptions) {
  const [drag, setDrag] = useState<HandDrag | null>(null)
  const [armedCardId, setArmedCardId] = useState<string | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  // The click that ends a real drag must not also toggle the card's selection.
  const suppressClickRef = useRef(false)
  const callbacksRef = useRef({ resolvePayload, onDrop })
  useEffect(() => {
    callbacksRef.current = { resolvePayload, onDrop }
  })

  const finish = useCallback(() => {
    const gesture = gestureRef.current
    if (!gesture) return
    gestureRef.current = null
    if (gesture.timer !== null) clearTimeout(gesture.timer)
    gesture.detach()
    setDrag(null)
    setArmedCardId(null)
  }, [])

  // A replaced session, a turn that is no longer the human's, or unmount ends the gesture.
  useEffect(() => finish, [sessionKey, enabled, finish])

  const onPointerDown = useCallback((cardId: string, event: ReactPointerEvent<HTMLElement>) => {
    suppressClickRef.current = false
    if (!enabled || gestureRef.current || !event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const element = event.currentTarget
    const pointerId = event.pointerId
    const isTouch = event.pointerType === 'touch'

    const onMove = (moveEvent: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || moveEvent.pointerId !== pointerId) return
      const distance = Math.hypot(moveEvent.clientX - gesture.startX, moveEvent.clientY - gesture.startY)
      if (!gesture.payload) {
        if (!gesture.armed) {
          // Touch moving before the delay is a scroll: leave it to the browser.
          if (distance > TOUCH_SLOP_PX) finish()
          return
        }
        if (distance < DRAG_THRESHOLD_PX) return
        gesture.payload = callbacksRef.current.resolvePayload(gesture.cardId)
        suppressClickRef.current = true
        try {
          gesture.element.setPointerCapture?.(pointerId)
        } catch {
          // Capture is an enhancement; window listeners still follow the pointer.
        }
      }
      moveEvent.preventDefault()
      setDrag({
        payload: gesture.payload,
        target: resolveDropTarget(moveEvent.clientX, moveEvent.clientY),
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      })
    }
    const onUp = (upEvent: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || upEvent.pointerId !== pointerId) return
      const payload = gesture.payload
      finish()
      // Without a real drag the press stays an ordinary click/tap.
      if (payload) callbacksRef.current.onDrop(payload, resolveDropTarget(upEvent.clientX, upEvent.clientY))
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) finish()
    }
    // Only the card's own capture counts: moving an implicit touch capture from a child
    // element to the card also fires `lostpointercapture` on that child.
    const onLostCapture = (lostEvent: Event) => {
      if (lostEvent.target === element && gestureRef.current?.payload) finish()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    element.addEventListener('lostpointercapture', onLostCapture)

    const gesture: Gesture = {
      pointerId,
      cardId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      armed: !isTouch,
      timer: null,
      payload: null,
      detach: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        element.removeEventListener('lostpointercapture', onLostCapture)
      },
    }
    if (isTouch) {
      gesture.timer = setTimeout(() => {
        if (gestureRef.current !== gesture) return
        gesture.timer = null
        gesture.armed = true
        setArmedCardId(cardId)
      }, TOUCH_DRAG_DELAY_MS)
    }
    gestureRef.current = gesture
  }, [enabled, finish])

  /** Swallows the click that ends a real drag; keyboard clicks (`detail === 0`) always pass. */
  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current || event.detail === 0) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  /** A pressed or dragged card never opens the long-press context menu. */
  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    if (gestureRef.current) event.preventDefault()
  }, [])

  /**
   * Callback ref for the hand container: a non-passive `touchmove` listener lets an armed
   * touch drag stop the browser from scrolling, while unarmed touches still scroll natively.
   */
  const handRef = useCallback((node: HTMLElement | null) => {
    if (!node) return
    const onTouchMove = (event: TouchEvent) => {
      if (gestureRef.current?.armed && event.cancelable) event.preventDefault()
    }
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => node.removeEventListener('touchmove', onTouchMove)
  }, [])

  return { drag, armedCardId, handRef, onPointerDown, onClickCapture, onContextMenu }
}
