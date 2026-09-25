/**
 * The supported bot strategy profiles. One profile applies to every bot seat of a match;
 * it only changes which legal candidate is preferred, never what is legal.
 */
export const BOT_DIFFICULTIES = ['easy', 'normal'] as const

export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number]

/** The pre-M35 strategic bot, used whenever no explicit difficulty is supplied. */
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'normal'

export const isBotDifficulty = (value: unknown): value is BotDifficulty =>
  (BOT_DIFFICULTIES as readonly unknown[]).includes(value)
