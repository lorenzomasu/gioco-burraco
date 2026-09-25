import { useEffect, useState, type ReactNode } from 'react'
import { SoundContext } from './audio/SoundContext'
import { createSoundController, createWebAudioBackend, type SoundBackend } from './audio/soundEffects'
import { HelpDialog } from './components/HelpDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { GameTable, type BotPlaybackSpeed } from './components/GameTable'
import { DEFAULT_BOT_DIFFICULTY, type BotDifficulty } from './game/bot'
import { StartScreen } from './components/StartScreen'
import { DEFAULT_MATCH_ROUND_COUNT, type MatchRoundCount, type MatchState, type RoundFactory } from './game/match'
import {
  clearMatchSave,
  getBrowserStorage,
  loadMatchSave,
  saveMatch,
  type MatchSaveLoadResult,
} from './shell/matchPersistence'
import {
  loadAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
} from './shell/audioPreferences'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'

type AppProps = Readonly<{
  /** Deterministic test seam; production matches use freshly shuffled named rounds. */
  createRoundFactory?: (setup: MatchSetup) => RoundFactory
  /** Browser-local storage for the active-match save; `null` when unavailable. */
  storage?: Storage | null
  /** Sound output seam; production synthesizes locally with Web Audio. */
  createSoundBackend?: () => SoundBackend | null
  /** Which input may unlock audio; browsers only allow trusted user gestures. */
  isAudioActivation?: (event: Event) => boolean
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

/** Concise non-blocking status after a valid local save was resumed. */
export const resumeNotice = (match: Pick<MatchState, 'currentRoundNumber' | 'roundCount'>) =>
  `Partita ripresa · Smazzata ${match.currentRoundNumber}/${match.roundCount}`

/** The app-level overlay currently open; transient shell state, never saved. */
type ShellOverlay = 'settings' | 'help' | null

const isTrustedGesture = (event: Event) => event.isTrusted

export default function App({
  createRoundFactory = (setup) => createSetupRoundFactory(setup),
  storage = getBrowserStorage(),
  createSoundBackend = createWebAudioBackend,
  isAudioActivation = isTrustedGesture,
}: AppProps) {
  const [initial] = useState(() => {
    const loaded = loadMatchSave(storage)
    if (loaded.status !== 'restored') {
      return {
        screen: { kind: 'onboarding' } as AppScreen,
        name: '',
        roundCount: DEFAULT_MATCH_ROUND_COUNT,
        botDifficulty: DEFAULT_BOT_DIFFICULTY,
        notice: loadNotice(loaded),
        resumedMatch: null,
      }
    }
    const { setup, match } = loaded.save
    const screen: AppScreen = { kind: 'match', setup, createGame: createRoundFactory(setup), initialMatch: match }
    return {
      screen,
      name: setup.humanPlayerName,
      roundCount: setup.roundCount,
      botDifficulty: setup.botDifficulty,
      notice: null,
      resumedMatch: match,
    }
  })
  const [screen, setScreen] = useState<AppScreen>(initial.screen)
  const [lastPlayerName, setLastPlayerName] = useState(initial.name)
  // Last chosen length, retained like the name while this application stays mounted.
  const [lastRoundCount, setLastRoundCount] = useState<MatchRoundCount>(initial.roundCount)
  const [lastBotDifficulty, setLastBotDifficulty] = useState<BotDifficulty>(initial.botDifficulty)
  const [notice, setNotice] = useState<string | null>(initial.notice)
  // Progress of the restored save, shown once as a dismissible status; UI only, never saved.
  const [resumedMatch, setResumedMatch] = useState<MatchState | null>(initial.resumedMatch)
  const [overlay, setOverlay] = useState<ShellOverlay>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState<BotPlaybackSpeed>('normal')
  const [audioPreferences, setAudioPreferences] = useState<AudioPreferences>(() => loadAudioPreferences(storage))
  // One presentation-only sound service for the application's lifetime.
  const [sound] = useState(() => createSoundController(createSoundBackend, audioPreferences))
  const [playSounds] = useState(() => sound.play)

  // Audio becomes eligible only on the first trusted user gesture; earlier presentation
  // events (for example a restored bot turn) stay silent and are never replayed.
  useEffect(() => {
    if (sound.isActive()) return
    const activate = (event: Event) => {
      if (!isAudioActivation(event)) return
      sound.activate()
      removeListeners()
    }
    const events = ['pointerdown', 'keydown'] as const
    const removeListeners = () => {
      for (const type of events) window.removeEventListener(type, activate, true)
    }
    for (const type of events) window.addEventListener(type, activate, true)
    return removeListeners
  }, [sound, isAudioActivation])

  const changeAudioPreferences = (next: AudioPreferences) => {
    setAudioPreferences(next)
    sound.setPreferences(next)
    // A preference write failure needs no notice; the match save is never involved.
    saveAudioPreferences(storage, next)
  }

  // The single Help and Settings entries, shared by onboarding and every match view.
  const shellActions = (
    <>
      <button type="button" className="button button--ghost button--compact" onClick={() => setOverlay('help')}>
        Come si gioca
      </button>
      <button type="button" className="button button--ghost button--compact" onClick={() => setOverlay('settings')}>
        Impostazioni
      </button>
    </>
  )

  // The background stays mounted but `inert` while an overlay is open, so no match
  // control can be operated behind it.
  const withOverlay = (content: ReactNode) => (
    <>
      <div className="app-content" inert={overlay !== null}>{content}</div>
      {overlay === 'settings' && (
        <SettingsDialog
          speed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
          audio={audioPreferences}
          onAudioChange={changeAudioPreferences}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'help' && <HelpDialog onClose={() => setOverlay(null)} />}
    </>
  )

  if (screen.kind === 'onboarding') {
    return withOverlay(
      <StartScreen
        initialName={lastPlayerName}
        initialRoundCount={lastRoundCount}
        initialBotDifficulty={lastBotDifficulty}
        notice={notice}
        focusOnMount={screen.returnedFromMatch}
        actions={shellActions}
        onStart={(setup) => {
          setLastPlayerName(setup.humanPlayerName)
          setLastRoundCount(setup.roundCount)
          setLastBotDifficulty(setup.botDifficulty)
          setNotice(null)
          setScreen({ kind: 'match', setup, createGame: createRoundFactory(setup), startedFromOnboarding: true })
        }}
      />,
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

  return withOverlay(
    <SoundContext value={playSounds}>
      {notice ? (
        <p className="storage-notice storage-notice--match" role="status">{notice}</p>
      ) : resumedMatch !== null && (
        <div className="storage-notice storage-notice--match storage-notice--resume" role="status">
          <span>{resumeNotice(resumedMatch)}</span>
          <button
            type="button"
            className="storage-notice__dismiss"
            onClick={() => setResumedMatch(null)}
            aria-label="Chiudi avviso di ripresa"
          >
            ×
          </button>
        </div>
      )}
      <GameTable
        initialMatch={screen.initialMatch}
        createGame={screen.createGame}
        roundCount={setup.roundCount}
        botDifficulty={setup.botDifficulty}
        focusContextOnMount={screen.startedFromOnboarding}
        onMatchChange={persistMatch}
        onLeaveMatch={() => {
          // Reached only after any required confirmation: the abandoned match is not resumable.
          clearMatchSave(storage)
          setNotice(null)
          setResumedMatch(null)
          setScreen({ kind: 'onboarding', returnedFromMatch: true })
        }}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        shellActions={shellActions}
      />
    </SoundContext>,
  )
}
