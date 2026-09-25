# Milestone Implementation Report

## Milestone

- Milestone: M33 — V1.1 Hardening & Release
- Branch: `milestone-33-v1.1-hardening-release`
- Implementer: Claude Code
- Final HEAD: the commit adding this report (base `579fac0`)

## Verification

- `npm run verify`: passed (exit 0) on the final M33 working tree
- Tests: Vitest 43 files / 702 tests passed; Playwright Chromium 41/41 passed (39 existing + 2 new)
- Build: `tsc -b && vite build` passed
- `git diff --check`: passed (part of `npm run verify`)
- Extra: `motion.spec.ts` + `app-shell.spec.ts` with `--repeat-each=3` 33/33 passed
- Working tree at completion: clean

Environment note (as in M30–M32): the container ships Chromium build 1194 while the pinned
`@playwright/test` 1.63 expects headless-shell build 1243. The unchanged repository command
ran after a container-only symlink to the preinstalled 1194 headless shell; no repository
change. CI installs its own matching browser.

## Behaviour implemented

No product code changed. M33 adds release coverage, the version bump and v1.1 release docs.

### Browser release matrix audit (AC1–AC10)

| M33 requirement | Covering test(s) |
| --- | --- |
| Full face-up pile, chronological order, long pile local scroll, no page overflow (AC2) | `discard-pile.spec.ts` — long pile at narrow/desktop widths, overlapping spread layout |
| Empty pile after collection, keyboard collection (AC2, AC5) | `discard-pile.spec.ts` — keyboard and collection |
| Save/reload/resume, pending bot playback restore (AC3) | `persistence.spec.ts` (3 tests), `discard-pile.spec.ts` resumed long pile, `app-shell.spec.ts` resume status |
| Muted audio + reduced motion, real action (AC4) | `app-shell.spec.ts` integrated test (tightened, see below); `motion.spec.ts` reduced motion |
| Keyboard-only fallbacks (AC5) | `hand-manipulation.spec.ts` keyboard only; `app-shell.spec.ts` Settings/Help focus and keyboard abandonment |
| Touch direct manipulation + native page scroll (AC6) | `hand-manipulation.spec.ts` touch at narrow widths |
| 320/390 px shell/table, no document overflow (AC7) | `app-shell.spec.ts` per-width shell, `mobile.spec.ts`, `hand-manipulation.spec.ts` 320 px fixture |
| Interrupted animation (AC8) | **new** in `motion.spec.ts` (below) |
| Hidden information (AC9) | `hidden-information.spec.ts` |
| Four smazzate to final result (AC10) | `lifecycle.spec.ts` |
| Deployment project path/metadata | `deployment.spec.ts`; `scripts/deployed-smoke.mjs` unchanged |

### Interrupted-animation coverage (AC8)

Two tests in `e2e/motion.spec.ts`. A test-side init script wraps `Element.prototype.animate`
and pauses each `.motion-proxy` flight, so the flight is deterministically in progress when
the session is replaced; the held `Animation` objects are then force-finished to fire any
stale completion.

- Abandon mid-flight: human stock draw (hand already 12 committed cards, proxy in the layer)
  → «Nuova partita» → «Abbandona partita». Asserts proxy removed, animation `idle`, save
  cleared; then a replacement match starts, stale flights are finished, and the new view
  (hand, proxy count, enabled draw) is unchanged and still playable.
- «Completa subito» mid bot flight: a paused `…>seat` bot flight is cancelled by the
  completed session; all held flights `idle`, no proxy, and forcing the stale completions
  leaves the committed hand/tallone untouched.

Both run under the shared `pageErrors` fixture (no uncaught page error). Mutation check:
with `MotionLayer`'s effect cleanup replaced by a no-op, both new tests fail; restored.

### Version and release docs (AC12–AC14)

- `package.json` and root `package-lock.json` metadata: `1.0.0` → `1.1.0` (no dependency change).
- `README.md`: current release `v1.1.0`.
- `docs/RELEASE.md`: release-version table (v1.0: M25→M26 `v1.0.0`; v1.1: M32→M33 `v1.1.0`),
  generic `<version>` checklist with concrete `v1.1.0` commands, reviewed HEAD unchanged after
  review, package/lock version = tag without `v`, existing tags incl. `v1.0.0` immutable.

## Deviations from specification

None.

## Known risks and ambiguities

- The interruption tests rely on test-side WAAPI instrumentation (explicitly permitted); they
  prove cancellation/unmount semantics, not the visual timing of an unpaused flight.
- No release-blocking product defect was found; production deployment, deployed smoke and tag
  `v1.1.0` remain post-merge gate steps and are not claimed here.

## Incidental changes

- `e2e/app-shell.spec.ts` muted + reduced-motion test: added two assertions (no `.motion-proxy`;
  the active-match save contains no audio preference) to make AC4 explicit.
- CI/deployment files (`.github/workflows/ci.yml`, `scripts/deployed-smoke.mjs`): unchanged.
- `docs/RULES.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`: unchanged.

## Notes for independent review

- `holdFlights`/`finishHeldFlights` in `e2e/motion.spec.ts`: confirm the stale-finish check is
  meaningful (proxy `onfinish` stays attached after cancel).
- `docs/RELEASE.md` checklist wording for v1.1 exact-SHA sequence.
