import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

/**
 * M38 update lifecycle. The shipped `dist` is served by a test-only static server on its own
 * localhost origin (a secure context), and a second, distinct build is simulated by test-only
 * transforms of the same artifacts: each build's `sw.js` answers which build it is over a
 * MessageChannel, and build 2 changes the precached `index.html` (marker plus revision). The
 * product code, its registration and the Workbox lifecycle options are unchanged. A real
 * server is used because the browser's worker update check bypasses request routing.
 */
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
/** One port per parallel worker, next to the preview server's 4173. */
const updateOrigin = (parallelIndex: number) => `http://127.0.0.1:${4180 + parallelIndex}`
const BUILD_QUERY = 'm38-build'
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

const serveBuilds = async (origin: string) => {
  const build = { current: 1 }
  const distIndex = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8')
  const distWorker = await readFile(path.join(DIST_DIR, 'sw.js'), 'utf8')
  const indexRevision = distWorker.match(/url:"index\.html",revision:"([^"]+)"/)?.[1]
  expect(indexRevision).toBeDefined()
  const server = createServer(async (request, response) => {
    const file = new URL(request.url ?? '/', origin).pathname.slice(1) || 'index.html'
    const n = build.current
    let body: string | Buffer
    if (file === 'index.html') {
      body = distIndex.replace('<head>', `<head><meta name="${BUILD_QUERY}" content="${n}">`)
    } else if (file === 'sw.js') {
      const responder = `self.addEventListener("message",e=>{e.data==="${BUILD_QUERY}"&&e.ports[0].postMessage(${n})});`
      body = responder + (n === 1 ? distWorker : distWorker.replace(indexRevision!, `${indexRevision}-build-${n}`))
    } else {
      try {
        body = await readFile(path.join(DIST_DIR, path.normalize(file)))
      } catch {
        response.writeHead(404).end()
        return
      }
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    }).end(body)
  })
  await new Promise<void>((resolve) => server.listen(Number(new URL(origin).port), '127.0.0.1', resolve))
  return { build, close: () => new Promise((resolve) => server.close(resolve)) }
}

/** Which simulated build a worker of this page's registration is, or `null` when absent. */
const workerBuild = (page: Page, which: 'controller' | 'active' | 'waiting') =>
  page.evaluate(async ([slot, query]) => {
    const registration = await navigator.serviceWorker.getRegistration()
    const worker = slot === 'controller' ? navigator.serviceWorker.controller : registration?.[slot]
    if (!worker) return null
    return new Promise<number>((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => resolve(event.data)
      worker.postMessage(query, [channel.port2])
    })
  }, [which, BUILD_QUERY] as const)

const servedBuild = (page: Page) => page.locator(`meta[name="${BUILD_QUERY}"]`).getAttribute('content')

test.describe('service-worker update', () => {
  test.use({ baseURL: async ({}, use, testInfo) => use(updateOrigin(testInfo.parallelIndex)) })

  test('a newer worker waits while a match is open and controls the next client with the save intact', async ({
    page,
    context,
    baseURL,
  }) => {
    const { build, close } = await serveBuilds(baseURL!)
    try {
      // Build 1 installs on the first visit; the match page is then a controlled client.
      await page.goto('/')
      await waitForActiveWorker(page)
      await startNewMatch(page, PLAYER_NAME, 3)
      await drawAndDiscard(page)
      await completeNowButton(page).click()
      await expect(drawPileButton(page)).toBeEnabled()
      expect(await workerBuild(page, 'controller')).toBe(1)
      const rawSave = await readRawSave(page)
      expect(rawSave).not.toBeNull()

      let navigations = 0
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations += 1
      })
      await page.evaluate(() => {
        (window as unknown as { m38SamePage: boolean }).m38SamePage = true
      })

      // Build 2 is deployed at the same scope and the browser's update check finds it.
      build.current = 2
      await page.evaluate(async () => {
        const registration = (await navigator.serviceWorker.getRegistration())!
        await registration.update()
        const installing = registration.installing ?? registration.waiting
        if (installing && installing.state !== 'installed') {
          await new Promise<void>((resolve) => {
            const onChange = () => {
              if (installing.state === 'installing') return
              installing.removeEventListener('statechange', onChange)
              resolve()
            }
            installing.addEventListener('statechange', onChange)
            onChange()
          })
        }
      })

      // The new worker installed and waits: no takeover, no reload, the same page and save.
      expect(await workerBuild(page, 'waiting')).toBe(2)
      expect(await workerBuild(page, 'active')).toBe(1)
      expect(await workerBuild(page, 'controller')).toBe(1)
      expect(navigations).toBe(0)
      expect(await page.evaluate(() => (window as unknown as { m38SamePage?: boolean }).m38SamePage)).toBe(true)
      expect(await servedBuild(page)).toBe('1')
      await expect(roundIndicator(page)).toHaveText('Smazzata 1/3')
      expect(await readRawSave(page)).toBe(rawSave)

      // Closing the last old client is the safe activation boundary; the next client is build 2.
      await page.close()
      const next = await context.newPage()
      const errors: Error[] = []
      next.on('pageerror', (error) => errors.push(error))
      await next.goto('/')
      await expect.poll(() => workerBuild(next, 'active')).toBe(2)
      expect(await workerBuild(next, 'controller')).toBe(2)
      expect(await servedBuild(next)).toBe('2')

      // The same local match resumes unchanged and keeps playing in schema v3.
      await expect(roundIndicator(next)).toHaveText('Smazzata 1/3')
      await expect(onboardingHeading(next)).toBeHidden()
      expect(await readRawSave(next)).toBe(rawSave)
      await drawAndDiscard(next)
      await expect.poll(() => savedTurnOwner(next)).not.toBe('player-1')
      expect(await readActiveSave(next)).toMatchObject({
        version: 3,
        setup: { humanPlayerName: PLAYER_NAME, roundCount: 3, botDifficulty: 'normal' },
        match: { roundCount: 3, status: 'in-progress' },
      })
      expect(errors.map(String)).toEqual([])
    } finally {
      await close()
    }
  })
})

/**
 * M38 progressive enhancement: with no service-worker support, or a registration that the
 * browser rejects, the online app still starts, resumes and plays, and the save is untouched.
 * Both conditions are imposed by browser/test control only.
 */
const SERVICE_WORKER_FAILURES = {
  unsupported: async (page: Page) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker
    })
    return async () => expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(false)
  },
  'registration rejected': async (page: Page) => {
    await page.context().route('**/sw.js', (route) => route.fulfill({ status: 404, body: 'not deployed' }))
    await page.addInitScript(() => {
      const register = ServiceWorkerContainer.prototype.register
      ServiceWorkerContainer.prototype.register = function (...args) {
        const result = register.apply(this, args)
        ;(window as unknown as { m38Registration: Promise<string> }).m38Registration =
          result.then(() => 'registered', () => 'rejected')
        return result
      }
    })
    return async () => {
      expect(await page.evaluate(() => (window as unknown as { m38Registration?: Promise<string> }).m38Registration))
        .toBe('rejected')
      expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
    }
  },
}

for (const [failure, impose] of Object.entries(SERVICE_WORKER_FAILURES)) {
  test(`with service-worker setup ${failure} the online app starts, resumes and plays`, async ({ page }) => {
    const expectFailure = await impose(page)
    await startNewMatch(page, PLAYER_NAME, 2, 'Facile')
    await drawAndDiscard(page)
    await completeNowButton(page).click()
    await expect(drawPileButton(page)).toBeEnabled()
    const rawSave = await readRawSave(page)
    expect(rawSave).not.toBeNull()

    await page.reload()

    await expect(onboardingHeading(page)).toBeHidden()
    await expect(roundIndicator(page)).toHaveText('Smazzata 1/2')
    await expectFailure()
    expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull()
    expect(await readRawSave(page)).toBe(rawSave)

    await drawAndDiscard(page)
    await expect(completeNowButton(page)).toBeVisible()
    expect(await savedTurnOwner(page)).not.toBe('player-1')
    expect(await readActiveSave(page)).toMatchObject({
      version: 3,
      setup: { humanPlayerName: PLAYER_NAME, roundCount: 2, botDifficulty: 'easy' },
      match: { roundCount: 2, status: 'in-progress' },
    })
  })
}
