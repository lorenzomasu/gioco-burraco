# Milestone 39 — iOS Architecture Spike

## Goal

Build a deliberately small, disposable iPhone vertical slice with Capacitor on top of the existing React/Vite project so the product can be judged on a real iPhone before committing the v1.3 UI rewrite to this architecture.

M39 is a technology/feel decision milestone, not a production migration. The v1.2 web/PWA product remains the stable baseline. A green code review does **not** authorize automatic merge: the user must first install/play the spike on a physical iPhone and explicitly accept Capacitor as the UI/runtime direction.

## Context

- Released baseline: `v1.2.0` / `main` at `b2022bf23ac5a8070ac4daca36acf74965d84cb5`.
- The gameplay engine, scoring, match lifecycle, bot legality/strategy, save/resume and release pipeline are already mature and are not the problem being evaluated here.
- Post-v1.2 mobile playtesting found the current narrow-screen UI visually dense and close to unusable as a phone game.
- The product direction is now iPhone-first, but there is an explicit concern that a Capacitor/WKWebView app may still feel too much like a web app.
- M39 exists to answer that concern with a real device prototype before spending multiple milestones rebuilding the UI.
- The known product request to persist/display **which player** took the pozzetto remains approved follow-up work, but it is intentionally not mixed into this architecture spike.

## In scope

- Add the minimum Capacitor dependencies and configuration required for an iOS app shell.
- Add an iOS platform project under `ios/` that can be opened in Xcode and installed on a physical iPhone with the developer's own signing identity.
- Add a **separate iPhone-first spike entry/build mode** that does not replace or visually alter the released web/PWA application.
- The spike must be representative enough to judge feel, not feature completeness. It should include:
  - portrait-first composition sized for a modern iPhone;
  - compact top status/score treatment;
  - four player seats or equivalent table context;
  - stock and discard affordances;
  - at least one own-meld/table area;
  - a touch-first player hand;
  - a bottom action surface;
  - card selection;
  - one draw-like interaction;
  - one discard-like interaction;
  - at least one card movement animation;
  - one sheet/panel interaction representative of settings/history/help;
  - safe-area handling;
  - native haptic feedback for at least selection and one committed-looking action.
- Use official Capacitor plugins only where they materially help the experiment (for example Haptics; Status Bar only if needed).
- Keep browser-like artefacts out of the spike where practical: accidental text selection, touch callouts/context menus, inappropriate overscroll and desktop-style hover assumptions.
- Provide deterministic prototype state/fixtures when needed. Reuse existing presentation/card assets and utilities where useful.
- Add concise setup/run instructions for:
  - web preview of the spike;
  - building/syncing the iOS shell;
  - opening the generated Xcode project;
  - selecting a signing team/bundle identity if Xcode requires it;
  - installing/running on a connected iPhone.
- Record implementation evidence, limitations and device-test checklist in `docs/milestones/reports/M39-implementation.md`.

## Out of scope

- Full mobile/table redesign.
- Replacing the production React table with the spike.
- App Store or TestFlight submission.
- Permanent commitment to Capacitor.
- React Native or SwiftUI implementation.
- New game rules, scoring behaviour or Victory Point changes.
- Bot changes.
- Save-schema changes.
- Persisting the player who took the pozzetto; this is follow-up product work after the architecture decision.
- Backend, accounts, cloud sync or multiplayer.
- Removing the PWA, GitHub Pages or existing web deployment.
- Production-specific native plugins beyond what is required to evaluate feel.
- Large UI libraries/design systems unless a concrete spike requirement cannot reasonably be met without one.

## Required behaviour

### 1. Production web/PWA isolation

The ordinary `npm run dev`, `npm run build`, production entrypoint and GitHub Pages behaviour must remain functionally unchanged.

The iOS spike must be entered through an explicit build/dev mode, entrypoint or equivalent isolation mechanism. A normal production web build must never unexpectedly render the spike.

### 2. Local native bundle

The Capacitor iOS shell must load bundled local build assets. Do not configure it to point at the GitHub Pages URL or a development server for the normal installed-device path.

A development live-reload option may be documented separately if useful, but it must not be the only way the iPhone prototype works.

### 3. Representative touch interaction

On an iPhone-sized viewport/device, the spike must make these actions comfortably operable with touch:

1. select/deselect cards in the hand;
2. trigger a draw-like action;
3. trigger a discard-like action using a selected card;
4. open and dismiss a sheet/panel.

The slice is evaluating interaction quality, so controls must not rely on hover or sub-44px precision targets where avoidable.

### 4. Motion

At least one card visibly moves between meaningful source/destination regions using transform/opacity-based motion or another lightweight technique suitable for a 60 Hz mobile UI.

Motion is presentation-only and must not require changing game-engine semantics.

### 5. Haptics

When running natively through Capacitor:

- card selection produces a light/tactile haptic;
- one draw/discard-like action produces a distinct haptic.

The browser preview must remain usable when the native haptics bridge is unavailable. No interaction may fail merely because haptics are unavailable.

### 6. iPhone chrome and safe areas

The prototype must correctly respect iOS safe-area insets at the top and bottom, including the home indicator region. It must not place primary actions underneath those areas.

Status-bar treatment should be deliberate if the shell exposes it, but M39 does not require a full native navigation architecture.

### 7. No second rules engine

The spike may use deterministic fixture/prototype state because the goal is feel. It must not reimplement Burraco legality, bot strategy or scoring in a second UI-side rules model.

If real engine commands are reused, use them unchanged. If mocked interactions are cheaper, clearly mark them as prototype-only and do not present them as production gameplay correctness.

### 8. Decision checklist

The implementation report must include a short physical-device evaluation checklist. At minimum the user should judge:

- hand scrolling/selection responsiveness;
- tap target comfort;
- animation smoothness;
- sheet/panel feel;
- haptic quality;
- safe-area/full-screen feel;
- whether any interaction visibly/behaviourally feels browser-like;
- overall answer to: **"Would I accept this runtime for the full iPhone-first redesign?"**

The report must distinguish technical pass/fail from this subjective product decision.

## Acceptance criteria

- [ ] AC1 — Capacitor is added without changing ordinary production web/PWA behaviour.
- [ ] AC2 — An iOS project exists and `npx cap sync ios` (or the repository script wrapping it) succeeds.
- [ ] AC3 — The native shell uses local bundled assets for its normal device build, not a remote production URL.
- [ ] AC4 — A separately isolated iPhone-first spike screen can be built and previewed without replacing the normal web application.
- [ ] AC5 — The spike contains the representative table/hand/action composition defined in scope.
- [ ] AC6 — Card selection, draw-like, discard-like and sheet/panel interactions work with touch.
- [ ] AC7 — At least one card transition is animated and does not mutate authoritative game rules.
- [ ] AC8 — Native haptics are wired for selection and one action with a safe browser fallback.
- [ ] AC9 — Top/bottom safe areas are respected and primary controls remain reachable on an iPhone portrait layout.
- [ ] AC10 — Existing `npm run verify` remains green.
- [ ] AC11 — The implementation report contains exact build/sync evidence, known limitations and the physical-device decision checklist.
- [ ] AC12 — No App Store/TestFlight, full UI rewrite, bot/rules/scoring/save or pozzetto-owner implementation leaked into M39.
- [ ] AC13 — The branch is ready for independent code review and physical-device trial, but is **not merged to `main` before explicit user acceptance of the Capacitor feel**.

## Required tests

Add only focused automated coverage that protects the spike from obvious breakage without turning an experiment into a second product test suite:

- ordinary production entry/build still renders the normal app, not the spike;
- spike entry/build renders the representative iPhone surface;
- core prototype interactions update presentation state as expected;
- haptic bridge absence does not break browser interaction;
- any new build/config helper that selects production vs spike mode is regression-tested where practical.

Run targeted tests during implementation.

Before handing the branch over for review/device trial, run:

`npm run verify`

Also run the iOS spike build and Capacitor sync command(s) defined by the implementation and record their exact result.

If the local environment supports a non-signing Xcode compile/build check, run it and record the result. Lack of a signing identity or physical device is not by itself an implementation failure, but must be stated clearly.

## Documentation updates

- Update `docs/ROADMAP.md` to record the post-v1.2 iPhone-first decision process and M39 decision gate.
- Do **not** change `docs/RULES.md`.
- Do **not** make Capacitor a stable architectural invariant in `docs/ARCHITECTURE.md` yet; it remains an experiment until the device playtest is accepted.
- Create/update `docs/milestones/reports/M39-implementation.md` with setup instructions, verification evidence, limitations and device-test checklist.

## Verification

During implementation use targeted tests.

At completion run once:

`npm run verify`

Then run the documented spike build plus Capacitor iOS sync. Confirm:

`git diff --check`

The working tree must be clean and the completed branch pushed.

## Completion conditions

M39 has two gates:

### Technical gate

The implementation branch is technically ready when:

- AC1–AC12 are satisfied;
- independent review has no unresolved blocker/important finding;
- canonical verification and iOS build/sync evidence are green.

### Product decision gate

M39 is **not adopted into the product architecture merely because the technical gate is green**.

After technical review, the user installs/runs the spike on a physical iPhone and explicitly chooses one of:

1. **Accept Capacitor** — the feel is good enough to use for the v1.3 iPhone-first redesign. Only then may the experimental work be merged/adopted as the basis for subsequent milestones.
2. **Reject Capacitor** — do not merge the spike into the stable product; preserve useful design learnings and prepare a React Native/native alternative spike.
3. **Needs one focused iteration** — fix only the concrete feel issue(s) identified on-device, then repeat the physical trial.

The normal automatic green-path merge in `docs/WORKFLOW.md` is intentionally suspended for M39 until this explicit product decision is made.
