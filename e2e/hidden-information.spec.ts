import type { Page } from '@playwright/test'
import { cardLabel, sortCardsForDisplay } from '../src/components/cardPresentation'
import { INITIAL_BOT_CHAIN_PROGRESS, playNextBotChainStep } from '../src/game/bot'
import type { Card } from '../src/game/cards/types'
import { createSeededRandom } from '../src/game/cards/shuffle'
import { discardCard, drawCard } from '../src/game/engine/turn'
import { startMatch } from '../src/game/match'
import type { GameState } from '../src/game/state/types'
import { createSetupRoundFactory } from '../src/shell/matchSetup'
import {
  E2E_SEED,
  NORMAL_BOT_DELAY_MS,
  PLAYER_NAME,
  drawAndDiscard,
  expect,
  humanHandCards,
  openSavedMatch,
  test,
  timelineEntries,
} from './fixtures'

/** Every card a player may legitimately see: own hand, discard pile and all melds. */
const publicCards = (state: GameState): readonly Card[] => [
  ...state.players.find(({ id }) => id === 'player-1')!.hand,
  ...state.discardPile,
  ...state.teams.flatMap(({ melds }) => melds.flatMap(({ cards }) => cards.map(({ card }) => card))),
]

const hiddenCards = (state: GameState): readonly Card[] => [
  ...state.players.filter(({ id }) => id !== 'player-1').flatMap(({ hand }) => hand),
  ...state.drawPile,
  ...state.pozzetti.flat(),
]

/**
 * No hidden physical card (bot hands, tallone, untaken pozzetti) may appear in the
 * rendered document: not in text, accessible names or any attribute. A card that was
 * public earlier (for example a collected discard) is exempt, as in the component suite.
 */
const expectHiddenCardsNotRendered = async (page: Page, state: GameState, everPublic: Set<string>) => {
  for (const card of publicCards(state)) everPublic.add(card.id)
  const html = await page.content()
  const leaked = hiddenCards(state)
    .filter((card) => !everPublic.has(card.id))
    .filter((card) => html.includes(cardLabel(card)) || html.includes(card.id))
  expect(leaked.map(cardLabel)).toEqual([])
}

test('opponent and partner hands stay hidden while the match is active', async ({ page }) => {
  const match = startMatch(createSetupRoundFactory({ humanPlayerName: PLAYER_NAME }, createSeededRandom(E2E_SEED)))
  const initial = match.currentRound
  const everPublic = new Set<string>()
  await openSavedMatch(page, match)

  // Bot seats expose only public identity and hand counts.
  for (const bot of initial.players.filter(({ id }) => id !== 'player-1')) {
    const seat = page.getByRole('region', { name: `Giocatore ${bot.name}` })
    await expect(seat.getByLabel('11 carte in mano')).toBeVisible()
    await expect(seat.getByRole('img')).toHaveCount(0)
    await expect(seat.getByRole('button')).toHaveCount(0)
  }
  await expect(humanHandCards(page)).toHaveCount(11)
  await expectHiddenCardsNotRendered(page, initial, everPublic)

  // The same boundary holds after a real human turn and one committed bot step.
  const discarded = sortCardsForDisplay(drawCard(initial, 'player-1').players[0]!.hand)[0]!
  const afterHuman = discardCard(drawCard(initial, 'player-1'), 'player-1', discarded.id)
  const afterBotStep = playNextBotChainStep(afterHuman, 'player-1', INITIAL_BOT_CHAIN_PROGRESS)!.state
  await drawAndDiscard(page)
  await expect(page.getByRole('button', { name: /^Raccogli il monte degli scarti/ })
    .getByRole('img', { name: cardLabel(discarded) })).toBeVisible()
  await expectHiddenCardsNotRendered(page, afterHuman, everPublic)

  await page.clock.runFor(NORMAL_BOT_DELAY_MS)
  await expect(timelineEntries(page)).toHaveCount(1)
  await expectHiddenCardsNotRendered(page, afterBotStep, everPublic)
})
