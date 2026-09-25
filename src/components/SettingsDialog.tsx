import type { AudioPreferences } from '../shell/audioPreferences'
import { AudioControls } from './AudioControls'
import { BotSpeedControl } from './BotSpeedControl'
import { Dialog } from './Dialog'
import type { BotPlaybackSpeed } from './GameTable'

type SettingsDialogProps = Readonly<{
  speed: BotPlaybackSpeed
  onSpeedChange: (speed: BotPlaybackSpeed) => void
  audio: AudioPreferences
  onAudioChange: (preferences: AudioPreferences) => void
  guidanceEnabled: boolean
  onGuidanceEnabledChange: (enabled: boolean) => void
  onClose: () => void
}>

/**
 * The single app-level settings surface. Every preference is shell presentation state:
 * opening, changing or closing it never touches `GameState`, `MatchState` or the match save.
 */
export function SettingsDialog({
  speed,
  onSpeedChange,
  audio,
  onAudioChange,
  guidanceEnabled,
  onGuidanceEnabledChange,
  onClose,
}: SettingsDialogProps) {
  return (
    <Dialog title="Impostazioni" onClose={onClose} className="dialog--settings">
      <div className="settings-section">
        <BotSpeedControl speed={speed} onChange={onSpeedChange} />
        <p className="settings-section__help">Quanto attendono i bot tra una mossa e la successiva.</p>
      </div>
      <div className="settings-section">
        <AudioControls preferences={audio} onChange={onAudioChange} />
        <p className="settings-section__help">Effetti brevi e facoltativi: ogni informazione resta visibile anche senza audio.</p>
      </div>
      <div className="settings-section">
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={guidanceEnabled}
            onChange={(event) => onGuidanceEnabledChange(event.target.checked)}
          />
          Guida contestuale
        </label>
        <p className="settings-section__help">
          Durante la partita spiega cosa puoi fare nella fase in corso e perché alcuni comandi non sono disponibili.
        </p>
      </div>
    </Dialog>
  )
}
