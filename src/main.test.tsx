import { screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createBurracoDeck } from './game/cards/deck'
import { dealInitialState } from './game/engine/startGame'
import { MATCH_SAVE_STORAGE_KEY, saveMatch } from './shell/matchPersistence'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  document.body.innerHTML = ''
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

it('a production entrypoint whose worker registration fails still starts React and resumes the save untouched', async () => {
  const initial = dealInitialState(createBurracoDeck())
  expect(saveMatch({ humanPlayerName: 'Ada', roundCount: 3, botDifficulty: 'easy' }, {
    roundCount: 3,
    status: 'in-progress',
    currentRoundNumber: 1,
    currentRound: {
      ...initial,
      players: initial.players.map((player) => player.id === 'player-1' ? { ...player, name: 'Ada' } : player),
      round: { status: 'in-progress', turn: { currentPlayerId: 'player-1', phase: 'mustDraw' } },
    },
    roundResults: [],
  }, window.localStorage)).toBe(true)
  const rawSave = window.localStorage.getItem(MATCH_SAVE_STORAGE_KEY)
  const removeItem = vi.spyOn(window.localStorage, 'removeItem')

  // Registration never settles and then rejects: React must not wait for it either way.
  let rejectRegistration!: (reason: unknown) => void
  const register = vi.fn(() => new Promise<ServiceWorkerRegistration>((_, reject) => { rejectRegistration = reject }))
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
  vi.stubEnv('PROD', true)
  document.body.innerHTML = '<div id="root"></div>'

  await import('./main')

  expect(await screen.findByText('Partita ripresa · Smazzata 1/3')).toBeInTheDocument()
  expect(register).toHaveBeenCalledExactlyOnceWith('./sw.js', { scope: './' })
  rejectRegistration(new DOMException('failed', 'SecurityError'))
  await Promise.resolve()

  expect(screen.getByText('Partita ripresa · Smazzata 1/3')).toBeInTheDocument()
  expect(window.localStorage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe(rawSave)
  expect(removeItem).not.toHaveBeenCalled()
})

it('the development entrypoint never registers the production worker', async () => {
  const register = vi.fn()
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } })
  vi.stubEnv('PROD', false)
  document.body.innerHTML = '<div id="root"></div>'

  await import('./main')

  expect(await screen.findByRole('heading', { level: 1, name: 'Burraco' })).toBeInTheDocument()
  expect(register).not.toHaveBeenCalled()
})
