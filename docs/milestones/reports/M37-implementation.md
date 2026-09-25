# Milestone Implementation Report

## Milestone

- Milestone: M37 — Installable PWA & Offline Resume
- Branch: `milestone-37-installable-pwa-offline-resume`
- Implementer: Claude Code
- Base: specification commit `0464f45` on top of the M36 baseline `efaac63` (current `main`).
  Final HEAD: the implementation commit carrying this report.

## Verification

- `npm run verify`: passed (exit 0) on the final working tree, report included
- Tests: Vitest 52 files / 973 tests passed; Playwright Chromium 63/63 passed
- Build: `tsc -b && vite build` passed (part of `npm run verify`); PWA precache 8 entries
- `git diff --check`: passed
- Working tree at completion: clean

Cloud-only, uncommitted adaptation: Playwright 1.63 expects headless shell 1243 while the
container ships 1194, so a symlinked `chromium_headless_shell-1243` was created outside the
repository. No repository file works around it.

## Behaviour implemented

- **Integration:** `vite-plugin-pwa` 1.3 (dev dependency, Workbox `generateSW`) in
  `vite.config.ts`. Chosen as the standard Vite integration: it emits a build-revisioned
  precache manifest from the real build output instead of a handwritten list.
  `injectRegister: false`; registration is the small seam `src/pwa/registerServiceWorker.ts`,
  called fire-and-forget from `src/main.tsx` after React renders, only when
  `import.meta.env.PROD`, swallowing unsupported/failed registration. `src/vite-env.d.ts`
  adds the standard `vite/client` types needed for `import.meta.env`.
- **Manifest / scope:** `manifest.webmanifest` linked as `./manifest.webmanifest`; `id`,
  `start_url`, `scope` all `./` (resolved against the manifest, so `/` on preview and
  `/gioco-burraco/` on Pages); `name`/`short_name` `Burraco`, `lang: it`, `standalone`,
  theme/background `#071c17` (the existing app background). `index.html` gains
  `<meta name="theme-color">`. Worker `./sw.js`, scope `./`. No origin hard-coded.
- **Icons:** `public/icons/icon-192.png`, `icon-512.png` (purpose `any`, the favicon
  artwork) and `icon-maskable-512.png` (purpose `maskable`, full-bleed background, same
  card mark scaled into the safe zone). Rasterized once from `public/favicon.svg` with the
  local Chromium; no generator is committed.
- **Cache policy:** precache only `index.html`, hashed JS/CSS, favicon, manifest and icons;
  `navigateFallback: index.html`; `runtimeCaching: []`; `cleanupOutdatedCaches: true`.
- **Update/activation:** `skipWaiting: false`, `clientsClaim: false`, no update callback. A
  new worker waits for a safe activation point; the first visit is not claimed. Workbox's
  generated `SKIP_WAITING` message listener remains, but the client never posts it.
- **Development:** `devOptions.enabled: false` and the `PROD` gate: `npm run dev` and
  Vitest never register the worker.
- **Persistence:** no change to `src/shell` or `src/game`; `MATCH_SAVE_SCHEMA_VERSION`
  stays 3, same key/serialization, preferences stay separate. Cache Storage holds assets only.

Tests added/changed:

- `e2e/pwa.spec.ts` (new): warmed offline reload served by the worker
  (`fromServiceWorker()`), network proven down, 3-smazzate Facile match resumes and a
  draw/discard keeps writing the v3 save offline; cache contains only shell URLs; deleting
  caches and unregistering leaves the raw save byte-identical and resumable.
- `e2e/deployment.spec.ts`: new built-artifact test (manifest link and fields, PNG
  dimensions, maskable icon, relative precache URLs, Workbox runtime present, no
  `clientsClaim`, `skipWaiting` only on message, single navigation route, outdated-cache
  cleanup, no `SKIP_WAITING` in the client bundle). The Pages-shaped test now uses
  `https://pages.invalid` (secure context so the worker registers) with `context.route`
  (covers worker requests) and asserts manifest/start/scope/icons/worker scope and script
  under `/gioco-burraco/`; existing assertions kept. New smoke negative test: a
  Pages-shaped server without the manifest makes the smoke fail.
- `scripts/deployed-smoke.mjs`: checks manifest reachable, every icon 200, worker ready
  and scoped to the deployed path.
- `src/pwa/registerServiceWorker.test.ts`, `src/main.test.tsx` (new): dev gate,
  unsupported capability, relative URL/scope, failed/pending registration does not block
  React startup, resume still works, save untouched.

Files changed: `vite.config.ts`, `index.html`, `src/main.tsx`, `src/vite-env.d.ts`,
`src/pwa/*`, `src/main.test.tsx`, `public/icons/*`, `e2e/pwa.spec.ts`,
`e2e/deployment.spec.ts`, `scripts/deployed-smoke.mjs`, `package.json`,
`package-lock.json`, `docs/ARCHITECTURE.md`, `README.md`, this report.

## Deviations from specification

None. CI workflow unchanged: the extended smoke and E2E already run in the existing jobs.

## Known risks and ambiguities

- The built-artifact test matches Workbox's minified `sw.js` text (`precacheAndRoute`
  entries, `NavigationRoute`, `SKIP_WAITING`). A Workbox/plugin upgrade may need the
  regexes adjusted; the lockfile pins the current versions.
- The update path (a second build replacing a controlling worker) is enforced by
  configuration and static assertions, not by a two-build browser test; the spec assigns
  exhaustive update/failure coverage to M38.
- Installability is inferred from manifest/icon/worker validity; the browser install UI is
  not exercised headlessly.
- `vite-plugin-pwa` brings `workbox-build` and its Babel/Rollup tree into dev
  dependencies (large lockfile diff). Top-level `vite`, `rollup`, `esbuild`, `vitest` and
  Playwright versions are unchanged. `npm audit` reports 2 moderate issues via
  `vitest`/`@vitest/mocker`, not introduced by this change.
- Offline E2E runs on `127.0.0.1` (secure context); a real Pages offline launch is not
  automated beyond the deployed smoke's registration check.

## Incidental changes

- `src/vite-env.d.ts` (standard Vite client types) to type `import.meta.env.PROD`.
- Deployed-smoke PASSED message mentions the PWA check.

## Notes for independent review

- `vite.config.ts` Workbox options (`globPatterns` narrowed to html/js/css so the plugin
  adds favicon/manifest/icons exactly once).
- `e2e/pwa.spec.ts` first test: first page uncontrolled, then controlled after the
  onboarding navigation; the offline reload must be `fromServiceWorker()`.
- Deployment spec now at `https://pages.invalid` with `context.route`; confirm no weakening
  of the root-relative request guard.
- `src/main.test.tsx` imports the real entrypoint with `vi.stubEnv('PROD', …)`.
- `docs/ROADMAP.md`, `docs/RULES.md`, package version and release docs intentionally untouched.
