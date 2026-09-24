# Milestone Implementation Report

## Milestone

- Milestone: M25 — E2E & Release Hardening
- Branch: `milestone-25-e2e-release-hardening`
- Implementer: Claude Code
- Specification HEAD at start: `b97032c` (`docs: specify E2E and release hardening milestone (M25)`)

## Verification

- `npm run verify`: passed, exit code 0. This was the final run, after this report was written and before the commit. It now runs `npm test && npm run test:e2e && git diff --check`, and `test:e2e` is `npm run build && playwright test`.
- Vitest: 562 tests passed across 30 files.
  - Baseline before M25: 553 in 29 files.
  - Added: the new file `src/components/GameTableAutomationFailure.test.tsx` with 9 tests.
  - Changed: 2 existing tests in `src/components/GameTablePlayback.test.tsx`; see "Tests added or changed".
- Playwright: 9 tests passed in 5 spec files under `e2e/`. One project, `chromium` (Playwright 1.63.0, Chrome Headless Shell 153), against `vite preview` of the production `dist` at `http://127.0.0.1:4173`.
  - Stability: `npx playwright test --repeat-each=5` passed 45/45 locally. A `CI=1` run (1 worker, `forbidOnly`) passed 9/9.
- Build: passed (`tsc -b && vite build`). `tsc -b` now also typechecks `e2e/` and `playwright.config.ts` through the new `tsconfig.e2e.json` reference.
- `git diff --check`: passed as part of `npm run verify`. `git diff --cached --check` also passed on the staged milestone diff, which includes the new untracked files and this report.
- Working tree at completion: clean after the milestone commit.

## Behaviour implemented

### Playwright release gate (AC1, AC2, AC15)

- `@playwright/test` is a dev dependency. The root `playwright.config.ts` defines:
  - Chromium only;
  - `testDir: ./e2e`;
  - `baseURL` `http://127.0.0.1:4173`;
  - a `webServer` running `vite preview --host 127.0.0.1 --port 4173 --strictPort` with `reuseExistingServer: false`, so it always serves the freshly built `dist` and never the dev server;
  - `retries: 0`;
  - `trace: retain-on-failure`, `screenshot: only-on-failure`, no video;
  - a `list` reporter;
  - `workers: 1` and `forbidOnly` when `CI` is set.
- `npm run verify` stays the single gate. It runs Vitest, then the build, then Playwright against that build, then `git diff --check`. The build runs once, inside `test:e2e`.
- Vitest excludes `e2e/**`, so the specs run only in Playwright.
- `test-results/` and `playwright-report/` are git-ignored.

### Deterministic E2E setup (AC15)

All setup is test-side, in `e2e/fixtures.ts`. The shipped app has no new route, query parameter, global, control or attribute.

- **Seeded shuffle.** `page.addInitScript` replaces `Math.random` before the bundle runs with a fixed-seed Mulberry32 sequence (seed `20250925`), the same algorithm as `createSeededRandom`. The app's default shuffle source reads it unchanged.
  - React DOM consumes a few `Math.random` values at load, so the browser deal is not the same as `createSeededRandom(seed)` in Node. The sequence is still identical on every load. A test proves this: two fresh loads deal the same hand.
- **Paused fake clock.** `page.clock.install` and then `pauseAt` a fixed instant. Bot playback timers fire only when a test calls `clock.runFor(...)` or `clock.resume()`, or uses the real `Completa subito` control. With the clock paused, only the test's own actions change the table, so there are no timing races and no `waitForTimeout`.
- **Known-state fixtures.** These go through the real M22 boundary. `openSavedMatch` builds a match in Node with `startMatch` plus `createSetupRoundFactory(..., createSeededRandom(seed))`, serialises it with the app's own `serializeMatchSave`, writes it to `localStorage` and reloads. Only the hidden-information test uses it.
- **Page errors.** An automatic fixture records every `pageerror` and fails the test if there are any. Console errors are attached as a diagnostic, but do not fail the test.

### Browser coverage (AC4–AC10)

| Spec | Coverage |
| --- | --- |
| `smoke.spec.ts` | A trimmed name starts smazzata 1. The table, `Smazzata 1/4`, the named `h1` and turn banner, 11 hand cards and both enabled draw controls are present. A fresh load deals the same hand again. Human draw and discard are followed by visible bot playback: `Bot in gioco…`, `Completa subito`, the human's controls disabled, and one real delayed step (`clock.runFor(550)`) that adds one timeline entry. `Completa subito` then returns the turn to the human, who can draw again. |
| `lifecycle.spec.ts` | One session plays all four smazzate with the simple strategy: draw, discard the first card, `Completa subito`. The loop is bounded by `MAX_LIFECYCLE_ITERATIONS = 400`. Rounds 1–3 each show the result heading, `Dopo N smazzate` and `Inizia smazzata N+1`, and the header advances 1→4. The final screen shows `Partita conclusa`, `Risultato finale`, the outcome line, `Match Points N`, two `N VP` values and `Gioca ancora`. Exact scores are not asserted. |
| `persistence.spec.ts` | Save → reload → resume: after the turn returns to the human, the version-1 save holds the setup name and an in-progress match. The reload resumes the same match with the same tallone, discard pile and hand, and play continues.<br>Reload during bot playback: after one committed bot step, the reload shows the pending chain again with a fresh, empty timeline. With real time resumed, the recreated playback returns the turn to the human.<br>`Nuova partita` during pending playback: the step is 50 ms from firing. The native confirmation text is `LEAVE_MATCH_CONFIRMATION` and is accepted. The app returns to onboarding and the save is `null`. The clock then advances 5 × 550 ms with no mutation, no table and no save. The replacement match starts clean. |
| `mobile.spec.ts` | 320×740, `isMobile`, `hasTouch`. Onboarding, start, tallone tap, card selection (`aria-pressed`), `Scarta e passa` and `Completa subito` all work by tap. `clientWidth` is 320 and `scrollWidth ≤ clientWidth` at every step. Playwright's tap actionability checks prove that nothing, including M24 cues, covers the controls. |
| `hidden-information.spec.ts` | Bot seats show `11 carte in mano` and contain no card image or button. At three points — the initial state, after the human's turn, and after one bot step — no hidden card appears anywhere in `page.content()`, by its unique label (which includes `mazzo N`) or by its physical ID. Hidden cards are those in bot hands, the tallone and untaken pozzetti. The expected states are computed in Node with `drawCard`, `discardCard` and `playNextBotChainStep`. |

### `BotAutomationError` handling (AC11–AC14)

This lives in `src/components/GameTable.tsx`.

- **The guard.** `guardBotAutomation(session, play)` catches only `BotAutomationError`. It returns the same session with `automationFailed: true`, so nothing from the failing step is committed. Any other error is re-thrown unchanged.
- **Where it applies.** Both boundaries use it:
  - the delayed timer's `setSession` updater, which is still a pure transition returning state, with no side effect;
  - every step of `completeBotPlayback`.
- **`Completa subito` keeps earlier steps.** If a failure happens partway through `Completa subito`, the steps committed before it are kept, exactly as delayed playback would have kept them. The session is then marked failed.
- **The failure state.** `automationFailed` is a new field of the transient `GameTableSession`. While it is set:
  - the playback effect returns early, so no timer is set and a speed change does not reschedule;
  - `Completa subito` is not rendered, and its handler also refuses;
  - the banner status reads `Bot fermi`;
  - the guidance reads `Il gioco automatico dei bot si è interrotto.`;
  - a `role="alert"` block (the existing `rule-error` styling) shows **Gioco automatico interrotto** — *Il gioco automatico dei bot non può proseguire in questa partita. Puoi iniziarne una nuova con «Nuova partita».*

  No exception text, player ID or card data is rendered, and `Nuova partita` is unchanged.
- **Nothing is persisted.** The flag is not part of `MatchState`, so `onMatchChange` and the save are untouched. A failure on the first step leaves `session.match` as the same object, so there is no notification. The save is not cleared.
- **Clearing.** A fresh session clears the flag (new round, restore, new match), as does a human action or an unmount.

### CI (AC3)

`.github/workflows/ci.yml`:

- keeps the `push` to `main` and `pull_request` to `main` triggers and the concurrency group;
- adds `npx playwright install --with-deps chromium` after `npm ci`;
- runs `npm run verify`;
- on failure only, uploads `test-results/` (traces and screenshots) as a 7-day artifact.

There is no separate browser-only job.

### Documentation

- `docs/ARCHITECTURE.md`:
  - `e2e/` added to the structure section;
  - a new "Bot automation failure" subsection;
  - a new "Browser end-to-end release gate" section covering the public-surface-only rule, test-side determinism and no product test hooks.
- `docs/WORKFLOW.md`: what `npm run verify` now runs, the one-time `npx playwright install chromium` prerequisite, and CI installing Chromium before the same gate.
- `docs/RULES.md` and `docs/ROADMAP.md` are unchanged.

### Tests added or changed

- `src/components/GameTableAutomationFailure.test.tsx` (new, 9 tests). The seam is a pass-through `vi.mock` of `playNextBotChainStep` that throws on a chosen call. The deal is real and seeded, and the human draws and discards through the UI. The tests cover:
  - delayed playback failing on step 2: the first step's committed state and timeline are kept, the alert content is shown with no internal details, `Completa subito` is gone, `Nuova partita` is available, `onMatchChange` still reports the pre-failure match, no timer remains, and later time adds no chain calls;
  - a first-step delayed failure produces no `onMatchChange`;
  - `Completa subito` failing on step 3 keeps the 2 earlier steps, leaves no retry control and no timer, and makes no further calls;
  - a `Completa subito` first-step failure produces no `onMatchChange`;
  - Normale/Veloce speed toggles after a failure schedule nothing and call nothing;
  - unmounting the failed table leaves no timers;
  - a non-`BotAutomationError` (`TypeError`) from delayed playback and from `Completa subito` propagates and is not shown as the bot error;
  - through `App` with memory storage: the save is untouched by the failure and holds no failure data. `Nuova partita` clears the save, and a new match starts with no alert and working playback.
- `src/components/GameTablePlayback.test.tsx`: the two safety-limit tests (`enforces the existing chain safety limit … immediate completion` and `… in delayed playback`) asserted that `BotAutomationError` escaped React. M25 explicitly replaces that behaviour.
  - They still prove the same limit, with the same injected `maxBotTurns: 2` and the current progress. They now read it from the chain-step spy's thrown result (`Bot chain exceeded the 2-turn safety limit.`) and assert the alert, and that the chain did not finish (the banner is not `You`).
  - This is not a weaker test: fresh counters would still let the chain finish and fail the test.
- **Mutation checks** (run locally, then reverted). Each change below was caught:
  - dropping the `automationFailed` check from `canPlayBots`: 3 failures;
  - catching every error instead of only `BotAutomationError`: 2 failures.

## Deviations from specification

None.

## Known risks and ambiguities

- **Partial `Completa subito` before a failure.** The spec requires that "the last successfully committed `MatchState`" stays authoritative. I treat each chain step that the engine completed before the failure as committed, because delayed playback would have committed those same steps one by one. Those steps are therefore kept and saved, and only the failing step is dropped. The alternative, rolling back to the state before `Completa subito`, would make the two playback modes diverge.
- **Retry after reload.** The failure flag is transient by design. Reloading a match whose chain hit a `BotAutomationError` restores the saved match and retries the chain from fresh counters. That is consistent with "do not discard the saved match", and a deterministic failure would show the alert again.
- **No browser-level `BotAutomationError` test.** The spec forbids a product hook, so forcing the error in the built app is not possible. It is covered only at component level through the module mock.
- **Browser determinism relies on the seeded `Math.random`** plus the count of `Math.random` calls React DOM makes at load. A React upgrade could change the deal, but not its determinism. No exact score or card is asserted from a fresh browser deal. The hidden-information test uses a Node-built save, so it is independent of this.
- **The fake clock also freezes `Date`/`performance`.** No product code depends on wall-clock time, and one test resumes real time to cover the natural timer path.
- **The alert's layout** at 320 px was not checked in a browser, because the failure cannot be triggered in the built app without a hook. It reuses the existing `rule-error` styling, which wraps and is already used at narrow widths.
- **Chromium only**, as the spec says. Firefox, WebKit and real devices are not certified.
- **CI assumptions.** `npx playwright install --with-deps` has not run in GitHub Actions from this workspace. Its first run will happen on the PR.
- **Pre-existing `npm audit` output.** `npm install` reported 2 moderate findings in the existing Vite/Vitest dependency chain. The same findings appear without the M25 changes. They are out of M25 scope.

## Incidental changes

- `tsconfig.e2e.json` added and referenced from `tsconfig.json`, so `tsc -b` in the build typechecks the E2E code (`jsx: react-jsx`, because the persistence spec imports `LEAVE_MATCH_CONFIRMATION` from `GameTable.tsx`).
- `vite.config.ts`: Vitest `exclude` adds `e2e/**`.
- `.gitignore`: `test-results/`, `playwright-report/`.
- `GameTable` exports `BOT_AUTOMATION_FAILURE_MESSAGE`.

## Notes for independent review

- `GameTable.tsx`: `guardBotAutomation`, `completeBotPlayback`'s loop exit and `if (next.automationFailed) current = next`, `canPlayBots` in both the effect and `completeBotsNow`, and that the flag never reaches `session.match`.
- `e2e/fixtures.ts`: the seeded `Math.random` init script, the paused clock and the auto `pageErrors` fixture.
- `e2e/persistence.spec.ts`, third test: the explicit `clock.runFor(NORMAL_BOT_DELAY_MS * 5)` after reset is the only deliberate time advance used to prove that a stale timer is gone.
- `lifecycle.spec.ts`: the iteration guard, and that the four `or` states are mutually exclusive while the clock is paused.
- No change under `src/game`, `src/shell`, the save schema, `docs/RULES.md` or `docs/ROADMAP.md`. Nothing from M26 (deployment, version, tags, metadata).
