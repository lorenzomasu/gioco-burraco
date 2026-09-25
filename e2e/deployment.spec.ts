import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect as baseExpect, test as baseTest } from '@playwright/test'
import { expect, onboardingHeading, PLAYER_NAME, roundIndicator, test } from './fixtures'

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
const SMOKE_SCRIPT = fileURLToPath(new URL('../scripts/deployed-smoke.mjs', import.meta.url))

/** A GitHub Pages–shaped project URL, served offline from the built `dist` by request routing. */
const PAGES_ORIGIN = 'http://pages.invalid'
const PROJECT_PATH = '/gioco-burraco/'

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url))
/** The current product release (M33.1 patch). */
const RELEASE_VERSION = '1.1.1'

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

test('the production build runs from the Pages project path with no root-relative request', async ({ page }) => {
  const outsideProjectPath: string[] = []
  await page.route(`${PAGES_ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    if (!pathname.startsWith(PROJECT_PATH)) {
      outsideProjectPath.push(pathname)
      return route.fulfill({ status: 404, body: 'outside the project path' })
    }
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

  baseTest('passes against the served production build', async ({ baseURL }) => {
    baseTest.setTimeout(90_000)
    const result = await runDeployedSmoke([`${baseURL}/`])
    baseExpect(result.output).toContain('deployed smoke: PASSED')
    baseExpect(result.exitCode).toBe(0)
  })
})
