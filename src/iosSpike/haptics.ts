/**
 * M39 (experimental): native haptics through the official Capacitor plugin, with a silent
 * browser fallback. Feedback is fire-and-forget: no interaction ever waits for it or fails
 * because the native bridge is missing, rejects or throws.
 */
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export type SpikeHapticCue = 'select' | 'draw' | 'discard' | 'sheet'

export type HapticsBridge = Readonly<{
  isNative: () => boolean
  impact: (style: 'light' | 'medium') => Promise<void>
  success: () => Promise<void>
}>

export type SpikeHaptics = (cue: SpikeHapticCue) => void

const capacitorBridge: HapticsBridge = {
  isNative: () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Haptics'),
  impact: (style) => Haptics.impact({ style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }),
  success: () => Haptics.notification({ type: NotificationType.Success }),
}

export const createSpikeHaptics = (bridge: HapticsBridge = capacitorBridge): SpikeHaptics => (cue) => {
  try {
    // The browser preview has no Taptic Engine: stay silent rather than emulate.
    if (!bridge.isNative()) return
    // Selection and sheet are light taps; draw is a firmer impact; discard is the distinct,
    // committed-feeling notification pattern.
    const feedback = cue === 'discard'
      ? bridge.success()
      : bridge.impact(cue === 'draw' ? 'medium' : 'light')
    void Promise.resolve(feedback).catch(() => undefined)
  } catch {
    // A broken bridge must never break the interaction that triggered it.
  }
}
