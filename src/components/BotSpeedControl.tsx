import { useId } from 'react'
import type { BotPlaybackSpeed } from './GameTable'

const playbackSpeedLabels: Readonly<Record<BotPlaybackSpeed, string>> = {
  normal: 'Normale',
  fast: 'Veloce',
}

type BotSpeedControlProps = Readonly<{
  speed: BotPlaybackSpeed
  onChange: (speed: BotPlaybackSpeed) => void
}>

/** Native radio group for the transient bot playback preference; it never touches the match. */
export function BotSpeedControl({ speed, onChange }: BotSpeedControlProps) {
  const name = useId()
  return (
    <fieldset className="playback-controls">
      <legend>Velocità bot</legend>
      {(['normal', 'fast'] as const).map((option) => (
        <label key={option} className="playback-controls__option">
          <input
            type="radio"
            name={name}
            value={option}
            checked={speed === option}
            onChange={() => onChange(option)}
          />
          {playbackSpeedLabels[option]}
        </label>
      ))}
    </fieldset>
  )
}
