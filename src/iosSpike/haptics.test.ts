import { describe, expect, it, vi } from 'vitest'
import { createSpikeHaptics, type HapticsBridge } from './haptics'

const bridge = (overrides: Partial<HapticsBridge> = {}): HapticsBridge => ({
  isNative: () => true,
  impact: vi.fn(() => Promise.resolve()),
  success: vi.fn(() => Promise.resolve()),
  ...overrides,
})

describe('M39 spike haptics', () => {
  it('uses a light impact for selection and a distinct pattern for draw and discard', () => {
    const native = bridge()
    const haptics = createSpikeHaptics(native)
    haptics('select')
    haptics('draw')
    haptics('discard')
    expect(native.impact).toHaveBeenNthCalledWith(1, 'light')
    expect(native.impact).toHaveBeenNthCalledWith(2, 'medium')
    expect(native.success).toHaveBeenCalledOnce()
  })

  it('stays silent in the browser preview', () => {
    const browser = bridge({ isNative: () => false })
    createSpikeHaptics(browser)('discard')
    expect(browser.impact).not.toHaveBeenCalled()
    expect(browser.success).not.toHaveBeenCalled()
  })

  it('never lets a throwing or rejecting bridge escape to the interaction', async () => {
    const rejecting = bridge({ impact: () => Promise.reject(new Error('unimplemented')) })
    expect(() => createSpikeHaptics(rejecting)('select')).not.toThrow()
    const throwing = bridge({ isNative: () => { throw new Error('no bridge') } })
    expect(() => createSpikeHaptics(throwing)('draw')).not.toThrow()
    await Promise.resolve()
  })

  it('the default Capacitor bridge is a no-op outside a native shell', () => {
    expect(() => createSpikeHaptics()('discard')).not.toThrow()
  })
})
