import type { GameErrorCode } from '../game/engine/errors'

/**
 * Public/presentation facts the contextual coach (M36) may read. Everything here is already
 * rendered or already decided elsewhere: the phase and pile controls the table shows, the
 * UI selection count, the code of an engine rejection that has already happened and the
 * committed public feedback. No card identity from any zone is part of it, so the coach
 * cannot predict legality, rank moves or reveal hidden cards.
 */
export type CoachingFacts = Readonly<{
  isBotPlaying: boolean
  automationFailed: boolean
  phase: 'mustDraw' | 'action'
  /** The actual enabled state of the stock control. */
  canDrawStock: boolean
  /** The actual enabled state of the discard-pile control. */
  canTakeDiscardPile: boolean
  selectedCount: number
  /** Whether the human team currently has at least one public meld. */
  hasTeamMelds: boolean
  /** Code of the latest engine rejection of a human command, cleared by the next change. */
  rejectionCode: GameErrorCode | null
  /** Committed public feedback: which side just took its pozzetto. */
  pozzettoTaken: Readonly<{ ownTeam: boolean; opponentTeam: boolean }>
  /** Committed public feedback: which side has a meld newly classified as Burraco. */
  burracoReached: Readonly<{ ownTeam: boolean; opponentTeam: boolean }>
}>

export type Coaching = Readonly<{
  /** What the player can do now. */
  now: string
  /** Why common controls are unavailable, from the existing UI control contracts only. */
  unavailable: readonly string[]
  /** One contextual explanation of a committed public event or an engine rejection. */
  context: string | null
  /** Flow reminder during the human action phase; never a legality indicator. */
  reminder: string | null
}>

/**
 * Contextual explanation of an engine rejection that already happened. The alert keeps the
 * immediate message; this adds only what to do next and never re-checks the move.
 */
export const REJECTION_COACHING: Readonly<Partial<Record<GameErrorCode, string>>> = {
  INVALID_TURN_PHASE:
    'Ogni turno segue l’ordine fisso: prima peschi o raccogli gli scarti, poi cali e infine scarti una carta.',
  EMPTY_CARD_SELECTION: 'Tocca prima le carte della mano che vuoi usare, poi scegli l’azione.',
  INVALID_MELD:
    'Il gioco ha rifiutato questa combinazione e non ha cambiato nulla. Modifica la selezione e riprova; le regole delle calate sono in «Come si gioca».',
  CANNOT_REDISCARD_SINGLE_COLLECTED_CARD:
    'Hai raccolto dagli scarti una sola carta: per finire il turno scarta una carta diversa.',
  CANNOT_CLOSE_WITHOUT_BURRACO:
    'Quella era la tua ultima carta dopo il pozzetto: chiudere richiede almeno un Burraco della tua squadra. Continua a giocare finché non ne avete uno.',
  CANNOT_CLOSE_WITH_WILDCARD:
    'La chiusura avviene con lo scarto finale, che non può essere un jolly o una pinella: tieni una carta diversa per chiudere.',
  CANNOT_CLOSE_WITHOUT_DISCARD:
    'Dopo il pozzetto non puoi calare tutte le carte rimaste: tienine una per lo scarto finale che chiude la smazzata.',
}

const ACQUIRE_FIRST = '«Cala» e «Scarta e passa» si attivano solo dopo che hai pescato o raccolto gli scarti.'
const SELECT_FOR_MELD = '«Cala» richiede almeno una carta selezionata.'
const SELECT_ONE_TO_DISCARD = '«Scarta e passa» richiede esattamente una carta selezionata.'
const CLOSING_REMINDER = 'La chiusura della smazzata avviene sempre con lo scarto finale.'

const acquisitionNow = ({ canDrawStock, canTakeDiscardPile }: CoachingFacts): string => {
  if (canDrawStock && canTakeDiscardPile) return 'Tocca a te: pesca dal tallone oppure raccogli tutto il monte degli scarti.'
  if (canDrawStock) return 'Tocca a te: pesca dal tallone (il monte degli scarti è vuoto).'
  if (canTakeDiscardPile) return 'Tocca a te: il tallone è vuoto, raccogli il monte degli scarti.'
  return 'Tocca a te, ma al momento nessuna pesca è disponibile.'
}

const actionNow = ({ selectedCount, hasTeamMelds }: CoachingFacts): string => {
  if (selectedCount === 0) {
    const extend = hasTeamMelds ? ' o aggiungerle a una tua calata' : ''
    return `Seleziona carte per provare «Cala»${extend}, oppure una sola carta per «Scarta e passa».`
  }
  if (selectedCount === 1) {
    const extend = hasTeamMelds ? ' o aggiungerla a una tua calata' : ''
    return `«Scarta e passa» scarta la carta selezionata e finisce il turno. Puoi anche provare a calarla${extend}: decide il gioco.`
  }
  const extend = hasTeamMelds ? ' o aggiungile a una tua calata' : ''
  return `Con ${selectedCount} carte selezionate prova «Cala»${extend}: decide il gioco se è valida.`
}

const OWN_POZZETTO = 'La tua squadra ha preso il pozzetto: è la vostra seconda mano e il gioco continua normalmente.'
const OWN_BURRACO =
  'Una calata della tua squadra è ora un Burraco: il badge sulla calata ne indica il tipo. Con il pozzetto preso e almeno un Burraco potrete chiudere con lo scarto finale.'
const OPPONENT_POZZETTO = 'Gli avversari hanno preso il loro pozzetto.'
const OPPONENT_BURRACO = 'Gli avversari hanno completato un Burraco: il badge sulla loro calata ne indica il tipo.'

/**
 * One committed cue can carry both events for the same side (a meld that reaches Burraco
 * with the last cards of the first hand, then the pozzetto): both are then explained.
 */
const eventContext = ({ pozzettoTaken, burracoReached }: CoachingFacts): string | null => {
  const own = [pozzettoTaken.ownTeam && OWN_POZZETTO, burracoReached.ownTeam && OWN_BURRACO].filter(Boolean)
  if (own.length > 0) return own.join(' ')
  const opponent = [pozzettoTaken.opponentTeam && OPPONENT_POZZETTO, burracoReached.opponentTeam && OPPONENT_BURRACO]
    .filter(Boolean)
  return opponent.length > 0 ? opponent.join(' ') : null
}

/**
 * The single presentation seam for contextual coaching. A pure mapping from public facts
 * to copy: it enumerates no moves and validates nothing, so the engine stays the only
 * authority on whether an attempted command is legal.
 */
export const deriveCoaching = (facts: CoachingFacts): Coaching => {
  if (facts.automationFailed) {
    return {
      now: 'Il gioco automatico dei bot si è interrotto: puoi iniziare una nuova partita con «Nuova partita».',
      unavailable: [],
      context: null,
      reminder: null,
    }
  }
  const rejection = facts.rejectionCode ? REJECTION_COACHING[facts.rejectionCode] ?? null : null
  if (facts.isBotPlaying) {
    return {
      now: 'I bot giocano una mossa alla volta: seguili sul tavolo e nella cronologia, oppure usa «Completa subito».',
      unavailable: [],
      context: eventContext(facts),
      reminder: null,
    }
  }
  if (facts.phase === 'mustDraw') {
    return {
      now: acquisitionNow(facts),
      unavailable: [ACQUIRE_FIRST],
      context: rejection ?? eventContext(facts),
      reminder: null,
    }
  }
  return {
    now: actionNow(facts),
    unavailable: facts.selectedCount === 0
      ? [SELECT_FOR_MELD, SELECT_ONE_TO_DISCARD]
      : facts.selectedCount > 1 ? [SELECT_ONE_TO_DISCARD] : [],
    context: rejection ?? eventContext(facts),
    reminder: CLOSING_REMINDER,
  }
}
