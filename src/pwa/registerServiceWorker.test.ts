import { afterEach, describe, expect, it, vi } from 'vitest'
import { MATCH_SAVE_STORAGE_KEY } from '../shell/matchPersistence'
import { registerServiceWorker, SERVICE_WORKER_SCOPE, SERVICE_WORKER_URL } from './registerServiceWorker'

const container = (register: ServiceWorkerContainer['register']) => ({ register: vi.fn(register) })

describe('registerServiceWorker (M37)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never registers the production worker outside the production build', async () => {
    const serviceWorker = container(async () => ({}) as ServiceWorkerRegistration)
    expect(await registerServiceWorker({ isProduction: false, serviceWorker })).toBe(false)
    expect(serviceWorker.register).not.toHaveBeenCalled()
  })

  it('skips quietly when service workers are unsupported', async () => {
    expect(await registerServiceWorker({ isProduction: true, serviceWorker: undefined })).toBe(false)
  })

  it('registers the generated worker relative to the document, scoped to the app path', async () => {
    const serviceWorker = container(async () => ({}) as ServiceWorkerRegistration)
    expect(await registerServiceWorker({ isProduction: true, serviceWorker })).toBe(true)
    expect(serviceWorker.register).toHaveBeenCalledExactlyOnceWith('./sw.js', { scope: './' })
    expect(SERVICE_WORKER_URL).not.toMatch(/^\//)
    expect(SERVICE_WORKER_SCOPE).not.toMatch(/^\//)
  })

  it('swallows a registration failure without touching the local match save', async () => {
    window.localStorage.setItem(MATCH_SAVE_STORAGE_KEY, '{"version":3}')
    const setItem = vi.spyOn(window.localStorage, 'setItem')
    const removeItem = vi.spyOn(window.localStorage, 'removeItem')
    const clear = vi.spyOn(window.localStorage, 'clear')
    const serviceWorker = container(async () => {
      throw new DOMException('insecure', 'SecurityError')
    })

    await expect(registerServiceWorker({ isProduction: true, serviceWorker })).resolves.toBe(false)
    expect(window.localStorage.getItem(MATCH_SAVE_STORAGE_KEY)).toBe('{"version":3}')
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })
})
