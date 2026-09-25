/**
 * Production-only service-worker registration (M37).
 *
 * PWA support is a progressive enhancement: registration never blocks React startup, never
 * touches the browser-local match save and swallows unsupported/failed setup. The worker is
 * registered relative to the document so its scope stays inside the deployment path
 * (`/gioco-burraco/` on GitHub Pages, `/` on the local preview), and it is never registered
 * by the Vite development server, where it would serve a stale cached shell.
 */
export const SERVICE_WORKER_URL = './sw.js'
export const SERVICE_WORKER_SCOPE = './'

type ServiceWorkerHost = Readonly<{
  /** `import.meta.env.PROD`: true only for the shipped production build. */
  isProduction: boolean
  /** `navigator.serviceWorker`, absent in unsupported or insecure contexts. */
  serviceWorker?: Pick<ServiceWorkerContainer, 'register'>
}>

/**
 * Registers the generated worker without an update callback: a newly installed worker waits
 * until no client uses the old one, so an open match is never reloaded underneath the player.
 * Resolves `true` when registration was accepted, `false` when skipped or rejected.
 */
export const registerServiceWorker = async ({ isProduction, serviceWorker }: ServiceWorkerHost): Promise<boolean> => {
  if (!isProduction || serviceWorker === undefined) return false
  try {
    await serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
    return true
  } catch {
    return false
  }
}
