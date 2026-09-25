import type { Page } from '@playwright/test'
import { cardLabel, sortCardsForDisplay } from '../src/components/cardPresentation'
import { LEAVE_MATCH_CONFIRMATION } from '../src/components/GameTable'
import {
  leaveDialog,
  NORMAL_HANDOFF_DELAY_MS,
  PLAYER_NAME,
  completeNowButton,
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
    version: 2,
    setup: { humanPlayerName: PLAYER_NAME, roundCount: 4 },
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
    version: 2,
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
