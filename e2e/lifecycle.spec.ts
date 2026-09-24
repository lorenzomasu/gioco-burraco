import {
  completeNowButton,
  drawAndDiscard,
  expect,
  roundIndicator,
  startNewMatch,
  test,
} from './fixtures'

/**
 * Upper bound on loop iterations (human turns, bot completions and round transitions)
 * for the whole match. A normal seeded match needs well under half of it; a regression
 * that stops progressing fails here instead of hanging CI.
 */
const MAX_LIFECYCLE_ITERATIONS = 400

test('one session plays all four smazzate through the real UI to the final result', async ({ page }) => {
  test.setTimeout(180_000)
  await startNewMatch(page)

  const nextRoundButton = page.getByRole('button', { name: /^Inizia smazzata \d$/ })
  const playAgainButton = page.getByRole('button', { name: 'Gioca ancora' })
  const enabledDrawPile = page.getByRole('button', { name: /^Pesca dal tallone/, disabled: false })
  const resultHeading = page.getByRole('heading', { level: 1, name: /^(Ha chiuso .+|Tallone esaurito)$/ })
  const completedRounds: number[] = []
  let roundNumber = 1

  for (let iteration = 0; ; iteration += 1) {
    expect(iteration, 'bounded four-smazzate lifecycle').toBeLessThan(MAX_LIFECYCLE_ITERATIONS)
    // With the paused clock only the test's own actions change the table, so exactly one
    // of these states is current when the assertion resolves.
    await expect(
      nextRoundButton.or(playAgainButton).or(completeNowButton(page)).or(enabledDrawPile).first(),
    ).toBeVisible()

    if (await playAgainButton.isVisible()) break

    if (await nextRoundButton.isVisible()) {
      await expect(resultHeading).toBeVisible()
      await expect(roundIndicator(page)).toHaveText(`Smazzata ${roundNumber}/4`)
      await expect(page.getByText(`Dopo ${roundNumber} smazzate`)).toBeVisible()
      await expect(nextRoundButton).toHaveText(`Inizia smazzata ${roundNumber + 1}`)
      completedRounds.push(roundNumber)
      await nextRoundButton.click()
      roundNumber += 1
      await expect(roundIndicator(page)).toHaveText(`Smazzata ${roundNumber}/4`)
      continue
    }

    if (await completeNowButton(page).isVisible()) {
      await completeNowButton(page).click()
      continue
    }

    await drawAndDiscard(page)
  }

  expect(completedRounds).toEqual([1, 2, 3])
  await expect(roundIndicator(page)).toHaveText('Smazzata 4/4')
  await expect(resultHeading).toBeVisible()
  await expect(page.getByText('Partita conclusa')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Risultato finale' })).toBeVisible()
  await expect(page.getByText(/^Match Points \d+$/)).toBeVisible()
  await expect(page.getByText(/(Prima la Squadra [12]\.|Parità esatta\.)$/)).toBeVisible()
  const victoryPoints = page.getByLabel('Victory Points')
  await expect(victoryPoints.getByText(/^\d+ VP$/)).toHaveCount(2)
  await expect(playAgainButton).toBeEnabled()
  await expect(page.getByRole('button', { name: /^Inizia smazzata/ })).toHaveCount(0)
})
