# Milestone 37 — Installable PWA & Offline Resume

## Goal

Make the production Burraco client installable on supported desktop/mobile browsers and usable after connectivity is lost once the application shell has been successfully cached.

M37 adds only the PWA/offline infrastructure needed by the existing static client: web-app metadata/icons, a production service worker with a bounded app-shell cache, safe update behaviour, and automated coverage proving that an already-valid browser-local match can be resumed offline.

The authoritative match remains the existing schema-v3 browser-local save. M37 must not add a backend, account, cloud sync, network game state, or a second persistence model.

## Baseline and current architecture

The M36 baseline on `main` is:

`efaac639139df56c3e82a3275cabea306ce72820`

Relevant current behaviour:

- the application is a React/Vite static client deployed by GitHub Pages at the project path `/gioco-burraco/`;
- `vite.config.ts` uses `base: './'`, and the same `dist/` must work both from local `vite preview` root and the Pages project path;
- `.github/workflows/ci.yml` runs the canonical `npm run verify`, uploads that exact verified `dist/`, deploys it to Pages, then runs the deployed Chromium smoke;
- `e2e/deployment.spec.ts` guards against root-relative build requests;
- `scripts/deployed-smoke.mjs` exercises the real deployed client only through public browser/UI behaviour;
- the app has no runtime backend/API dependency and locally synthesized audio has no network dependency;
- the active match is already persisted independently in browser `localStorage` using schema version 3 and can be restored by the shell;
- audio and contextual-guidance preferences already use separate browser-local keys;
- `public/` currently contains only the favicon; there is no manifest, application icon set, service worker or cache layer;
- M34–M36 product flows are stable and must not change as part of this milestone.

## Product and technical decisions

### 1. Progressive enhancement boundary

PWA support is an enhancement to the existing web client.

When service workers, installation, Cache Storage or related browser capabilities are unavailable or fail:

- the online web application must continue to load and play as it does now;
- a valid local match must not be deleted, migrated or rewritten because PWA setup failed;
- the shell must not block onboarding, resume, gameplay, settings or help;
- no game command or save write may wait for service-worker/cache work.

Do not add a custom unsupported-browser error screen.

Browser-provided installation UI is sufficient for M37. Do not add a custom install button or intercept `beforeinstallprompt` unless implementation evidence shows it is strictly necessary for the acceptance criteria.

### 2. Web app manifest and install metadata

Add one production web-app manifest linked from `index.html`.

It must provide, at minimum:

- application `name` and `short_name`;
- a relative `start_url` that resolves to the current deployment scope;
- standalone display behaviour;
- a stable app identity/scope compatible with both local production preview and the GitHub Pages project path;
- theme/background colours consistent with the existing UI;
- install icons satisfying the supported Chromium installability requirements, including 192 × 192 and 512 × 512 assets;
- at least one maskable-compatible icon asset/purpose so supported mobile launchers do not crop the mark badly;
- Italian language metadata where applicable.

Manifest and icon URLs must remain project-path safe. Do not introduce origin-root URLs such as `/manifest.webmanifest` or `/icons/...` into the built production document/manifest if they would escape `/gioco-burraco/` on Pages.

The icon artwork should reuse/simplify the existing Burraco/favicon visual language rather than introducing unrelated branding. Keep assets repository-owned and network-independent.

### 3. Service-worker implementation

Use a standard Vite-compatible PWA/service-worker integration rather than maintaining a large handwritten cache manifest when a small established build integration can generate the same behaviour safely.

The implementation must:

- generate/register a production service worker as part of the normal Vite production build;
- keep registration scope inside the application deployment scope;
- precache only the static application shell needed to load the client offline: built HTML, hashed JS/CSS chunks, manifest and required local visual assets;
- use build-revisioned/precache entries so a new production build does not silently reuse stale hashed application assets;
- remove obsolete caches belonging to prior generated application-shell revisions when the new worker safely activates;
- avoid broad runtime caching of unrelated requests or third-party origins;
- not cache GitHub/API traffic because the game has no network game-state API;
- provide an offline navigation path for the app's own start/document URL after the shell has been cached.

Do not cache arbitrary opaque responses or every same-origin request by default.

The generated service-worker code/cache metadata is build infrastructure and must never enter `GameState`, `MatchState`, `MatchSetup` or the active-match save.

### 4. Safe update behaviour

A newly downloaded worker must never force-refresh an active match without an explicit user action.

Prefer the normal safe service-worker lifecycle:

- the currently controlling worker continues serving the already-open client;
- a new worker may wait while an older controlled client is still open;
- the new worker becomes authoritative on a later safe navigation/session once the browser can activate it;
- old app-shell caches are removed only when activation is safe.

Do not use unconditional mid-session `skipWaiting` + forced reload semantics.

If the chosen integration emits an update callback/event, it may remain presentation-neutral in M37; no update banner is required. The important contract is that an update cannot reload or replace the active client underneath a game.

M38 owns exhaustive service-worker update/failure release coverage.

### 5. Offline resume contract

Offline support begins only after the required production application assets have completed a successful online cache/install cycle.

After that point, with network connectivity disabled:

- loading/reloading the application's own start URL must render the existing client from the service-worker cache;
- a valid in-progress match already present in the normal schema-v3 local save must restore through the existing resume path;
- the restored match must preserve its configured round count and bot difficulty and use the current independent presentation preferences exactly as the existing shell does;
- gameplay must continue locally because engine, bot strategy, scoring, audio synthesis and persistence are already client-side;
- subsequent valid state changes must continue writing through the existing local-save path;
- reconnecting must not merge, replace or reconcile match state with any remote source because none exists.

Offline mode does not promise a fresh first visit without a cached application shell.

### 6. Persistence boundary remains unchanged

M37 must not change the domain/save model merely to support offline loading.

Required invariants:

- `MATCH_SAVE_SCHEMA_VERSION` remains 3;
- `MatchSetup`, `GameState` and `MatchState` gain no PWA/offline fields;
- the active-match storage key and serialization semantics remain unchanged;
- audio/guidance preferences remain separate presentation storage;
- service-worker Cache Storage is for application assets only, never authoritative match JSON;
- clearing/updating service-worker caches must not clear the local match save.

Do not create a second IndexedDB/localStorage match store.

### 7. Development and test isolation

Development must not accumulate a production service worker that makes local coding appear stale.

Required behaviour:

- ordinary `npm run dev` must not register/use the production PWA service worker;
- Vitest/jsdom runs must not depend on service-worker availability;
- the production build served through `vite preview` may register the worker because E2E must test the shipped build;
- browser tests that assert PWA behaviour must use isolated contexts/storage and must not leak service-worker/cache state into unrelated tests;
- no shipped debug route, query parameter, global test API or hidden game-state hook may be added to make PWA E2E easier.

### 8. Existing Pages portability remains mandatory

The current relative-build contract is not relaxed by M37.

The built client, manifest, icons and service worker must all work when the exact same `dist/` is served:

- from the root of local `vite preview`; and
- from `/gioco-burraco/` on GitHub Pages.

Extend the existing deployment-path tests so they fail if PWA additions request required assets from the origin root instead of the application project path.

Do not hard-code `https://lorenzomasu.github.io/gioco-burraco/` into runtime registration logic when a relative/scope-derived URL is sufficient.

### 9. CI/deployment boundary

Preserve the current verified-artifact deployment model.

M37 may update CI/deployed smoke only as needed to prove the shipped PWA, but:

- PRs still do not deploy;
- only a green `main` verification may upload `dist/`;
- Pages must publish the exact `dist/` produced by that green verification;
- no second build may occur between verification and Pages artifact upload;
- the deployed smoke remains public-surface only.

At minimum the deployed smoke should verify that the deployed manifest and service-worker registration are reachable/valid enough to catch a project-path or missing-artifact regression. Keep the smoke bounded; the deterministic offline-resume scenario belongs primarily in the production-build E2E suite.

### 10. No user-visible game-flow change

Do not redesign onboarding, the live table, guided coaching, settings, help, scoring or bot behaviour for M37.

Existing M34–M36 flows must remain functionally unchanged online.

Small document-head metadata required for PWA installation is in scope; unrelated visual/product polish is not.

## In scope

- PWA build integration and required dependency/configuration;
- web app manifest;
- install icons and maskable-compatible asset(s);
- production service-worker registration;
- bounded precache/app-shell strategy;
- safe worker update lifecycle;
- offline navigation after cache warm-up;
- offline restoration of the existing local match;
- Pages project-path correctness for all PWA assets;
- focused Vitest/Playwright/deployment-smoke coverage;
- architecture documentation for the new client-runtime/cache boundary.

## Out of scope

- backend or API;
- user accounts/authentication;
- cloud save/sync;
- cross-device resume;
- multiplayer/network gameplay;
- push notifications;
- background sync;
- periodic background sync;
- remote analytics/telemetry;
- custom install promotion UI;
- app-store packaging;
- arbitrary runtime request caching;
- replacement of localStorage with IndexedDB;
- save schema v4;
- offline-first first visit;
- new gameplay, bot or rules behaviour;
- release/version/tag work belonging to M38.

## Required behaviour

### First online load

A production user visits the app online.

The manifest and required icon assets resolve inside the app scope. The service worker registers without blocking the app. Once install/precache has completed, the application is eligible for the supported browser's normal installation surface and has the app shell required for later offline startup.

### Already-controlled online session

The existing web experience is unchanged. Gameplay, local save writes, settings and guidance do not wait for service-worker operations.

### Connectivity loss after cache warm-up

The current open game continues because it has no runtime network dependency.

If the page is reloaded or the installed app is reopened while offline, the cached app shell loads. The shell then reads the existing authoritative browser-local save and resumes the match through the current resume path.

### Fresh offline visit without cache

No fake guarantee is required. The browser may show its normal offline failure because the app shell has never been installed/cached.

### New deployed build while an old client is open

The open client is not force-reloaded. It may continue under the old controlling worker until a normal safe activation point. The next safely activated build must not mix stale old shell assets with a newer HTML/chunk graph.

### PWA setup/cache failure

The online application remains usable. Match state and its local save remain untouched.

## Acceptance criteria

- [ ] AC1 — The production document links a valid web-app manifest using a project-path-safe URL.
- [ ] AC2 — The manifest includes the required install metadata and resolving 192 × 192 and 512 × 512 application icons, with a maskable-compatible icon/purpose.
- [ ] AC3 — A production service worker is generated/registered only for the shipped production build and its scope is the current application scope rather than the origin root.
- [ ] AC4 — The worker precaches the bounded local app shell and does not introduce broad third-party/arbitrary request caching.
- [ ] AC5 — After one successful online cache/install cycle, the app's own start URL can be reloaded with the browser offline and still renders the application.
- [ ] AC6 — In that offline reload, a previously valid in-progress schema-v3 match resumes through the existing shell path and remains playable/persistable locally.
- [ ] AC7 — `MATCH_SAVE_SCHEMA_VERSION` remains 3 and no PWA/offline state is added to `MatchSetup`, `GameState`, `MatchState` or the active-match envelope.
- [ ] AC8 — Updating/removing generated app-shell caches does not clear or rewrite the browser-local active match.
- [ ] AC9 — A newly available worker does not unconditionally force-reload an already-open match.
- [ ] AC10 — `npm run dev` does not register/use the production worker, preventing stale development-cache behaviour.
- [ ] AC11 — The same built `dist/` resolves document, manifest, icons, worker and built assets both at local preview root and under a Pages-shaped `/gioco-burraco/` project path without required origin-root requests.
- [ ] AC12 — Existing online onboarding, resume, gameplay, M35 difficulty and M36 guidance behaviour remain green.
- [ ] AC13 — The canonical deployment pipeline still publishes the exact verified `dist/`; the deployed smoke checks the shipped PWA metadata/registration without private test hooks.
- [ ] AC14 — Architecture documentation describes the service-worker/cache boundary and unchanged authoritative local-save boundary.
- [ ] AC15 — No M38 release/version/tag scope or unrelated product feature is introduced.

## Required tests

Add/update automated tests covering the smallest robust set below.

### Build/manifest tests

Cover at least:

- built `index.html` links the manifest project-path-safely;
- manifest fields required by this milestone;
- 192 × 192 and 512 × 512 icon entries resolve to repository-owned production assets;
- at least one maskable-compatible icon declaration exists;
- PWA-generated worker/registration assets exist in `dist/`;
- emitted manifest/icon/worker references do not escape a Pages-shaped project path.

Prefer deterministic file/build assertions where browser install UI itself would be flaky or unavailable headlessly.

### Service-worker/offline Playwright test

Add a focused Chromium E2E scenario against the production build:

1. load the app online in a fresh isolated browser context;
2. wait deterministically for service-worker installation/readiness and ensure the page is controlled, using a normal reload when required by the lifecycle rather than a shipped test hook;
3. start or restore a real match through the public UI so the normal active-match save exists;
4. place the browser context offline;
5. reload/open the app start URL;
6. assert that the app renders from cache and the saved match resumes;
7. perform one ordinary local interaction/state transition appropriate to the fixture and prove the existing save remains writable while offline.

Do not satisfy this by intercepting every request with Playwright and manually serving `dist/`; the service worker/cache must be the reason the offline page loads.

### Persistence regression

Cover at least:

- active-match schema stays version 3;
- valid save bytes/semantics from M36 still restore;
- cache cleanup/service-worker setup does not call active-match clear/migration code;
- audio/guidance preferences remain independent.

### Development/progressive-enhancement regression

Cover at least:

- production worker registration is gated away from Vite development;
- registration failure/unsupported service-worker capability does not block React startup or mutate the active save.

Use unit coverage around the registration seam if needed; do not mock game state into the shipped client.

### Existing deployment E2E

Extend `e2e/deployment.spec.ts` rather than creating a competing deployment model.

Keep the existing assertions for:

- relative built JS/CSS/favicon references;
- Pages-shaped project-path execution;
- no origin-root requests;
- public onboarding/match path.

Add PWA-specific path/metadata assertions without weakening the existing checks.

### Deployed smoke

Extend the existing public Chromium smoke narrowly enough to catch:

- manifest missing/unreachable;
- required icon URL missing/unreachable;
- service-worker registration failing or scoped outside the deployed project path.

Do not turn deployed smoke into the exhaustive M38 PWA release suite.

## Documentation updates

Do **not** change `docs/RULES.md`: M37 changes no Burraco behaviour.

Update `docs/ARCHITECTURE.md` to document:

- the service worker as production client infrastructure;
- the app-shell-only cache boundary;
- safe update/activation semantics;
- GitHub Pages project-path/scope requirements;
- offline startup after cache warm-up;
- the fact that localStorage schema-v3 match persistence remains authoritative and independent from Cache Storage;
- production-only registration versus normal Vite development;
- unchanged verified-artifact Pages deployment.

Update `README.md` only where directly useful to describe install/offline capability of the development baseline without falsely changing the current tagged release.

Do not bump `package.json`/lockfile product version, update the release table, create a tag or mark v1.2 released; that belongs to M38.

Do not mark M37 complete in `docs/ROADMAP.md` before implementation, independent review and merge are green.

## Verification

M37 is a standalone delivery unit.

Use focused tests during implementation as useful, then run the canonical gate once at completion:

`npm run verify`

Also run:

`git diff --check`

Do not report verification as passed unless the unchanged repository commands complete successfully.

## Completion report

Create/update:

`docs/milestones/reports/M37-implementation.md`

using the repository report template.

Record concisely:

- branch and final implementation SHA;
- PWA integration/dependency chosen and why;
- manifest/start-url/scope strategy;
- icon assets added;
- service-worker precache/runtime-cache policy;
- update/activation behaviour;
- confirmation that development does not register the production worker;
- confirmation that match persistence remains schema v3 and independent from Cache Storage;
- offline-resume E2E coverage;
- Pages-path and deployed-smoke coverage;
- files changed;
- final `npm run verify` result;
- final `git diff --check` result;
- deviations from this specification;
- remaining risks/ambiguities;
- incidental changes, if any.

## Completion conditions

M37 is complete only when:

- all acceptance criteria are satisfied;
- the shipped client is installable on supported browsers from valid production metadata/assets;
- the warmed production app shell can start offline;
- an existing valid local match resumes and continues locally offline;
- updates cannot force-reload an active match;
- development avoids stale production-worker cache behaviour;
- the Pages project-path deployment remains portable and green;
- the save/domain model is unchanged;
- canonical verification and `git diff --check` pass;
- no M38 or unrelated feature scope is included.
