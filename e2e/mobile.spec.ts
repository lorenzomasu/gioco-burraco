import type { Page } from '@playwright/test'
import {
  PLAYER_NAME,
  completeNowButton,
  discardButton,
  drawPileButton,
  expect,
  historyToggle,
  humanHandCards,
  onboardingHeading,
  roundIndicator,
  test,
} from './fixtures'

// The supported M23 minimum-width baseline.
test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true })

/** Document-level horizontal overflow; intentionally scrollable card/meld regions scroll locally. */
const documentOverflow = (page: Page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))

const expectNoDocumentOverflow = async (page: Page) => {
  const { scrollWidth, clientWidth } = await documentOverflow(page)
  expect(clientWidth).toBe(320)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

test('at 320 px a match starts and the draw/select/discard flow works without page overflow', async ({ page }) => {
  await page.goto('/')
  await expect(onboardingHeading(page)).toBeVisible()
  await expectNoDocumentOverflow(page)

  await page.getByLabel('Il tuo nome').tap()
  await page.getByLabel('Il tuo nome').fill(PLAYER_NAME)
  await page.getByRole('button', { name: 'Inizia partita' }).tap()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await expectNoDocumentOverflow(page)

  // Taps are delivered to the real controls: nothing (including M24 cues) covers them.
  await drawPileButton(page).tap()
  await expect(humanHandCards(page)).toHaveCount(12)
  await expectNoDocumentOverflow(page)

  const card = humanHandCards(page).first()
  await card.scrollIntoViewIfNeeded()
  await card.tap()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('carta selezionata', { exact: true })).toBeVisible()

  await discardButton(page).scrollIntoViewIfNeeded()
  await discardButton(page).tap()
  // During bot playback the hand is rendered read-only, so count it from the header.
  await expect(page.getByRole('region', { name: `Mano di ${PLAYER_NAME}` }).getByText('11 carte', { exact: true })).toBeVisible()
  await expect(completeNowButton(page)).toBeVisible()
  await expectNoDocumentOverflow(page)

  await completeNowButton(page).tap()
  await expect(drawPileButton(page)).toBeEnabled()
  await expectNoDocumentOverflow(page)

  // The bot history disclosure opens by touch inside the page width.
  await historyToggle(page).tap()
  await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('log', { name: 'Cronologia bot' }).getByRole('listitem').first()).toBeVisible()
  await expectNoDocumentOverflow(page)
  await historyToggle(page).tap()
  await expect(historyToggle(page)).toHaveAttribute('aria-expanded', 'false')
})
