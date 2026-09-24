import type { Page } from '@playwright/test'
import { cardLabel } from '../src/components/cardPresentation'
import { createSeededRandom } from '../src/game/cards/shuffle'
import { startMatch, type MatchState } from '../src/game/match'
import { createSetupRoundFactory } from '../src/shell/matchSetup'
import {
  E2E_SEED,
  PLAYER_NAME,
  collectDiscardPileButton,
  discardPile,
  discardPileCards,
  drawPileButton,
  expect,
  historyToggle,
  humanHandCards,
  openSavedMatch,
  test,
} from './fixtures'

const LONG_PILE_EXTRA_CARDS = 30

/**
 * The seeded smazzata 1 with a long face-up pile: stock cards move onto the discard pile
 * (after the opening discard), so every physical card still exists exactly once and the
 * save passes the real M22 validation. The human is still in the draw phase.
 */
const longPileMatch = (): MatchState => {
  const match = startMatch(createSetupRoundFactory({ humanPlayerName: PLAYER_NAME }, createSeededRandom(E2E_SEED)))
  const round = match.currentRound
  return {
    ...match,
    currentRound: {
      ...round,
      drawPile: round.drawPile.slice(LONG_PILE_EXTRA_CARDS),
      discardPile: [...round.discardPile, ...round.drawPile.slice(0, LONG_PILE_EXTRA_CARDS)],
    },
  }
}

const spread = (page: Page) => discardPile(page).getByRole('list', { name: /^Carte scartate/ })

const spreadScroll = (page: Page) => spread(page).evaluate((element) => ({
  scrollLeft: element.scrollLeft,
  maxScrollLeft: element.scrollWidth - element.clientWidth,
}))

const documentOverflow = (page: Page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))

const expectNoDocumentOverflow = async (page: Page) => {
  const { scrollWidth, clientWidth } = await documentOverflow(page)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** The newest card lies horizontally inside the visible part of the spread. */
const expectNewestInView = async (page: Page) => {
  const list = (await spread(page).boundingBox())!
  const newest = (await discardPileCards(page).last().boundingBox())!
  expect(newest.x).toBeGreaterThanOrEqual(list.x - 1)
  expect(newest.x + newest.width).toBeLessThanOrEqual(list.x + list.width + 1)
}

const pileLabels = (page: Page) =>
  discardPileCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))

for (const width of [320, 375, 390]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true })

    test('a long pile scrolls locally, keeps the newest card in view and stays inspectable', async ({ page }) => {
      const match = longPileMatch()
      const pile = match.currentRound.discardPile
      await openSavedMatch(page, match)

      await expect(discardPileCards(page)).toHaveCount(pile.length)
      expect(await pileLabels(page)).toEqual(pile.map(cardLabel))
      await expect(discardPile(page).getByText(`${pile.length} carte`, { exact: true })).toBeVisible()
      await expect(discardPile(page).getByText('In cima')).toBeVisible()
      await expect(discardPile(page).getByText(/scorri per i precedenti/)).toBeVisible()
      await expectNoDocumentOverflow(page)

      // The spread itself overflows and starts on the newest card.
      await spread(page).scrollIntoViewIfNeeded()
      const initial = await spreadScroll(page)
      expect(initial.maxScrollLeft).toBeGreaterThan(0)
      expect(initial.scrollLeft).toBeGreaterThanOrEqual(initial.maxScrollLeft - 1)
      await expectNewestInView(page)

      // Older cards are reachable by scrolling the spread; the page never scrolls sideways.
      await spread(page).evaluate((element) => { element.scrollLeft = 0 })
      await expect(discardPileCards(page).first()).toBeInViewport()
      await expectNoDocumentOverflow(page)

      // Unrelated renders (history, speed) keep the user's position.
      await historyToggle(page).tap()
      await historyToggle(page).tap()
      await page.getByRole('radio', { name: 'Veloce' }).check()
      expect((await spreadScroll(page)).scrollLeft).toBe(0)
    })
  })
}

test.describe('keyboard and collection', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the scroll surface and the whole-pile collection are keyboard operable', async ({ page }) => {
    const match = longPileMatch()
    const pile = match.currentRound.discardPile
    await openSavedMatch(page, match)

    // Tab order: stock → pile scroll surface (one stop) → whole-pile collection.
    await drawPileButton(page).focus()
    await page.keyboard.press('Tab')
    await expect(spread(page)).toBeFocused()
    const before = await spreadScroll(page)
    // Arrow keys scroll the focused spread natively (no per-card tab stops).
    await page.keyboard.press('ArrowLeft')
    await expect.poll(async () => (await spreadScroll(page)).scrollLeft).toBeLessThan(before.scrollLeft)
    const scrolledBack = (await spreadScroll(page)).scrollLeft
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await spreadScroll(page)).scrollLeft).toBeGreaterThan(scrolledBack)

    await page.keyboard.press('Tab')
    await expect(collectDiscardPileButton(page)).toBeFocused()
    await expect(collectDiscardPileButton(page)).toHaveAccessibleName(
      `Raccogli tutto il monte degli scarti, ${pile.length} carte`,
    )
    await page.keyboard.press('Enter')

    await expect(discardPile(page).getByText('Monte degli scarti vuoto')).toBeVisible()
    await expect(discardPile(page).getByText('0 carte', { exact: true })).toBeVisible()
    await expect(discardPileCards(page)).toHaveCount(0)
    await expect(collectDiscardPileButton(page)).toBeDisabled()
    await expect(humanHandCards(page)).toHaveCount(11 + pile.length)
    await expectNoDocumentOverflow(page)
  })

  test('a resumed long pile opens on its newest card', async ({ page }) => {
    await openSavedMatch(page, longPileMatch())
    await spread(page).evaluate((element) => { element.scrollLeft = 0 })

    await page.reload()

    await expect(discardPile(page).getByText('In cima')).toBeVisible()
    const resumed = await spreadScroll(page)
    expect(resumed.maxScrollLeft).toBeGreaterThan(0)
    expect(resumed.scrollLeft).toBeGreaterThanOrEqual(resumed.maxScrollLeft - 1)
  })
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 768, height: 1024 }]) {
  test(`at ${viewport.width}×${viewport.height} the pile is an overlapping spread inside the table`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const match = longPileMatch()
    await openSavedMatch(page, match)

    await expect(discardPileCards(page)).toHaveCount(match.currentRound.discardPile.length)
    const [first, second] = [
      (await discardPileCards(page).nth(0).boundingBox())!,
      (await discardPileCards(page).nth(1).boundingBox())!,
    ]
    // Overlapping, yet each older card keeps its rank/suit corner exposed.
    expect(second.x).toBeLessThan(first.x + first.width)
    expect(second.x - first.x).toBeGreaterThanOrEqual(16)
    await expectNoDocumentOverflow(page)
    await expectNewestInView(page)
    // The collection control never covers the cards.
    const collect = (await collectDiscardPileButton(page).boundingBox())!
    const list = (await spread(page).boundingBox())!
    expect(collect.y + collect.height <= list.y || collect.y >= list.y + list.height).toBe(true)
  })
}
