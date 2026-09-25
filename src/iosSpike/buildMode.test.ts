import { describe, expect, it } from 'vitest'
import capacitorConfig from '../../capacitor.config.json'
import { IOS_SPIKE_MODE, IOS_SPIKE_OUT_DIR, resolveBuildTarget } from './buildMode'

describe('M39 build target selection', () => {
  it('keeps every ordinary mode on the released web/PWA build', () => {
    for (const mode of ['production', 'development', 'test', 'ios', 'ios-spike-extra', '']) {
      expect(resolveBuildTarget(mode)).toEqual({ kind: 'web' })
    }
  })

  it('builds the spike only in its explicit mode, into its own output directory', () => {
    expect(resolveBuildTarget(IOS_SPIKE_MODE)).toEqual({
      kind: 'ios-spike',
      root: 'ios-spike',
      publicDir: '../public',
      outDir: `../${IOS_SPIKE_OUT_DIR}`,
    })
    expect(IOS_SPIKE_OUT_DIR).not.toBe('dist')
  })

  it('points the native shell at the locally bundled spike, never at a remote or dev server', () => {
    expect(capacitorConfig.webDir).toBe(IOS_SPIKE_OUT_DIR)
    expect(capacitorConfig).not.toHaveProperty('server')
    expect(JSON.stringify(capacitorConfig)).not.toMatch(/https?:\/\//)
  })
})
