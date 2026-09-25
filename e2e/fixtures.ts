import { test as base, expect, type Locator, type Page } from '@playwright/test'
import type { MatchState } from '../src/game/match'
import { MATCH_SAVE_STORAGE_KEY, serializeMatchSave, type MatchSaveEnvelope } from '../src/shell/matchPersistence'

/** Fixed seed for every browser test; the shipped app keeps using `Math.random` unchanged. */
export const E2E_SEED = 20_250_925

/** Fixed fake-clock origin, so bot playback timers only fire when a test advances time. */
const CLOCK_ORIGIN = new Date('2026-01-01T09:00:00Z')

/**
 * Replaces `Math.random` before the application bundle runs with the same Mulberry32
 * sequence as `createSeededRandom(seed)`. The production entrypoint is unchanged: the
 * app's default shuffle source simply reads the seeded function.
 */
const installSeededRandom = (seed: number) => {
  let state = seed >>> 0
  Math.random = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

type Fixtures = Readonly<{
  /** Uncaught page errors; every test fails if any occurred. */
  pageErrors: Error[]
}>

/**
 * Every test gets a deterministic shuffle and a paused fake clock: a pending bot step is
 * committed only when the test advances the clock or uses the real `Completa subito`.
 */
export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await page.addInitScript(installSeededRandom, E2E_SEED)
    await page.clock.install({ time: CLOCK_ORIGIN })
    await page.clock.pauseAt(CLOCK_ORIGIN)
    await use(page)
  },
  pageErrors: [
    async ({ page }, use, testInfo) => {
      const errors: Error[] = []
      const consoleErrors: string[] = []
      page.on('pageerror', (error) => errors.push(error))
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      await use(errors)
      if (consoleErrors.length > 0) {
        await testInfo.attach('console-errors', { body: consoleErrors.join('\n'), contentType: 'text/plain' })
      }
      expect(errors.map(String), 'uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** The committed bot playback delay at the default `Normale` speed (`BOT_PLAYBACK_DELAYS_MS.normal`). */
export const NORMAL_BOT_DELAY_MS = 550

export const PLAYER_NAME = 'Lorenzo'

export const drawPileButton = (page: Page): Locator => page.getByRole('button', { name: /^Pesca dal tallone/ })
/** The M28 face-up discard pile (every card, oldest → newest) and its whole-pile collection button. */
export const discardPile = (page: Page): Locator => page.getByRole('group', { name: 'Monte degli scarti' })
export const discardPileCards = (page: Page): Locator =>
  discardPile(page).getByRole('list', { name: /^Carte scartate/ }).getByRole('img')
export const collectDiscardPileButton = (page: Page): Locator =>
  page.getByRole('button', { name: /^Raccogli tutto il monte degli scarti/ })
export const completeNowButton = (page: Page): Locator => page.getByRole('button', { name: 'Completa subito' })
export const discardButton = (page: Page): Locator => page.getByRole('button', { name: 'Scarta e passa' })
export const newMatchButton = (page: Page): Locator => page.getByRole('button', { name: 'Nuova partita' })
export const roundIndicator = (page: Page): Locator => page.getByText(/^Smazzata \d\/4$/)
export const humanHandCards = (page: Page, name = PLAYER_NAME): Locator =>
  page.getByRole('region', { name: `Mano di ${name}` }).getByLabel(`Carte di ${name}`).getByRole('button')
export const timelineEntries = (page: Page): Locator =>
  page.getByRole('region', { name: 'Cronologia bot' }).getByRole('listitem')
/** The M27 disclosure toggle of the bot history; the log stays mounted while collapsed. */
export const historyToggle = (page: Page): Locator => page.getByRole('button', { name: /^Cronologia bot/ })
/** The shared M32 Settings dialog and its bot-speed choice. */
export const settingsDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Impostazioni' })
export const chooseBotSpeed = async (page: Page, label: 'Normale' | 'Veloce') => {
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  await settingsDialog(page).getByRole('radio', { name: label }).check()
  await settingsDialog(page).getByRole('button', { name: 'Chiudi' }).click()
  await expect(settingsDialog(page)).toHaveCount(0)
}
/** The M32 in-app abandonment confirmation. */
export const leaveDialog = (page: Page): Locator => page.getByRole('alertdialog', { name: 'Abbandonare la partita?' })
export const onboardingHeading = (page: Page): Locator => page.getByRole('heading', { level: 1, name: 'Burraco' })

/** Opens a fresh application and starts smazzata 1 through the real onboarding form. */
export const startNewMatch = async (page: Page, typedName = `  ${PLAYER_NAME}  `) => {
  await page.goto('/')
  await expect(onboardingHeading(page)).toBeVisible()
  await page.getByLabel('Il tuo nome').fill(typedName)
  await page.getByRole('button', { name: 'Inizia partita' }).click()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
}

/** The human's simple, always-legal turn: draw from the tallone, then discard the first hand card. */
export const drawAndDiscard = async (page: Page) => {
  await drawPileButton(page).click()
  await humanHandCards(page).first().click()
  await expect(discardButton(page)).toBeEnabled()
  await discardButton(page).click()
}

/**
 * Opens a known committed match through the real M22 boundary: a version-1 envelope
 * produced by the app's own serializer is placed in browser storage and the page reloads.
 */
export const openSavedMatch = async (page: Page, match: MatchState, humanPlayerName = PLAYER_NAME) => {
  await page.goto('/')
  await expect(onboardingHeading(page)).toBeVisible()
  await page.evaluate(
    ([key, raw]) => window.localStorage.setItem(key, raw),
    [MATCH_SAVE_STORAGE_KEY, serializeMatchSave({ humanPlayerName }, match)] as const,
  )
  await page.reload()
  await expect(roundIndicator(page)).toHaveText(`Smazzata ${match.currentRoundNumber}/4`)
}

/** Reads the active local save through the page's real browser storage. */
export const readActiveSave = (page: Page): Promise<MatchSaveEnvelope | null> =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  }, MATCH_SAVE_STORAGE_KEY)
