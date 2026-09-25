import { GUIDANCE_PREFERENCES_STORAGE_KEY } from '../src/shell/guidancePreferences'
import {
  PLAYER_NAME,
  drawPileButton,
  expect,
  humanHandCards,
  onboardingHeading,
  readActiveSave,
  roundIndicator,
  startNewMatch,
  test,
} from './fixtures'

test('the first match is guided and a dismissed guide stays hidden while the match resumes', async ({ page }) => {
  await startNewMatch(page)
  const coach = page.getByRole('region', { name: 'Guida contestuale' })
  await expect(coach).toBeVisible()
  await expect(coach).toContainText('Tocca a te: pesca dal tallone')
  expect(await page.evaluate((key) => window.localStorage.getItem(key), GUIDANCE_PREFERENCES_STORAGE_KEY)).toBeNull()

  await drawPileButton(page).click()
  await expect(coach).toContainText('Seleziona carte per provare «Cala»')
  const saveBefore = await readActiveSave(page)

  await coach.getByRole('button', { name: 'Nascondi guida' }).click()
  await expect(coach).toBeHidden()
  await expect(page.getByText(/^Seleziona le carte per aprire una nuova calata/)).toBeVisible()
  expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!), GUIDANCE_PREFERENCES_STORAGE_KEY))
    .toEqual({ version: 1, enabled: false, completedOnce: false })
  // The active-match save is independent of the guidance preference.
  const saveAfter = await readActiveSave(page)
  expect(saveAfter).toEqual(saveBefore)
  expect(saveAfter).toMatchObject({ version: 3, setup: { humanPlayerName: PLAYER_NAME } })
  expect(Object.keys(saveAfter!).sort()).toEqual(['match', 'setup', 'version'])

  await page.reload()

  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await expect(onboardingHeading(page)).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: PLAYER_NAME })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Guida contestuale' })).toBeHidden()
  expect(await readActiveSave(page)).toEqual(saveBefore)

  await page.getByRole('button', { name: 'Impostazioni' }).click()
  await page.getByRole('dialog', { name: 'Impostazioni' }).getByRole('checkbox', { name: 'Guida contestuale' }).check()
  await page.getByRole('dialog', { name: 'Impostazioni' }).getByRole('button', { name: 'Chiudi' }).click()
  await expect(page.getByRole('region', { name: 'Guida contestuale' })).toBeVisible()
})

test.describe('desktop 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the guided table keeps the whole hand inside the first viewport', async ({ page }) => {
    await startNewMatch(page)
    await drawPileButton(page).click()
    await expect(page.getByRole('region', { name: 'Guida contestuale' })).toBeVisible()
    const card = (await humanHandCards(page).first().boundingBox())!
    expect(card.y + card.height).toBeLessThanOrEqual(900)
  })
})
