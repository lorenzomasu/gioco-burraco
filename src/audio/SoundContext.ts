import { createContext, useContext } from 'react'
import type { SoundCue } from './soundEffects'

/** Requests the sounds of one presentation event; fire-and-forget, never awaited. */
export type PlaySounds = (cues: readonly SoundCue[]) => void

const silent: PlaySounds = () => undefined

/**
 * The shell provides its sound controller here. Without a provider (a standalone table)
 * every request is silently dropped.
 */
export const SoundContext = createContext<PlaySounds>(silent)

export const usePlaySounds = (): PlaySounds => useContext(SoundContext)
