import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBurracoDeck } from '../game/cards/deck'
import { dealInitialState } from '../game/engine/startGame'
import type { MatchRoundCount, MatchState, SettledRoundResult } from '../game/match'
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
      roundCount: 4,
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
      roundCount: 4,
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
    roundCount: 4,
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

  it.each([2, 3] as const)('derives the header, progress and next-round action from a %i-smazzate match', (roundCount) => {
    const createGame = vi.fn(humanTurn)
    const match: MatchState = {
      roundCount,
      status: 'in-progress',
      currentRoundNumber: 1,
      currentRound: completedRound(),
      roundResults: [settled(1, 150, 90)],
    }
    render(<GameTable initialMatch={match} createGame={createGame} />)

    expect(screen.getByText(`Smazzata 1/${roundCount}`)).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Punteggio cumulativo' })
    expect(summary).toHaveTextContent(`Smazzata 1 di ${roundCount} conclusa`)
    expect(summary.querySelectorAll('.round-track__step')).toHaveLength(roundCount)
    expect(summary.querySelectorAll('.round-track__step--done')).toHaveLength(1)
    expect(within(summary).getAllByRole('button')).toHaveLength(1)

    fireEvent.click(within(summary).getByRole('button', { name: 'Inizia smazzata 2' }))
    expect(createGame).toHaveBeenCalledExactlyOnceWith({ roundNumber: 2, startingPlayerId: 'player-2' })
    expect(screen.getByText(`Smazzata 2/${roundCount}`)).toBeInTheDocument()
  })

  it('starts a fresh match with the requested length', () => {
    render(<GameTable createGame={humanTurn} roundCount={3} />)
    expect(screen.getByText('Smazzata 1/3')).toBeInTheDocument()
  })

  const terminalMatch = (roundCount: MatchRoundCount, team1: number): MatchState => ({
    roundCount,
    status: 'completed',
    currentRoundNumber: roundCount,
    currentRound: completedRound(),
    roundResults: Array.from({ length: roundCount }, (_, index) =>
      settled((index + 1) as 1 | 2 | 3 | 4, index === 0 ? team1 : 0, 0)),
  })

  it.each([
    [2, 'Smazzata 2/2', ['19 VP', '1 VP']],
    [3, 'Smazzata 3/3', ['17 VP', '3 VP']],
    [4, 'Smazzata 4/4', ['15 VP', '5 VP']],
  ] as const)(
    'shows the final result of a %i-smazzate match with its own VP table and no further round',
    (roundCount, header, victoryPoints) => {
      render(<GameTable initialMatch={terminalMatch(roundCount, 1000)} onLeaveMatch={vi.fn()} />)

      expect(screen.getByText(header)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Risultato finale' })).toBeInTheDocument()
      expect(screen.getByText('Match Points')).toHaveTextContent('1000')
      const vp = within(screen.getByLabelText('Victory Points')).getAllByText(/VP$/).map(({ textContent }) => textContent)
      expect(vp).toEqual(victoryPoints)
      expect(screen.queryByRole('button', { name: /^Inizia smazzata/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gioca ancora' })).toBeInTheDocument()
    },
  )
})
