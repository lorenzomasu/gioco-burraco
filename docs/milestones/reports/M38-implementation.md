# Milestone Implementation Report

## Milestone

- Milestone: M38 — V1.2 Hardening & Release
- Branch: `milestone-38-v1.2-hardening-release`
- Implementer: Claude Code
- Base: specification commit `4177866` on top of `main` `9a0b39b` (M34–M37).
  Final HEAD: the implementation commit carrying this report.

## Verification

- `npm run verify`: passed (exit 0) on the final implementation tree; this report was then
  completed with the recorded counts (documentation only) and `git diff --check` re-run
- Tests: Vitest 52 files / 973 tests passed (unchanged); Playwright Chromium 69/69 passed
  (63 before M38 + 6 new)
- Build: `tsc -b && vite build` passed (part of `npm run verify`); PWA precache 8 entries
- `git diff --check`: passed
- Working tree at completion: clean

Cloud-only, uncommitted adaptation: Playwright 1.63 expects headless shell 1243 while the
container ships 1194, so a symlinked `chromium_headless_shell-1243` was created outside the
repository. No repository file works around it.

## Behaviour implemented

No production code changed: the audit found no release-blocking defect. M38 closes the
browser-level gaps and prepares the `1.2.0` release metadata.

Release matrix (real Chromium, production build):

| Requirement | Test | Status |
| --- | --- | --- |
| 2 smazzate reach the final result | `lifecycle.spec.ts` two-smazzate test | existing |
| 3 smazzate survive reload/resume | `persistence.spec.ts` three-smazzate test | existing |
| 4 smazzate default path playable | `lifecycle.spec.ts` four-smazzate test | existing |
| Normale default, Facile persists | `persistence.spec.ts` difficulty test | existing |
| Legacy v1 / v2 saves restore and continue as v3 | `persistence.spec.ts` `a released schema-v{1,2} save …` | new |
| Malformed/unsupported legacy saves fail safely | `persistence.spec.ts` `malformed or unsupported legacy saves …` | new |
| Guidance dismiss is presentation-only | `guidance.spec.ts` first test | existing |
| Guidance re-enabled from Settings, visible on the same match, save untouched, survives reload | `guidance.spec.ts` first test, extended | extended |
| Warmed offline reload/resume | `pwa.spec.ts` offline test | existing |
| Cache removal keeps the save; app-shell-only cache | `pwa.spec.ts` cache tests | existing |
| Worker update waits, no takeover/reload, next client uses it, save intact | `pwa.spec.ts` `service-worker update` | new |
| Unsupported / rejected registration does not block startup or touch the save | `pwa.spec.ts` `with service-worker setup {unsupported, registration rejected} …` | new |
| Hidden information | `hidden-information.spec.ts` | existing |
| Version metadata/docs agree | `deployment.spec.ts` release-version test (now `1.2.0`) | updated |

- **Legacy saves:** both formats the migration layer accepts are browser-tested: schema v1
  (released v1.1.x, no length/difficulty → four smazzate, Normale) and schema v2 (M34 on
  `main`, explicit length, no difficulty → Normale, tested with 3 smazzate). Each is derived
  from a real committed match by removing exactly the fields its version lacked, written to
  storage and reloaded; the test asserts the `Partita ripresa` status, same tallone and
  discard pile, then one draw/discard rewrites the save as v3 with the historical length and
  `normal`. Invalid cases: non-JSON, v1 carrying `roundCount`, v2 carrying `botDifficulty`,
  v1 with an out-of-range round, versions 0 and 4 → onboarding and the save removed.
- **Service-worker update:** a test-only Node static server serves the real `dist` on a
  per-worker localhost port (secure context). Request routing was not usable: Chromium's
  update check of the worker script bypasses `context.route` ("unknown error when fetching
  the script"). Build 2 is a test-only transform of the same artifacts: both builds' `sw.js`
  get a prepended MessageChannel responder reporting their build number, and build 2 also
  changes the `index.html` precache revision and serves an `index.html` marker. The test
  installs build 1, starts a controlled 3-smazzate match, switches the server to build 2 and
  calls `registration.update()`; it asserts build 2 is `waiting`, build 1 stays `active` and
  controller, no main-frame navigation happened, the in-page marker survived, and the raw
  save is byte-identical. After closing the page (the last old client), a new page is
  controlled by build 2, served build 2's `index.html`, resumes the same byte-identical save
  and plays a turn in schema v3.
- **Failure paths:** an init script removes `navigator.serviceWorker` (unsupported), or
  `sw.js` is routed to 404 while an init-script wrapper records that the real
  `register()` rejected. Both start a 2-smazzate Facile match, reload, assert resume with a
  byte-identical save, no controller/registration, then play a turn in schema v3. The
  shared `pageErrors` fixture asserts no uncaught error.
- **Version/docs:** `package.json` and root `package-lock.json` metadata `1.2.0` (no
  dependency changes); `README.md` current release `v1.2.0`; `docs/RELEASE.md` adds the v1.2
  row (M37 previous product milestone, M38 release milestone, `v1.2.0` / `1.2.0`), the v1.2
  checklist examples and tag commands, lists `v1.1.2` among immutable tags and documents the
  PWA checks the deployed smoke already performs.

Files changed: `e2e/persistence.spec.ts`, `e2e/guidance.spec.ts`, `e2e/pwa.spec.ts`,
`e2e/deployment.spec.ts`, `package.json`, `package-lock.json`, `README.md`,
`docs/RELEASE.md`, this report.

CI/deployment files: `.github/workflows/ci.yml` and `scripts/deployed-smoke.mjs` unchanged;
the deployed smoke already covers every item of spec §11 since M37.

## Deviations from specification

None.

## Known risks and ambiguities

- The update test binds ports `4180 + parallelIndex` on `127.0.0.1`; an unrelated process on
  such a port would fail the test (not retried). CI runs one worker (port 4180).
- The simulated second build is a transform of the same `dist` (worker bytes and the
  `index.html` revision differ; hashed JS/CSS are shared). It proves the lifecycle, not a
  real two-commit deploy.
- The safe activation boundary tested is "last old client closed". The test asserts the
  very next navigation is already controlled by build 2; this held in every local run
  (including 4× repeated parallel runs) but relies on Chromium activating the waiting
  worker before handling that navigation.
- Legacy fixtures are derived from the current serializer by field removal, which matches
  the released v1/v2 wire shapes as defined by the migration code; no archived v1.1.x save
  file exists in the repository.
- The v1.2.0 release itself (PR CI, merge, main verify/deploy/deployed smoke, tag) is not
  done from this branch.

## Incidental changes

- `e2e/deployment.spec.ts`: `RELEASE_VERSION` comment/value updated to M38 / `1.2.0`.
- `README.md`: the M37 installable-app sentence now names v1.2.0 instead of "not yet in a
  tagged release".

## Notes for independent review

- `e2e/pwa.spec.ts` `serveBuilds` and `workerBuild`: confirm the transforms stay test-only
  and do not weaken the M37 `skipWaiting`/`clientsClaim` static assertions.
- The `test.use({ baseURL })` fixture function for the per-worker origin.
- `e2e/persistence.spec.ts` legacy conversion (`LEGACY_SAVES.toLegacy`) against
  `migrateVersion1MatchSave` / `migrateVersion2MatchSave`.
