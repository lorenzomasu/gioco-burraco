import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolveBuildTarget } from './src/iosSpike/buildMode.ts'

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))

// M37: web-app manifest plus a generated Workbox app-shell worker, production build only.
const pwaPlugin = () => VitePWA({
  // `src/pwa/registerServiceWorker.ts` registers the worker; nothing is injected.
  injectRegister: false,
  // No `skipWaiting`/`clientsClaim`: a new worker waits for a safe activation point.
  registerType: 'prompt',
  // `npm run dev` never serves or registers the production worker.
  devOptions: { enabled: false },
  includeAssets: ['favicon.svg'],
  manifest: {
    id: './',
    name: 'Burraco',
    short_name: 'Burraco',
    description: 'Burraco a quattro giocatori nel browser: tu e un bot compagno contro due bot avversari.',
    lang: 'it',
    dir: 'ltr',
    // Relative to the manifest, so the same `dist` is scoped to `/` locally and
    // to `/gioco-burraco/` on GitHub Pages.
    start_url: './',
    scope: './',
    display: 'standalone',
    theme_color: '#071c17',
    background_color: '#071c17',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Only the built static shell: HTML and hashed JS/CSS. The plugin adds the favicon
    // (`includeAssets`), the manifest and its icons exactly once.
    globPatterns: ['**/*.{html,js,css}'],
    // Offline navigation to the app's own start URL is answered by the cached shell.
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    skipWaiting: false,
    clientsClaim: false,
    // No runtime caching: unrelated and third-party requests always go to the network.
    runtimeCaching: [],
  },
})

export default defineConfig(({ mode }) => {
  const target = resolveBuildTarget(mode)
  const spikeRoot = target.kind === 'ios-spike' ? path.resolve(repositoryRoot, target.root) : null
  return {
    plugins: [
      react(),
      // The M39 iOS spike is bundled into the native shell and never ships the web worker.
      ...(target.kind === 'web' ? [pwaPlugin()] : []),
    ],
    // M39 (experimental): the spike has its own `index.html` and output directory, so the
    // released web entry and `dist` are never replaced by it.
    ...(target.kind === 'ios-spike' && spikeRoot && {
      root: spikeRoot,
      publicDir: path.resolve(spikeRoot, target.publicDir),
      build: { outDir: path.resolve(spikeRoot, target.outDir), emptyOutDir: true },
    }),
    // Relative asset URLs keep the static build portable: it runs from the GitHub Pages
    // project path (`/gioco-burraco/`) and from the root of the local `vite preview`.
    base: './',
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.ts'],
      // Browser E2E specs run only through Playwright against the production build.
      exclude: [...configDefaults.exclude, 'e2e/**'],
    },
  }
})
