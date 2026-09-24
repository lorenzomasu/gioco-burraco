# Milestone 23 — UX, Mobile & Accessibility Hardening

## Goal

Harden the existing v1 interface so the complete local-match flow remains understandable and operable on narrow mobile, tablet, and desktop layouts and through keyboard/accessibility-oriented interaction.

M23 is a UX-hardening milestone, not a visual redesign. Preserve the current product identity and gameplay architecture while fixing layout pressure, interaction-state clarity, focus behaviour, accessible naming/status announcements, touch usability, and concise in-context guidance.

This milestone introduces no Burraco-rule change and must preserve the M1–M22 game, bot, match-lifecycle, onboarding, persistence, and hidden-information contracts.

## Context

M21 established the application shell and onboarding. M22 added local save/resume and minimal persistence notices. The current UI already has useful foundations that must be preserved rather than rebuilt:

- responsive CSS breakpoints at 1000 px, 760 px, and 440 px;
- deliberate horizontal scrolling for the human hand and meld cards;
- native buttons for playable cards, with `aria-pressed` for selection;
- native disabled controls for unavailable actions;
- a polite live turn banner;
- rule errors exposed as `role="alert"`;
- storage notices exposed as `role="status"`;
- reduced-motion CSS that removes transition duration.

The current implementation still has hardening gaps that M23 must address:

- the game header and playback/new-match controls are dense at approximately 320–390 px;
- several interactive controls are below a comfortable touch-target size, especially small meld buttons, radio options, and dismiss controls;
- repeated meld-extension buttons have indistinguishable accessible names;
- the bot timeline is visible but not exposed as an incremental live log;
- major screen/lifecycle replacements can leave keyboard focus without a meaningful destination;
- persistence notices are minimally styled and may overlay match content;
- the game explains the fixed setup but gives little concise contextual guidance during draw/action/bot phases;
- selected/active/disabled states and critical small text need a focused readability/contrast audit;
- mobile overflow must be verified as intentional internal scrolling rather than document-level clipping.

Relevant sources of truth:

- `docs/ROADMAP.md`
- `docs/WORKFLOW.md`
- `docs/ARCHITECTURE.md`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/styles.css`
- `src/components/GameTable.tsx`
- `src/components/GameTable.test.tsx`
- `src/components/GameTablePlayback.test.tsx`
- `src/components/StartScreen.tsx`
- `src/components/PlayingCard.tsx`
- `src/components/MeldArea.tsx`
- `src/components/PlayerSeat.tsx`
- `src/components/BotActionTimeline.tsx`
- `src/components/RoundScore.tsx`
- `docs/milestones/reports/M22-implementation.md`

No gameplay-rule changes are part of M23.

## In scope

- Harden layout from the repository-supported minimum width of 320 px through common mobile widths (320, 360, 390 px), tablet widths, and desktop.
- Remove document-level horizontal overflow/clipping caused by the application shell, header, table, result views, or notices.
- Keep intentional component-level scrolling where it is useful, especially the human hand and long meld rows.
- Make header actions, playback speed controls, table controls, meld controls, error dismissal, and lifecycle actions usable as touch targets.
- Preserve card readability and interaction on narrow screens without shrinking cards into illegibility.
- Keep long hands and long melds operable with keyboard and touch while preventing focus rings/selected states from being clipped.
- Harden score, round-result, cumulative-score, final-result, and between-round layouts on narrow screens.
- Make meaningful focus visible on every keyboard-operable control.
- Add deliberate focus management for major application/lifecycle replacements where the invoking control disappears.
- Give repeated controls unique, contextual accessible names.
- Expose the bot timeline as an incremental polite activity log without re-announcing the complete history after every event.
- Preserve and improve status/error announcements for turns, storage notices, rule errors, round completion, and major lifecycle transitions where appropriate.
- Add concise contextual guidance for the current digital flow (draw phase, action phase, bot phase) without creating a tutorial system.
- Make selected, active, disabled, and current-turn states understandable without depending only on colour.
- Audit and correct critical contrast/readability problems in the current palette while preserving the existing visual direction.
- Preserve reduced-motion behaviour and ensure M23 introduces no mandatory motion.
- Harden M22 persistence-notice presentation so it wraps safely and does not obstruct critical match controls.
- Add focused component/integration regression tests for the semantic and interaction contracts introduced here.
- Record any viewport checks that cannot be meaningfully exercised by jsdom in the implementation report.

## Out of scope

- Visual rebrand, new art direction, new card artwork, or a broad typography/palette redesign.
- M24 game-feel work: decorative animation, card-flight effects, turn-transition choreography, celebratory effects, or a general animation system.
- Audio, music, haptics, particles, or cosmetic systems.
- New gameplay rules, scoring changes, bot-strategy changes, or hidden-information changes.
- New match options, bot difficulty, configurable round count, or settings pages.
- Persisting accessibility/UI preferences beyond the M22 save contract.
- Replacing native destructive confirmation with a custom modal solely for styling.
- A general design-system/component-library refactor.
- Browser-level E2E infrastructure, Playwright, visual-regression tooling, or release hardening owned by M25.
- Backend, accounts, cloud sync, or multiple saves.
- WCAG certification or a claim of full conformance. M23 must remove obvious blockers within the current local-game experience, not present itself as an external accessibility audit.

## Required behaviour

### 1. Responsive application shell

At widths from 320 px upward, the onboarding screen, game header, active table, bot timeline, round result, cumulative summary, final result, and persistence notices must fit the viewport without application-level horizontal scrolling.

The header must reflow rather than compressing the brand, round indicator, playback controls, `Completa subito`, and `Nuova partita` into an unreadable row. On narrow screens:

- controls may wrap or stack;
- the round indicator must remain visible;
- playback speed controls must remain understandable as one labelled group;
- lifecycle controls must remain directly reachable;
- no control may be visually clipped off-screen.

Do not solve narrow layouts by globally shrinking text or cards below useful readability.

### 2. Intentional overflow for hands and melds

Long human hands and long melds may continue to use local horizontal scrolling.

The implementation must ensure:

- document-level horizontal scrolling is not required to reach them;
- the first and last card can be reached;
- keyboard focus/outline on a card is not hidden by the scroll container;
- a selected card remains visibly selected even at narrow widths;
- meld action controls stay outside the horizontally scrolling card strip and remain reachable;
- vertical nested scrolling is kept only where it materially helps rather than trapping most of the mobile viewport.

Long player names within the existing 24-character limit must not break the table layout.

### 3. Card and game-state readability

The physical card UI must preserve visible rank/suit information at narrow widths. Compact meld cards may remain smaller than hand cards, but meaningful card identity may not depend on hover.

Critical game labels and interactive text must remain legible on mobile. Tiny decorative/kicker text may stay secondary, but information necessary to choose an action must not be reduced to decorative-size text.

The current selected state must remain exposed through `aria-pressed` and must also have a clear non-colour-only visual cue (for example shape/position/marker in addition to border colour).

Current-player/active-team state must likewise remain distinguishable without relying only on a subtle colour difference.

### 4. Touch targets

Controls used during ordinary play must provide a comfortable target on touch devices.

At minimum, ensure approximately 44×44 CSS px of clickable/tappable area for:

- normal action buttons;
- `Completa subito`;
- `Nuova partita` / `Gioca ancora` / next-round action;
- playback-speed radio options as a whole labelled target;
- meld-extension controls;
- rule-error dismissal;
- draw/discard-pile controls.

Playing cards already exceed this target and must not be shrunk below it merely to avoid scrolling.

A visually compact control may use internal padding or a larger hit area; do not fake a large target with an unrelated overlay that harms semantics.

### 5. Keyboard and focus visibility

All ordinary interactive controls must remain keyboard-operable through native semantics.

A visible `:focus-visible` treatment must apply consistently to buttons, cards, text input, radio choices, and any other focusable control introduced by M23. The focus indicator must not be clipped by a parent overflow region.

Do not add positive `tabIndex` values or a custom keyboard-navigation system for the card hand.

Disabled actions must remain genuinely disabled controls and outside normal keyboard activation, rather than merely looking disabled.

### 6. Focus after major lifecycle replacements

When an interaction replaces the current primary screen/state and the invoking control disappears, keyboard focus must be moved to a meaningful non-interactive focus target or the next primary control.

Cover at least:

- onboarding → active match;
- active round → completed-round/result view;
- completed round → next active round;
- match/result → onboarding through `Nuova partita` or `Gioca ancora`.

The target must identify the new context (for example the turn/status area, result heading, or onboarding heading/form) and must not create a focus trap.

Do not steal focus on every ordinary card action or bot timeline event.

### 7. Accessible control names and states

Repeated controls must be distinguishable without visual context.

In particular, every `Aggiungi alla calata` action must expose an accessible name that identifies at least the team and meld index/position it affects.

Preserve meaningful names for:

- draw pile with remaining count;
- discard pile with current count/empty state;
- playable cards;
- human hand;
- player seats;
- score/result regions.

If visual text becomes abbreviated for mobile, the accessible name must still convey the full action.

### 8. Bot timeline as an activity log

The public bot timeline must remain chronological and must not expose hidden information.

Expose the event list as a polite incremental log suitable for assistive technology, using appropriate native/ARIA semantics such as `role="log"` with additions announced.

Appending one new bot event must announce the newly added content without intentionally re-announcing every historical event.

An empty timeline remains understandable and does not need repeated live announcements.

Restoring a save still begins with the M22-required fresh empty timeline; M23 must not persist or reconstruct previous bot events.

### 9. Turn/status, errors, and lifecycle announcements

Preserve the existing polite turn banner, rule-error alert, and storage status semantics, but avoid noisy duplicate live regions.

The current turn/phase must remain available visually and to assistive technology.

A newly shown rule error must remain assertive enough to be noticed without moving game legality into React.

Round completion and the terminal match result must expose a clear heading/region and participate in the focus transition from requirement 6.

Storage/resume warnings remain non-blocking status information.

### 10. Contextual digital-flow guidance

Add a concise, always local explanation of what the human can do in the current phase.

The guidance must adapt at least to:

- human `mustDraw` phase: communicate that the player can draw from the stock or collect the discard pile when available;
- human `action` phase: communicate that cards can be selected to create/extend a meld and that one selected card can be discarded to end the turn;
- bot phase: communicate that automated play is in progress and that `Completa subito` is available when rendered.

This is help for operating the digital interface, not a Burraco rules tutorial. Do not add a modal tutorial, rules encyclopedia, or duplicate all of `docs/RULES.md`.

The guidance must not claim an action is available when the corresponding control is disabled by the current UI/domain state.

### 11. Selected, disabled, and active states

Selected cards, disabled actions, current player, active team, and taken/unavailable pozzetto state must remain visually distinct under the current palette.

Do not rely only on opacity for a critical distinction when a text/state label can make the meaning explicit.

Preserve native `disabled`, `aria-pressed`, `aria-current`, and existing semantic state where already correct.

### 12. Contrast and reduced motion

Audit the colors used for body text, secondary text that communicates game state, focus indicators, selected states, status/error text, and actionable controls.

Where current combinations are materially weak, adjust them within the existing dark-green/gold/red visual direction. Aim for WCAG AA contrast for normal informational text and a clearly visible focus indicator; do not claim certification.

`prefers-reduced-motion: reduce` must continue to suppress nonessential transition/animation duration. M23 must not introduce behaviour that requires motion to understand state.

### 13. Persistence notice presentation

M22 notices must remain `role="status"` and non-blocking.

On both onboarding and an active match, a long notice must:

- wrap within the viewport at 320 px;
- remain readable;
- not cover the hand, action bar, header controls, or result actions;
- not create horizontal overflow.

It is acceptable to change the current fixed match-notice presentation into normal document flow or another non-obstructive layout. Do not build a notification framework.

### 14. Preserve architecture and domain authority

All M23 changes are presentation/interaction concerns.

Do not:

- duplicate engine legality in CSS/React;
- change bot candidate/strategy logic;
- change match lifecycle/scoring;
- change save schema solely for presentation state;
- persist focus, selected cards, help text, notice dismissal, or accessibility state.

The game engine and match layer remain authoritative exactly as documented in `docs/ARCHITECTURE.md`.

## Acceptance criteria

- [ ] AC1 — The onboarding, active table, bot timeline, round result, between-round summary, final result, and storage notices fit at 320, 360, and 390 px widths without document-level horizontal overflow or clipped primary controls.
- [ ] AC2 — Tablet/desktop layout remains functional and does not regress while mobile-specific reflow is applied.
- [ ] AC3 — Long hands and long meld rows remain locally scrollable/reachable; focus and selected-state visuals are not clipped, and no document-level horizontal scrolling is required.
- [ ] AC4 — Primary play/lifecycle controls provide approximately 44×44 CSS px touch targets; hand cards remain at least that large.
- [ ] AC5 — All keyboard-operable controls expose a visible focus indicator, and no new positive-tabindex/custom hand-navigation system is introduced.
- [ ] AC6 — Focus lands on meaningful context after onboarding→match, round completion, next-round start, and result/match→onboarding transitions.
- [ ] AC7 — Playable cards remain native buttons with meaningful labels and `aria-pressed`; selected state also has a clear non-colour-only visual cue.
- [ ] AC8 — Every meld-extension control has a unique accessible name identifying the target team and meld.
- [ ] AC9 — The bot timeline is exposed as a polite incremental log and appending an event does not intentionally re-announce the whole existing timeline.
- [ ] AC10 — Existing turn, error, and storage status semantics remain correct without duplicated/noisy live regions.
- [ ] AC11 — Concise contextual guidance accurately describes the current human draw phase, human action phase, or bot phase without implementing game legality independently.
- [ ] AC12 — Header/playback/lifecycle controls wrap or stack cleanly at narrow widths and remain readable/reachable.
- [ ] AC13 — Score cards, cumulative score, Victory Points, round-end copy, and result actions remain readable and reachable at narrow widths.
- [ ] AC14 — Current player, active team, selected card, disabled action, and pozzetto state remain visually understandable without colour alone where the state is critical.
- [ ] AC15 — Critical informational text, focus indicators, status/error text, and actionable controls have no obvious WCAG-AA contrast blocker under the implemented palette; any manual contrast verification is recorded in the report.
- [ ] AC16 — `prefers-reduced-motion: reduce` continues to suppress nonessential transition/animation duration and no M23 interaction requires motion.
- [ ] AC17 — M22 storage/resume notices wrap safely, stay non-blocking, and do not obscure critical match controls.
- [ ] AC18 — A restored pending-bot match still resumes through the existing M22 playback path with a fresh timeline; M23 does not persist/replay transient UI state.
- [ ] AC19 — Existing M1–M22 rule, scoring, bot, playback, match, onboarding, persistence, and hidden-information tests remain green.
- [ ] AC20 — No M24 animation/visual-polish scope, M25 E2E stack, gameplay feature, or post-v1 scope is introduced.

## Required tests

Use the existing Vitest + Testing Library stack unless a new dependency demonstrates clear value. Do not add Playwright or browser-E2E infrastructure in M23.

### Accessibility and semantic component tests

Add or update deterministic tests covering at least:

- playable card accessible name and `aria-pressed` before/after selection;
- disabled action controls remain semantically disabled;
- unique accessible names for multiple meld-extension controls;
- player current-state semantics;
- the bot event list exposes log/live semantics;
- rule errors remain `role="alert"`;
- storage warnings remain `role="status"`;
- current turn/phase status remains available to assistive technology;
- contextual guidance changes between must-draw, action, and bot-owned turns.

### Focus/lifecycle tests

Add deterministic focus assertions for:

- starting a match from onboarding;
- changing from an active round to the completed-round/result view;
- starting the next round;
- returning to onboarding after a confirmed leave or `Gioca ancora`.

Keep fake-timer handling deterministic where bot playback is involved.

Do not assert implementation-specific DOM nesting when a role/name/focus contract is sufficient.

### Existing integration regression

Preserve or extend coverage for:

- human draw/collect/meld/extend/discard actions;
- selection reset after committed actions;
- bot playback speed and `Completa subito`;
- destructive leave cancellation/confirmation;
- between-round transition;
- final match result;
- save/resume and pending-bot resume.

### Responsive/style verification

jsdom does not perform real layout. Do not pretend a DOM unit test proves viewport geometry.

The implementation must therefore:

- make responsive behaviour explicit in CSS rather than relying on JavaScript viewport branching;
- keep the relevant mobile breakpoints understandable/reviewable;
- record in `docs/milestones/reports/M23-implementation.md` which representative widths were checked (target: 320, 360, 390 px plus tablet/desktop) and by what available method;
- if the implementation environment cannot perform a rendered-browser viewport check, state that limitation explicitly rather than claiming it passed.

M25 remains responsible for browser-level automated viewport/E2E protection.

## Documentation updates

- Do **not** change `docs/RULES.md`; M23 introduces no Burraco behaviour.
- Update `docs/ARCHITECTURE.md` only if implementation establishes a reusable UI/focus/accessibility invariant that future work must preserve. Do not add decorative design documentation.
- `docs/ROADMAP.md` does not need modification unless implementation discovers a genuine objective/dependency conflict.
- Do not document M24/M25 implementation details early.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

The implementation report must record:

- final `npm run verify` result;
- test count;
- build result;
- `git diff --check`;
- working-tree state;
- viewport/responsive-check evidence and limitations;
- accessibility/contrast checks performed;
- deviations from this specification;
- known risks/ambiguities;
- incidental changes.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- required semantic/focus/integration tests exist and pass;
- `npm run verify` passes;
- the implementation report exists at `docs/milestones/reports/M23-implementation.md`;
- responsive/accessibility verification is reported honestly, including any lack of real-browser geometry testing;
- documentation remains consistent with the existing architecture;
- no gameplay-rule, persistence, bot, match-lifecycle, or hidden-information regression exists;
- no M24+ or post-v1 scope was introduced;
- the completed implementation is committed and pushed to `milestone-23-ux-mobile-accessibility`;
- the branch is left unmerged for independent review.
