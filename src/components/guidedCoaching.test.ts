import { describe, expect, it } from 'vitest'
import { GAME_ERROR_CODES } from '../game/engine/errors'
import { deriveCoaching, REJECTION_COACHING, type CoachingFacts } from './guidedCoaching'

const none = { ownTeam: false, opponentTeam: false } as const

/** Human draw phase with both acquisition controls enabled; every fact is public. */
const facts = (overrides: Partial<CoachingFacts> = {}): CoachingFacts => ({
  isBotPlaying: false,
  automationFailed: false,
  phase: 'mustDraw',
  canDrawStock: true,
  canTakeDiscardPile: true,
  selectedCount: 0,
  hasTeamMelds: false,
  rejectionCode: null,
  pozzettoTaken: none,
  burracoReached: none,
  ...overrides,
})

const action = (overrides: Partial<CoachingFacts> = {}) =>
  facts({ phase: 'action', canDrawStock: false, canTakeDiscardPile: false, ...overrides })

describe('deriveCoaching (M36)', () => {
  it('explains the human acquisition step from the actual enabled pile controls', () => {
    expect(deriveCoaching(facts()).now).toMatch(/pesca dal tallone oppure raccogli tutto il monte degli scarti/)
    expect(deriveCoaching(facts({ canTakeDiscardPile: false })).now).toMatch(/pesca dal tallone \(il monte degli scarti è vuoto\)/)
    expect(deriveCoaching(facts({ canDrawStock: false })).now).toMatch(/il tallone è vuoto, raccogli il monte/)
    const neither = deriveCoaching(facts({ canDrawStock: false, canTakeDiscardPile: false }))
    expect(neither.now).toBe('Tocca a te, ma al momento nessuna pesca è disponibile.')
    for (const coaching of [deriveCoaching(facts()), neither]) {
      expect(coaching.unavailable).toEqual([
        '«Cala» e «Scarta e passa» si attivano solo dopo che hai pescato o raccolto gli scarti.',
      ])
      expect(coaching.reminder).toBeNull()
    }
  })

  it('explains the action phase with no selection, mentioning extension only with own melds', () => {
    const withoutMelds = deriveCoaching(action())
    expect(withoutMelds.now).toMatch(/^Seleziona carte per provare «Cala», oppure una sola carta per «Scarta e passa»\.$/)
    expect(withoutMelds.now).not.toMatch(/tua calata/)
    expect(withoutMelds.unavailable).toEqual([
      '«Cala» richiede almeno una carta selezionata.',
      '«Scarta e passa» richiede esattamente una carta selezionata.',
    ])
    expect(withoutMelds.reminder).toBe('La chiusura della smazzata avviene sempre con lo scarto finale.')
    expect(deriveCoaching(action({ hasTeamMelds: true })).now).toMatch(/aggiungerle a una tua calata/)
  })

  it('offers the discard for exactly one card without claiming a one-card meld is legal', () => {
    const coaching = deriveCoaching(action({ selectedCount: 1 }))
    expect(coaching.now).toMatch(/^«Scarta e passa» scarta la carta selezionata e finisce il turno/)
    expect(coaching.now).toMatch(/provare a calarla: decide il gioco\./)
    expect(coaching.unavailable).toEqual([])
    expect(deriveCoaching(action({ selectedCount: 1, hasTeamMelds: true })).now)
      .toMatch(/aggiungerla a una tua calata/)
  })

  it('explains the discard contract for several selected cards without predicting the meld', () => {
    const coaching = deriveCoaching(action({ selectedCount: 3 }))
    expect(coaching.now).toMatch(/^Con 3 carte selezionate prova «Cala»/)
    expect(coaching.now).toMatch(/decide il gioco se è valida/)
    expect(coaching.unavailable).toEqual(['«Scarta e passa» richiede esattamente una carta selezionata.'])
  })

  it('keeps bot turns to the public flow and Completa subito', () => {
    const coaching = deriveCoaching(facts({ isBotPlaying: true, canDrawStock: false, canTakeDiscardPile: false }))
    expect(coaching.now).toMatch(/I bot giocano una mossa alla volta/)
    expect(coaching.now).toMatch(/«Completa subito»/)
    expect(coaching.unavailable).toEqual([])
    expect(coaching.reminder).toBeNull()
  })

  it('explains only rejections the engine already produced', () => {
    expect(deriveCoaching(action()).context).toBeNull()
    for (const code of [
      'INVALID_TURN_PHASE',
      'EMPTY_CARD_SELECTION',
      'INVALID_MELD',
      'CANNOT_REDISCARD_SINGLE_COLLECTED_CARD',
      'CANNOT_CLOSE_WITHOUT_BURRACO',
      'CANNOT_CLOSE_WITH_WILDCARD',
      'CANNOT_CLOSE_WITHOUT_DISCARD',
    ] as const) {
      expect(deriveCoaching(action({ rejectionCode: code })).context).toBe(REJECTION_COACHING[code])
    }
    expect(Object.keys(REJECTION_COACHING).every((code) => (GAME_ERROR_CODES as readonly string[]).includes(code)))
      .toBe(true)
    // A code without extra coaching keeps only the alert.
    expect(deriveCoaching(action({ rejectionCode: 'NOT_CURRENT_PLAYER' })).context).toBeNull()
  })

  it('explains committed public pozzetto events for either side', () => {
    expect(deriveCoaching(action({ pozzettoTaken: { ownTeam: true, opponentTeam: false } })).context)
      .toMatch(/La tua squadra ha preso il pozzetto: è la vostra seconda mano/)
    expect(deriveCoaching(facts({ isBotPlaying: true, pozzettoTaken: { ownTeam: false, opponentTeam: true } })).context)
      .toBe('Gli avversari hanno preso il loro pozzetto.')
  })

  it('explains committed public Burraco events and the ordinary closing requirements', () => {
    const own = deriveCoaching(action({ burracoReached: { ownTeam: true, opponentTeam: false } })).context
    expect(own).toMatch(/è ora un Burraco: il badge sulla calata ne indica il tipo/)
    expect(own).toMatch(/pozzetto preso e almeno un Burraco/)
    expect(deriveCoaching(facts({ isBotPlaying: true, burracoReached: { ownTeam: false, opponentTeam: true } })).context)
      .toMatch(/Gli avversari hanno completato un Burraco/)
  })

  it('explains a pozzetto and a Burraco reached in the same committed cue for the same side', () => {
    const both = { ownTeam: true, opponentTeam: false }
    const own = deriveCoaching(action({ pozzettoTaken: both, burracoReached: both })).context
    expect(own).toMatch(/^La tua squadra ha preso il pozzetto: è la vostra seconda mano/)
    expect(own).toMatch(/Una calata della tua squadra è ora un Burraco/)

    const opponentsBoth = { ownTeam: false, opponentTeam: true }
    expect(deriveCoaching(facts({ isBotPlaying: true, pozzettoTaken: opponentsBoth, burracoReached: opponentsBoth })).context)
      .toBe('Gli avversari hanno preso il loro pozzetto. Gli avversari hanno completato un Burraco: il badge sulla loro calata ne indica il tipo.')

    // Single events keep their exact existing copy.
    expect(deriveCoaching(action({ pozzettoTaken: both })).context)
      .toBe('La tua squadra ha preso il pozzetto: è la vostra seconda mano e il gioco continua normalmente.')
    expect(deriveCoaching(action({ burracoReached: both })).context).not.toMatch(/ha preso il pozzetto/)
  })

  it('lets a fresh engine rejection take precedence over an older event', () => {
    const coaching = deriveCoaching(action({
      rejectionCode: 'INVALID_MELD',
      pozzettoTaken: { ownTeam: true, opponentTeam: false },
    }))
    expect(coaching.context).toBe(REJECTION_COACHING.INVALID_MELD)
  })

  it('is built only from counts and flags: no card identity is a fact', () => {
    const keys = Object.keys(facts()).sort()
    expect(keys).toEqual([
      'automationFailed', 'burracoReached', 'canDrawStock', 'canTakeDiscardPile', 'hasTeamMelds',
      'isBotPlaying', 'phase', 'pozzettoTaken', 'rejectionCode', 'selectedCount',
    ])
  })
})
