import { describe, expect, it } from 'vitest'
import { createBurracoDeck } from '../cards/deck'
import type { Card, Pozzetto, Rank, Suit } from '../cards/types'
import { validateMeld, type ValidatedMeld } from '../melds'
import { calculateRoundScore } from '../scoring'
import type { CompletedGameState, GameState, InProgressGameState, TeamId } from '../state/types'
import { GameRuleError, type GameErrorCode } from './errors'
import { extendMeld } from './extendMeld'
import { playMeld } from './playMeld'
import { UNPLAYABLE_DRAW_PILE_CARDS } from './roundClosure'
import { dealInitialState, getPlayer } from './startGame'
import { discardCard, drawCard, takeDiscardPile } from './turn'

const deck = createBurracoDeck()
const card = (rank: Rank, suit: Suit, deckNumber: 1 | 2 = 1): Card =>
  deck.find((candidate) =>
    candidate.rank === rank && candidate.suit === suit && candidate.deckNumber === deckNumber,
  )!
const joker = (): Card => deck.find((candidate) => candidate.rank === 'joker')!

const validatedMeld = (cards: readonly Card[]): ValidatedMeld => {
  const result = validateMeld(cards)
  if (!result.valid) throw new Error(`Expected a valid test meld, received ${result.reason}`)
  return result.meld
}

const cleanBurraco = (): ValidatedMeld => validatedMeld([
  card('three', 'spades'), card('four', 'spades'), card('five', 'spades'),
  card('six', 'spades'), card('seven', 'spades'), card('eight', 'spades'), card('nine', 'spades'),
])

/** The top card is the third-to-last: drawing it leaves only the unplayable stock. */
const thirdToLastStock = (top: Card): readonly Card[] => [
  top, card('jack', 'diamonds', 2), card('ten', 'diamonds', 2),
]

const mustDrawState = ({
  hand,
  drawPile,
  melds = [],
  hasTakenPozzetto = false,
  discardPile = [card('four', 'diamonds', 2)],
  pozzetti = [[card('ace', 'clubs', 2), card('queen', 'clubs', 2)], [card('queen', 'spades', 2)]],
}: {
  hand: readonly Card[]
  drawPile: readonly Card[]
  melds?: readonly ValidatedMeld[]
  hasTakenPozzetto?: boolean
  discardPile?: readonly Card[]
  pozzetti?: readonly [Pozzetto, Pozzetto]
}): InProgressGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => ({
      ...player,
      hand: player.id === 'player-1' ? hand : [],
    })),
    teams: initial.teams.map((team) => ({
      ...team,
      melds: team.id === 'team-1' ? melds : [],
      hasTakenPozzetto: team.id === 'team-1' ? hasTakenPozzetto : false,
    })),
    drawPile,
    discardPile,
    pozzetti,
    round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
  }
}

const teamById = (state: GameState, teamId: TeamId) =>
  state.teams.find((team) => team.id === teamId)!

const requireCompleted = (state: GameState): CompletedGameState => {
  if (state.round.status !== 'completed') throw new Error('Expected a completed round')
  return { ...state, round: state.round }
}

const expectRuleError = (action: () => unknown, code: GameErrorCode): void => {
  try {
    action()
    throw new Error('Expected a GameRuleError')
  } catch (error) {
    expect(error).toBeInstanceOf(GameRuleError)
    expect(error).toMatchObject({ code })
  }
}

describe('draw-pile exhaustion', () => {
  it('lets the player who draws the third-to-last card finish the turn, then ends the round on the discard', () => {
    const drawn = card('seven', 'clubs')
    const finalDiscard = card('king', 'diamonds')
    const kept = card('queen', 'hearts')
    const state = mustDrawState({
      hand: [card('five', 'clubs'), card('six', 'clubs'), card('six', 'hearts'), finalDiscard, kept],
      drawPile: thirdToLastStock(drawn),
      melds: [validatedMeld([card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts')])],
    })
    const before = structuredClone(state)

    const afterDraw = drawCard(state, 'player-1')
    expect(afterDraw.drawPile).toHaveLength(UNPLAYABLE_DRAW_PILE_CARDS)
    expect(afterDraw.round.turn).toMatchObject({ currentPlayerId: 'player-1', phase: 'action' })

    const afterMeld = playMeld(afterDraw, 'player-1', [
      card('five', 'clubs').id, card('six', 'clubs').id, drawn.id,
    ])
    const afterExtension = extendMeld(afterMeld, 'player-1', 0, [card('six', 'hearts').id])
    expect(afterExtension.round.status).toBe('in-progress')
    const beforeDiscard = structuredClone(afterExtension)

    const next = discardCard(afterExtension, 'player-1', finalDiscard.id)

    expect(next.round).toEqual({
      status: 'completed',
      ending: 'draw-pile-exhausted',
      lastDiscardPlayerId: 'player-1',
    })
    expect(next.discardPile.at(-1)).toBe(finalDiscard)
    expect(next.drawPile).toEqual(afterDraw.drawPile)
    expect(getPlayer(next, 'player-1').hand).toEqual([kept])
    expect(teamById(next, 'team-1').melds).toHaveLength(2)
    expect(state).toEqual(before)
    expect(afterExtension).toEqual(beforeDiscard)
  })

  it('does not end the round while more than two stock cards remain', () => {
    const drawn = card('seven', 'clubs')
    const state = mustDrawState({
      hand: [card('king', 'diamonds'), card('queen', 'hearts')],
      drawPile: [drawn, ...thirdToLastStock(card('eight', 'clubs'))],
    })

    const next = discardCard(drawCard(state, 'player-1'), 'player-1', card('king', 'diamonds').id)

    expect(next.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: 'player-2', phase: 'mustDraw' },
    })
  })

  it('rejects every gameplay command after the round ends by exhaustion', () => {
    const state = mustDrawState({
      hand: [card('king', 'diamonds'), card('queen', 'hearts'), card('queen', 'hearts', 2)],
      drawPile: thirdToLastStock(card('seven', 'clubs')),
      melds: [validatedMeld([card('three', 'hearts'), card('four', 'hearts'), card('five', 'hearts')])],
    })
    const completed = discardCard(drawCard(state, 'player-1'), 'player-1', card('king', 'diamonds').id)
    expect(completed.round).toMatchObject({ status: 'completed', ending: 'draw-pile-exhausted' })
    const before = structuredClone(completed)

    expectRuleError(() => drawCard(completed, 'player-2'), 'ROUND_COMPLETED')
    expectRuleError(() => takeDiscardPile(completed, 'player-2'), 'ROUND_COMPLETED')
    expectRuleError(() => discardCard(completed, 'player-1', card('queen', 'hearts').id), 'ROUND_COMPLETED')
    expectRuleError(() => playMeld(completed, 'player-1', [
      card('queen', 'hearts').id, card('queen', 'hearts', 2).id, card('seven', 'clubs').id,
    ]), 'ROUND_COMPLETED')
    expectRuleError(() => extendMeld(completed, 'player-1', 0, [card('seven', 'clubs').id]), 'ROUND_COMPLETED')
    expect(completed).toEqual(before)
  })

  it('applies an ordinary closure, with its bonus, when the exhausting discard is a valid closure', () => {
    const drawn = card('ten', 'spades')
    const finalDiscard = card('king', 'clubs')
    const state = mustDrawState({
      hand: [finalDiscard],
      drawPile: thirdToLastStock(drawn),
      melds: [cleanBurraco()],
      hasTakenPozzetto: true,
    })

    const extended = extendMeld(drawCard(state, 'player-1'), 'player-1', 0, [drawn.id])
    const next = discardCard(extended, 'player-1', finalDiscard.id)

    expect(next.round).toEqual({
      status: 'completed',
      ending: 'closure',
      closedByPlayerId: 'player-1',
      closingTeamId: 'team-1',
    })
    const score = calculateRoundScore(requireCompleted(next))
    expect(score.teams.map(({ teamId, closingBonus }) => ({ teamId, closingBonus }))).toEqual([
      { teamId: 'team-1', closingBonus: 100 },
      { teamId: 'team-2', closingBonus: 0 },
    ])
  })

  it('takes the pozzetto with the exhausting discard and scores its unplayed cards as hand penalty', () => {
    const drawn = card('nine', 'spades')
    const finalDiscard = card('king', 'diamonds')
    const pozzetto = [card('ace', 'clubs'), joker(), card('four', 'hearts')]
    const state = mustDrawState({
      hand: [card('eight', 'spades'), finalDiscard],
      drawPile: thirdToLastStock(drawn),
      melds: [validatedMeld([card('five', 'spades'), card('six', 'spades'), card('seven', 'spades')])],
      pozzetti: [pozzetto, [card('queen', 'clubs')]],
    })

    const extended = extendMeld(drawCard(state, 'player-1'), 'player-1', 0, [
      card('eight', 'spades').id, drawn.id,
    ])
    const next = discardCard(extended, 'player-1', finalDiscard.id)

    expect(next.round).toEqual({
      status: 'completed',
      ending: 'draw-pile-exhausted',
      lastDiscardPlayerId: 'player-1',
    })
    expect(teamById(next, 'team-1').hasTakenPozzetto).toBe(true)
    expect(getPlayer(next, 'player-1').hand).toEqual(pozzetto)
    expect(next.pozzetti).toEqual([[], [card('queen', 'clubs')]])

    // team-1: 5♠ 6♠ 7♠ (5 each) + 8♠ 9♠ (10 each) = 35 melded; pozzetto A♣ 15 + joker 30 + 4♥ 5 = 50 in hand.
    // team-2: nothing melded or in hand, but it did not take a pozzetto while team-1 did.
    expect(calculateRoundScore(requireCompleted(next)).teams).toEqual([
      {
        teamId: 'team-1',
        meldCardPoints: 35,
        burracoBonus: 0,
        closingBonus: 0,
        handPenalty: 50,
        pozzettoPenalty: 0,
        total: -15,
      },
      {
        teamId: 'team-2',
        meldCardPoints: 0,
        burracoBonus: 0,
        closingBonus: 0,
        handPenalty: 0,
        pozzettoPenalty: 100,
        total: -100,
      },
    ])
  })

  it('does not end the round when the player takes the discard pile instead of the third-to-last card', () => {
    const collected = card('seven', 'hearts')
    const state = mustDrawState({
      hand: [card('king', 'diamonds'), card('queen', 'hearts')],
      drawPile: thirdToLastStock(card('seven', 'clubs')),
      discardPile: [collected],
    })

    const afterTake = takeDiscardPile(state, 'player-1')
    const next = discardCard(afterTake, 'player-1', card('king', 'diamonds').id)

    expect(next.drawPile).toEqual(state.drawPile)
    expect(next.round).toEqual({
      status: 'in-progress',
      turn: { currentPlayerId: 'player-2', phase: 'mustDraw' },
    })
  })
})
