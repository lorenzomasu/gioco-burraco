# Milestone 24 — Game Feel & Visual Polish

## Goal

Make the stable v1 game feel deliberately designed as a videogame rather than only a correct functional interface.

M24 adds lightweight, coherent visual feedback to the main match lifecycle — successful card actions, turn changes, pozzetto acquisition, Burraco state, round completion and final results — while preserving all M1–M23 gameplay, persistence, accessibility, responsive-layout and hidden-information contracts.

The milestone must prefer CSS transitions/animations and minimal transient React presentation state. It must not introduce a general animation engine, a new domain event model, or gameplay semantics in the UI.

## Context

M23 completed the UX/mobile/accessibility hardening baseline. The current interface already provides:

- a responsive application shell down to 320 px;
- native accessible controls and consistent focus handling;
- explicit current-player/active-team/selected-card cues;
- a polite turn-status region and incremental bot activity log;
- stepwise bot playback with visible intermediate states;
- card selection lift/transition;
- Burraco classification badges;
- pozzetto status text;
- round score, cumulative score and final Victory Point presentation;
- `prefers-reduced-motion: reduce` protection.

The product is therefore functionally and structurally ready for polish, but most successful game actions still update abruptly. Drawing, taking the discard pile, playing/extending melds, discarding, changing turn, taking a pozzetto and reaching round/match results have limited transient feedback beyond the resulting static state.

Relevant sources of truth:

- `docs/ROADMAP.md`
- `docs/WORKFLOW.md`
- `docs/ARCHITECTURE.md`
- `docs/RULES.md`
- `src/App.tsx`
- `src/styles.css`
- `src/components/GameTable.tsx`
- `src/components/GameTable.test.tsx`
- `src/components/GameTablePlayback.test.tsx`
- `src/components/PlayingCard.tsx`
- `src/components/MeldArea.tsx`
- `src/components/PlayerSeat.tsx`
- `src/components/BotActionTimeline.tsx`
- `src/components/RoundScore.tsx`
- `docs/milestones/M23-ux-mobile-accessibility.md`
- `docs/milestones/reports/M23-implementation.md`

No Burraco-rule, scoring, bot-strategy, persistence-schema or match-lifecycle change is part of M24.

## In scope

- Add lightweight visual feedback for successful human draw, discard-pile collection, meld play/extension and discard actions.
- Make stepwise bot playback feel visually connected to the public table changes already exposed by the existing bot automation flow.
- Strengthen turn-change and phase-change emphasis without adding duplicate status semantics or stealing focus.
- Add clear, non-blocking visual feedback when a team acquires its pozzetto.
- Improve the visual treatment of Burraco classifications while preserving their existing textual labels.
- Improve round-complete, cumulative-score and final-result hierarchy so progression and outcome feel intentional and game-like.
- Refine table/card/pile/surface depth, spacing, highlights and micro-interactions within the existing dark-green/gold/red identity.
- Preserve the M23 mobile, touch, keyboard, accessibility and reduced-motion guarantees.
- Keep all animation/polish state transient and local to presentation code.
- Add focused regression tests for any new transient state, classes/attributes, cleanup behaviour or semantics introduced by the implementation.
- Record rendered/manual verification for representative desktop/mobile widths and reduced-motion behaviour.

## Out of scope

- New gameplay rules, scoring logic, match structure or bot strategy.
- New public game events or changes to the engine solely to drive animation.
- Audio, music, haptics, particles, confetti or a general effects system.
- Heavy card-flight choreography that requires absolute-position measurement or layout snapshots across the screen.
- Framer Motion, GSAP, animation libraries, canvas/WebGL or other new runtime dependencies solely for M24.
- A visual rebrand, new logo system, new card artwork set or wholesale typography/palette replacement.
- Skins, themes, cosmetic inventory or user-selectable appearance settings.
- Persisting animation/effect state, UI timestamps or presentation history in the M22 save.
- Browser-level E2E, Playwright, screenshot-diff/visual-regression infrastructure or release hardening owned by M25.
- Changing the M23 focus-management contract, live-region architecture or responsive breakpoints without a concrete regression fix.
- Replacing native controls with custom visual controls only for appearance.

## Required behaviour

### 1. Lightweight presentation architecture

Game-feel state must remain presentation-only.

A successful action may create a short-lived UI cue derived from the already-authoritative result of the engine/match operation. The cue may identify presentation concepts such as the affected source/destination, action kind or changed meld, but it must not become a second legality model.

Do not:

- duplicate whether an action is legal in React;
- modify engine return types only to expose cosmetic information that the UI can derive safely from before/after public state;
- persist effect state;
- let an animation delay or block the committed game state;
- make later game logic depend on completion of an animation.

If transient React state or timers/listeners are used, they must be safely reset on replacement/unmount and must not mutate a newer match/session after cleanup.

### 2. Successful human action feedback

Successful human actions must have visible but restrained feedback tied to the area that changed.

Cover at least:

- **draw from stock:** the stock source and/or newly received hand state gets a brief success emphasis;
- **take discard pile:** the discard source and resulting hand change get a clear cue without individually animating every collected card when the pile is large;
- **play new meld:** the created meld/destination receives a brief entry/emphasis treatment;
- **extend meld:** the affected existing meld receives a brief update treatment;
- **discard:** the new visible top discard receives a brief arrival/emphasis treatment.

The committed game state must appear immediately. Feedback is an enhancement layered on top.

A rejected `GameRuleError` action must not trigger a success animation/cue.

Ordinary card selection remains responsive and must not acquire delays.

### 3. Bot playback feedback

The existing stepwise bot playback is already the pacing mechanism and remains authoritative.

Each visible bot step should feel connected to its public state change through lightweight emphasis of already-public UI, for example:

- the active bot seat/turn treatment;
- the affected public pile or meld area when that can be derived without exposing hidden information;
- a subtle entry treatment for the newly appended timeline item.

Do not add hidden card identities, candidate reasoning, hand previews or any new bot-information disclosure.

`Completa subito` must still complete the pending automation immediately. It must not wait for cosmetic effects and must not leave stale effect state after the session jumps to the completed bot chain.

### 4. Turn and phase transitions

A current-player change and a meaningful phase change should be visually perceptible through the existing turn banner, active seat/team treatment or equivalent presentational emphasis.

The effect must:

- remain subtle enough for repeated turns;
- not remount or duplicate live regions solely to replay an animation;
- not move focus;
- not change `aria-current`, labels or domain state semantics introduced by M23.

Static current-player/current-team cues must remain fully understandable even when motion is disabled.

### 5. Pozzetto acquisition feedback

When a team changes from `Pozzetto da prendere` to `Pozzetto preso`, the affected team area/status must receive clear positive visual feedback.

The final static state must remain expressed in text exactly as a durable state cue; transient motion cannot be the only indication.

Do not create a new rules announcement or duplicate the engine condition for when the pozzetto is taken.

### 6. Burraco state polish

Existing `Pulito`, `Semipulito` and `Sporco` labels remain authoritative visible classifications.

Improve their presentation so a Burraco reads as an achievement/state change rather than a small metadata chip. This may include stronger badge hierarchy, iconographic/decorative treatment, border/surface emphasis or a short first-appearance animation.

The three classifications must remain distinguishable without relying only on animation and without removing the existing text.

Do not change `classifyBurraco` or its scoring meaning.

### 7. Table, cards and controls visual polish

Refine the existing visual direction rather than replacing it.

Improve perceived quality where useful across:

- table-surface depth and felt-like hierarchy;
- pile affordances and hover/active feedback;
- cards, card backs and selected-card response;
- player seats and active-turn treatment;
- meld containers and action hierarchy;
- buttons and score/result surfaces;
- spacing, shadows, borders and highlights.

The polish must preserve:

- readability of rank/suit and annotations;
- approximately 44×44 px play/touch targets from M23;
- document-level no-overflow behaviour from 320 px upward;
- focus-ring visibility;
- non-colour state cues;
- current contrast fixes.

Do not reduce information density by hiding existing important state.

### 8. Round-end and match-end presentation

Round completion should feel like a lifecycle event, not only a static score form.

Improve hierarchy for:

- the closure/tallone-exhausted result;
- per-team round totals and score breakdown;
- cumulative scores between rounds;
- next-round action;
- final Match Points;
- Victory Points;
- leading-team or exact-tie outcome;
- `Gioca ancora`.

The existing calculated values and textual outcome remain authoritative.

The final result may visually emphasize the leading team when one exists, but must correctly preserve the tie case and must not imply a winner different from `getFinalMatchOutcome`.

Focus must still land on the result heading according to the M23 lifecycle-focus invariant.

### 9. Motion discipline and reduced motion

Motion should be short, restrained and reusable. Prefer transform/opacity/filter/shadow/border effects that do not cause avoidable layout shifts.

Do not build long animation queues. Normal play must remain understandable if every animation effectively completes immediately.

Under `prefers-reduced-motion: reduce`:

- nonessential animations/transitions must be effectively suppressed by the existing reduced-motion policy or an equivalent stronger implementation;
- all success, turn, pozzetto, Burraco and result states must remain visible through static styling/text;
- no feedback may depend on motion timing to expose required information.

### 10. Preserve M23 accessibility and interaction contracts

M24 must not regress:

- the single polite turn/status announcement;
- incremental bot `role="log"` behaviour;
- rule-error `role="alert"`;
- storage `role="status"`;
- lifecycle focus movement only on major view replacements;
- no focus stealing on ordinary game actions/bot events;
- native disabled controls;
- unique meld-extension names;
- keyboard operation;
- selected-card `aria-pressed`;
- current-player/team non-colour cues;
- responsive behaviour implemented through CSS rather than JS viewport branching.

Purely decorative motion/effect elements must be hidden from assistive technology where appropriate.

## Acceptance criteria

- [ ] AC1 — Successful stock draw produces brief visual feedback tied to the stock/hand change while the committed state updates immediately.
- [ ] AC2 — Successful discard-pile collection produces clear feedback without requiring per-card choreography for a large pile.
- [ ] AC3 — Successful new-meld and extend-meld actions visually emphasize the affected meld destination.
- [ ] AC4 — Successful discard visually emphasizes the new discard top/destination; rejected actions do not show success feedback.
- [ ] AC5 — Stepwise bot playback has coherent lightweight visual feedback without exposing hidden information or changing bot timing/state semantics.
- [ ] AC6 — `Completa subito` remains immediate and leaves no stale pending visual-effect state.
- [ ] AC7 — Turn/player and phase changes are visually perceptible without moving focus, duplicating live regions or depending on motion for meaning.
- [ ] AC8 — First pozzetto acquisition by a team receives transient positive feedback while the durable `Pozzetto preso` text remains present.
- [ ] AC9 — Burraco `Pulito`, `Semipulito` and `Sporco` remain textually identified and have clearer visual hierarchy without changing classification logic.
- [ ] AC10 — Round-end and final-result views have improved game-like hierarchy while displaying exactly the existing score, Match Point, Victory Point and tie/leader outcomes.
- [ ] AC11 — M24 introduces no engine-rule, scoring, bot-strategy, save-schema or match-lifecycle behaviour change.
- [ ] AC12 — No new animation/runtime dependency or general animation framework is added.
- [ ] AC13 — At 320, 360/390, 768 and desktop widths, primary controls, cards, piles, melds, results and focus indicators remain readable/reachable with no new document-level horizontal overflow.
- [ ] AC14 — M23 touch-target, keyboard, focus, live-region, non-colour cue and status/error contracts remain green.
- [ ] AC15 — With reduced motion enabled, required state changes remain immediately understandable and nonessential animations are effectively suppressed.
- [ ] AC16 — Any transient presentation state/timer/listener introduced by M24 is safely cleaned up across new round, `Completa subito`, leave/unmount and session replacement as applicable.
- [ ] AC17 — `npm run verify` passes with no unrelated refactor or M25/release tooling introduced.

## Required tests

Add or update automated tests only where they protect behaviour introduced by M24 rather than attempting pixel-perfect visual testing.

Cover as applicable to the chosen implementation:

- successful human actions set/render the intended transient feedback marker/state;
- a rejected engine action does not produce a success marker;
- draw vs discard-pile collection vs discard vs meld/extend target the correct public UI region;
- bot-step feedback uses only existing public bot events/state;
- `Completa subito` clears or supersedes transient bot/action feedback safely;
- pozzetto transition feedback appears only when the durable state changes to taken;
- Burraco visual state maps to the existing classification result without changing classification;
- final result treatment follows the existing leading-team/tie outcome;
- lifecycle focus and live-region behaviour from M23 remain unchanged;
- cleanup prevents stale timers/listeners/effects from affecting a replacement/unmounted session if the implementation uses them.

Do not add brittle assertions for exact animation duration, computed pixel colors, full CSS snapshots or jsdom layout geometry.

The implementation report must also record rendered/manual verification at representative widths including 320 px, a common 360/390 px mobile width, tablet and desktop, plus a reduced-motion check.

## Documentation updates

Update `docs/ARCHITECTURE.md` only if M24 introduces a reusable presentation-state invariant that future milestones need to preserve, for example a defined transient visual-feedback layer and its cleanup/domain-boundary rules.

Do not update `docs/RULES.md`; M24 introduces no Burraco-rule behaviour.

Do not expand `docs/ROADMAP.md` unless implementation evidence requires a material roadmap decision.

## Verification

During implementation, prefer targeted component tests while iterating.

Before completion, run exactly:

`npm run verify`

The implementation report at `docs/milestones/reports/M24-implementation.md` must record:

- final `npm run verify` result;
- test count/files;
- build result;
- `git diff --check`;
- rendered/manual widths checked;
- reduced-motion verification;
- material deviations;
- known risks/ambiguities;
- incidental changes.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- game feel is visibly improved across the main lifecycle without delaying or redefining game state;
- M23 responsive/accessibility contracts remain intact;
- required tests exist and pass;
- `npm run verify` passes;
- the implementation report is complete;
- no unrelated refactor, new gameplay, heavy animation architecture or M25 release-hardening work was introduced;
- any remaining ambiguity, risk or deferred polish is explicitly reported.
