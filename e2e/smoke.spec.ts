import {
  PLAYER_NAME,
  completeNowButton,
  drawAndDiscard,
  drawPileButton,
  expect,
  humanHandCards,
  NORMAL_BOT_DELAY_MS,
  roundIndicator,
  startNewMatch,
  test,
  timelineEntries,
} from './fixtures'

const turnBanner = (page: import('@playwright/test').Page) => page.getByText('Turno di').locator('..')

test('onboarding starts a named smazzata 1 on a playable table', async ({ page }) => {
  await startNewMatch(page)

  await expect(page.getByRole('region', { name: 'Tavolo di Burraco' })).toBeVisible()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await expect(page.getByRole('heading', { level: 1, name: PLAYER_NAME })).toBeVisible()
  await expect(turnBanner(page)).toContainText(PLAYER_NAME)
  await expect(humanHandCards(page)).toHaveCount(11)
  await expect(drawPileButton(page)).toBeEnabled()
  await expect(page.getByRole('button', { name: /^Raccogli il monte degli scarti/ })).toBeEnabled()
})

test('the seeded setup deals the same match on every fresh load', async ({ page }) => {
  const dealtHand = async () => {
    await startNewMatch(page)
    return humanHandCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
  }
  const first = await dealtHand()
  await page.evaluate(() => window.localStorage.clear())

  expect(await dealtHand()).toEqual(first)
})

test('a human turn hands control to the bots and back to a playable human turn', async ({ page }) => {
  await startNewMatch(page)
  await expect(timelineEntries(page)).toHaveCount(0)

  await drawAndDiscard(page)

  // Bot playback is pending and visible, and human gameplay is locked.
  await expect(completeNowButton(page)).toBeVisible()
  await expect(page.getByText('Bot in gioco…')).toBeVisible()
  await expect(turnBanner(page)).not.toContainText(PLAYER_NAME)
  await expect(drawPileButton(page)).toBeDisabled()

  // One presentation delay commits exactly one public bot action through the real timer.
  await page.clock.runFor(NORMAL_BOT_DELAY_MS)
  await expect(timelineEntries(page)).toHaveCount(1)
  await expect(timelineEntries(page).first()).toHaveText(/pesca dal tallone|raccoglie il monte degli scarti/)

  await completeNowButton(page).click()
  await expect(completeNowButton(page)).toBeHidden()
  await expect(turnBanner(page)).toContainText(PLAYER_NAME)
  expect(await timelineEntries(page).count()).toBeGreaterThan(1)

  // The next human turn is playable.
  await expect(drawPileButton(page)).toBeEnabled()
  await drawPileButton(page).click()
  await expect(humanHandCards(page)).toHaveCount(12)
  await expect(page.getByRole('button', { name: 'Scarta e passa' })).toBeDisabled()
})
