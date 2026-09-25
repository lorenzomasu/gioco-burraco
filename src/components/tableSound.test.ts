import { describe, expect, it } from 'vitest'
import type { TableFeedback } from './tableFeedback'
import { finalAccentSounds, soundsForFeedback, type SoundContextFacts } from './tableSound'

const base: TableFeedback = {
  sequence: 1,
  cycle: 'a',
  action: null,
  cardCount: 0,
  receivedCardIds: [],
  actorId: null,
  turnChange: null,
  pozzettoTeamIds: [],
  burracoMelds: [],
}
const facts: SoundContextFacts = { roundCompleted: false, matchCompleted: false, humanTurn: false, fastPlayback: false }

describe('soundsForFeedback', () => {
  it.each([
    [{ type: 'draw-stock' }, 'draw'],
    [{ type: 'collect-discard-pile' }, 'collect'],
    [{ type: 'play-meld', teamId: 'team-1', meldIndex: 0 }, 'play'],
    [{ type: 'extend-meld', teamId: 'team-1', meldIndex: 0 }, 'extend'],
    [{ type: 'discard' }, 'discard'],
  ] as const)('maps %o to one primary %s sound', (action, sound) => {
    expect(soundsForFeedback({ ...base, action }, facts)).toEqual([sound])
  })

  it('adds the strongest single accent: match > round > Burraco > pozzetto', () => {
    const everything: TableFeedback = {
      ...base,
      action: { type: 'play-meld', teamId: 'team-1', meldIndex: 0 },
      burracoMelds: [{ teamId: 'team-1', meldIndex: 0 }],
      pozzettoTeamIds: ['team-1'],
      turnChange: 'player',
    }
    expect(soundsForFeedback(everything, { ...facts, roundCompleted: true, matchCompleted: true })).toEqual(['play', 'match-complete'])
    expect(soundsForFeedback(everything, { ...facts, roundCompleted: true })).toEqual(['play', 'round-complete'])
    expect(soundsForFeedback(everything, facts)).toEqual(['play', 'burraco'])
    expect(soundsForFeedback({ ...everything, burracoMelds: [] }, facts)).toEqual(['play', 'pozzetto'])
  })

  it('never stacks a turn cue on an accent and marks the human turn distinctly', () => {
    const handover: TableFeedback = { ...base, action: { type: 'discard' }, actorId: 'player-4', turnChange: 'player' }
    expect(soundsForFeedback(handover, { ...facts, humanTurn: true })).toEqual(['discard', 'human-turn'])
    expect(soundsForFeedback({ ...handover, actorId: 'player-2' }, facts)).toEqual(['discard', 'turn'])
    expect(soundsForFeedback({ ...handover, pozzettoTeamIds: ['team-2'] }, { ...facts, humanTurn: true }))
      .toEqual(['discard', 'pozzetto'])
    expect(soundsForFeedback({ ...base, turnChange: 'phase', action: { type: 'draw-stock' } }, facts)).toEqual(['draw'])
  })

  it('thins bot-to-bot turn cues in fast playback but keeps the human turn', () => {
    const handover: TableFeedback = { ...base, action: { type: 'discard' }, actorId: 'player-2', turnChange: 'player' }
    expect(soundsForFeedback(handover, { ...facts, fastPlayback: true })).toEqual(['discard'])
    expect(soundsForFeedback(handover, { ...facts, fastPlayback: true, humanTurn: true })).toEqual(['discard', 'human-turn'])
  })
})

describe('finalAccentSounds', () => {
  it('plays at most one final accent after immediate completion', () => {
    expect(finalAccentSounds({ ...facts, roundCompleted: true, matchCompleted: true, humanTurn: true })).toEqual(['match-complete'])
    expect(finalAccentSounds({ ...facts, roundCompleted: true })).toEqual(['round-complete'])
    expect(finalAccentSounds({ ...facts, humanTurn: true })).toEqual(['human-turn'])
    expect(finalAccentSounds(facts)).toEqual([])
  })
})
