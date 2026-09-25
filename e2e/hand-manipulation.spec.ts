import type { CDPSession, Locator, Page } from '@playwright/test'
import { cardLabel, sortCardsForDisplay } from '../src/components/cardPresentation'
import { MULTI_CARD_DISCARD_MESSAGE } from '../src/components/GameTable'
import { TOUCH_DRAG_DELAY_MS } from '../src/components/useHandDrag'
import { createBurracoDeck } from '../src/game/cards/deck'
import { createSeededRandom } from '../src/game/cards/shuffle'
import type { Card, Rank, Suit } from '../src/game/cards/types'
import { startMatch, type MatchState } from '../src/game/match'
import { validateMeld, type ValidatedMeld } from '../src/game/melds'
import { createSetupRoundFactory } from '../src/shell/matchSetup'
import {
  chooseBotSpeed,
  E2E_SEED,
  PLAYER_NAME,
  discardButton,
  discardPile,
  discardPileCards,
  expect,
  historyToggle,
  humanHandCards,
  openSavedMatch,
  readActiveSave,
  test,
} from './fixtures'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit): Card =>
  deck.find((candidate) => candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === 1)!
const meld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Invalid fixture meld: ${result.reason}`)
  return result.meld
}

const sevens = [card('seven', 'clubs'), card('seven', 'diamonds'), card('seven', 'hearts')]
const eights = [card('eight', 'clubs'), card('eight', 'diamonds'), card('eight', 'hearts')]
const nines = [card('nine', 'clubs'), card('nine', 'diamonds'), card('nine', 'hearts')]
const nineOfSpades = card('nine', 'spades')
const kingOfSpades = card('king', 'spades')
const queenOfClubs = card('queen', 'clubs')
/** A known, deliberately unsorted human hand for the direct-manipulation fixture. */
const fixtureHand = [
  kingOfSpades, ...sevens, nineOfSpades, card('three', 'diamonds'), card('four', 'hearts'), queenOfClubs,
  card('five', 'spades'),
]

/**
 * The seeded smazzata 1 with the human in the action phase holding `fixtureHand` and team 1
 * owning two melds (8s, 9s). Every physical card still exists exactly once — the chosen
 * cards are taken out of the dealt layout and the remainder refills it with the same sizes —
 * so the envelope passes the real M22 validation.
 */
const directManipulationMatch = (): MatchState => {
  const match = startMatch(createSetupRoundFactory({ humanPlayerName: PLAYER_NAME, roundCount: 4, botDifficulty: 'normal' }, createSeededRandom(E2E_SEED)))
  const round = match.currentRound
  const reserved = new Set([...fixtureHand, ...eights, ...nines].map(({ id }) => id))
  const pool = [
    ...round.players.flatMap(({ hand }) => hand),
    ...round.pozzetti.flat(),
    ...round.discardPile,
    ...round.drawPile,
  ].filter(({ id }) => !reserved.has(id))
  const take = (count: number) => pool.splice(0, count)
  const players = round.players.map((player) => ({
    ...player,
    hand: player.id === 'player-1' ? fixtureHand : take(player.hand.length),
  }))
  const pozzetti = round.pozzetti.map((pozzetto) => take(pozzetto.length))
  const discardPileCards = take(round.discardPile.length)
  return {
    ...match,
    currentRound: {
      ...round,
      players,
      teams: round.teams.map((team) => team.id === 'team-1' ? { ...team, melds: [meld(eights), meld(nines)] } : team),
      pozzetti: [pozzetti[0]!, pozzetti[1]!],
      discardPile: discardPileCards,
      drawPile: pool,
      round: {
        status: 'in-progress',
        turn: {
          currentPlayerId: 'player-1',
          phase: 'action',
          acquisition: { source: 'drawPile', cardIds: [card('five', 'spades').id] },
        },
      },
    },
  }
}

const handLabels = (page: Page) =>
  humanHandCards(page).evaluateAll((cards) => cards.map((element) => element.getAttribute('aria-label')))
const handCard = (page: Page, target: Card) => humanHandCards(page).and(page.getByRole('button', { name: cardLabel(target) }))
const sortedLabels = (cards: readonly Card[]) => sortCardsForDisplay(cards).map(cardLabel)
const ownMelds = (page: Page) => page.getByRole('region', { name: 'Calate squadra 1' })
const newMeldTarget = (page: Page) => ownMelds(page).getByRole('group', { name: 'Nuova calata' })
const ownMeld = (page: Page, index: number) => ownMelds(page).getByRole('article', { name: `Calata ${index} squadra 1` })
const ruleAlert = (page: Page) => page.getByRole('alert')

const centre = async (locator: Locator, xFraction = 0.5, yFraction = 0.5) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width * xFraction, y: box.y + box.height * yFraction }
}

/** A real mouse drag from `source` to a point of `target`, with the pointer moving in steps. */
const mouseDrag = async (page: Page, source: Locator, target: Locator, xFraction = 0.5, yFraction = 0.5) => {
  const from = await centre(source)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y - 10, { steps: 2 })
  const to = await centre(target, xFraction, yFraction)
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
}

const expectNoDocumentOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('desktop pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a pointer reorder survives unrelated rerenders and Ordina mano restores the sort', async ({ page }) => {
    const match = directManipulationMatch()
    await openSavedMatch(page, match)
    const saveBefore = await readActiveSave(page)
    const sorted = sortedLabels(fixtureHand)
    expect(await handLabels(page)).toEqual(sorted)

    // Drag the first card past the third one: a presentation-only reorder.
    await mouseDrag(page, humanHandCards(page).nth(0), humanHandCards(page).nth(2), 0.8)
    const manual = [sorted[1], sorted[2], sorted[0], ...sorted.slice(3)]
    await expect.poll(() => handLabels(page)).toEqual(manual)
    await expect(humanHandCards(page).first()).toHaveAttribute('aria-pressed', 'false')
    await expect(ruleAlert(page)).toHaveCount(0)

    await historyToggle(page).click()
    await historyToggle(page).click()
    await chooseBotSpeed(page, 'Veloce')
    await humanHandCards(page).nth(4).click()
    expect(await handLabels(page)).toEqual(manual)
    expect(await readActiveSave(page)).toEqual(saveBefore)

    await page.getByRole('button', { name: 'Ordina mano' }).click()
    expect(await handLabels(page)).toEqual(sorted)
    // The selection survives the sort and nothing was committed or saved.
    await expect(humanHandCards(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1)
    expect(await readActiveSave(page)).toEqual(saveBefore)
  })

  test('direct new meld, rejected drop, exact extension and discard go through the engine', async ({ page }) => {
    await openSavedMatch(page, directManipulationMatch())

    // New meld: select the three sevens, drag one of them to «Nuova calata».
    for (const seven of sevens) await handCard(page, seven).click()
    await expect(newMeldTarget(page)).toContainText('Trascina qui le carte')
    await mouseDrag(page, handCard(page, sevens[1]!), newMeldTarget(page))
    await expect(ownMeld(page, 3)).toBeVisible()
    await expect(ownMeld(page, 3).getByRole('img')).toHaveCount(3)
    await expect(humanHandCards(page)).toHaveCount(fixtureHand.length - 3)

    // Engine rejection: K♠ cannot extend the 8s. State, save and order stay unchanged.
    const saveBefore = await readActiveSave(page)
    const orderBefore = await handLabels(page)
    await mouseDrag(page, handCard(page, kingOfSpades), ownMeld(page, 1))
    await expect(ruleAlert(page)).toContainText('Le carte selezionate non formano una calata valida.')
    await expect(ownMeld(page, 1).getByRole('img')).toHaveCount(3)
    expect(await handLabels(page)).toEqual(orderBefore)
    expect(await readActiveSave(page)).toEqual(saveBefore)

    // Exact extension: 9♠ onto «Calata 2» (the 9s), never onto a neighbour.
    await mouseDrag(page, handCard(page, nineOfSpades), ownMeld(page, 2))
    await expect(ownMeld(page, 2).getByRole('img')).toHaveCount(4)
    await expect(ownMeld(page, 1).getByRole('img')).toHaveCount(3)
    await expect(ownMeld(page, 3).getByRole('img')).toHaveCount(3)
    await expect(ruleAlert(page)).toHaveCount(0)

    // Multi-card discard is refused before the engine; one card is discarded.
    await handCard(page, queenOfClubs).click()
    await handCard(page, kingOfSpades).click()
    await mouseDrag(page, handCard(page, queenOfClubs), discardPile(page), 0.3, 0.3)
    await expect(ruleAlert(page)).toContainText(MULTI_CARD_DISCARD_MESSAGE)
    await handCard(page, kingOfSpades).click()
    await mouseDrag(page, handCard(page, queenOfClubs), discardPile(page), 0.3, 0.3)
    await expect(discardPileCards(page).last()).toHaveAccessibleName(cardLabel(queenOfClubs))
    await expect(page.getByText('Turno di').locator('..')).toContainText('North')
    const saved = await readActiveSave(page)
    expect(saved?.match.currentRound.discardPile.at(-1)?.id).toBe(queenOfClubs.id)
  })
})

/** Real Chromium touch input through CDP: the browser still arbitrates scroll vs drag. */
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })

/**
 * Resolves once the page's scroll position has stopped changing. A native swipe leaves a
 * fling running after `touchEnd`; a touch that starts during a fling only stops it (Chrome
 * makes that `touchstart` non-cancelable), so the next gesture must wait for it to settle.
 */
const waitForScrollToSettle = async (page: Page) => {
  let previous = Number.NaN
  await expect.poll(async () => {
    const current = await page.evaluate(() => window.scrollY)
    const settled = current === previous
    previous = current
    return settled
  }, { intervals: [100] }).toBe(true)
}

/**
 * A long-press drag with explicit synchronisation at each stage: the press is delivered
 * before the fake clock runs the touch delay, the card is armed, the drag has really
 * started, and `target` is the active destination before the finger is lifted.
 */
const touchDrag = async (
  page: Page,
  cdp: CDPSession,
  source: Locator,
  target: Locator,
  activeTarget: Locator,
  xFraction = 0.5,
) => {
  await waitForScrollToSettle(page)
  const from = await centre(source)
  const to = await centre(target, xFraction, 0.3)
  // `dispatchTouchEvent` resolves once the renderer has handled the (blocking) touchstart,
  // so the pointerdown handler has scheduled the touch delay before the clock advances.
  await touch(cdp, 'touchStart', from.x, from.y)
  await expect(source).not.toHaveClass(/playing-card--armed/)
  await page.clock.runFor(TOUCH_DRAG_DELAY_MS)
  await expect(source).toHaveClass(/playing-card--armed/)
  const steps = 8
  for (let step = 1; step <= steps; step += 1) {
    await touch(cdp, 'touchMove', from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps)
    // The drag begins on the first move past the threshold and survives every later move.
    if (step === 1 || step === steps) await expect(page.locator('.drag-proxy')).toHaveText('1 carta')
  }
  await expect(activeTarget).toHaveAttribute('data-drop-state', 'active')
  await touch(cdp, 'touchEnd')
  await expect(page.locator('.drag-proxy')).toHaveCount(0)
}

for (const width of [375, 390]) {
  test.describe(`touch at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true })

    test('touch reorder and a direct discard work while the page still scrolls', async ({ page }) => {
      await openSavedMatch(page, directManipulationMatch())
      const cdp = await page.context().newCDPSession(page)
      const sorted = sortedLabels(fixtureHand)
      // Bring the discard pile and the hand into one viewport.
      await discardPile(page).evaluate((element) => {
        window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 40)
      })
      await expect(humanHandCards(page).first()).toBeInViewport()

      // A quick swipe on the page is still a native scroll, never a drag.
      const scrollBefore = await page.evaluate(() => window.scrollY)
      const hand = await centre(humanHandCards(page).first())
      await touch(cdp, 'touchStart', hand.x, hand.y)
      for (let step = 1; step <= 6; step += 1) await touch(cdp, 'touchMove', hand.x, hand.y - step * 25)
      await touch(cdp, 'touchEnd')
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore)
      await waitForScrollToSettle(page)
      await expect(page.locator('.drag-proxy')).toHaveCount(0)
      expect(await handLabels(page)).toEqual(sorted)
      await page.evaluate((y) => window.scrollTo(0, y), scrollBefore)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore)

      // Touch reorder inside the hand.
      const handZone = page.getByLabel(`Carte di ${PLAYER_NAME}`)
      await touchDrag(page, cdp, humanHandCards(page).nth(0), humanHandCards(page).nth(1), handZone, 0.9)
      await expect.poll(() => handLabels(page)).toEqual([sorted[1], sorted[0], ...sorted.slice(2)])
      await expect(humanHandCards(page).nth(1)).toHaveAttribute('aria-pressed', 'false')

      // Direct discard by touch.
      await touchDrag(page, cdp, handCard(page, queenOfClubs), discardPile(page), discardPile(page), 0.3)
      await expect(discardPileCards(page).last()).toHaveAccessibleName(cardLabel(queenOfClubs))
      await expect(humanHandCards(page)).toHaveCount(0)
      await expectNoDocumentOverflow(page)
    })
  })
}

test.describe('keyboard only', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('selection, reorder controls and every action button work without dragging', async ({ page }) => {
    await openSavedMatch(page, directManipulationMatch())
    const sorted = sortedLabels(fixtureHand)
    const moveLeft = page.getByRole('button', { name: 'Sposta a sinistra' })
    const moveRight = page.getByRole('button', { name: 'Sposta a destra' })
    await expect(moveLeft).toBeDisabled()
    await expect(moveRight).toBeDisabled()

    // Select the first card with the keyboard, then move it two steps right.
    await humanHandCards(page).first().focus()
    await page.keyboard.press('Space')
    await expect(humanHandCards(page).first()).toHaveAttribute('aria-pressed', 'true')
    await expect(moveLeft).toBeDisabled()
    await moveRight.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    expect(await handLabels(page)).toEqual([sorted[1], sorted[2], sorted[0], ...sorted.slice(3)])
    await moveLeft.focus()
    await page.keyboard.press('Enter')
    expect(await handLabels(page)).toEqual([sorted[1], sorted[0], ...sorted.slice(2)])
    await page.getByRole('button', { name: 'Ordina mano' }).focus()
    await page.keyboard.press('Enter')
    expect(await handLabels(page)).toEqual(sorted)
    await handCard(page, fixtureHand.find((held) => cardLabel(held) === sorted[0])!).focus()
    await page.keyboard.press('Space')

    // Meld, extension and discard through the native buttons only.
    for (const seven of sevens) {
      await handCard(page, seven).focus()
      await page.keyboard.press('Space')
    }
    await page.getByRole('button', { name: 'Cala', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(ownMeld(page, 3).getByRole('img')).toHaveCount(3)
    await handCard(page, nineOfSpades).focus()
    await page.keyboard.press('Space')
    await page.getByRole('button', { name: 'Aggiungi alla calata 2 della squadra 1' }).focus()
    await page.keyboard.press('Enter')
    await expect(ownMeld(page, 2).getByRole('img')).toHaveCount(4)
    await handCard(page, queenOfClubs).focus()
    await page.keyboard.press('Space')
    await discardButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(discardPileCards(page).last()).toHaveAccessibleName(cardLabel(queenOfClubs))
    await expectNoDocumentOverflow(page)
  })
})

test.describe('narrow fixture at 320 px', () => {
  test.use({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true })

  test('the hand tools and drop targets add no horizontal page overflow', async ({ page }) => {
    await openSavedMatch(page, directManipulationMatch())
    await expect(newMeldTarget(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ordina mano' })).toBeVisible()
    await expectNoDocumentOverflow(page)
    const tools = (await page.getByRole('group', { name: 'Ordine della mano' }).boundingBox())!
    const hand = (await page.getByLabel(`Carte di ${PLAYER_NAME}`).boundingBox())!
    // The tools sit below the hand, never over the card faces.
    expect(tools.y).toBeGreaterThanOrEqual(hand.y + hand.height - 1)
  })
})
