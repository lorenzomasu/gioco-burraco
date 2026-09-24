import type { RandomSource } from '../game/cards/shuffle'
import { createMatchRoundFactory, type RoundFactory } from '../game/match'

/** The seat controlled by the local human player; the other three seats are bots. */
export const HUMAN_PLAYER_ID = 'player-1'

/** Onboarding choices for one local match. The table layout itself is fixed. */
export type MatchSetup = Readonly<{
  /** Already trimmed, non-empty display name for the human seat. */
  humanPlayerName: string
}>

/** Builds the round factory that gives every round of the match the chosen human name. */
export const createSetupRoundFactory = (
  { humanPlayerName }: MatchSetup,
  random?: RandomSource,
): RoundFactory => createMatchRoundFactory({ playerNames: { [HUMAN_PLAYER_ID]: humanPlayerName }, random })
