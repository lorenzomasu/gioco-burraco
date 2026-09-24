import { useState } from 'react'
import { GameTable, type BotPlaybackSpeed } from './components/GameTable'
import { StartScreen } from './components/StartScreen'
import type { MatchState, RoundFactory } from './game/match'
import {
  clearMatchSave,
  getBrowserStorage,
  loadMatchSave,
  saveMatch,
  type MatchSaveLoadResult,
} from './shell/matchPersistence'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'

type AppProps = Readonly<{
  /** Deterministic test seam; production matches use freshly shuffled named rounds. */
  createRoundFactory?: (setup: MatchSetup) => RoundFactory
  /** Browser-local storage for the active-match save; `null` when unavailable. */
  storage?: Storage | null
}>

/**
 * Transient application screen. A match screen owns exactly one mounted `GameTable`;
 * leaving it unmounts the table and cancels its pending playback through cleanup. A
 * restored match carries its saved `MatchState`; its factory is recreated from the setup.
 * The focus flags mark screen replacements triggered by the user, so keyboard focus moves
 * to the new context; the first page load (including a restored match) never moves it.
 */
type AppScreen =
  | Readonly<{ kind: 'onboarding'; returnedFromMatch?: boolean }>
  | Readonly<{
      kind: 'match'
      setup: MatchSetup
      createGame: RoundFactory
      initialMatch?: MatchState
      startedFromOnboarding?: boolean
    }>

export const RESTORE_DISCARDED_NOTICE = 'La partita salvata non era più valida e non è stata ripristinata.'
export const STORAGE_UNAVAILABLE_NOTICE =
  'Il salvataggio locale non è disponibile: la partita non potrà essere ripresa dopo un ricaricamento.'
export const SAVE_FAILED_NOTICE =
  'Impossibile salvare la partita in questo browser: puoi continuare a giocare, ma non potrà essere ripresa dopo un ricaricamento.'

const loadNotice = (result: MatchSaveLoadResult): string | null => {
  if (result.status === 'discarded') return RESTORE_DISCARDED_NOTICE
  if (result.status === 'unavailable') return STORAGE_UNAVAILABLE_NOTICE
  return null
}

export default function App({
  createRoundFactory = (setup) => createSetupRoundFactory(setup),
  storage = getBrowserStorage(),
}: AppProps) {
  const [initial] = useState(() => {
    const loaded = loadMatchSave(storage)
    if (loaded.status !== 'restored') {
      return { screen: { kind: 'onboarding' } as AppScreen, name: '', notice: loadNotice(loaded) }
    }
    const { setup, match } = loaded.save
    const screen: AppScreen = { kind: 'match', setup, createGame: createRoundFactory(setup), initialMatch: match }
    return { screen, name: setup.humanPlayerName, notice: null }
  })
  const [screen, setScreen] = useState<AppScreen>(initial.screen)
  const [lastPlayerName, setLastPlayerName] = useState(initial.name)
  const [notice, setNotice] = useState<string | null>(initial.notice)
  const [playbackSpeed, setPlaybackSpeed] = useState<BotPlaybackSpeed>('normal')

  if (screen.kind === 'onboarding') {
    return (
      <StartScreen
        initialName={lastPlayerName}
        notice={notice}
        focusOnMount={screen.returnedFromMatch}
        onStart={(setup) => {
          setLastPlayerName(setup.humanPlayerName)
          setNotice(null)
          setScreen({ kind: 'match', setup, createGame: createRoundFactory(setup), startedFromOnboarding: true })
        }}
      />
    )
  }

  const { setup } = screen
  // Only an active match is resumable; a completed one is no longer saved.
  const persistMatch = (match: MatchState) => {
    if (match.status === 'completed') {
      clearMatchSave(storage)
    } else if (!saveMatch(setup, match, storage)) {
      setNotice(SAVE_FAILED_NOTICE)
    }
  }

  return (
    <>
      {notice && <p className="storage-notice storage-notice--match" role="status">{notice}</p>}
      <GameTable
        initialMatch={screen.initialMatch}
        createGame={screen.createGame}
        focusContextOnMount={screen.startedFromOnboarding}
        onMatchChange={persistMatch}
        onLeaveMatch={() => {
          // Reached only after any required confirmation: the abandoned match is not resumable.
          clearMatchSave(storage)
          setNotice(null)
          setScreen({ kind: 'onboarding', returnedFromMatch: true })
        }}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
      />
    </>
  )
}
