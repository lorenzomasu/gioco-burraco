import type { Page } from '@playwright/test'
import {
  NORMAL_HANDOFF_DELAY_MS,
  PLAYER_NAME,
  discardButton,
  drawPileButton,
  completeNowButton,
  expect,
  humanHandCards,
  leaveDialog,
  newMatchButton,
  onboardingHeading,
  readActiveSave,
  roundIndicator,
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

  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS)

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

/**
 * Test-side only: holds every motion-proxy flight paused at its start, so a session can be
 * replaced while the flight is deterministically still in progress. The held animations
 * stay reachable so the test can later force their (stale) completion. The app is unchanged.
 */
const holdFlights = (page: Page) => page.addInitScript(() => {
  const held: Animation[] = []
  ;(window as unknown as { __heldFlights: Animation[] }).__heldFlights = held
  const original = Element.prototype.animate
  Element.prototype.animate = function (this: Element, keyframes, options) {
    const animation = original.call(this, keyframes, options)
    if (this instanceof HTMLElement && this.classList.contains('motion-proxy')) {
      animation.pause()
      held.push(animation)
    }
    return animation
  }
})

const heldPlayStates = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __heldFlights: Animation[] }).__heldFlights.map((a) => a.playState))

/** Forces every held flight to its end, firing any completion callback still attached. */
const finishHeldFlights = (page: Page) =>
  page.evaluate(() => {
    for (const animation of (window as unknown as { __heldFlights: Animation[] }).__heldFlights) animation.finish()
  })

test('abandoning the match mid-flight removes the proxy and a stale completion never touches the next session', async ({ page }) => {
  await holdFlights(page)
  await startNewMatch(page)

  await drawPileButton(page).click()
  // The committed draw is already rendered under the still-running flight.
  await expect(humanHandCards(page)).toHaveCount(12)
  await expect(page.locator('.motion-layer .motion-proxy')).toHaveCount(1)
  expect(await heldPlayStates(page)).toEqual(['paused'])

  await newMatchButton(page).click()
  await leaveDialog(page).getByRole('button', { name: 'Abbandona partita' }).click()

  // Unmounting the table cancels the flight and detaches its proxy.
  await expect(onboardingHeading(page)).toBeVisible()
  await expect(page.locator('.motion-proxy')).toHaveCount(0)
  expect(await heldPlayStates(page)).toEqual(['idle'])
  expect(await readActiveSave(page)).toBeNull()

  // A replacement session, then the old flight's completion fires late.
  await page.getByLabel('Il tuo nome').fill(PLAYER_NAME)
  await page.getByRole('button', { name: 'Inizia partita' }).click()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  const replacementHand = await humanHandCards(page).allTextContents()
  await finishHeldFlights(page)

  await expect(page.locator('.motion-proxy')).toHaveCount(0)
  await expect(humanHandCards(page)).toHaveCount(11)
  expect(await humanHandCards(page).allTextContents()).toEqual(replacementHand)
  await expect(drawPileButton(page)).toBeEnabled()
  await drawPileButton(page).click()
  await expect(humanHandCards(page)).toHaveCount(12)
})

test('«Completa subito» cancels an in-flight bot flight without rolling back the committed steps', async ({ page }) => {
  await holdFlights(page)
  await startNewMatch(page)
  await drawPileButton(page).click()
  await humanHandCards(page).first().click()
  await discardButton(page).click()

  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS)
  await expect(page.locator('.motion-layer .motion-proxy[data-motion-flight$=">seat"]')).toHaveCount(1)
  expect((await heldPlayStates(page)).at(-1)).toBe('paused')

  await completeNowButton(page).click()

  // The completed bot chain is the committed view; every earlier flight was cancelled.
  await expect(drawPileButton(page)).toBeEnabled()
  await expect(page.locator('.motion-proxy')).toHaveCount(0)
  expect(new Set(await heldPlayStates(page))).toEqual(new Set(['idle']))
  const committedHand = await humanHandCards(page).allTextContents()
  const committedTallone = await drawPileButton(page).getAttribute('aria-label')

  await finishHeldFlights(page)

  await expect(page.locator('.motion-proxy')).toHaveCount(0)
  expect(await humanHandCards(page).allTextContents()).toEqual(committedHand)
  await expect(drawPileButton(page)).toHaveAttribute('aria-label', committedTallone!)
})
