# Milestone 30 — Motion & Bot Choreography

## Goal

Make committed card actions visually legible as movement across the tabletop instead of only as state changes and highlight rings. Human and bot actions should show where cards came from and where they went, while keeping the engine authoritative and all animation presentation-only. Motion must remain lightweight, interruptible, safe for hidden information, and effectively disabled by reduced-motion preferences.

## Context

M29 is integrated on `main` at `49601f33f0e71054190792046768d236aa109816`. The stable interaction surface now includes:

- the M27 tabletop composition;
- the complete M28 discard spread;
- M29 manual hand order and Pointer Events direct manipulation;
- the existing M24 transient `TableFeedback` cue model in `src/components/tableFeedback.ts`;
- stepwise bot playback in `GameTable`, with public bot events and normal/fast timing;
- CSS-only cue/highlight animations and a global `prefers-reduced-motion` collapse policy.

The current committed state always renders immediately. This milestone must preserve that property: motion explains a completed transition but never becomes part of the transition itself.

## In scope

- Lightweight source-to-destination movement for committed human draw, discard-pile collection, discard, new meld and meld extension.
- Equivalent choreography for public bot actions, without revealing hidden cards.
- Pozzetto acquisition movement/emphasis and Burraco emphasis.
- A presentation-only motion layer/coordinator that can reuse the existing `TableFeedback`/public-event information rather than introducing a second game model.
- Cancellation/replacement rules for overlapping motion, new round, new match, unmount, immediate bot completion and disappearing destinations.
- Reduced-motion behaviour.
- Focused unit/component tests plus browser coverage where real geometry is required.
- Architecture documentation for the new transient motion boundary.

## Out of scope

- Audio or sound preferences; M31 owns those.
- App-wide settings/help/result redesign; M32 owns those.
- Any change to `src/game` legality, scoring, bot strategy, match lifecycle or hidden-information rules.
- Any change to the M22 match-save schema or serialization boundary.
- Replacing M29 Pointer Events direct manipulation or making drag state drive legality.
- Delaying an engine commit until an animation finishes.
- General replay/history playback.
- A heavy animation framework or new runtime dependency unless a concrete repository constraint proves the existing platform APIs insufficient.

## Required behaviour

### 1. Motion is derived from committed presentation events

- A human motion is created only after the corresponding engine command succeeds. A rejected `GameRuleError` or structural drag rejection produces no card-flight animation.
- A bot motion is created only from the committed bot step and its existing public events.
- Capturing pre-commit geometry for a human source is allowed, but it is only consumed after a successful commit. Geometry or motion state is never written into `GameState`, `MatchState` or local save data.
- Motion must not call game commands, decide legality, alter card order, mutate the bot timeline or delay `onMatchChange`.
- Reuse or extend the current presentation feedback/event metadata where practical. Do not create a parallel rules interpretation in React.

### 2. Human source-to-destination motion

For a successful human action:

- **Draw from stock:** animate a face-down card proxy from the stock to the human hand/newly received card region. The committed hand is already authoritative; motion does not hold the new card back.
- **Collect discard pile:** animate a compact stack/proxy from the discard spread to the human hand. It is not necessary to animate every card individually, but the movement must clearly represent the whole pile and expose no information beyond cards that were already public.
- **Discard:** animate the chosen hand card from its pre-commit hand position to the discard pile/top-card destination.
- **New meld:** animate the committed payload from the hand toward the exact new meld destination created by the command.
- **Extend meld:** animate the committed payload from the hand toward the exact existing meld index that was extended.

For multi-card meld movement, a bounded stack/fan proxy is acceptable instead of one animated DOM clone per card, provided the direction and card count are visually intelligible.

If a successful action immediately replaces the tabletop with a completed-round view and the destination is no longer mounted, the state transition wins: cancel/skip the ordinary flight cleanly rather than delaying round completion or retaining stale DOM.

### 3. Bot choreography and hidden information

For public bot actions:

- **Draw from stock:** move only a face-down card/back from stock to the acting bot seat. Never expose the drawn card identity in text, DOM attributes, accessible names, animation payloads or debug data.
- **Collect discard pile:** move a public pile/stack proxy from the discard area to the acting bot seat. The destination remains a hidden hand.
- **Play meld / extend meld:** move a neutral or face-down proxy from the acting bot seat to the exact resulting public meld. Card identities become visible only through the committed public meld state, never from hidden bot-hand data.
- **Discard:** move a proxy from the acting bot seat to the discard destination; the committed public top card may be shown only after the step has made it public.
- **Take pozzetto:** move a face-down stack proxy from the pozzetti area to the acting player/seat and emphasize the affected team state. Never expose pozzetto contents, order or assignment beyond the public durable state already rendered.

The motion layer must remain `aria-hidden`/decorative and must not create focusable controls or hidden-information text.

### 4. Burraco and pozzetto emphasis

- Detect a newly reached or changed Burraco classification by comparing committed before/after melds and reusing the existing `classifyBurraco` domain helper. Do not reimplement Burraco classification in presentation code.
- Emphasize the exact meld/badge that newly becomes or changes Burraco classification.
- Pozzetto emphasis must be tied to the existing durable transition where a team changes from not-taken to taken.
- These accents may accompany a card movement, but they cannot block or sequence game state.

### 5. Timing and bot playback

- Motion should use platform primitives already appropriate for this repository: CSS transforms/transitions, Web Animations API and/or a light FLIP-style measurement. Prefer transform/opacity over layout animation.
- A new presentation event may cancel or replace an older unfinished event. Do not build an unbounded animation queue.
- Normal bot playback should leave each committed step visually understandable.
- Fast bot playback must remain fast: motion must not stretch the existing `BOT_PLAYBACK_DELAYS_MS.fast` cadence or force the automation to wait.
- `Completa subito` must cancel/suppress intermediate pending motion so the UI lands directly on the final committed state instead of replaying a burst of stale animations.
- Motion failure or an unavailable Web Animations API must degrade to the static committed UI, not fail gameplay.

### 6. Interruption and cleanup

All active motion/proxies/timers/animation handles must be cancelled or discarded when relevant on:

- next presentation event;
- fresh round;
- restored/replaced match session;
- confirmed new match/leave;
- `Completa subito`;
- component unmount;
- source/destination disappearance.

No stale overlay may survive into a different round or onboarding/result screen.

### 7. Reduced motion

When `prefers-reduced-motion: reduce` is active:

- do not perform source-to-destination translation/scale choreography;
- do not create a long-running JS/Web Animations sequence;
- committed state, text cues, focus behaviour and accessibility remain identical;
- static/highlight feedback may remain only insofar as it is effectively instantaneous under the existing reduced-motion policy.

Reduced-motion handling must be testable without depending on wall-clock animation completion.

### 8. Accessibility and interaction preservation

- Existing native buttons, keyboard paths, screen-reader paths, M29 drag/touch behaviour, focus movement and live regions remain authoritative and operable.
- The motion layer must use `pointer-events: none` and never intercept drag, scroll, click or keyboard input.
- No animation may remount an existing focus target merely to replay an effect.
- Scroll positions in hand/discard/meld areas must not be unexpectedly reset just to animate an action.

## Acceptance criteria

- [ ] AC1 — Successful human draw, whole-pile collection, discard, new meld and exact-meld extension each produce a clear source-to-destination presentation without delaying or changing the committed state.
- [ ] AC2 — Rejected human actions and structural drop rejections produce no card-flight motion and leave the existing error behaviour intact.
- [ ] AC3 — Public bot draw, collect, play/extend, discard and pozzetto actions have intelligible choreography tied to the acting seat and destination.
- [ ] AC4 — No bot-hand or pozzetto card identity/order is exposed through motion markup, attributes, accessible text or presentation state before it is public in committed game state.
- [ ] AC5 — A newly reached/changed Burraco and a newly taken pozzetto receive presentation emphasis derived from existing domain/public state rather than duplicated rules.
- [ ] AC6 — Motion is presentation-only: no `src/game` behaviour, match-save schema, card identity, hand order or bot legality semantics change.
- [ ] AC7 — New round/session, unmount, disappearing destination and `Completa subito` clear pending motion without stale overlays or delayed actions.
- [ ] AC8 — Fast bot playback is not gated by animation; consecutive committed steps may replace unfinished motion cleanly.
- [ ] AC9 — With reduced motion enabled, source-to-destination movement is skipped/collapsed while all controls, committed state and accessible cues remain usable.
- [ ] AC10 — Motion overlays are non-focusable, `aria-hidden`, pointer-transparent and do not disturb the M29 drag/touch/keyboard interaction contract.
- [ ] AC11 — No heavy animation dependency is added unless the implementation report documents a concrete need and why platform APIs were insufficient.

## Required tests

Add or update deterministic tests covering at least:

- derivation of human motion only after successful commits;
- bot motion metadata from public events, including absence of hidden card identities;
- exact target selection for new meld versus a specific meld extension;
- whole-pile and pozzetto proxy behaviour;
- Burraco transition detection through `classifyBurraco`;
- cancellation/replacement on new event, new round/session, unmount and `Completa subito`;
- reduced-motion suppression;
- regression protection for existing selection, drag/drop, focus and bot-playback semantics.

Add focused Playwright coverage for the browser-only parts that unit/jsdom tests cannot establish reliably, such as real source/destination geometry or reduced-motion rendering. Keep it narrow; M33 owns the full v1.1 E2E hardening pass.

At the M30 internal batch checkpoint, run only the directly relevant Vitest/Playwright checks needed to establish this milestone. Defer canonical `npm run verify` to the M30–M32 batch gate.

## Documentation updates

- Update `docs/ARCHITECTURE.md` with the presentation-only motion boundary, event provenance, hidden-information rule, cancellation lifecycle and reduced-motion invariant.
- Do not change `docs/RULES.md`; this milestone changes no Burraco behaviour.
- Do not update the roadmap unless implementation evidence requires a material scope/order change.

## Verification

M30 is an internal checkpoint of the approved M30–M32 batch.

Run focused tests/checks for motion and directly affected interaction paths after implementation. Do not run the canonical full gate merely to mark this checkpoint complete unless a concrete risk or failure justifies it.

The batch runs:

`npm run verify`

once after M32, per `docs/WORKFLOW.md`.

## Completion conditions

The milestone checkpoint is complete only when:

- all acceptance criteria are satisfied;
- required focused tests pass;
- documentation reflects the implemented transient motion boundary;
- the implementation is committed as the distinct M30 commit on the shared batch branch;
- no M31 audio or M32 app-wide polish scope was pulled forward except minimal reusable presentation-event plumbing needed by M30;
- any remaining ambiguity, risk or browser-specific fallback is recorded for the final batch report.
