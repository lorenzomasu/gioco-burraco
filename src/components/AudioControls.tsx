import { useId } from 'react'
import { clampVolume, type AudioPreferences } from '../shell/audioPreferences'

type AudioControlsProps = Readonly<{
  preferences: AudioPreferences
  onChange: (preferences: AudioPreferences) => void
}>

/**
 * Reusable sound preferences: a native mute checkbox and a native volume slider. The state
 * is stated in text and through native semantics, never by an icon or colour alone.
 */
export function AudioControls({ preferences, onChange }: AudioControlsProps) {
  const volumeId = useId()
  const percent = Math.round(preferences.volume * 100)
  return (
    <fieldset className="audio-controls">
      <legend>Suoni</legend>
      <label className="audio-controls__mute">
        <input
          type="checkbox"
          checked={preferences.muted}
          onChange={(event) => onChange({ ...preferences, muted: event.target.checked })}
        />
        Disattiva suoni
      </label>
      <label className="audio-controls__volume" htmlFor={volumeId}>Volume</label>
      <input
        id={volumeId}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={preferences.muted ? `${percent}%, suoni disattivati` : `${percent}%`}
        onChange={(event) => onChange({ ...preferences, volume: clampVolume(Number(event.target.value) / 100) })}
      />
      {/* Visual echo only; the slider's own value text is the accessible state. */}
      <span className="audio-controls__value" aria-hidden="true">{percent}%</span>
    </fieldset>
  )
}
