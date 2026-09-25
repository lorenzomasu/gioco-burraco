import type { Page } from '@playwright/test'
import { MATCH_SAVE_STORAGE_KEY } from '../src/shell/matchPersistence'
import {
  PLAYER_NAME,
  completeNowButton,
  drawAndDiscard,
  drawPileButton,
  expect,
  onboardingHeading,
  readActiveSave,
  roundIndicator,
  startNewMatch,
  test,
} from './fixtures'

/**
 * M37 installable PWA and offline resume, against the shipped production build. Every test
 * runs in Playwright's fresh isolated context, so service-worker and Cache Storage state never
 * leaks into other tests. The worker is reached only through standard browser APIs.
 */

/** Waits for the generated worker to finish its precache install and become active. */
const waitForActiveWorker = (page: Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const active = registration.active!
    if (active.state !== 'activated') {
      await new Promise<void>((resolve) => {
        const onChange = () => {
          if (active.state !== 'activated') return
          active.removeEventListener('statechange', onChange)
          resolve()
        }
        active.addEventListener('statechange', onChange)
        onChange()
      })
    }
    return { scope: registration.scope, state: active.state }
  })

const isControlled = (page: Page) => page.evaluate(() => navigator.serviceWorker.controller !== null)

const readRawSave = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), MATCH_SAVE_STORAGE_KEY)

const savedTurnOwner = async (page: Page) => {
  const round = (await readActiveSave(page))?.match.currentRound.round
  return round?.status === 'in-progress' ? round.turn.currentPlayerId : null
}

test('after one online install the app reloads offline from the cache and resumes the saved match', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/')
  await expect(onboardingHeading(page)).toBeVisible()
  const worker = await waitForActiveWorker(page)
  expect(worker).toEqual({ scope: `${baseURL}/`, state: 'activated' })
  // No `clientsClaim`: the first page stays uncontrolled; a normal navigation is controlled.
  expect(await isControlled(page)).toBe(false)

  // A real three-smazzate Facile match started and advanced through the public UI.
  await startNewMatch(page, PLAYER_NAME, 3, 'Facile')
  expect(await isControlled(page)).toBe(true)
  await drawAndDiscard(page)
  await completeNowButton(page).click()
  await expect(drawPileButton(page)).toBeEnabled()
  const saved = await readActiveSave(page)
  expect(saved).toMatchObject({
    version: 3,
    setup: { humanPlayerName: PLAYER_NAME, roundCount: 3, botDifficulty: 'easy' },
    match: { roundCount: 3, status: 'in-progress' },
  })
  expect(await savedTurnOwner(page)).toBe('player-1')
  const tallone = await drawPileButton(page).getAttribute('aria-label')

  await context.setOffline(true)
  // The network is really gone: an uncached same-origin URL is not served by any cache.
  expect(await page.evaluate(() => fetch('./not-precached.txt').then(() => 'served', () => 'failed'))).toBe('failed')

  const response = await page.reload()
  expect(response?.fromServiceWorker()).toBe(true)
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/3')
  await expect(onboardingHeading(page)).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: PLAYER_NAME })).toBeVisible()
  await expect(drawPileButton(page)).toHaveAttribute('aria-label', tallone!)

  // Play continues locally offline and keeps writing the same schema-v3 save.
  await drawAndDiscard(page)
  await expect(completeNowButton(page)).toBeVisible()
  expect(await savedTurnOwner(page)).not.toBe('player-1')
  expect(await readActiveSave(page)).toMatchObject({
    version: 3,
    setup: { humanPlayerName: PLAYER_NAME, roundCount: 3, botDifficulty: 'easy' },
    match: { roundCount: 3, status: 'in-progress' },
  })
})

test('the app-shell cache holds only built static assets, never the match save', async ({ page, baseURL }) => {
  await startNewMatch(page)
  await waitForActiveWorker(page)
  const rawSave = await readRawSave(page)
  expect(rawSave).not.toBeNull()

  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url)
    }
    return urls
  })
  expect(cached.length).toBeGreaterThan(0)
  for (const url of cached) {
    const { origin, pathname } = new URL(url)
    expect(origin).toBe(baseURL)
    expect(pathname).toMatch(
      /^\/(?:index\.html|favicon\.svg|manifest\.webmanifest|assets\/[\w-]+\.(?:js|css)|icons\/icon-[\w-]+\.png)$/,
    )
  }
  for (const url of cached) expect(url).not.toContain(MATCH_SAVE_STORAGE_KEY)
})

test('removing the worker and its caches leaves the local match save untouched', async ({ page }) => {
  await startNewMatch(page, PLAYER_NAME, 2)
  await waitForActiveWorker(page)
  const rawSave = await readRawSave(page)
  expect(rawSave).not.toBeNull()

  const removed = await page.evaluate(async () => {
    const names = await caches.keys()
    await Promise.all(names.map((name) => caches.delete(name)))
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
    return names.length
  })
  expect(removed).toBeGreaterThan(0)
  expect(await readRawSave(page)).toBe(rawSave)

  await page.reload()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/2')
  expect(await readRawSave(page)).toBe(rawSave)
})
