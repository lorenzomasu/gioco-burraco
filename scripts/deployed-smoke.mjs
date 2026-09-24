// Release smoke of a deployed Burraco build (M26).
//
// Usage: npm run smoke:deployed -- <url>   (or DEPLOYED_URL=<url> npm run smoke:deployed)
//
// Opens the exact supplied URL in real Chromium, requires onboarding to render, starts one
// match through the public UI and requires the table plus `Smazzata 1/4`. Any navigation
// failure, non-OK document, broken favicon or uncaught page error fails the run. It uses
// only the shipped public UI: no test route, query flag or global hook.
import { chromium } from '@playwright/test'

const PLAYER_NAME = 'Smoke'
const STEP_TIMEOUT_MS = 30_000

const parseTargetUrl = () => {
  const raw = (process.argv[2] ?? process.env.DEPLOYED_URL ?? '').trim()
  if (raw === '') {
    throw new Error('no deployed URL supplied; pass it as the first argument or set DEPLOYED_URL')
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`unsupported URL protocol: ${url.protocol}`)
  }
  return url.href
}

const exerciseApplication = async (page, targetUrl) => {
  const response = await page.goto(targetUrl, { waitUntil: 'load' })
  if (response === null || !response.ok()) {
    throw new Error(`document request returned HTTP ${response?.status() ?? 'no response'}`)
  }

  // The favicon must resolve relative to the deployed path, not the origin root.
  const favicon = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="icon"]')
    if (link === null) return { href: null, status: 0 }
    const iconResponse = await fetch(link.href)
    return { href: link.href, status: iconResponse.status }
  })
  if (favicon.href === null || favicon.status !== 200) {
    throw new Error(`favicon did not resolve (${favicon.href ?? 'no icon link'} → HTTP ${favicon.status})`)
  }

  await page.getByRole('heading', { level: 1, name: 'Burraco' }).waitFor()
  await page.getByLabel('Il tuo nome').fill(PLAYER_NAME)
  await page.getByRole('button', { name: 'Inizia partita' }).click()

  await page.getByRole('region', { name: 'Tavolo di Burraco' }).waitFor()
  await page.getByText(/^Smazzata 1\/4$/).waitFor()
}

const runSmoke = async (targetUrl) => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(STEP_TIMEOUT_MS)
    page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error))
    const describePageErrors = () => `uncaught page error(s):\n${pageErrors.map(String).join('\n')}`

    try {
      await exerciseApplication(page, targetUrl)
    } catch (error) {
      // A step timeout is usually a symptom; report the uncaught error that caused it.
      if (pageErrors.length > 0) throw new Error(`${describePageErrors()}\n(step failure: ${error.message})`)
      throw error
    }
    if (pageErrors.length > 0) throw new Error(describePageErrors())
  } finally {
    await browser.close()
  }
}

try {
  const targetUrl = parseTargetUrl()
  console.log(`deployed smoke: checking ${targetUrl}`)
  await runSmoke(targetUrl)
  console.log('deployed smoke: PASSED — onboarding rendered and smazzata 1/4 started')
} catch (error) {
  console.error(`deployed smoke: FAILED — ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
