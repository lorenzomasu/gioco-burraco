import type { Locator, Page } from '@playwright/test'
import { cardLabel } from '../src/components/cardPresentation'
import type { Card } from '../src/game/cards/types'
import { denseMeldMatch } from '../src/tests/denseTable'
import { discardButton, expect, humanHandCards, openSavedMatch, test } from './fixtures'

/*
 * M33.1 table flow and adaptive meld density in a real browser: a committed, save-valid
 * stress table (seven melds per team, 12-card wildcard sequences, Burraco, a pinella) is
 * restored at every supported width.
 */
const dense = denseMeldMatch()
const state = dense.currentRound
const human = state.players.find(({ id }) => id === 'player-1')!
const handCard = (page: Page, rank: Card['rank'], suit: Card['suit']) => {
  const card = human.hand.find((candidate) => candidate.rank === rank && candidate.suit === suit)!
  return humanHandCards(page, human.name).and(page.getByRole('button', { name: cardLabel(card) }))
}
const teamArea = (page: Page, team: 1 | 2) => page.getByRole('region', { name: `Calate squadra ${team}` })
const ownMeld = (page: Page, index: number) => teamArea(page, 1).getByRole('article', { name: `Calata ${index} squadra 1` })

const openDenseTable = (page: Page) => openSavedMatch(page, dense, human.name)

const expectNoDocumentOverflow = async (page: Page) => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/**
 * No meld list or meld card row is a scroll container or holds hidden overflow, and within
 * each row every overlapped card still exposes its rank/suit corner.
 */
const layoutFacts = (page: Page) => page.evaluate(() => {
  const scrolling = [...document.querySelectorAll('.meld-list, .meld__cards')].filter((element) => {
    const style = getComputedStyle(element)
    return ['auto', 'scroll', 'hidden'].includes(style.overflowX) || ['auto', 'scroll', 'hidden'].includes(style.overflowY)
      || element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
  }).length
  const coveredCorners: string[] = []
  const outsideMeld: string[] = []
  for (const row of document.querySelectorAll('.meld__cards')) {
    const meld = row.closest('.meld')!.getBoundingClientRect()
    const cards = [...row.querySelectorAll<HTMLElement>('.playing-card')]
    cards.forEach((card, index) => {
      const box = card.getBoundingClientRect()
      if (box.left < meld.left - 1 || box.right > meld.right + 1) outsideMeld.push(card.getAttribute('aria-label')!)
      const next = cards[index + 1]?.getBoundingClientRect()
      const corner = card.querySelector('.playing-card__corner')!.getBoundingClientRect()
      // Only a following card on the same row can cover this corner.
      if (next && Math.abs(next.top - box.top) < 2 && next.left < corner.right - .5) {
        coveredCorners.push(card.getAttribute('aria-label')!)
      }
    })
  }
  return { scrolling, coveredCorners, outsideMeld }
})

const expectEveryPublicMeldCard = async (page: Page) => {
  for (const [index, team] of state.teams.entries()) {
    const area = teamArea(page, (index + 1) as 1 | 2)
    await expect(area.getByRole('article')).toHaveCount(team.melds.length)
    for (const [meldIndex, meld] of team.melds.entries()) {
      const article = area.getByRole('article', { name: `Calata ${meldIndex + 1} squadra ${index + 1}` })
      const images = article.getByRole('img')
      await expect(images).toHaveCount(meld.cards.length)
      for (const card of await images.all()) await expect(card).toBeVisible()
    }
  }
}

/**
 * Brings one team's meld area to the top of the viewport (page scrolling between table
 * regions is allowed) and measures it there. `toBeVisible()` alone is not enough: an
 * element below the fold is still "visible", so these are real viewport geometries.
 */
const meldAreaInViewport = (page: Page, team: 1 | 2) => page.evaluate((label) => {
  const area = document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!
  area.scrollIntoView({ block: 'start' })
  const viewport = window.innerHeight
  const rect = (element: Element) => element.getBoundingClientRect()
  const inside = (element: Element) => rect(element).top >= -0.5 && rect(element).bottom <= viewport + 0.5
  const melds = [...area.querySelectorAll('article')]
  const cards = [...area.querySelectorAll('.meld__cards .playing-card')]
  return {
    viewport,
    areaHeight: rect(area).height,
    areaInside: inside(area),
    firstMeldInside: inside(melds[0]!),
    lastMeldInside: inside(melds.at(-1)!),
    // Every meld and card of the team is inside the same viewport span at once.
    meldsOutside: melds.filter((meld) => !inside(meld)).map((meld) => meld.getAttribute('aria-label')),
    cardsOutside: cards.filter((card) => !inside(card)).length,
    cardCount: cards.length,
  }
}, `Calate squadra ${team}`)

const primaryControls = (page: Page): readonly Locator[] => [
  page.getByRole('button', { name: 'Cala', exact: true }),
  discardButton(page),
  page.getByRole('button', { name: 'Impostazioni' }),
  page.getByRole('button', { name: 'Come si gioca' }),
  page.getByRole('button', { name: 'Nuova partita' }),
  page.getByRole('button', { name: /^Cronologia bot/ }),
]

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test.describe(`${viewport.width} px`, () => {
    test.use({ viewport })

    test('the stress table shows every meld and card identity without local meld scrolling', async ({ page }) => {
      await openDenseTable(page)
      await expectNoDocumentOverflow(page)
      await expectEveryPublicMeldCard(page)

      // Each team's complete meld area fits one viewport-height span: first and last meld
      // (and every card) are inspectable together without further page scrolling.
      for (const team of [1, 2] as const) {
        const area = await meldAreaInViewport(page, team)
        expect(area.areaHeight).toBeLessThanOrEqual(area.viewport)
        expect(area.areaInside).toBe(true)
        expect(area.firstMeldInside).toBe(true)
        expect(area.lastMeldInside).toBe(true)
        expect(area.meldsOutside).toEqual([])
        expect(area.cardsOutside).toBe(0)
        expect(area.cardCount).toBe(state.teams[team - 1]!.melds.reduce((total, meld) => total + meld.cards.length, 0))
      }

      const facts = await layoutFacts(page)
      expect(facts.scrolling).toBe(0)
      expect(facts.coveredCorners).toEqual([])
      expect(facts.outsideMeld).toEqual([])

      // Burraco classification and wildcard meaning stay in text.
      await expect(teamArea(page, 1).getByText('Sporco')).toBeVisible()
      await expect(teamArea(page, 1).getByText('Pulito')).toBeVisible()
      await expect(teamArea(page, 1).getByText('Matta → 8')).toBeVisible()
      await expect(teamArea(page, 2).getByText('Matta → 7')).toBeVisible()

      // Primary and secondary controls stay reachable with a 44 px touch height.
      for (const control of primaryControls(page)) {
        await control.scrollIntoViewIfNeeded()
        await expect(control).toBeVisible()
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
      }
      // The compact extension controls keep a 44 × 44 px hit area around their centre.
      for (const extend of await teamArea(page, 1).getByRole('button', { name: /^Aggiungi alla calata/ }).all()) {
        const hits = await extend.evaluate((button) => {
          // Centred, so every probe point lies inside the viewport.
          button.scrollIntoView({ block: 'center', inline: 'center' })
          const box = button.getBoundingClientRect()
          const x = box.left + box.width / 2
          const y = box.top + box.height / 2
          return [[x - 21, y - 21], [x + 21, y - 21], [x - 21, y + 21], [x + 21, y + 21]]
            .map(([px, py]) => button.contains(document.elementFromPoint(px!, py!)))
        })
        expect(hits).toEqual([true, true, true, true])
      }
    })

    test('own-team melds stay keyboard and pointer extension destinations after density changes', async ({ page }) => {
      await openDenseTable(page)

      // Keyboard: select the fourth king and extend «Calata 2» with its extension control.
      await handCard(page, 'king', 'hearts').focus()
      await page.keyboard.press('Enter')
      const extendKings = page.getByRole('button', { name: 'Aggiungi alla calata 2 della squadra 1' })
      await extendKings.focus()
      await page.keyboard.press('Enter')
      await expect(ownMeld(page, 2).getByRole('img')).toHaveCount(4)

      // Pointer: drag the ten of clubs onto the clean clubs sequence («Calata 5»).
      const source = handCard(page, 'ten', 'clubs')
      await source.scrollIntoViewIfNeeded()
      const from = (await source.boundingBox())!
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 - 10, { steps: 2 })
      const target = ownMeld(page, 5)
      await target.scrollIntoViewIfNeeded()
      const to = (await target.boundingBox())!
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
      await expect(target).toHaveAttribute('data-drop-state', 'active')
      await page.mouse.up()
      await expect(ownMeld(page, 5).getByRole('img')).toHaveCount(8)
      await expectNoDocumentOverflow(page)
      expect((await layoutFacts(page)).scrolling).toBe(0)
    })
  })
}

test.describe('seating', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the teammate sits opposite and the opponents left/right in clockwise order', async ({ page }) => {
    await openDenseTable(page)
    const box = async (name: string) => (await page.getByRole('region', { name: `Giocatore ${name}` }).boundingBox())!
    const [left, top, right] = [await box('North'), await box('Partner'), await box('South')]
    const hand = (await page.getByRole('region', { name: `Mano di ${human.name}` }).boundingBox())!

    expect(top.y + top.height).toBeLessThan(left.y)
    expect(top.y + top.height).toBeLessThan(right.y)
    expect(left.x + left.width).toBeLessThan(top.x)
    expect(top.x + top.width).toBeLessThan(right.x)
    expect(Math.max(left.y, right.y)).toBeLessThan(hand.y)
    await expect(page.getByRole('region', { name: 'Giocatore Partner' })).toContainText('Compagno')
  })
})
