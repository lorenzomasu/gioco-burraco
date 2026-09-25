import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect as baseExpect, test as baseTest } from '@playwright/test'
import { expect, onboardingHeading, PLAYER_NAME, roundIndicator, test } from './fixtures'

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
const SMOKE_SCRIPT = fileURLToPath(new URL('../scripts/deployed-smoke.mjs', import.meta.url))

/**
 * A GitHub Pages–shaped project URL, served offline from the built `dist` by request routing.
 * HTTPS makes it a secure context, so the M37 service worker registers there as on Pages.
 */
const PAGES_ORIGIN = 'https://pages.invalid'
const PROJECT_PATH = '/gioco-burraco/'

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url))
/** The current product release (M33.2 patch). */
const RELEASE_VERSION = '1.1.2'

test('package metadata and release documents agree on the current release version', async () => {
  const read = (file: string) => readFile(path.join(ROOT_DIR, file), 'utf8')
  const packageJson = JSON.parse(await read('package.json'))
  const lock = JSON.parse(await read('package-lock.json'))

  expect(packageJson.version).toBe(RELEASE_VERSION)
  expect(lock.version).toBe(RELEASE_VERSION)
  expect(lock.packages[''].version).toBe(RELEASE_VERSION)
  expect(await read('README.md')).toContain(`Current release: **v${RELEASE_VERSION}**.`)
  const currentRows = (await read('docs/RELEASE.md')).split('\n').filter((line) => line.includes('(current)'))
  expect(currentRows).toEqual([expect.stringContaining(`| \`v${RELEASE_VERSION}\` / \`${RELEASE_VERSION}\` |`)])
})

test('the built index references its assets relative to the page, never the origin root', async () => {
  const html = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8')
  const references = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((match) => match[1])

  expect(references).toEqual(expect.arrayContaining(['./favicon.svg']))
  expect(references.some((reference) => /^\.\/assets\/.+\.js$/.test(reference))).toBe(true)
  expect(references.some((reference) => /^\.\/assets\/.+\.css$/.test(reference))).toBe(true)
  for (const reference of references) expect(reference).toMatch(/^\.\//)
})

/** Width × height from a PNG's IHDR chunk. */
const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })

test('the built PWA manifest, icons and worker are emitted relative to the deployment path', async () => {
  const read = (file: string) => readFile(path.join(DIST_DIR, file), 'utf8')
  const html = await read('index.html')
  expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest">')
  expect(html).toContain('<meta name="theme-color" content="#071c17" />')

  const manifest = JSON.parse(await read('manifest.webmanifest'))
  expect(manifest).toMatchObject({
    id: './',
    name: 'Burraco',
    short_name: 'Burraco',
    lang: 'it',
    start_url: './',
    scope: './',
    display: 'standalone',
    theme_color: '#071c17',
    background_color: '#071c17',
  })
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = manifest.icons
  for (const icon of icons) {
    // Relative to the manifest: never the origin root, never another host.
    expect(icon.src).toMatch(/^icons\/[\w-]+\.png$/)
    expect(icon.type).toBe('image/png')
    const [width, height] = icon.sizes.split('x').map(Number)
    expect(pngSize(await readFile(path.join(DIST_DIR, icon.src)))).toEqual({ width, height })
  }
  expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
  )

  const worker = await read('sw.js')
  const precached = [...worker.matchAll(/\{url:"([^"]+)",revision:(?:"[^"]+"|null)\}/g)].map((match) => match[1])
  expect(precached).toEqual(expect.arrayContaining([
    'index.html',
    'manifest.webmanifest',
    'favicon.svg',
    ...icons.map(({ src }) => src),
  ]))
  expect(precached.some((url) => /^assets\/.+\.js$/.test(url))).toBe(true)
  expect(precached.some((url) => /^assets\/.+\.css$/.test(url))).toBe(true)
  for (const url of precached) expect(url).toMatch(/^(?:index\.html|favicon\.svg|manifest\.webmanifest|assets\/|icons\/)/)
  const workboxRuntime = worker.match(/define\(\["\.\/(workbox-[\w-]+)"\]/)?.[1]
  expect(workboxRuntime).toBeDefined()
  await expect(readFile(path.join(DIST_DIR, `${workboxRuntime}.js`))).resolves.toBeDefined()
  // Safe lifecycle: no clients.claim, and skipWaiting only on an explicit message the app never sends.
  expect(worker).not.toContain('clientsClaim')
  expect(worker.match(/skipWaiting\(\)/g)).toHaveLength(1)
  expect(worker).toMatch(/"SKIP_WAITING"===\w+\.data\.type&&self\.skipWaiting\(\)/)
  // App-shell only: the single route is the offline navigation fallback to the cached index.
  expect(worker.match(/registerRoute\(/g)).toHaveLength(1)
  expect(worker).toMatch(/NavigationRoute\(\w+\.createHandlerBoundToURL\("index\.html"\)\)/)
  expect(worker).toContain('cleanupOutdatedCaches()')
  for (const bundle of await readdir(path.join(DIST_DIR, 'assets'))) {
    if (bundle.endsWith('.js')) expect(await read(`assets/${bundle}`)).not.toContain('SKIP_WAITING')
  }
})

test('the production build runs from the Pages project path with no root-relative request', async ({ page, context }) => {
  const outsideProjectPath: string[] = []
  const servedPaths: string[] = []
  // Context-level routing also serves the service worker's own script and precache requests.
  await context.route(`${PAGES_ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    if (!pathname.startsWith(PROJECT_PATH)) {
      outsideProjectPath.push(pathname)
      return route.fulfill({ status: 404, body: 'outside the project path' })
    }
    servedPaths.push(pathname)
    const file = pathname.slice(PROJECT_PATH.length) || 'index.html'
    return route.fulfill({ path: path.join(DIST_DIR, file) })
  })

  const response = await page.goto(`${PAGES_ORIGIN}${PROJECT_PATH}`)
  expect(response?.ok()).toBe(true)
  await expect(onboardingHeading(page)).toBeVisible()
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './favicon.svg')
  const faviconStatus = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    return link === null ? 0 : (await fetch(link.href)).status
  })
  expect(faviconStatus).toBe(200)

  // M37: manifest, its icons and the worker all resolve inside the project path.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest')
  const pwa = await page.evaluate(async () => {
    const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href
    const manifest = await (await fetch(manifestUrl)).json()
    const icons = await Promise.all(
      manifest.icons.map(async ({ src }: { src: string }) => {
        const url = new URL(src, manifestUrl).href
        return { url, status: (await fetch(url)).status }
      }),
    )
    const registration = await navigator.serviceWorker.ready
    return {
      manifestUrl,
      startUrl: new URL(manifest.start_url, manifestUrl).href,
      scope: new URL(manifest.scope, manifestUrl).href,
      icons,
      workerScope: registration.scope,
      workerScript: registration.active!.scriptURL,
    }
  })
  const projectUrl = `${PAGES_ORIGIN}${PROJECT_PATH}`
  expect(pwa.manifestUrl).toBe(`${projectUrl}manifest.webmanifest`)
  expect(pwa.startUrl).toBe(projectUrl)
  expect(pwa.scope).toBe(projectUrl)
  expect(pwa.icons.length).toBeGreaterThanOrEqual(3)
  for (const icon of pwa.icons) expect(icon).toEqual({ url: expect.stringMatching(`^${projectUrl}icons/`), status: 200 })
  expect(pwa.workerScope).toBe(projectUrl)
  expect(pwa.workerScript).toBe(`${projectUrl}sw.js`)
  // The worker's precache install fetched the shell from the project path, too.
  await expect.poll(() => servedPaths.some((served) => served.startsWith(`${PROJECT_PATH}workbox-`))).toBe(true)

  await page.getByLabel('Il tuo nome').fill(PLAYER_NAME)
  await page.getByRole('button', { name: 'Inizia partita' }).click()
  await expect(page.getByRole('region', { name: 'Tavolo di Burraco' })).toBeVisible()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')

  expect(outsideProjectPath).toEqual([])
})

test('the page metadata names Burraco, is Italian and links a resolving favicon locally', async ({ page }) => {
  await page.goto('/')
  await expect(onboardingHeading(page)).toBeVisible()
  await expect(page).toHaveTitle('Burraco')
  await expect(page.locator('html')).toHaveAttribute('lang', 'it')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Burraco/)

  const favicon = await page.request.get('favicon.svg')
  expect(favicon.status()).toBe(200)
  expect(favicon.headers()['content-type']).toContain('image/svg+xml')
})

const runDeployedSmoke = async (args: string[]) => {
  const env = { ...process.env }
  delete env.DEPLOYED_URL
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [SMOKE_SCRIPT, ...args], { env })
    return { exitCode: 0, output: stdout + stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { exitCode: failure.code ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

baseTest.describe('deployed smoke command', () => {
  baseTest('fails clearly when no deployed URL is supplied', async () => {
    const result = await runDeployedSmoke([])
    baseExpect(result.exitCode).toBe(1)
    baseExpect(result.output).toContain('FAILED — no deployed URL supplied')
  })

  baseTest('fails clearly for a malformed deployed URL', async () => {
    const result = await runDeployedSmoke(['lorenzomasu.github.io/gioco-burraco'])
    baseExpect(result.exitCode).toBe(1)
    baseExpect(result.output).toContain('FAILED — not a valid URL')
  })

  baseTest('fails for an unreachable deployed URL', async () => {
    const result = await runDeployedSmoke(['http://127.0.0.1:1/gioco-burraco/'])
    baseExpect(result.exitCode).toBe(1)
    baseExpect(result.output).toContain('deployed smoke: FAILED')
  })

  baseTest('fails when the deployed build has no reachable PWA manifest', async () => {
    // The real `dist` under a Pages-shaped path, with the manifest missing from the deploy.
    const server = createServer(async (request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost')
      const file = pathname.slice(PROJECT_PATH.length) || 'index.html'
      if (!pathname.startsWith(PROJECT_PATH) || file === 'manifest.webmanifest') {
        response.writeHead(404).end()
        return
      }
      try {
        const body = await readFile(path.join(DIST_DIR, file))
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'
        response.writeHead(200, { 'content-type': type }).end(body)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = server.address() as AddressInfo
      const result = await runDeployedSmoke([`http://127.0.0.1:${port}${PROJECT_PATH}`])
      baseExpect(result.exitCode).toBe(1)
      baseExpect(result.output).toContain('deployed smoke: FAILED — PWA check failed: manifest')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  baseTest('passes against the served production build', async ({ baseURL }) => {
    baseTest.setTimeout(90_000)
    const result = await runDeployedSmoke([`${baseURL}/`])
    baseExpect(result.output).toContain('deployed smoke: PASSED')
    baseExpect(result.exitCode).toBe(0)
  })
})
