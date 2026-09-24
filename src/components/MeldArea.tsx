import { isPinella } from '../game/cards/types'
import { classifyBurraco, type BurracoClassification, type MeldCardPlacement } from '../game/melds'
import type { Team } from '../game/state/types'
import { representedRankLabel } from './cardPresentation'
import { PlayingCard } from './PlayingCard'
import { cueAttributes, type TableFeedback } from './tableFeedback'

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
  activeTeam: boolean
  canExtend: boolean
  onExtend: (meldIndex: number) => void
  /** Transient presentation cue of the latest committed change; purely visual. */
  feedback?: TableFeedback | null
}>

export function MeldArea({ team, activeTeam, canExtend, onExtend, feedback = null }: MeldAreaProps) {
  const teamNumber = team.id === 'team-1' ? '1' : '2'
  const tookPozzetto = feedback?.pozzettoTeamIds.includes(team.id) ?? false
  const action = feedback?.action
  const cuedMeldIndex = (action?.type === 'play-meld' || action?.type === 'extend-meld') && action.teamId === team.id
    ? action.meldIndex
    : null
  const meldCue = action?.type === 'play-meld' ? 'meld-created' : 'meld-extended'

  return (
    <section
      className={`meld-area ${activeTeam ? 'meld-area--active' : ''}`}
      aria-label={`Calate squadra ${teamNumber}`}
      {...cueAttributes(feedback, tookPozzetto && 'pozzetto')}
    >
      <header className="meld-area__header">
        <div>
          <span className="section-kicker">Squadra {teamNumber}</span>
          <h2>Calate</h2>
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

      {team.melds.length === 0 ? (
        <p className="meld-area__empty">Nessuna calata</p>
      ) : (
        <div className="meld-list">
          {team.melds.map((meld, meldIndex) => {
            const classification = classifyBurraco(meld)
            return (
              <article
                className={`meld${classification !== 'none' ? ' meld--burraco' : ''}`}
                key={`${team.id}-meld-${meldIndex}`}
                aria-label={`Calata ${meldIndex + 1} squadra ${teamNumber}`}
                data-burraco={classification !== 'none' ? classification : undefined}
                {...cueAttributes(feedback, cuedMeldIndex === meldIndex && meldCue)}
              >
                <div className="meld__meta">
                  <span className="meld__label">
                    <span className="meld__index">Calata {meldIndex + 1}</span>
                    <span>{meld.type === 'group' ? 'Combinazione' : 'Sequenza'}</span>
                  </span>
                  {classification !== 'none' && (
                    // Keyed by classification so a newly reached or changed Burraco replays
                    // its short first-appearance treatment.
                    <strong key={classification} className={`burraco-badge burraco-badge--${classification}`}>
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
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
