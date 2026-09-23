import { isPinella } from '../game/cards/types'
import { classifyBurraco, type BurracoClassification, type MeldCardPlacement } from '../game/melds'
import type { Team } from '../game/state/types'
import { representedRankLabel } from './cardPresentation'
import { PlayingCard } from './PlayingCard'

const burracoLabels: Readonly<Record<Exclude<BurracoClassification, 'none'>, string>> = {
  clean: 'Pulito',
  'semi-clean': 'Semipulito',
  dirty: 'Sporco',
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
}>

export function MeldArea({ team, activeTeam, canExtend, onExtend }: MeldAreaProps) {
  const teamNumber = team.id === 'team-1' ? '1' : '2'

  return (
    <section className={`meld-area ${activeTeam ? 'meld-area--active' : ''}`} aria-label={`Calate squadra ${teamNumber}`}>
      <header className="meld-area__header">
        <div>
          <span className="section-kicker">Squadra {teamNumber}</span>
          <h2>Calate</h2>
        </div>
        <span className={`pozzetto-status ${team.hasTakenPozzetto ? 'pozzetto-status--taken' : ''}`}>
          Pozzetto {team.hasTakenPozzetto ? 'preso' : 'da prendere'}
        </span>
      </header>

      {team.melds.length === 0 ? (
        <p className="meld-area__empty">Nessuna calata</p>
      ) : (
        <div className="meld-list">
          {team.melds.map((meld, meldIndex) => {
            const classification = classifyBurraco(meld)
            return (
              <article className="meld" key={`${team.id}-meld-${meldIndex}`}>
                <div className="meld__meta">
                  <span>{meld.type === 'group' ? 'Combinazione' : 'Sequenza'}</span>
                  {classification !== 'none' && (
                    <strong className={`burraco-badge burraco-badge--${classification}`}>
                      {burracoLabels[classification]}
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
