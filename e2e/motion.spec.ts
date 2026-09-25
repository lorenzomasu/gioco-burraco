import type { Page } from '@playwright/test'
import {
  NORMAL_BOT_DELAY_MS,
  discardButton,
  drawPileButton,
  expect,
  humanHandCards,
  startNewMatch,
  test,
} from './fixtures'

type RecordedFlight = Readonly<{
  flight: string
  startX: number
  startY: number
  endX: number
  endY: number
  inLayer: boolean
}>

/**
 * Test-side only: records each Web Animations call on a motion proxy (start centre and
 * final translate) before the application bundle runs, so the real geometry can be
 * checked without racing the short flight. The shipped app is unchanged.
 */
const recordFlights = (page: Page) => page.addInitScript(() => {
  const flights: unknown[] = []
  ;(window as unknown as { __motionFlights: unknown[] }).__motionFlights = flights
  const original = Element.prototype.animate
  Element.prototype.animate = function (this: Element, keyframes, options) {
    if (this instanceof HTMLElement && this.classList.contains('motion-proxy')) {
      const frames = keyframes as Keyframe[]
      const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(String(frames.at(-1)?.transform))
      const left = Number.parseFloat(this.style.left) + 22
      const top = Number.parseFloat(this.style.top) + 31
      flights.push({
        flight: this.dataset.motionFlight,
        startX: left,
        startY: top,
        endX: left + Number(match?.[1] ?? Number.NaN),
        endY: top + Number(match?.[2] ?? Number.NaN),
        inLayer: this.parentElement?.classList.contains('motion-layer') ?? false,
      })
    }
    return original.call(this, keyframes, options)
  }
})

const flights = (page: Page): Promise<RecordedFlight[]> =>
  page.evaluate(() => (window as unknown as { __motionFlights: RecordedFlight[] }).__motionFlights)

const centre = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).first().boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('a stock draw flies from the real stock to the newly drawn card in a decorative layer', async ({ page }) => {
  await recordFlights(page)
  await startNewMatch(page)

  await drawPileButton(page).click()
  await expect(humanHandCards(page)).toHaveCount(12)

  const [flight] = await flights(page)
  expect(flight).toMatchObject({ flight: 'stock>received-card', inLayer: true })
  const stock = await centre(page, '[data-motion-anchor="stock"]')
  const received = await centre(page, '[data-motion-anchor="hand"] [data-feedback="received"]')
  expect(Math.abs(flight!.startX - stock.x)).toBeLessThan(2)
  expect(Math.abs(flight!.startY - stock.y)).toBeLessThan(2)
  expect(Math.abs(flight!.endX - received.x)).toBeLessThan(2)
  // The received card was measured during its short M24 rise (at most .6rem above rest).
  expect(Math.abs(flight!.endY - received.y)).toBeLessThan(12)

  const layer = page.locator('.motion-layer')
  await expect(layer).toHaveAttribute('aria-hidden', 'true')
  await expect(layer).toHaveCSS('pointer-events', 'none')
  // The committed hand stays operable while (or after) the proxy flies.
  await humanHandCards(page).first().click()
  await expect(discardButton(page)).toBeEnabled()
})

test('a bot step flies toward the acting seat without delaying the committed step', async ({ page }) => {
  await recordFlights(page)
  await startNewMatch(page)
  await drawPileButton(page).click()
  await humanHandCards(page).first().click()
  await discardButton(page).click()

  await page.clock.runFor(NORMAL_BOT_DELAY_MS)

  const botFlight = (await flights(page)).at(-1)!
  expect(botFlight.flight).toMatch(/^(stock|discard)>seat$/)
  const seat = await centre(page, '[data-motion-anchor="seat-player-2"]')
  expect(Math.abs(botFlight.endX - seat.x)).toBeLessThan(2)
  expect(Math.abs(botFlight.endY - seat.y)).toBeLessThan(2)
})

test('reduced motion skips every card flight while the committed state is unchanged', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await recordFlights(page)
  await startNewMatch(page)

  await drawPileButton(page).click()

  await expect(humanHandCards(page)).toHaveCount(12)
  await expect(drawPileButton(page)).toHaveAttribute('data-feedback', 'draw')
  expect(await flights(page)).toEqual([])
  await expect(page.locator('.motion-proxy')).toHaveCount(0)
})
