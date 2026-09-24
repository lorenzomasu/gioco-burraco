import { useState } from 'react'
import { GameTable, type BotPlaybackSpeed } from './components/GameTable'
import { StartScreen } from './components/StartScreen'
import type { RoundFactory } from './game/match'
import { createSetupRoundFactory, type MatchSetup } from './shell/matchSetup'

type AppProps = Readonly<{
  /** Deterministic test seam; production matches use freshly shuffled named rounds. */
  createRoundFactory?: (setup: MatchSetup) => RoundFactory
}>

/**
 * Transient application screen. A match screen owns exactly one mounted `GameTable`;
 * leaving it unmounts the table and cancels its pending playback through cleanup.
 */
type AppScreen =
  | Readonly<{ kind: 'onboarding' }>
  | Readonly<{ kind: 'match'; createGame: RoundFactory }>

export default function App({ createRoundFactory = (setup) => createSetupRoundFactory(setup) }: AppProps) {
  const [screen, setScreen] = useState<AppScreen>({ kind: 'onboarding' })
  const [lastPlayerName, setLastPlayerName] = useState('')
  const [playbackSpeed, setPlaybackSpeed] = useState<BotPlaybackSpeed>('normal')

  if (screen.kind === 'onboarding') {
    return (
      <StartScreen
        initialName={lastPlayerName}
        onStart={(setup) => {
          setLastPlayerName(setup.humanPlayerName)
          setScreen({ kind: 'match', createGame: createRoundFactory(setup) })
        }}
      />
    )
  }

  return (
    <GameTable
      createGame={screen.createGame}
      onLeaveMatch={() => setScreen({ kind: 'onboarding' })}
      playbackSpeed={playbackSpeed}
      onPlaybackSpeedChange={setPlaybackSpeed}
    />
  )
}
