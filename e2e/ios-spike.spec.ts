import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test, type Page } from '@playwright/test'

/**
 * M39 (experimental) iOS architecture spike. The production `dist` must never contain it; the
 * spike itself is built through its explicit Vite mode into a temporary directory and driven
 * with touch at an iPhone portrait size.
 */
const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url))
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const SPIKE_ORIGIN = 'https://ios-spike.invalid'
const IPHONE = { width: 390, height: 844 }

test('the production build contains neither the spike entry nor its code', async () => {
  const html = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8')
  expect(html).not.toContain('ios-spike')
  const assets = await readdir(path.join(DIST_DIR, 'assets'))
  for (const asset of assets.filter((file) => file.endsWith('.js'))) {
    expect(await readFile(path.join(DIST_DIR, 'assets', asset), 'utf8')).not.toContain('data-ios-spike')
  }
})

test.describe('iPhone spike', () => {
  test.use({ viewport: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })

  let spikeDir = ''

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    spikeDir = await mkdtemp(path.join(tmpdir(), 'burraco-ios-spike-'))
    await promisify(execFile)('npx', ['vite', 'build', '--mode', 'ios-spike', '--outDir', spikeDir, '--emptyOutDir'], { cwd: ROOT_DIR })
  })

  test.afterAll(async () => {
    if (spikeDir) await rm(spikeDir, { recursive: true, force: true })
  })

  const openSpike = async (page: Page) => {
    const errors: Error[] = []
    page.on('pageerror', (error) => errors.push(error))
    // Records which card each Web Animation moved, with its starting transform.
    await page.addInitScript(() => {
      const recorded: string[] = []
      Object.assign(window, { __spikeFlights: recorded })
      const animate = Element.prototype.animate
      Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
        const [keyframes] = args
        const from = Array.isArray(keyframes) ? String(keyframes[0]?.transform) : ''
        recorded.push(`${this.getAttribute('data-spike-card')} ${from}`)
        return animate.apply(this, args)
      }
    })
    await page.route(`${SPIKE_ORIGIN}/**`, (route) => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html'
      return route.fulfill({ path: path.join(spikeDir, path.normalize(file)) })
    })
    await page.goto(`${SPIKE_ORIGIN}/`)
    await expect(page.getByRole('region', { name: 'La tua mano' })).toBeVisible()
    return errors
  }

  const flights = (page: Page) => page.evaluate(() => (window as unknown as { __spikeFlights: string[] }).__spikeFlights)

  const hand = (page: Page) => page.getByRole('region', { name: 'La tua mano' }).getByRole('button')

  test('the bundle is self-contained and relative, with no PWA worker', async () => {
    const html = await readFile(path.join(spikeDir, 'index.html'), 'utf8')
    expect(html).toContain('viewport-fit=cover')
    for (const [, reference] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) expect(reference).toMatch(/^\.\//)
    const files = await readdir(spikeDir)
    expect(files).not.toContain('sw.js')
    expect(files).not.toContain('manifest.webmanifest')
  })

  test('touch selects, draws with motion, discards and opens/dismisses the sheet', async ({ page }) => {
    const errors = await openSpike(page)
    const [first] = await hand(page).all()
    await first.tap()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await first.tap()
    await expect(first).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: 'Pesca', exact: true }).tap()
    await expect(hand(page)).toHaveCount(12)
    // The drawn card flew from the stock into the hand.
    await expect.poll(() => flights(page)).toEqual([expect.stringContaining('deck-1-ace-clubs')])

    await hand(page).first().tap()
    await page.getByRole('button', { name: 'Scarta', exact: true }).tap()
    await expect(hand(page)).toHaveCount(11)
    await expect(page.getByRole('button', { name: 'Pozzo, in cima Tre di fiori, mazzo 1' })).toBeVisible()
    // ...and the discarded card flew from the hand onto the discard pile.
    await expect.poll(() => flights(page)).toHaveLength(2)
    expect((await flights(page))[1]).toContain('deck-1-three-clubs')

    await page.getByRole('button', { name: 'Menu' }).tap()
    const sheet = page.getByRole('dialog', { name: 'Pannello' })
    await expect(sheet).toBeInViewport({ ratio: 1 })
    await sheet.getByRole('button', { name: 'Chiudi', exact: true }).tap()
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    await expect(sheet).not.toBeInViewport()
    expect(errors).toEqual([])
  })

  test('card motion uses a real source-to-destination translation', async ({ page }) => {
    await openSpike(page)
    await page.getByRole('button', { name: 'Pesca', exact: true }).tap()
    await expect.poll(() => flights(page)).toHaveLength(1)
    const [flight] = await flights(page)
    const [, dx, dy] = flight.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/)!.map(Number)
    // From the stock in the middle of the table down to the hand.
    expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(50)
    expect(dy).toBeLessThan(0)
  })

  test('primary controls are comfortable touch targets and the hand scrolls horizontally', async ({ page }) => {
    await openSpike(page)
    for (const name of ['Menu', 'Pesca', 'Scarta']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    const cards = await hand(page).all()
    const [a, b] = await Promise.all(cards.slice(0, 2).map((card) => card.boundingBox()))
    // Exposed width of an overlapped hand card.
    expect(b!.x - a!.x).toBeGreaterThanOrEqual(44)
    expect(a!.height).toBeGreaterThanOrEqual(44)
    const scroller = page.locator('.spike-hand')
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    // App chrome: the document itself never scrolls, text is not selectable.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none')
  })

  test('primary controls stay clear of simulated notch and home-indicator insets', async ({ page }) => {
    await openSpike(page)
    // Chromium reports zero insets; emulate an iPhone's by overriding the spike's inset tokens.
    await page.addStyleTag({ content: ':root { --spike-safe-top: 47px; --spike-safe-bottom: 34px; }' })
    const menu = (await page.getByRole('button', { name: 'Menu' }).boundingBox())!
    expect(menu.y).toBeGreaterThanOrEqual(47)
    for (const name of ['Pesca', 'Scarta']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(IPHONE.height - 34)
    }
    await page.getByRole('button', { name: 'Menu' }).tap()
    const close = page.getByRole('dialog', { name: 'Pannello' }).getByRole('button', { name: 'Chiudi', exact: true })
    await expect(close).toBeInViewport()
    const closeBox = (await close.boundingBox())!
    expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(IPHONE.height - 34)
  })
})
