import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import { dealInitialState } from '../game/engine/startGame'
import type { MatchState, SettledRoundResult } from '../game/match'
import type { CompletedGameState, InProgressGameState, TeamId } from '../game/state/types'
import { GameTable } from './GameTable'

const deck = createBurracoDeck()

const settled = (roundNumber: 1 | 2 | 3 | 4, team1: number, team2: number): SettledRoundResult => ({
  roundNumber,
  ending: 'draw-pile-exhausted',
  score: {
    teams: [
      { teamId: 'team-1', meldCardPoints: 0, burracoBonus: 0, closingBonus: 0, handPenalty: 0, pozzettoPenalty: 0, total: team1 },
      { teamId: 'team-2', meldCardPoints: 0, burracoBonus: 0, closingBonus: 0, handPenalty: 0, pozzettoPenalty: 0, total: team2 },
    ],
  },
})

const humanTurn = (): InProgressGameState => ({
  ...dealInitialState(deck),
  round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
})

const completedRound = (): CompletedGameState => {
  const initial = dealInitialState(deck)
  return {
    ...initial,
    players: initial.players.map((player) => ({ ...player, hand: [] })),
    teams: initial.teams.map((team) => ({ ...team, melds: [], hasTakenPozzetto: false })),
    drawPile: [],
    discardPile: [],
    pozzetti: [[], []],
    round: { status: 'completed', ending: 'draw-pile-exhausted', lastDiscardPlayerId: 'player-2' },
  }
}

const matchScore = () => screen.getByRole('group', { name: 'Punteggio della partita' })
const shellActions = <button type="button">Impostazioni</button>

describe('GameTable M32 match context', () => {
  it('shows 0–0 with no settled round during the first smazzata', () => {
    render(<GameTable initialState={humanTurn()} />)
    expect(matchScore()).toHaveTextContent('La tua squadra (Sq. 1) 0')
    expect(matchScore()).toHaveTextContent('Avversari (Sq. 2) 0')
    expect(matchScore()).toHaveTextContent('nessuna smazzata conclusa')
  })

  it('shows only settled cumulative points, oriented to the human team', () => {
    const match: MatchState = {
      status: 'in-progress',
      currentRoundNumber: 3,
      currentRound: humanTurn(),
      roundResults: [settled(1, 120, 300), settled(2, -40, 60)],
    }
    render(<GameTable initialMatch={match} />)
    const teams = within(matchScore()).getAllByText(/Sq\. \d/).map((element) => element.parentElement!.textContent)
    expect(teams).toEqual(['La tua squadra (Sq. 1) 80', 'Avversari (Sq. 2) 360'])
    expect(matchScore()).toHaveTextContent('dopo 2 smazzate')
    // The current round's melds or hands never add a partial score.
    fireEvent.click(screen.getByRole('button', { name: /^Pesca dal tallone/ }))
    expect(matchScore()).toHaveTextContent('La tua squadra (Sq. 1) 80')
  })

  it('separates round result, match progress and one next-round action between smazzate', () => {
    const createGame = vi.fn(humanTurn)
    const match: MatchState = {
      status: 'in-progress',
      currentRoundNumber: 1,
      currentRound: completedRound(),
      roundResults: [settled(1, 150, 90)],
    }
    render(<GameTable initialMatch={match} createGame={createGame} shellActions={shellActions} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Tallone esaurito' })).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Punteggio cumulativo' })
    expect(summary).toHaveTextContent('Smazzata 1 di 4 conclusa')
    expect(within(summary).getByLabelText('Punti cumulativi')).toHaveTextContent(/La tua squadra · Squadra 1.*150/)
    expect(within(summary).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Punteggio della partita' })).not.toBeInTheDocument()
    // Shell entries and the history stay available, the history after the progression.
    expect(screen.getByRole('button', { name: 'Impostazioni' })).toBeInTheDocument()
    const history = screen.getByRole('region', { name: 'Cronologia bot' })
    expect(summary.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(within(summary).getByRole('button', { name: 'Inizia smazzata 2' }))
    expect(createGame).toHaveBeenCalledOnce()
    expect(screen.getByText('Smazzata 2/4')).toBeInTheDocument()
  })

  const finalMatch = (team1: number, team2: number): MatchState => ({
    status: 'completed',
    currentRoundNumber: 4,
    currentRound: completedRound(),
    roundResults: [settled(1, team1, team2), settled(2, 0, 0), settled(3, 0, 0), settled(4, 0, 0)],
  })

  it.each([
    [400, 100, 'Hai vinto la partita!', 'team-1'],
    [100, 400, 'Hanno vinto gli avversari.', 'team-2'],
    [200, 200, 'Partita pari.', null],
  ] as const)('states the final result for %i–%i relative to the human team', (team1, team2, headline, leader: TeamId | null) => {
    const onLeaveMatch = vi.fn()
    render(<GameTable initialMatch={finalMatch(team1, team2)} onLeaveMatch={onLeaveMatch} shellActions={shellActions} />)

    const result = screen.getByRole('heading', { name: 'Risultato finale' }).parentElement!
    expect(within(result).getByText(headline)).toBeInTheDocument()
    expect(result).toHaveClass(leader ? 'final-result--leader' : 'final-result--tie')
    expect(screen.getByText('Match Points')).toHaveTextContent(String(Math.abs(team1 - team2)))
    expect(screen.getByLabelText('Victory Points')).toHaveTextContent(/La tua squadra · Squadra 1/)
    expect(screen.getByLabelText('Punti cumulativi')).toHaveTextContent('You (tu) e Partner')
    expect(screen.getByRole('button', { name: 'Impostazioni' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Gioca ancora' }))
    expect(onLeaveMatch).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
