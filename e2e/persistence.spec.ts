import type { Page } from '@playwright/test'
import { MATCH_SAVE_STORAGE_KEY } from '../src/shell/matchPersistence'
import { cardLabel, sortCardsForDisplay } from '../src/components/cardPresentation'
import { LEAVE_MATCH_CONFIRMATION } from '../src/components/GameTable'
import {
  leaveDialog,
  NORMAL_HANDOFF_DELAY_MS,
  PLAYER_NAME,
  completeNowButton,
  difficultyRadio,
  discardPileCards,
  drawAndDiscard,
  drawPileButton,
  expect,
  humanHandCards,
  newMatchButton,
  onboardingHeading,
  readActiveSave,
  roundIndicator,
  startNewMatch,
  test,
  historyToggle,
  timelineEntries,
} from './fixtures'

const pileLabels = (page: Page) =>
  discardPileCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
const handLabels = (page: Page) =>
  humanHandCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')))
const savedTurnOwner = async (page: Page) => {
  const save = await readActiveSave(page)
  const round = save?.match.currentRound.round
  return round?.status === 'in-progress' ? round.turn.currentPlayerId : null
}

test('committed progress survives a reload and play continues', async ({ page }) => {
  await startNewMatch(page)
  await drawAndDiscard(page)
  await completeNowButton(page).click()
  await expect(drawPileButton(page)).toBeEnabled()

  const save = await readActiveSave(page)
  expect(save).toMatchObject({
    version: 3,
    setup: { humanPlayerName: PLAYER_NAME, roundCount: 4, botDifficulty: 'normal' },
    match: { roundCount: 4, status: 'in-progress' },
  })
  expect(await savedTurnOwner(page)).toBe('player-1')
  const tallone = await drawPileButton(page).getAttribute('aria-label')
  const discards = await pileLabels(page)
  expect(discards.length).toBeGreaterThan(0)
  const hand = await handLabels(page)
  expect(tallone).not.toBe('Pesca dal tallone, 41 carte rimaste')

  await page.reload()

  // The same active match resumes instead of onboarding, with its committed progress.
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await expect(onboardingHeading(page)).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: PLAYER_NAME })).toBeVisible()
  await expect(drawPileButton(page)).toHaveAttribute('aria-label', tallone!)
  await expect(discardPileCards(page)).toHaveCount(discards.length)
  expect(await pileLabels(page)).toEqual(discards)
  // The same physical cards; the M29 presentation order is transient, so a reload reseeds
  // it from the deterministic display sort of the saved hand.
  expect([...await handLabels(page)].sort()).toEqual([...hand].sort())
  expect(await handLabels(page)).toEqual(
    sortCardsForDisplay(save!.match.currentRound.players.find(({ id }) => id === 'player-1')!.hand).map(cardLabel),
  )

  // At least one more legal action is accepted after the reload.
  await drawAndDiscard(page)
  await expect(completeNowButton(page)).toBeVisible()
  expect(await savedTurnOwner(page)).not.toBe('player-1')
})

test('a selected three-smazzate match survives a reload with the same total', async ({ page }) => {
  await startNewMatch(page, PLAYER_NAME, 3)
  await drawAndDiscard(page)
  await completeNowButton(page).click()
  await expect(drawPileButton(page)).toBeEnabled()
  expect(await readActiveSave(page)).toMatchObject({
    version: 3,
    setup: { roundCount: 3 },
    match: { roundCount: 3, currentRoundNumber: 1 },
  })

  await page.reload()

  await expect(onboardingHeading(page)).toBeHidden()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/3')
  await expect(page.getByRole('status')).toHaveText(/Partita ripresa · Smazzata 1\/3/)
  await drawAndDiscard(page)
  expect(await readActiveSave(page)).toMatchObject({ match: { roundCount: 3 } })
})

test('onboarding defaults to Normale and a Facile match keeps its difficulty across a reload', async ({ page }) => {
  await page.goto('/')
  await expect(onboardingHeading(page)).toBeVisible()
  await expect(difficultyRadio(page, 'Normale')).toBeChecked()
  await expect(difficultyRadio(page, 'Facile')).not.toBeChecked()

  await startNewMatch(page, PLAYER_NAME, undefined, 'Facile')
  expect(await readActiveSave(page)).toMatchObject({ version: 3, setup: { botDifficulty: 'easy' } })
  await drawAndDiscard(page)
  await completeNowButton(page).click()
  await expect(drawPileButton(page)).toBeEnabled()

  await page.reload()

  await expect(onboardingHeading(page)).toBeHidden()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await drawAndDiscard(page)
  await completeNowButton(page).click()
  await expect(drawPileButton(page)).toBeEnabled()
  expect(await readActiveSave(page)).toMatchObject({
    version: 3,
    setup: { humanPlayerName: PLAYER_NAME, roundCount: 4, botDifficulty: 'easy' },
  })
})

test('a reload during bot playback resumes the pending chain from the committed match', async ({ page }) => {
  await startNewMatch(page)
  await drawAndDiscard(page)
  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS)
  await expect(timelineEntries(page)).toHaveCount(1)
  await expect.poll(() => savedTurnOwner(page)).not.toBe('player-1')
  const pendingTallone = await drawPileButton(page).getAttribute('aria-label')

  await page.reload()

  // Only the committed match was saved: timers, timeline and progress counters restart fresh.
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await expect(page.getByText('Bot in gioco…')).toBeVisible()
  await expect(completeNowButton(page)).toBeVisible()
  await expect(timelineEntries(page)).toHaveCount(0)
  await expect(drawPileButton(page)).toHaveAttribute('aria-label', pendingTallone!)

  // Real time again: the recreated playback finishes the chain on its own timers.
  await page.clock.resume()
  await expect(drawPileButton(page)).toBeEnabled({ timeout: 30_000 })
  await historyToggle(page).click()
  await expect(timelineEntries(page).first()).toBeVisible()
  await expect(humanHandCards(page)).toHaveCount(11)
  await drawPileButton(page).click()
  await expect(humanHandCards(page)).toHaveCount(12)
})

test('a confirmed Nuova partita during bot playback returns to a stable onboarding', async ({ page }) => {
  await startNewMatch(page)
  await drawAndDiscard(page)
  // The first bot step is scheduled but has not fired yet.
  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS - 50)
  await expect(completeNowButton(page)).toBeVisible()
  await expect(timelineEntries(page)).toHaveCount(0)
  expect(await readActiveSave(page)).not.toBeNull()

  await newMatchButton(page).click()
  await expect(leaveDialog(page)).toContainText(LEAVE_MATCH_CONFIRMATION)
  // The open confirmation holds the pending bot step.
  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS * 2)
  await expect(timelineEntries(page)).toHaveCount(0)
  await leaveDialog(page).getByRole('button', { name: 'Abbandona partita' }).click()

  await expect(onboardingHeading(page)).toBeVisible()
  expect(await readActiveSave(page)).toBeNull()

  // Explicitly advance well past the old pending step boundary: no stale callback may
  // mutate onboarding or write a save.
  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS * 5)
  await expect(onboardingHeading(page)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tavolo di Burraco' })).toHaveCount(0)
  await expect(page.getByLabel('Il tuo nome')).toHaveValue(PLAYER_NAME)
  expect(await readActiveSave(page)).toBeNull()

  // The replacement match starts clean.
  await page.getByRole('button', { name: 'Inizia partita' }).click()
  await expect(roundIndicator(page)).toHaveText('Smazzata 1/4')
  await expect(timelineEntries(page)).toHaveCount(0)
  await expect(humanHandCards(page)).toHaveCount(11)
  await expect(drawPileButton(page)).toBeEnabled()
  await page.clock.runFor(NORMAL_HANDOFF_DELAY_MS * 5)
  await expect(timelineEntries(page)).toHaveCount(0)
})

/**
 * M38: the released legacy wire formats the current migration layer accepts are restored
 * through the real application boundary. Each legacy save is derived from a real committed
 * match by removing exactly the fields its version never had.
 */
type Wire = { version: number; setup: Record<string, unknown>; match: Record<string, unknown> }
const LEGACY_SAVES = [
  {
    // Released v1.1.x: no length, no difficulty; always four smazzate against the normal bots.
    version: 1,
    roundCount: 4 as const,
    toLegacy: ({ setup: { roundCount: _length, botDifficulty: _difficulty, ...setup }, match: { roundCount: _matchLength, ...match } }: Wire) =>
      ({ version: 1, setup, match }),
  },
  {
    // Pre-release v1.2 (M34 on `main`): explicit length, no difficulty; always the normal bots.
    version: 2,
    roundCount: 3 as const,
    toLegacy: ({ setup: { botDifficulty: _difficulty, ...setup }, match }: Wire) => ({ version: 2, setup, match }),
  },
]

const writeRawSave = (page: Page, raw: string) =>
  page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [MATCH_SAVE_STORAGE_KEY, raw] as const)

for (const { version, roundCount, toLegacy } of LEGACY_SAVES) {
  test(`a released schema-v${version} save resumes and continues as a current schema-v3 save`, async ({ page }) => {
    await startNewMatch(page, PLAYER_NAME, roundCount)
    await drawAndDiscard(page)
    await completeNowButton(page).click()
    await expect(drawPileButton(page)).toBeEnabled()
    const current = (await readActiveSave(page)) as unknown as Wire
    const legacy = toLegacy(current)
    expect(legacy.version).toBe(version)
    const tallone = await drawPileButton(page).getAttribute('aria-label')
    const discards = await pileLabels(page)

    await writeRawSave(page, JSON.stringify(legacy))
    await page.reload()

    // The normal resume path, with the historical semantics: its length and the normal bots.
    await expect(onboardingHeading(page)).toBeHidden()
    await expect(page.getByRole('status')).toHaveText(new RegExp(`Partita ripresa · Smazzata 1/${roundCount}`))
    await expect(roundIndicator(page)).toHaveText(`Smazzata 1/${roundCount}`)
    await expect(page.getByRole('heading', { level: 1, name: PLAYER_NAME })).toBeVisible()
    await expect(drawPileButton(page)).toHaveAttribute('aria-label', tallone!)
    expect(await pileLabels(page)).toEqual(discards)

    // One ordinary committed action rewrites the save in the current schema.
    await drawAndDiscard(page)
    await expect(completeNowButton(page)).toBeVisible()
    expect(await savedTurnOwner(page)).not.toBe('player-1')
    const rewritten = await readActiveSave(page)
    expect(rewritten).toMatchObject({
      version: 3,
      setup: { humanPlayerName: PLAYER_NAME, roundCount, botDifficulty: 'normal' },
      match: { roundCount, status: 'in-progress', currentRoundNumber: 1 },
    })
    expect(Object.keys(rewritten!.setup).sort()).toEqual(['botDifficulty', 'humanPlayerName', 'roundCount'])
  })
}

test('malformed or unsupported legacy saves are discarded safely to onboarding', async ({ page }) => {
  await startNewMatch(page)
  const current = (await readActiveSave(page)) as unknown as Wire
  const [v1, v2] = LEGACY_SAVES.map(({ toLegacy }) => toLegacy(current))
  const invalid = [
    'not json',
    // A version-1 save cannot carry fields its version never had.
    JSON.stringify({ ...v1, setup: { ...v1!.setup, roundCount: 4 } }),
    // A version-2 save cannot carry a difficulty.
    JSON.stringify({ ...v2, setup: { ...v2!.setup, botDifficulty: 'easy' } }),
    // A legacy save still passes the full current state validation.
    JSON.stringify({ ...v1, match: { ...v1!.match, currentRoundNumber: 5 } }),
    // Unknown versions are never reinterpreted.
    JSON.stringify({ ...current, version: 0 }),
    JSON.stringify({ ...current, version: 4 }),
  ]

  for (const raw of invalid) {
    await writeRawSave(page, raw)
    await page.reload()
    await expect(onboardingHeading(page)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tavolo di Burraco' })).toHaveCount(0)
    expect(await readActiveSave(page)).toBeNull()
  }
})
