# Milestone 36 — Guided First Match

## Goal

Make the first complete local match understandable without requiring the player to open and read the full Help dialog first.

M36 adds an optional, dismissible contextual coaching layer around the existing table flow. The coaching must explain what the player can do now, why common controls are unavailable, and the important digital flow around acquisition, melds, discard, pozzetto, Burraco and closing.

The guide is presentation only. It must derive from already-authoritative committed state, existing control availability, engine rejection codes and public presentation feedback. It must never become a second rules engine or predict legality independently.

Normal repeat play must remain compact.

## Baseline and current architecture

The M35 baseline on `main` is:

`e693a825bf3d70b8923b7226fffc452a9ee1fd5b`

Relevant current behaviour:

- `GameTable` already derives a compact `turnGuidance` string from public turn phase, human/bot ownership, pile availability and whether the human team already has melds.
- draw/collect controls are enabled from the actual current turn phase plus visible pile availability.
- `Cala` and `Scarta e passa` have structural disabled states based on phase and selected-card count; engine commands remain the final legality authority.
- engine rejections are already surfaced through `GameRuleError` codes translated to Italian UI messages.
- `TableFeedback` already exposes committed public events such as acquisition, meld/extension, turn hand-off, pozzetto acquisition and newly reached Burraco.
- `HelpDialog` contains the concise full digital-flow reference and must remain available from the shell.
- `App` owns browser-local presentation preferences such as audio and shell overlays.
- the active match save is schema version 3 and contains only `MatchSetup` plus authoritative `MatchState`; transient/presentation preferences do not belong in that envelope.
- M34/M35 onboarding configuration and bot behaviour are already stable and are not part of this milestone.

## Product behaviour

### 1. First-match coaching default

Introduce one browser-local guidance preference owned by the application shell.

Use this semantic model:

- `enabled: boolean` — whether contextual coaching is currently shown;
- `completedOnce: boolean` — whether this browser has completed at least one match while the first-match guide was active.

Default when no valid preference exists:

- `enabled = true`;
- `completedOnce = false`.

This means the first match after M36 is guided by default.

If storage is unavailable or a write fails, the application continues with in-memory defaults/current state. Guidance-storage failure must never affect the active match or its save.

### 2. Automatic completion of the first guided match

When an authoritative `MatchState` first reaches `status: 'completed'` while:

- guidance is enabled; and
- `completedOnce` is false,

the shell must record:

- `completedOnce = true`;
- `enabled = false`.

The just-finished match/result remains otherwise unchanged. Future matches therefore use the compact normal presentation by default.

Do not infer completion from UI timers, a score screen mount, or guessed round counts. Use the authoritative completed match already received by the shell.

If the user manually disabled guidance before completing a match, simply keep it disabled; do not mark `completedOnce` merely because an unguided match completes.

If the user later re-enables guidance from Settings after `completedOnce = true`, keep that explicit choice enabled across future match completions until the user turns it off again.

### 3. Manual opt-out and re-enable

The contextual guide must be dismissible during an active match with a clear control such as **Nascondi guida**.

Dismissing it:

- immediately switches the table to the current compact repeat-play guidance;
- persists `enabled = false`;
- does not alter `completedOnce`;
- does not touch the active match save.

Extend the existing Settings dialog with one accessible **Guida contestuale** toggle so the player can re-enable or disable coaching explicitly at any time.

Settings remains presentation-only. Do not add guidance configuration to onboarding or `MatchSetup`.

### 4. Separate storage from the authoritative match save

Add a dedicated presentation-preference storage module/key following the defensive pattern already used for audio preferences.

The exact internal file structure is an implementation choice, but the contract is:

- guidance preference uses its own localStorage key;
- it is never nested in `gioco-burraco:active-match`;
- `MATCH_SAVE_SCHEMA_VERSION` remains 3;
- `MatchSetup`, `GameState` and `MatchState` gain no guidance fields;
- malformed guidance preference data falls back safely to defaults without deleting or rejecting a valid match save.

Do not introduce a general settings framework or migration framework just for M36.

### 5. Guided table surface

When guidance is enabled and a match is in progress, replace or expand the current one-line `turnGuidance` into one compact contextual coaching surface near the existing turn/action context.

The coach must be non-modal:

- it never blocks a valid action;
- it does not darken or inert the table;
- it does not require pressing “next” before playing;
- it works with pointer, touch and keyboard;
- it remains compact on mobile;
- it has a clear accessible label/heading and a keyboard-operable dismiss control.

Avoid a multi-step spotlight/tour library, absolute-position callouts tied to element geometry, or any flow that can desynchronize from the actual game state.

When guidance is disabled, preserve the current compact `turnGuidance` behaviour rather than replacing it with an empty area.

### 6. Authoritative derivation boundary

Create one presentation-level derivation seam (a pure helper/model is preferred) for coaching copy/state.

It may consume only already-public/presentation facts needed by the UI, for example:

- whether the active player is the human or a bot;
- current public turn phase;
- whether stock/discard acquisition controls are currently available;
- selected-card count;
- whether the human team currently has any public melds;
- existing engine rejection code/message from the attempted human action;
- committed public `TableFeedback` facts such as a pozzetto acquisition or newly reached Burraco;
- round/match progress already displayed publicly.

It must not:

- inspect opponent hand identities;
- inspect future stock identities/order;
- inspect unrevealed pozzetti;
- enumerate legal moves through a parallel validator;
- call meld validation solely to predict whether `Cala` should work;
- duplicate closure, wildcard, pozzetto or scoring legality;
- rank cards or recommend a strategic move.

The engine remains the only authority on whether an attempted game command is legal.

### 7. Core contextual guidance

The guided experience must cover at least these situations.

#### Human acquisition phase

Explain the current required first step using the real enabled acquisition controls:

- both available → choose between drawing from stock and collecting the discard pile;
- stock only → explain that the discard pile is unavailable/empty;
- discard only → explain that stock is unavailable/empty;
- neither → do not invent a workaround.

Also explain that meld/discard actions are not yet available because the player must acquire first.

#### Human action phase, no selection

Explain that the player may:

- select cards to try a new meld;
- select cards and add them to an existing own-team meld when one exists;
- finish the turn by selecting exactly one card and discarding it.

Do not claim that a particular selected set is legal before the engine accepts it.

#### Human action phase, exactly one selected card

Explain that **Scarta e passa** is structurally available with one selected card.

`Cala` may still be attempted, but the guide must not claim a one-card meld is legal. Existing engine rejection remains authoritative.

#### Human action phase, multiple selected cards

Explain that the selection can be used to try a new meld or extend an own-team meld.

Explain that discard is unavailable because exactly one card must be selected to discard.

This reason comes from the existing UI selection contract, not from reimplementing game legality.

#### Bot turn

Keep coaching short: the bot is acting automatically; the player can observe public moves or use **Completa subito**.

Do not expose bot ranking, rejected candidates, hidden cards, difficulty internals or strategy scores.

### 8. Engine rejection explanations

Preserve the existing `GameRuleError`-based rejection path.

The guided surface may contextualize the latest human rejection, but it must use the actual engine error code/result rather than predicting the failure.

At minimum preserve clear explanations for the existing important flow failures:

- invalid turn phase;
- empty selection;
- invalid meld;
- immediate re-discard restriction after collecting a single discard;
- cannot close without Burraco;
- cannot close with wildcard;
- closure requires the final discard.

A failed action remains atomic and does not advance any tutorial state through guessed success.

The existing alert remains the primary immediate error feedback unless a small refactor can safely share one source of translated copy.

### 9. Pozzetto coaching

When committed public feedback indicates that a team has taken a pozzetto, surface one concise contextual explanation of what just happened.

For the human team, explain that the team has received the second hand and play continues under the existing engine flow.

For the opponent team, explain only the public fact that they have taken their pozzetto.

Do not inspect or reveal unrevealed pozzetto card identities.

The guidance should be event-driven from the committed public feedback/state already available to `GameTable`, not from a parallel “is pozzetto legal?” calculation.

### 10. Burraco and closing coaching

When committed public feedback indicates a newly reached Burraco, surface concise context that:

- the meld is now a Burraco;
- the badge/classification already shown by the table remains authoritative;
- taking the pozzetto and having at least one Burraco are required before ordinary closure.

Do not calculate Burraco classification independently in the guide.

During ordinary human action play, the guide may remind the player that closure ultimately happens through the final discard. Any actual blocked closure must still come from the engine error path.

Do not add new closure buttons, previews, move recommendations or legality indicators.

### 11. Round and match transitions

The guide must not interfere with the existing round-score, next-round or final-result screens.

A new round in the first guided match remains guided while the preference is still enabled.

The first guided match is considered completed only when the authoritative match completes, regardless of whether the match length is 2, 3 or 4 smazzate.

After automatic first-match completion, starting a later match uses compact guidance by default.

### 12. Help remains the full reference

Keep **Come si gioca** available globally.

The contextual coach is not a replacement for the Help dialog and should not duplicate every detailed rule. It should point the player through the current digital flow; the full Help remains the concise reference for the overall match.

Update Help text only where directly useful to mention that contextual guidance can be enabled/disabled from Settings. Avoid duplicating the entire M36 coaching copy there.

### 13. Accessibility and responsive behaviour

The guide must:

- be keyboard reachable where it contains controls;
- expose a meaningful accessible region/heading;
- not rely on colour, animation or sound alone;
- not spam `aria-live` on every render or selection micro-change;
- preserve the existing turn-status live-region behaviour;
- keep dismiss/toggle controls with accessible names;
- remain usable at the mobile widths already covered by the UI suite;
- respect existing reduced-motion behaviour because M36 adds no required motion.

Do not auto-move focus to the coach on every phase change. Existing screen/context focus rules remain authoritative.

### 14. Architectural boundaries

M36 must preserve these boundaries:

- engine legality stays under `src/game/engine`;
- match lifecycle/scoring stays under `src/game/match`;
- bot strategy and M35 difficulty remain unchanged;
- the shell owns browser-local guidance preference and its persistence;
- `GameTable` consumes the preference and renders/derives presentation guidance;
- `GameState`, `MatchState` and `MatchSetup` remain free of tutorial/presentation state;
- active-match save schema remains version 3;
- public feedback may drive contextual explanations only after a committed action;
- no hidden-information boundary is weakened.

Prefer a small guidance model/component and a small shell preference module over embedding a second state machine into `GameTable`.

## Out of scope

- changing Burraco rules, scoring, match lifecycle or closure legality;
- changing M34 match-length presets or victory-point tables;
- changing M35 bot difficulty or strategy;
- hinting which exact cards the player should play or discard;
- best-move analysis, strategy coaching or bot-like recommendations;
- validating candidate melds in advance solely for tutorial UI;
- a blocking product tour, spotlight framework or geometry-based walkthrough;
- new animations/audio specifically required by the guide;
- online help, telemetry, analytics, accounts or cloud preference sync;
- changing the active-match save schema;
- PWA/service-worker/offline infrastructure from M37;
- M38 release/tag work;
- unrelated visual refactors.

## Acceptance criteria

- [ ] AC1 — With no valid guidance preference, contextual coaching starts enabled and `completedOnce` is false.
- [ ] AC2 — Guidance preference is stored under a dedicated presentation key, not in the active-match save.
- [ ] AC3 — Match save schema remains version 3 and serialized match envelopes are semantically unchanged by M36.
- [ ] AC4 — Storage unavailability/malformed guidance data is non-fatal and cannot invalidate a valid active match.
- [ ] AC5 — The active-match coach is non-modal, dismissible and keyboard operable.
- [ ] AC6 — Dismissing the coach immediately returns to the existing compact `turnGuidance` presentation and persists `enabled = false`.
- [ ] AC7 — Settings exposes an accessible Guida contestuale control that can disable and re-enable coaching.
- [ ] AC8 — Human acquisition coaching is derived from the actual phase and visible acquisition-control availability.
- [ ] AC9 — Action-phase coaching distinguishes zero, one and multiple selected cards without predicting meld legality.
- [ ] AC10 — Structural unavailability explanations match existing control contracts: acquire before action; at least one selected card for Cala; exactly one selected card for discard.
- [ ] AC11 — Rule-specific failures are explained only after the engine rejects the attempted command; no parallel legality engine is introduced.
- [ ] AC12 — Bot-turn coaching exposes only public flow and never bot ranking/hidden information.
- [ ] AC13 — Pozzetto coaching is triggered only by committed public pozzetto feedback/state and reveals no hidden pozzetto identities.
- [ ] AC14 — Burraco coaching is triggered from committed authoritative/public classification feedback rather than recalculating classification in presentation.
- [ ] AC15 — Closing guidance never bypasses or duplicates engine closure checks.
- [ ] AC16 — Guidance remains enabled across all rounds of the first guided 2/3/4-smazzate match unless the user dismisses it.
- [ ] AC17 — First authoritative match completion while `enabled && !completedOnce` stores `completedOnce = true` and `enabled = false`.
- [ ] AC18 — Completing an unguided match does not mark `completedOnce`.
- [ ] AC19 — Manually re-enabling guidance after `completedOnce = true` is respected across later match completions until manually disabled.
- [ ] AC20 — Restoring an active match respects the independent browser guidance preference; restore does not rewrite match setup/state.
- [ ] AC21 — Normal repeat play with guidance disabled preserves the existing compact table guidance and controls.
- [ ] AC22 — Help remains available and Settings/Help overlay behaviour is unchanged apart from the new guidance setting/copy.
- [ ] AC23 — Existing M34 match-length, M35 difficulty, bot playback, motion, audio, hand manipulation and persistence tests remain green.
- [ ] AC24 — No M37 PWA/offline or M38 release scope is introduced.

## Required tests

Add focused deterministic coverage proportional to presentation/persistence risk.

### Guidance preference storage

Cover at least:

- no stored value → default enabled/not-completed;
- valid enabled/disabled states round-trip;
- malformed JSON/value → safe defaults;
- storage read exception → safe defaults;
- storage write exception → no thrown error;
- guidance storage key is distinct from `MATCH_SAVE_STORAGE_KEY`.

### App/shell integration

Cover at least:

- fresh app passes enabled guidance to the table;
- dismiss changes shell state and writes only guidance preference;
- Settings can disable/re-enable guidance;
- a restored active match uses the independent current guidance preference;
- final authoritative completion while first-guide active auto-disables and marks completed;
- unguided completion does not mark completed;
- manually re-enabled post-completion guidance is not auto-disabled again;
- match persistence remains schema v3 and setup still contains only name/round count/bot difficulty.

### Guidance derivation

Prefer a pure presentation helper with direct unit coverage for:

- human must-draw: both piles available;
- stock only;
- discard only;
- bot turn;
- human action with zero selection;
- human action with exactly one selection;
- human action with multiple selection;
- own team with/without existing melds;
- relevant engine rejection code/context;
- public pozzetto event;
- public Burraco event.

Tests should prove the model can be constructed from public/presentation facts without card identities from hidden zones.

### GameTable/React

Cover at least:

- guided surface present when enabled;
- compact existing guidance present when disabled;
- dismiss control callback;
- selection-count explanations track UI state;
- draw/action control behaviour itself is unchanged;
- invalid attempted meld remains engine-rejected and atomic;
- closure-related engine error remains authoritative;
- pozzetto/Burraco public feedback produces coaching without leaking hidden data;
- bot playback and `Completa subito` remain usable while coaching is visible;
- no focus stealing on ordinary phase/selection changes;
- accessible region/control names are queryable by role/name.

### Settings and Help

Cover at least:

- Guida contestuale toggle checked state and callback;
- existing bot-speed and audio settings remain unchanged;
- Help remains openable/closable from onboarding and match;
- any new Help sentence is presentation copy only.

### Browser regression

Keep E2E focused; M38 owns exhaustive v1.2 release coverage.

At minimum cover:

- first launch with no guidance preference shows the guide;
- dismissing it and reloading keeps it hidden while a valid active match still resumes;
- the active-match save remains valid and independent from the guidance preference;
- existing default match start/resume critical path stays green.

Do not make E2E depend on completing a randomly dealt full match just to test the automatic-completion preference; prove that deterministically at shell/integration level.

## Documentation updates

Do **not** change `docs/RULES.md`: contextual coaching is not a Burraco rule.

Update `docs/ARCHITECTURE.md` to document:

- the presentation-only guidance preference boundary;
- the independent guidance storage key versus the active-match save;
- default first-match-enabled semantics and first guided completion behaviour;
- the guidance derivation seam consuming only public/authoritative presentation facts;
- unchanged engine legality and hidden-information boundaries.

Update directly stale product-facing Help/README text only if needed.

Do not mark M36 complete in `docs/ROADMAP.md` before implementation, independent review and merge are green.

## Verification

M36 is a standalone delivery unit.

Use focused tests during implementation as useful, then run the canonical gate once at completion:

`npm run verify`

Also run:

`git diff --check`

Do not report verification as passed unless the unchanged repository commands complete successfully.

## Completion report

Create/update:

`docs/milestones/reports/M36-implementation.md`

using the repository report template.

Record concisely:

- branch and final implementation SHA;
- files changed;
- guidance preference model/default/storage key;
- first guided match completion semantics;
- guided-table derivation/component changes;
- confirmation that engine legality and hidden-information boundaries were not duplicated/weakened;
- Settings/Help changes;
- tests added/updated;
- final `npm run verify` result;
- final `git diff --check` result;
- deviations from this specification;
- remaining risks/ambiguities;
- incidental changes, if any.

## Completion conditions

M36 is complete only when:

- all acceptance criteria are satisfied;
- a first guided match can be played without a blocking tutorial;
- common unavailable-control reasons are explained from existing UI/engine authority;
- pozzetto, Burraco and closure flow receive contextual explanation without new legality logic;
- the guide can be dismissed and later re-enabled;
- the first completed guided match makes later play compact by default;
- guidance preference remains fully separate from schema-v3 match persistence;
- existing match/bot/gameplay behaviour is unchanged;
- canonical verification and `git diff --check` pass;
- no M37+ scope is included.
