import type { Page } from '@playwright/test'
import { createSeededRandom } from '../src/game/cards/shuffle'
import { startMatch } from '../src/game/match'
import { createSetupRoundFactory } from '../src/shell/matchSetup'
import {
  E2E_SEED,
  PLAYER_NAME,
  drawPileButton,
  expect,
  leaveDialog,
  newMatchButton,
  onboardingHeading,
  openSavedMatch,
  readActiveSave,
  roundIndicator,
  settingsDialog,
  startNewMatch,
  test,
} from './fixtures'

const expectNoDocumentOverflow = async (page: Page) => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** The dialog panel lies entirely inside the viewport. */
const expectInsideViewport = async (page: Page, name: string, role: 'dialog' | 'alertdialog' = 'dialog') => {
  const box = (await page.getByRole(role, { name }).boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
}

for (const width of [320, 390]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 740 }, hasTouch: true, isMobile: true })

    test('onboarding, header, Settings and Help fit without page overflow', async ({ page }) => {
      await page.goto('/')
      await expect(onboardingHeading(page)).toBeVisible()
      await expectNoDocumentOverflow(page)

      await page.getByRole('button', { name: 'Come si gioca' }).tap()
      await expectInsideViewport(page, 'Come si gioca')
      await expectNoDocumentOverflow(page)
      await page.getByRole('dialog', { name: 'Come si gioca' }).getByRole('button', { name: 'Chiudi' }).tap()

      await page.getByLabel('Il tuo nome').fill(PLAYER_NAME)
      await page.getByRole('button', { name: 'Inizia partita' }).tap()
      await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
      await expect(page.getByRole('group', { name: 'Punteggio della partita' })).toContainText('La tua squadra')
      await expectNoDocumentOverflow(page)

      await page.getByRole('button', { name: 'Impostazioni' }).tap()
      await expectInsideViewport(page, 'Impostazioni')
      await expectNoDocumentOverflow(page)
      await settingsDialog(page).getByRole('button', { name: 'Chiudi' }).tap()

      await newMatchButton(page).tap()
      await expectInsideViewport(page, 'Abbandonare la partita?', 'alertdialog')
      await leaveDialog(page).getByRole('button', { name: 'Annulla' }).tap()
      await expect(drawPileButton(page)).toBeEnabled()
      await expectNoDocumentOverflow(page)
    })
  })
}

test('Settings and Help return focus to their invoker and close on Escape', async ({ page }) => {
  await startNewMatch(page)

  const settings = page.getByRole('button', { name: 'Impostazioni' })
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(settingsDialog(page)).toBeFocused()
  // Background controls are inert while the dialog is open.
  await expect(page.locator('.app-content')).toHaveAttribute('inert', '')
  await page.keyboard.press('Tab')
  await expect(settingsDialog(page).getByRole('radio', { name: 'Normale' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(settingsDialog(page)).toHaveCount(0)
  await expect(settings).toBeFocused()

  const help = page.getByRole('button', { name: 'Come si gioca' })
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Come si gioca' })).toContainText('Completa subito')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Come si gioca' })).toHaveCount(0)
  await expect(help).toBeFocused()
})

test('the new-match confirmation is keyboard operable and Escape never abandons', async ({ page }) => {
  await startNewMatch(page)
  const saved = await readActiveSave(page)

  await newMatchButton(page).focus()
  await page.keyboard.press('Enter')
  const cancel = leaveDialog(page).getByRole('button', { name: 'Annulla' })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(leaveDialog(page)).toHaveCount(0)
  await expect(newMatchButton(page)).toBeFocused()
  expect(await readActiveSave(page)).toEqual(saved)

  await page.keyboard.press('Enter')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(leaveDialog(page).getByRole('button', { name: 'Abbandona partita' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(onboardingHeading(page)).toBeFocused()
  expect(await readActiveSave(page)).toBeNull()
})

test('a restored save shows a concise resume status without taking focus', async ({ page }) => {
  const match = startMatch(createSetupRoundFactory({ humanPlayerName: PLAYER_NAME }, createSeededRandom(E2E_SEED)))
  await openSavedMatch(page, match)

  await expect(page.getByRole('status')).toHaveText(/Partita ripresa · Smazzata 1\/4/)
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await page.getByRole('button', { name: 'Chiudi avviso di ripresa' }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(drawPileButton(page)).toBeEnabled()
})

test('muted audio and reduced motion leave the integrated table fully playable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startNewMatch(page)
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  await settingsDialog(page).getByRole('checkbox', { name: 'Disattiva suoni' }).check()
  await settingsDialog(page).getByRole('button', { name: 'Chiudi' }).click()

  await drawPileButton(page).click()
  await expect(page.getByRole('region', { name: `Mano di ${PLAYER_NAME}` }).getByText('12 carte', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gioco-burraco:audio-preferences')!)))
    .toEqual({ version: 1, muted: true, volume: 0.6 })
  // No decorative flight was needed, and the presentation preference never enters the save.
  await expect(page.locator('.motion-proxy')).toHaveCount(0)
  expect(JSON.stringify(await readActiveSave(page))).not.toMatch(/muted|volume|audio/i)
})
