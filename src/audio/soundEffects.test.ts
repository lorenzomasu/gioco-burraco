import { describe, expect, it, vi } from 'vitest'
import { createSoundController, createWebAudioBackend, type SoundBackend } from './soundEffects'

const recorder = () => {
  const played: Array<[string, number]> = []
  const backend: SoundBackend = { play: (cue, volume) => played.push([cue, volume]), resume: vi.fn() }
  return { played, backend }
}

describe('sound controller', () => {
  it('stays silent before activation and never replays earlier requests', () => {
    const { played, backend } = recorder()
    const createBackend = vi.fn(() => backend)
    const sound = createSoundController(createBackend, { muted: false, volume: 0.5 })

    sound.play(['draw'])
    sound.play(['human-turn'])
    expect(createBackend).not.toHaveBeenCalled()

    sound.activate()
    // Activation creates the output lazily and plays nothing by itself.
    expect(createBackend).toHaveBeenCalledOnce()
    expect(backend.resume).toHaveBeenCalledOnce()
    expect(played).toEqual([])

    sound.play(['discard'])
    expect(played).toEqual([['discard', 0.5]])
    sound.activate()
    expect(createBackend).toHaveBeenCalledOnce()
  })

  it('applies mute and volume immediately', () => {
    const { played, backend } = recorder()
    const sound = createSoundController(() => backend, { muted: false, volume: 0.5 })
    sound.activate()

    sound.setPreferences({ muted: true, volume: 0.5 })
    sound.play(['draw'])
    sound.setPreferences({ muted: false, volume: 0.9 })
    sound.play(['draw'])
    sound.setPreferences({ muted: false, volume: 0 })
    sound.play(['draw'])

    expect(played).toEqual([['draw', 0.9]])
  })

  it('bounds one request to a primary sound and one accent', () => {
    const { played, backend } = recorder()
    const sound = createSoundController(() => backend, { muted: false, volume: 1 })
    sound.activate()
    sound.play(['play', 'burraco', 'pozzetto'])
    expect(played.map(([cue]) => cue)).toEqual(['play', 'burraco'])
  })

  it('contains backend creation and playback failures', () => {
    const failing = createSoundController(() => {
      throw new Error('no audio')
    }, { muted: false, volume: 1 })
    expect(() => failing.activate()).not.toThrow()
    expect(() => failing.play(['draw'])).not.toThrow()

    const throwing = createSoundController(() => ({
      play: () => {
        throw new Error('boom')
      },
    }), { muted: false, volume: 1 })
    throwing.activate()
    expect(() => throwing.play(['draw', 'turn'])).not.toThrow()
  })

  it('reports no Web Audio backend where the platform has none', () => {
    expect(createWebAudioBackend()).toBeNull()
  })
})
