import { isPinella } from '../game/cards/types'
import { classifyBurraco, type BurracoClassification, type MeldCardPlacement } from '../game/melds'
import type { Team } from '../game/state/types'
import { representedRankLabel } from './cardPresentation'
import { PlayingCard } from './PlayingCard'
import { cueAttributes, type TableFeedback } from './tableFeedback'
import type { DropState, DropTarget } from './useHandDrag'

const burracoLabels: Readonly<Record<Exclude<BurracoClassification, 'none'>, string>> = {
  clean: 'Pulito',
  'semi-clean': 'Semipulito',
  dirty: 'Sporco',
}

/** Decorative shape per classification; the text label stays the authoritative cue. */
const burracoIcons: Readonly<Record<Exclude<BurracoClassification, 'none'>, string>> = {
  clean: '★',
  'semi-clean': '✦',
  dirty: '◆',
}

const placementAnnotation = (placement: MeldCardPlacement): string | undefined => {
  if (placement.role === 'wildcard') return `Matta → ${representedRankLabel(placement.representedRank)}`
  if (isPinella(placement.card)) return '2 naturale'
  return undefined
}

type MeldAreaProps = Readonly<{
  team: Team
  /** Text relation of the team to the human (for example «La tua squadra»). */
  owner?: string
  activeTeam: boolean
  canExtend: boolean
  onExtend: (meldIndex: number) => void
  /** Transient presentation cue of the latest committed change; purely visual. */
  feedback?: TableFeedback | null
  /**
   * Direct-manipulation destinations of the human's own team only: the «Nuova calata»
   * target and each existing meld. Opponent areas never receive it.
   */
  directTargets?: OwnMeldTargets
}>

/** Transient drag presentation for the human team's meld destinations. */
export type OwnMeldTargets = Readonly<{
  /** Whether direct new-meld/extension drops are currently actionable (human action phase). */
  enabled: boolean
  /** Whether a hand drag is in progress. */
  dragging: boolean
  /** The destination currently under the pointer, if any. */
  activeTarget: DropTarget | null
}>

const dropState = (targets: OwnMeldTargets, isActive: boolean): DropState =>
  !targets.dragging ? 'idle' : isActive ? 'active' : 'available'

export function MeldArea({ team, owner, activeTeam, canExtend, onExtend, feedback = null, directTargets }: MeldAreaProps) {
  const teamNumber = team.id === 'team-1' ? '1' : '2'
  const tookPozzetto = feedback?.pozzettoTeamIds.includes(team.id) ?? false
  const action = feedback?.action
  const cuedMeldIndex = (action?.type === 'play-meld' || action?.type === 'extend-meld') && action.teamId === team.id
    ? action.meldIndex
    : null
  const meldCue = action?.type === 'play-meld' ? 'meld-created' : 'meld-extended'
  // Burraco emphasis follows only the before/after `classifyBurraco` comparison of the cue.
  const isNewBurraco = (meldIndex: number) =>
    feedback?.burracoMelds.some((ref) => ref.teamId === team.id && ref.meldIndex === meldIndex) ?? false
  const targets = directTargets?.enabled ? directTargets : null
  const newMeldState = targets && dropState(targets, targets.activeTarget?.kind === 'new-meld')
  const meldState = (meldIndex: number) => targets && dropState(
    targets,
    targets.activeTarget?.kind === 'meld' && targets.activeTarget.meldIndex === meldIndex,
  )

  return (
    <section
      className={`meld-area${activeTeam ? ' meld-area--active' : ''}`}
      aria-label={`Calate squadra ${teamNumber}`}
      {...cueAttributes(feedback, tookPozzetto && 'pozzetto')}
    >
      <header className="meld-area__header">
        <div>
          <span className="section-kicker">{owner ? `Calate · Squadra ${teamNumber}` : `Squadra ${teamNumber}`}</span>
          <h2>{owner ?? 'Calate'}</h2>
        </div>
        <div className="meld-area__states">
          {activeTeam && <span className="turn-badge">Di turno</span>}
          <span
            className={`pozzetto-status ${team.hasTakenPozzetto ? 'pozzetto-status--taken' : ''}`}
            {...cueAttributes(feedback, tookPozzetto && 'pozzetto')}
          >
            {team.hasTakenPozzetto && <span className="pozzetto-status__icon" aria-hidden="true">✓</span>}
            Pozzetto {team.hasTakenPozzetto ? 'preso' : 'da prendere'}
          </span>
        </div>
      </header>

      {directTargets && (
        // A pointer destination described in text; «Cala» stays the keyboard control, so
        // it is deliberately not an extra tab stop.
        <div
          className="new-meld-target"
          role="group"
          aria-label="Nuova calata"
          aria-describedby={`new-meld-help-${team.id}`}
          data-drop-target={newMeldState ? 'new-meld' : undefined}
          data-drop-state={newMeldState && newMeldState !== 'idle' ? newMeldState : undefined}
          aria-disabled={newMeldState ? undefined : true}
        >
          <strong className="new-meld-target__label">
            <span aria-hidden="true">＋</span> Nuova calata
          </strong>
          <span id={`new-meld-help-${team.id}`} className="new-meld-target__help">
            {!newMeldState
              ? 'Disponibile nella tua fase di gioco.'
              : newMeldState === 'active'
                ? 'Rilascia per calare queste carte.'
                : 'Trascina qui le carte oppure selezionale e premi «Cala».'}
          </span>
        </div>
      )}

      {team.melds.length === 0 ? (
        <p className="meld-area__empty">Nessuna calata</p>
      ) : (
        <div className="meld-list">
          {team.melds.map((meld, meldIndex) => {
            const classification = classifyBurraco(meld)
            const state = meldState(meldIndex)
            return (
              <article
                className={`meld${classification !== 'none' ? ' meld--burraco' : ''}`}
                key={`${team.id}-meld-${meldIndex}`}
                aria-label={`Calata ${meldIndex + 1} squadra ${teamNumber}`}
                data-burraco={classification !== 'none' ? classification : undefined}
                data-motion-anchor={`meld-${team.id}-${meldIndex}`}
                data-burraco-emphasis={isNewBurraco(meldIndex) ? feedback?.cycle : undefined}
                {...cueAttributes(feedback, cuedMeldIndex === meldIndex && meldCue)}
                data-drop-target={state ? 'meld' : undefined}
                data-meld-index={state ? meldIndex : undefined}
                data-drop-state={state && state !== 'idle' ? state : undefined}
              >
                <div className="meld__meta">
                  <span className="meld__label">
                    <span className="meld__index">Calata {meldIndex + 1}</span>
                    <span>{meld.type === 'group' ? 'Combinazione' : 'Sequenza'}</span>
                  </span>
                  {classification !== 'none' && (
                    // Keyed by classification so a newly reached or changed Burraco replays
                    // its short first-appearance treatment.
                    <strong
                      key={classification}
                      className={`burraco-badge burraco-badge--${classification}`}
                      {...cueAttributes(feedback, isNewBurraco(meldIndex) && 'burraco')}
                    >
                      <span className="burraco-badge__icon" aria-hidden="true">{burracoIcons[classification]}</span>
                      <span className="burraco-badge__kind">Burraco</span> {burracoLabels[classification]}
                    </strong>
                  )}
                </div>
                <div className="meld__cards">
                  {meld.cards.map((placement) => (
                    <PlayingCard
                      key={placement.card.id}
                      card={placement.card}
                      compact
                      annotation={placementAnnotation(placement)}
                    />
                  ))}
                </div>
                {activeTeam && (
                  <button
                    type="button"
                    className="button button--small button--ghost"
                    onClick={() => onExtend(meldIndex)}
                    disabled={!canExtend}
                    aria-label={`Aggiungi alla calata ${meldIndex + 1} della squadra ${teamNumber}`}
                  >
                    Aggiungi alla calata
                  </button>
                )}
                {/* Pointer affordance only; «Aggiungi alla calata» stays the accessible control. */}
                {state && state !== 'idle' && (
                  <span className="drop-label" aria-hidden="true">
                    {state === 'active' ? `Rilascia su Calata ${meldIndex + 1}` : 'Aggiungi qui'}
                  </span>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
