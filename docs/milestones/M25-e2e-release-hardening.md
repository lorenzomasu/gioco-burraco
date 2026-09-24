# Milestone 25 — E2E & Release Hardening

## Goal

Turn the completed v1 product into a release candidate protected by a browser-level critical-path gate.

M25 adds deterministic Playwright coverage around the real production build, hardens the known bot-automation failure path so it cannot crash the application, and makes the browser suite part of the canonical verification/CI gate. It must preserve all M1–M24 gameplay, persistence, accessibility, responsive-layout, hidden-information and presentation contracts.

This milestone is release hardening, not new product scope.

## Context

M24 completed the planned v1 product/polish work. The current application already provides:

- onboarding and named local matches;
- one human plus three deterministic-strategy bots;
- four-smazzata match lifecycle with rotating starter;
- stepwise bot playback, speed control and `Completa subito`;
- versioned local save/resume with runtime validation;
- responsive UI down to the M23 320 px baseline;
- keyboard/focus/live-region/accessibility hardening;
- transient M24 game-feel feedback without gameplay coupling;
- 553 unit/component/integration tests across 29 files;
- a production Vite build;
- GitHub CI whose canonical gate is currently `npm run verify`.

The repository has no browser E2E dependency or Playwright configuration yet.

The known release risk intentionally deferred from M17–M19 is still present: `playNextBotChainStep` can raise `BotAutomationError`, and the current delayed/instant playback paths do not convert that failure into a stable user-facing state. An automation safety failure must not become an unhandled React/application crash in the release candidate.

Relevant sources of truth:

- `docs/ROADMAP.md`
- `docs/WORKFLOW.md`
- `docs/ARCHITECTURE.md`
- `docs/RULES.md`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/components/GameTable.tsx`
- `src/components/GameTable.test.tsx`
- `src/components/GameTablePlayback.test.tsx`
- `src/components/GameTableFeedback.test.tsx`
- `src/game/bot/playBotTurn.ts`
- `src/game/bot/allBotRounds.test.ts`
- `src/shell/matchPersistence.ts`
- `src/shell/matchPersistence.test.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `docs/milestones/M21-game-shell-onboarding.md`
- `docs/milestones/M22-local-save-resume.md`
- `docs/milestones/M23-ux-mobile-accessibility.md`
- `docs/milestones/M24-game-feel-visual-polish.md`
- `docs/milestones/reports/M24-implementation.md`

No Burraco rule, scoring rule, bot strategy, persistence schema or product feature is introduced by M25.

## In scope

- Add Playwright as the browser E2E framework, using Chromium as the M25 release-gate browser.
- Run browser tests against the built application served by Vite preview, not the development server.
- Make browser E2E part of the canonical `npm run verify` gate.
- Update GitHub CI so the exact PR/main SHA installs the required Playwright Chromium runtime and executes the complete canonical gate.
- Add deterministic browser-level coverage for:
  - onboarding/start-match smoke;
  - human → bot → human interaction;
  - round completion and next-round transition;
  - one complete four-smazzata lifecycle through the real UI;
  - final match completion/result;
  - save → reload → resume;
  - minimum-width mobile interaction;
  - abandoning/resetting a match while bot playback is pending;
  - continued hidden-information protection.
- Harden `BotAutomationError` during delayed playback and `Completa subito` into a stable, accessible, user-facing automation-failure state.
- Add focused component/integration regression tests for the automation-failure state and cleanup behaviour.
- Keep E2E setup deterministic without adding a production-visible debug route, query parameter or gameplay test control.
- Keep failure diagnostics useful but lightweight (for example Playwright trace/screenshot only on failure).

## Out of scope

- New gameplay rules, scoring, match structure or bot strategy.
- Changing the M20 F.I.Bur. rules baseline.
- New save-schema version or migration.
- Accounts, backend, cloud sync or telemetry.
- New difficulty settings or bot configuration.
- Audio, additional visual polish or other M24 follow-up features.
- Firefox/WebKit compatibility certification as a release gate in M25.
- Device-farm or physical-device testing.
- Pixel/screenshot-diff visual-regression infrastructure.
- Performance benchmarking or load testing.
- Production hosting, DNS, release tags, version `1.0.0`, deployment configuration, analytics, SEO/PWA/service-worker work; those belong to M26.
- Catching every programming error and silently converting it into a generic warning. M25 must harden the known bot-automation boundary without hiding unrelated defects.
- Production-visible test APIs, debug buttons, fixture selectors or URL modes created only for E2E.

## Required behaviour

### 1. Playwright release-gate tooling

Add `@playwright/test` as a development dependency and a root Playwright configuration.

The M25 browser gate must:

- use Chromium only;
- run against a production build served with `vite preview` (or an equivalent preview of the already-built `dist`);
- use a stable local host/port and Playwright `baseURL`;
- avoid relying on the Vite development server;
- use Playwright's web-first assertions instead of fixed sleeps for application state;
- use deterministic test data/setup;
- keep retries conservative: a flaky test must not be made green by broad retrying;
- retain useful diagnostics on failure without producing heavy artifacts for every passing run.

The implementation may choose the exact script names, but after M25:

`npm run verify`

must remain the single canonical repository gate and must execute, in one command:

1. the existing Vitest suite;
2. the production TypeScript/Vite build;
3. the Playwright Chromium E2E suite against that build;
4. `git diff --check`.

A practical shape is `test:e2e = npm run build && playwright test` and `verify = npm test && npm run test:e2e && git diff --check`, but an equivalent non-duplicative arrangement is acceptable.

### 2. CI must execute the same complete gate

Update `.github/workflows/ci.yml` so GitHub Actions:

- installs dependencies with `npm ci`;
- installs Chromium and its required system dependencies using Playwright's supported install command;
- runs the repository's canonical `npm run verify`;
- fails the workflow if unit/integration, build, E2E or diff-check fails.

Do not create a weaker browser-only path that can pass while `npm run verify` fails.

The exact reviewed commit SHA must therefore be covered by both the existing automated tests and browser critical-path tests before the normal merge gate can close.

### 3. Deterministic browser setup without product hooks

Browser tests must be reproducible.

Prefer test-side control of randomness before application bootstrap, for example a Playwright `addInitScript` deterministic `Math.random` implementation/seed. This preserves the actual production application entrypoint and avoids changing runtime product behaviour solely for tests.

Existing public boundaries may also be used for focused setup, especially browser `localStorage` with a valid M22 save envelope produced from real domain helpers.

Do not add:

- a `?test=` / `?seed=` production query contract;
- a hidden debug button;
- a global test API exposed by the shipped app;
- a second E2E-only rules implementation;
- handwritten state that bypasses the repository's real serialization/domain helpers when a valid fixture can be built from them.

Fixture/helper code may live under an E2E-only test directory and may import existing deterministic domain primitives.

### 4. Onboarding/start-match smoke path

At browser level, prove that a fresh application:

- opens on onboarding;
- accepts a trimmed valid player name;
- starts smazzata 1;
- renders the real game table;
- displays the named human player;
- exposes the expected round indicator and playable draw controls;
- produces no uncaught browser/page error on the nominal path.

Use user-facing role/name locators where practical rather than CSS implementation details.

### 5. Human → bot → human browser path

Cover one real turn cycle through the browser:

1. human acquires from the tallone;
2. human selects one card and discards;
3. bot playback becomes pending/visible;
4. at least one public bot action is rendered through the existing timeline/state UI;
5. control eventually returns to the human, using normal playback or `Completa subito` as appropriate to keep the test fast;
6. the next human turn is playable.

The test must not inspect hidden bot decision inputs or call bot engine commands directly to advance the browser state after the human discard.

It may use `Completa subito` because that is a real production control whose equivalence is already covered at component level.

### 6. Deterministic four-smazzata lifecycle

Add one browser-level critical-path test that reaches the actual final result through all four smazzate in one application session.

The test should keep the human strategy intentionally simple and robust: draw from the tallone when available, select a legal hand card, discard, then use the real playback controls to resolve pending bots. It does not need to play strategically or create Burraco.

Requirements:

- randomness is deterministic for the whole session;
- the test has an explicit bounded iteration/turn guard so a regression cannot hang CI indefinitely;
- round 1, 2 and 3 each reach their completed-round UI;
- `Inizia smazzata 2/3/4` advances through the real match lifecycle;
- the header/summary round number progresses correctly;
- the fourth completed round reaches the real final result;
- final Match Points and Victory Points are present;
- `Gioca ancora` is present;
- the browser reports no unhandled page errors on the nominal lifecycle.

Do not assert exact score totals unless the test specifically derives them from the same deterministic domain result and doing so adds release value. The primary E2E purpose is lifecycle integration, not duplicating scoring unit tests.

### 7. Save → reload → resume

At browser level, prove the M22 persistence path against real browser storage.

At minimum:

- start a deterministic match;
- commit meaningful progress;
- verify the active-save key exists;
- reload the page;
- verify the same active match resumes rather than returning to onboarding;
- verify visible committed progress is preserved;
- continue with at least one legal action after reload.

Also cover one reload while bot work is pending or immediately after a committed human discard, so restored transient playback machinery is recreated safely from the committed match rather than persisted timers/callbacks.

Do not require bot timeline entries, visual-feedback cues, timers or playback-speed preference to survive reload; those remain transient by design.

### 8. Mobile viewport release smoke

Run at least one Playwright critical-path test at the supported minimum-width baseline of approximately 320 px (for example 320×740).

At that viewport:

- onboarding remains usable;
- a match can start;
- the tallone can be used;
- a hand card can be selected;
- `Scarta e passa` can be activated;
- the page has no document-level horizontal overflow;
- the primary interaction is not blocked by M24 presentation effects.

Local horizontal scrolling inside intentionally scrollable card/meld regions is allowed where already designed by M23.

This is browser layout smoke, not pixel-perfect visual testing.

### 9. Reset/new match while bot playback is pending

Browser-level regression coverage must prove that leaving an active match during bot playback is safe.

Scenario:

1. reach a committed human discard that starts bot playback;
2. trigger `Nuova partita` before the chain has naturally completed;
3. accept the existing native confirmation;
4. return to onboarding;
5. verify the active-match save is cleared;
6. wait/assert beyond the old pending step boundary using Playwright state assertions rather than a blind sleep where possible;
7. verify no stale bot callback mutates the replacement screen and no uncaught page error occurs.

The existing confirmation wording/semantics remain unchanged unless a concrete defect is found.

### 10. Hidden-information protection at browser level

The E2E suite must include a focused assertion that opponent hidden hands remain hidden in the rendered browser UI.

At minimum, while the match is active:

- bot seats may expose public identity/hand counts already present;
- bot card faces/physical card identities must not be rendered as opponent-hand content;
- no new E2E/debug instrumentation may expose bot candidate reasoning or private hand data in DOM-visible attributes/text.

Public cards emitted in the existing bot action timeline remain allowed exactly as defined by the current public-event contract.

Do not redefine hidden-information rules in E2E; this test protects the existing presentation boundary.

### 11. Graceful `BotAutomationError` state

Harden both bot execution boundaries used by the table:

- delayed one-step playback;
- synchronous `Completa subito`.

If `BotAutomationError` is raised:

- it must be caught at the bot-automation presentation boundary;
- it must not escape through a React state updater/render and crash/unmount the application;
- no partially returned/fabricated bot action may be committed;
- the last successfully committed `MatchState` and already-public timeline remain authoritative;
- automatic bot scheduling stops for that mounted session until the user leaves/replaces it;
- `Completa subito` must not remain as a control that repeatedly throws the same failure;
- a visible, concise Italian error message is rendered with `role="alert"` or an equivalent assertive accessible error semantic;
- the error must explain that automatic play could not continue and that the user can start a new match;
- the existing `Nuova partita` path remains available so the user can recover;
- no hidden bot state, exception stack or internal card data is shown to the player;
- the failure state is transient presentation/session state and is not added to `GameState`, `MatchState` or the M22 save schema.

Do not automatically discard the saved match merely because the automation error occurred. The user must still explicitly abandon/restart through the existing product flow.

Unknown/non-`BotAutomationError` programming errors should not be silently swallowed under this handling.

### 12. Automation-failure cleanup

Once an automation failure is present:

- the playback timer/effect must not keep rescheduling;
- changing playback speed must not restart the failed bot chain;
- session replacement/unmount must cleanly remove the failed transient state;
- starting another match must begin without an inherited automation error;
- no failure-only state may trigger `onMatchChange` as though domain progress occurred.

The implementation may integrate the error into the existing transient `GameTableSession` or use another minimal presentation-only structure. Avoid set-state side effects from inside another state updater.

### 13. Preserve all established product contracts

M25 must not regress:

- M20 gameplay/rules baseline;
- M21 onboarding and intentional reset flow;
- M22 save validation/schema/version and storage notices;
- M23 responsive, keyboard, focus, live-region, touch-target and reduced-motion behaviour;
- M24 transient-feedback/domain boundary;
- deterministic bot strategy and public-event semantics;
- current hidden-information guarantees;
- four-round starter rotation;
- round scoring, Match Points and Victory Points.

Browser E2E should complement the existing lower-level suite, not replace it.

## Acceptance criteria

- [ ] AC1 — Playwright is installed/configured and the M25 browser suite runs in Chromium against the built application served by Vite preview, not the dev server.
- [ ] AC2 — `npm run verify` is still the single canonical gate and now covers Vitest, production build, Playwright E2E and `git diff --check`.
- [ ] AC3 — GitHub CI installs Playwright Chromium/system dependencies and runs that same canonical `npm run verify` on PRs and `main`.
- [ ] AC4 — A deterministic browser smoke test covers onboarding → named smazzata 1 → playable table with no unhandled page error.
- [ ] AC5 — A deterministic browser test covers a real human draw/discard → visible bot activity → return to a playable human turn.
- [ ] AC6 — One bounded deterministic browser test traverses all four smazzate in one session and reaches the real final Match Points/Victory Points result and `Gioca ancora`.
- [ ] AC7 — Browser persistence coverage proves committed progress survives reload and play can continue, including a pending/recreated bot-playback case.
- [ ] AC8 — A minimum-width approximately 320 px browser test can start and perform the primary draw/select/discard flow with no document-level horizontal overflow.
- [ ] AC9 — Browser coverage proves confirmed `Nuova partita` during pending bot playback returns to stable onboarding, clears the active save and receives no stale bot mutation.
- [ ] AC10 — Browser coverage protects the existing hidden-opponent-information presentation boundary without adding debug leakage.
- [ ] AC11 — Delayed bot playback converts `BotAutomationError` into a stable accessible error state without an unhandled application crash or domain-state mutation.
- [ ] AC12 — `Completa subito` handles the same `BotAutomationError` safely and does not remain in a throw/retry loop.
- [ ] AC13 — Automation failure stops further scheduling, does not persist into the M22 save, and is cleared by session replacement/unmount.
- [ ] AC14 — Unknown non-`BotAutomationError` defects are not broadly swallowed by the new handling.
- [ ] AC15 — E2E setup is deterministic and does not add production-visible test/debug routes, controls, query contracts or hidden-card instrumentation.
- [ ] AC16 — Existing rule/engine/scoring/bot-strategy/save-schema semantics remain unchanged; no M26 deployment/release scope is introduced.
- [ ] AC17 — Final `npm run verify` passes on the completed milestone, including the new browser suite.

## Required tests

### Playwright E2E

Add focused tests under a dedicated E2E directory covering:

- fresh onboarding/start smoke;
- human → bot → human critical path;
- complete four-round lifecycle;
- save/reload/resume;
- pending-playback reset/new-match cleanup;
- 320 px mobile primary interaction/no document overflow;
- hidden opponent-hand presentation.

The exact test split is implementation-defined. Keep the suite small and release-critical rather than reproducing every component test in a browser.

For every nominal critical-path test, fail on unexpected `pageerror`/equivalent unhandled browser errors. Console noise may be captured for diagnostics, but do not fail on harmless browser/tooling messages unless they indicate an application defect.

Prefer accessible role/name locators. CSS/data selectors are acceptable only where there is no stable user-facing semantic and the selector represents an intentional contract.

Do not use arbitrary `waitForTimeout` calls to make races pass. The one exception is when intentionally proving a stale timer cannot fire after replacement; even there, prefer a condition/event/state assertion around the known delay and keep any time advance explicit and justified.

### Component/integration regression tests

Add focused Vitest/component tests for:

- `BotAutomationError` from delayed playback;
- `BotAutomationError` from `Completa subito`;
- error alert semantics/content;
- no further timer scheduling after failure;
- playback-speed changes do not revive a failed session;
- new session/unmount clears the transient error;
- no `onMatchChange` notification for error-only presentation state;
- non-`BotAutomationError` exceptions are not incorrectly converted into the user-facing bot error.

Use the smallest reliable fixture/seam needed to force the error. Do not add a production-visible testing control solely to make the test possible.

### Existing tests

All existing unit/component/integration tests remain part of the gate. Do not delete or weaken an existing test merely because equivalent browser coverage now exists.

## Documentation updates

Update `docs/ARCHITECTURE.md` to record the new release-critical invariants:

- browser E2E tests exercise the built client through its public browser surface;
- deterministic E2E setup must not become a production gameplay/debug API;
- bot automation failure is transient presentation/session state and never domain/save state.

Update `docs/WORKFLOW.md` only as needed to keep the canonical verification instructions accurate after `npm run verify` begins running browser E2E, including the local Playwright Chromium prerequisite where appropriate.

Do not update `docs/RULES.md`; M25 changes no Burraco behaviour.

Do not expand `docs/ROADMAP.md` unless implementation evidence requires a material roadmap decision.

## Verification

During implementation, use targeted Vitest and Playwright tests while iterating.

Install the local Playwright Chromium runtime as needed using the supported Playwright command; do not encode a browser download into every individual test execution if avoidable.

Before completion, run exactly:

`npm run verify`

That final command must include the new browser gate.

The implementation report at `docs/milestones/reports/M25-implementation.md` must record:

- final `npm run verify` result;
- Vitest test count/files;
- Playwright test count and projects/browsers used;
- production build result;
- `git diff --check`;
- exact deterministic E2E setup used;
- CI/workflow changes;
- automation-error handling behaviour;
- material deviations;
- known risks/ambiguities;
- incidental changes.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- the complete browser critical path is deterministic and green against the production build;
- the known `BotAutomationError` release risk has user-safe behaviour;
- the canonical local/CI gate covers unit/integration + build + browser E2E;
- existing gameplay, persistence, accessibility, responsive and hidden-information contracts remain intact;
- required tests exist and pass;
- `npm run verify` passes;
- the implementation report is complete;
- no unrelated refactor, new gameplay, production test backdoor or M26 deployment/release work was introduced;
- any remaining ambiguity, risk or deferred release concern is explicitly reported.
