/**
 * M39 (experimental): presentation-only FLIP motion. The card is already in its destination
 * region when this runs; it is drawn back at its source and animated to rest using only
 * transform and opacity, which stay on the compositor on a 60 Hz phone.
 */
export type Box = Readonly<{ left: number; top: number; width: number; height: number }>

export const FLIGHT_DURATION_MS = 320

export const flipTransform = (from: Box, to: Box): string => {
  const scaleX = to.width ? from.width / to.width : 1
  const scaleY = to.height ? from.height / to.height : 1
  const dx = from.left - to.left
  const dy = from.top - to.top
  return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Starts the flight when the platform supports it; otherwise the card simply appears. */
export const flyFrom = (element: HTMLElement, from: Box): Animation | null => {
  if (typeof element.animate !== 'function' || prefersReducedMotion()) return null
  const to = element.getBoundingClientRect()
  return element.animate(
    [
      { transformOrigin: '0 0', transform: flipTransform(from, to), opacity: 0.85 },
      { transformOrigin: '0 0', transform: 'none', opacity: 1 },
    ],
    { duration: FLIGHT_DURATION_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  )
}
