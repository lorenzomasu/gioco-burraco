import { useLayoutEffect, useRef, type RefObject } from 'react'
import { motionAnchor, planMotion, prefersReducedMotion, type MotionEndpoint, type MotionFlight } from './tableMotion'
import type { TableFeedback } from './tableFeedback'

/** Viewport rectangle of an element measured before the committed view replaced it. */
export type MotionRect = Readonly<{ left: number; top: number; width: number; height: number }>

/**
 * Pre-commit geometry of the human's own moved cards. It is measured only after the engine
 * accepted the action and belongs to exactly that action's cue; it is never game state.
 */
export type CapturedMotionSource = Readonly<{ feedback: TableFeedback; rect: MotionRect }>

type MotionLayerProps = Readonly<{
  feedback: TableFeedback | null
  /** Flight duration for this cue; kept inside the bot playback cadence by the owner. */
  durationMs: number
  capturedSource: RefObject<CapturedMotionSource | null>
}>

const PROXY_WIDTH = 44
const PROXY_HEIGHT = 62

const toRect = (element: Element): MotionRect => {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { left, top, width, height }
}

const resolveEndpoint = (
  root: ParentNode,
  endpoint: MotionEndpoint,
  feedback: TableFeedback,
  captured: CapturedMotionSource | null,
): MotionRect | null => {
  if (endpoint.kind === 'hand-selection') return captured?.feedback === feedback ? captured.rect : null
  if (endpoint.kind === 'received-card') {
    const received = root.querySelector('[data-motion-anchor="hand"] [data-feedback="received"]')
    return received ? toRect(received) : null
  }
  const anchor = root.querySelector(`[data-motion-anchor="${motionAnchor(endpoint)}"]`)
  if (!anchor) return null
  // A discard lands on the newest public card when the pile shows one.
  const target = endpoint.kind === 'discard' ? anchor.querySelector('.discard-spread__item--top') ?? anchor : anchor
  return toRect(target)
}

const centre = (rect: MotionRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })

const createProxy = (document: Document, flight: MotionFlight, from: MotionRect): HTMLElement => {
  const proxy = document.createElement('span')
  proxy.className = `motion-proxy motion-proxy--${flight.face}${flight.count > 1 ? ' motion-proxy--stack' : ''}`
  proxy.dataset.motionFlight = `${flight.source.kind}>${flight.destination.kind}`
  const start = centre(from)
  proxy.style.left = `${start.x - PROXY_WIDTH / 2}px`
  proxy.style.top = `${start.y - PROXY_HEIGHT / 2}px`
  // Only the public card count is ever shown; never a rank, suit or identity.
  if (flight.count > 1) {
    const badge = document.createElement('span')
    badge.className = 'motion-proxy__count'
    badge.textContent = String(flight.count)
    proxy.append(badge)
  }
  return proxy
}

/**
 * Decorative, pointer-transparent overlay that flies card proxies for the latest committed
 * cue. It is purely presentational: the committed table is already rendered underneath,
 * a new cue (or none, or unmount) cancels the running flights, reduced motion or a missing
 * Web Animations API skips them, and any failure leaves the static table in place.
 */
export function MotionLayer({ feedback, durationMs, capturedSource }: MotionLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer || !feedback) return
    const document = layer.ownerDocument
    if (prefersReducedMotion(document.defaultView)) return
    const root: ParentNode = layer.closest('.game-shell') ?? document
    const proxies: HTMLElement[] = []
    const animations: Animation[] = []
    const cancel = () => {
      for (const animation of animations) {
        try {
          animation.cancel()
        } catch {
          // A failed cancellation must never affect the committed table.
        }
      }
      for (const proxy of proxies) proxy.remove()
    }
    try {
      for (const flight of planMotion(feedback)) {
        const from = resolveEndpoint(root, flight.source, feedback, capturedSource.current)
        const to = resolveEndpoint(root, flight.destination, feedback, capturedSource.current)
        // A vanished source or destination simply has no flight.
        if (!from || !to) continue
        const proxy = createProxy(document, flight, from)
        if (typeof proxy.animate !== 'function') continue
        layer.append(proxy)
        proxies.push(proxy)
        const start = centre(from)
        const end = centre(to)
        const animation = proxy.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { opacity: 1, offset: 0.8 },
            { transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(.85)`, opacity: 0 },
          ],
          { duration: durationMs, easing: 'cubic-bezier(.3, .7, .3, 1)', fill: 'forwards' },
        )
        animations.push(animation)
        animation.onfinish = () => proxy.remove()
      }
    } catch {
      // Motion is optional: on any failure the committed static table stays as rendered.
      cancel()
      return
    }
    return cancel
    // Keyed on the cue object: re-rendering the same committed cue never replays it.
  }, [feedback])

  return <div ref={layerRef} className="motion-layer" aria-hidden="true" />
}
