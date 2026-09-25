/**
 * M39 (experimental): selects the ordinary web/PWA build or the isolated iOS architecture spike.
 *
 * Only the explicit Vite mode `ios-spike` (`npm run dev:ios-spike`, `npm run build:ios-spike`)
 * builds the spike. Every other mode, including the default `production` build that GitHub Pages
 * deploys, keeps the released entry, output directory and PWA worker unchanged.
 */
export const IOS_SPIKE_MODE = 'ios-spike'

/** Relative to the repository root; `capacitor.config.json` points its `webDir` here. */
export const IOS_SPIKE_OUT_DIR = 'dist-ios-spike'

export type BuildTarget =
  | Readonly<{ kind: 'web' }>
  | Readonly<{
    kind: 'ios-spike'
    /** Directory holding the spike's own `index.html`, used as the Vite root. */
    root: string
    /** The shared static assets (favicon, icons), relative to `root`. */
    publicDir: string
    /** Relative to `root`: the repository-level `dist-ios-spike`. */
    outDir: string
  }>

export const resolveBuildTarget = (mode: string): BuildTarget => mode === IOS_SPIKE_MODE
  ? { kind: 'ios-spike', root: 'ios-spike', publicDir: '../public', outDir: `../${IOS_SPIKE_OUT_DIR}` }
  : { kind: 'web' }
