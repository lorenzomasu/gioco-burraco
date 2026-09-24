# Milestone 22 — Local Save & Resume

## Goal

Make the local four-round match resilient to refresh, tab closure, and ordinary browser interruption.

A valid in-progress or between-round match must be saved locally and restored automatically on the next application load, preserving the exact committed match state and the M21 setup needed to continue future rounds. Persistence must remain a shell/infrastructure concern: transient React playback machinery must not be serialized into domain state.

This milestone introduces no Burraco-rule change and must preserve the M1–M21 gameplay, bot, match-lifecycle, and application-shell contracts.

## Context

M21 established the application shell in `src/App.tsx`: onboarding creates a `MatchSetup`, turns it into a `RoundFactory`, and mounts one `GameTable`.

`GameTable` owns a transient `GameTableSession` containing:

- authoritative `MatchState`;
- transient bot public events;
- transient bot chain-progress counters.

It also owns transient card selection and rule-error state. Bot playback timers are React effects. The shell owns the bot playback-speed preference.

`MatchState` is plain serializable data: it owns the current round number, current `GameState`, settled round results, and terminal match status. Future rounds are not pre-created; they are produced by the round factory only when `advanceMatch` is invoked.

M21's `MatchSetup` currently contains the human player's trimmed display name. That setup is required after restore so later rounds can still be created with the same player name. A function/closure such as `RoundFactory` must never be persisted.

Relevant sources of truth:

- `docs/ROADMAP.md`
- `docs/WORKFLOW.md`
- `docs/ARCHITECTURE.md`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/shell/matchSetup.ts`
- `src/components/GameTable.tsx`
- `src/components/GameTablePlayback.test.tsx`
- `src/game/match/types.ts`
- `src/game/match/lifecycle.ts`
- `src/game/state/types.ts`

No gameplay rule changes are part of M22.

## In scope

- Add versioned browser-local persistence for one active local match.
- Persist the minimum resumable envelope:
  - explicit schema version;
  - M21 `MatchSetup` needed to create future rounds;
  - authoritative committed `MatchState`.
- Use browser-local storage only; no backend or network dependency.
- Save the initial started match and every later committed `MatchState` transition while the match is active.
- Persist committed bot steps as they occur because they change `MatchState`.
- Restore a valid active save automatically on application load.
- Restore a between-round state with the completed round and settled score still visible.
- Recreate the future-round factory from the persisted setup; never serialize a function, callback, timer, random-source closure, or React object.
- Validate unknown persisted data before treating it as a resumable save.
- Reject and safely discard malformed, corrupt, stale, or unsupported-version saves.
- Keep storage read/write/remove failures from crashing or blocking ordinary gameplay.
- Clear the active save when the user confirms `Nuova partita`.
- Keep the save untouched when the user cancels the destructive confirmation.
- Clear the active save when the four-round match becomes terminal.
- Resume pending bot play from the restored committed `MatchState` using a fresh transient playback session.
- Update architecture documentation for the persistence boundary.
- Add only minimal product feedback needed for a discarded/unavailable save; broad UX/accessibility hardening remains M23.

## Out of scope

- Accounts, authentication, backend persistence, cloud sync, or cross-device saves.
- Multiple save slots.
- Save history, replay history, undo, or snapshots.
- Import/export of save files.
- Persisting a completed match as an archive.
- Persisting bot event timeline/history.
- Persisting bot chain-progress counters.
- Persisting pending timers, remaining delay, promises, callbacks, or React component state.
- Persisting selected cards, rule-error banners, hover/focus state, or other interaction state.
- Persisting bot playback speed across a full page reload.
- Persisting the round factory or PRNG state.
- Pre-generating or persisting future rounds.
- New game rules, scoring changes, bot-strategy changes, or hidden-information changes.
- Broad responsive/mobile/accessibility work (M23).
- Visual/game-feel polish (M24).
- Browser-level E2E tooling (M25).
- A general migration framework beyond the explicit v1 schema-version boundary required here.

## Required behaviour

### 1. Versioned save envelope

Persistence must use an explicit versioned wire format rather than writing an unversioned raw `MatchState`.

The current save schema is version 1 and must contain only the data required to resume one active local match:

- `version: 1`;
- the M21 `MatchSetup`;
- the current authoritative `MatchState`.

Use one stable exported storage key and one explicit exported schema-version constant so tests and future migrations do not depend on duplicated string/number literals.

The serialized representation must be JSON-compatible and must round-trip physical-card identity, card placement, turn/acquisition state, pozzetti, meld history, current-round ending state, settled score history, round number, and match status without semantic loss.

Do not store derived values that can be recalculated from `MatchState`.

### 2. Persistence boundary

Browser-storage access belongs outside `src/game`, preferably under `src/shell` or another shell/infrastructure module.

`src/game` must not import `window`, `localStorage`, React, persistence adapters, schema-version constants, or browser APIs.

The persistence module must expose focused load/save/clear behaviour and keep parsing/validation separate enough to unit test without mounting the whole application.

No storage operation may mutate the supplied `MatchState` or `MatchSetup`.

### 3. What is authoritative and when it is saved

The resumable source of truth is the committed `MatchState`, not the whole `GameTableSession`.

A newly started round-1 match must be saved after it exists.

Every committed match change must update the save, including:

- human draw/collect/meld/extend/discard actions;
- each bot action after that step has committed to `MatchState`;
- round settlement produced by synchronization;
- transition to the next round.

A scheduled bot timer that has not fired is not a committed state change and must not create a fictitious future save.

Implementation may add a focused `GameTable` callback such as match-state change notification, or an equivalent shell-facing seam, but storage access itself must not be embedded in game rules.

Avoid persistence writes caused only by transient state changes such as selection, rule errors, bot timeline updates without a domain change, or playback-speed changes.

### 4. Loading and automatic resume

On initial application construction:

- no save → render the normal M21 onboarding screen;
- valid supported active save → restore the saved match automatically and mount the game table directly;
- invalid, corrupt, incompatible, or stale save → discard it safely and render onboarding.

A restored match must use the saved `MatchState` as its actual table state. Do not reconstruct the current round from the name or replay actions.

The shell must recreate the `RoundFactory` from the persisted `MatchSetup` so rounds not yet dealt preserve the M21 player-name configuration and the existing starter schedule.

Future rounds are created normally at the time they are started. Their future random shuffle is not part of the saved state because no future round existed yet.

A restored save must not accidentally call `startMatch` and replace the saved round.

### 5. Validation and incompatible/corrupt data

Treat `localStorage` content as `unknown` until validated.

The loader must reject at minimum:

- invalid JSON;
- non-object/root-shape mismatch;
- unsupported schema version;
- missing or invalid setup;
- missing or invalid match structure needed by the application;
- a terminal/stale match that should no longer be an active save;
- an envelope whose saved human setup is inconsistent with the current round's `player-1` display name.

Validation must be strong enough that the loader does not simply cast arbitrary parsed JSON to `MatchState`.

Prefer small explicit runtime guards over adding a new validation dependency solely for this schema unless repository evidence justifies one.

If validation fails:

- do not mount `GameTable` with the invalid data;
- attempt to remove the invalid save;
- continue to onboarding even if cleanup itself fails;
- do not throw an uncaught application error.

A minimal non-blocking message may inform the user that the previous local save could not be restored. M23 will harden the final presentation.

### 6. Storage failures

Browser storage is an enhancement to continuity, not a reason to make the game unusable.

Reads, writes, and removals may throw (for example unavailable storage or quota failure). Such failures must be contained at the persistence boundary.

- Load/read failure → fall back to onboarding without crashing.
- Save/write failure during a live match → keep the live match playable.
- Clear/remove failure → do not crash the shell.

A minimal non-blocking warning is sufficient for M22; do not build a notification system.

Tests must not depend on a real browser profile or shared external storage.

### 7. Transient state after resume

The following must be reconstructed fresh and must not be serialized:

- bot action timeline;
- bot chain-progress counters;
- pending bot timeout and remaining delay;
- selected-card IDs;
- current rule-error message;
- controlled/uncontrolled component callbacks;
- bot playback-speed preference.

Therefore a restored table begins with normal fresh transient UI state around the exact saved `MatchState`.

If the saved `MatchState` says a bot owns the active turn, existing stepwise playback must schedule a fresh next step after mount and continue from that committed state.

It must not:

- replay already committed bot actions from before the save;
- infer historical events by diffing states;
- execute a saved timer callback;
- duplicate an already committed bot transition.

Resetting transient safety counters after a reload is acceptable; they are presentation/orchestration guards, not persisted domain state.

### 8. Between-round resume

When a round has completed and its result has been synchronized into `roundResults`, that settled between-round `MatchState` must be saved.

Reloading from that save must show the same completed-round score/cumulative summary and the normal `Inizia smazzata N` action.

It must not:

- settle the same round twice;
- duplicate the score result;
- auto-start the next round;
- skip to a different round number.

Starting the next round after restore must use the recreated factory and the existing match-layer starter rotation.

### 9. New-match integration

The M21 destructive flow remains authoritative.

While an active match is in progress:

- cancel `Nuova partita` → preserve the exact mounted session and its save;
- confirm `Nuova partita` → clear the active save, unmount the table, and return to onboarding.

Clearing the save must happen as part of the confirmed leave path, not before confirmation.

The application must not auto-resume the just-abandoned match if the user reloads from onboarding.

### 10. Match completion

When round 4 produces `MatchState.status === 'completed'`, the active-match save must be removed because M22 is continuity for an active match, not a match archive.

The terminal result remains visible in the currently mounted UI exactly as in M21.

After a full reload following completion, the application opens on onboarding rather than restoring a completed archive.

`Gioca ancora` continues to return to onboarding without destructive confirmation.

### 11. M21 setup consistency

The save must carry the trimmed human-name setup required to continue the match.

On restore:

- `player-1` in the current saved round keeps the saved display name;
- a later newly created round uses the same display name through the normal M21 setup/factory path;
- player IDs, teams, deal semantics, hidden information, and starter rotation remain unchanged.

Do not introduce a second independent rename mechanism.

## Acceptance criteria

- [ ] AC1 — With no stored save, a fresh application load still opens the M21 onboarding screen.
- [ ] AC2 — Starting a valid match writes one version-1 local save containing only the resumable setup and authoritative `MatchState`.
- [ ] AC3 — Human and bot domain transitions update the saved `MatchState` only after the transition has committed.
- [ ] AC4 — Refresh/remount with a valid active save automatically restores the exact current round, hands, melds, piles, pozzetti, turn/acquisition state, round number, and settled history represented by that save.
- [ ] AC5 — A valid between-round save restores the completed-round summary without double-settling and does not auto-start the next round.
- [ ] AC6 — After restore, starting a later round uses the persisted M21 setup, preserves the human name, and still follows the existing round-starter schedule.
- [ ] AC7 — No function, random-source closure, callback, timer, bot event timeline, bot progress, selection, rule error, or playback-speed preference is serialized.
- [ ] AC8 — Reloading while a bot turn is pending resumes from the saved committed `MatchState` with fresh playback machinery and does not duplicate an already committed step.
- [ ] AC9 — Invalid JSON is rejected, discarded when possible, and falls back to onboarding without an uncaught error.
- [ ] AC10 — An unsupported schema version is rejected and falls back safely rather than being treated as the current schema.
- [ ] AC11 — Structurally invalid/inconsistent saved data is not cast blindly into `MatchState` and cannot mount the game table as a valid resume.
- [ ] AC12 — Storage read/write/remove failures are contained and do not make the live application crash.
- [ ] AC13 — Cancelling `Nuova partita` preserves both the mounted match and its existing save.
- [ ] AC14 — Confirming `Nuova partita` clears the save and returns to onboarding; a later reload does not restore the abandoned match.
- [ ] AC15 — Completing round 4 clears the active save while leaving the terminal result visible in the current session.
- [ ] AC16 — Reloading after terminal completion opens onboarding rather than restoring a completed match archive.
- [ ] AC17 — Existing M1–M21 rule, scoring, bot, playback, match-lifecycle, onboarding, and hidden-information tests remain green.
- [ ] AC18 — No M23+ responsive/accessibility redesign, game-feel work, E2E stack, backend, cloud save, replay, or multi-slot persistence is introduced.

## Required tests

Add deterministic automated tests at both persistence-module and application-integration level.

### Persistence module

Cover at least:

- save → JSON round-trip → load of a representative active `MatchState`;
- version 1 is explicit and accepted;
- malformed JSON rejected;
- unsupported version rejected;
- missing/invalid setup rejected;
- invalid match shape rejected;
- setup/name inconsistency rejected;
- terminal/stale active save rejected or treated as no resumable save;
- invalid save cleanup is attempted;
- read/write/remove exceptions are contained;
- save/clear functions do not mutate their inputs.

Use injected `Storage` or an equivalent explicit seam where useful so these tests remain deterministic.

### Application resume

Extend `src/App.test.tsx` or focused shell tests to cover:

- no save → onboarding;
- start match → save exists;
- remount/reload simulation → same active match is restored without `startMatch` replacing it;
- restored human name is visible from actual game state;
- after restore, a later round is created with the same setup;
- between-round restore preserves the settled summary and next-round number;
- confirmed `Nuova partita` clears save;
- cancelled `Nuova partita` does not clear save;
- terminal match clears save.

### Bot playback resume

Add a deterministic case that:

1. reaches a bot turn;
2. commits at least one bot step;
3. captures the resulting persisted `MatchState`;
4. unmounts/remounts from that save;
5. verifies transient timeline/progress are fresh;
6. verifies the next bot step continues from the restored state without replaying the already committed transition.

Keep existing fake-timer protections against stale callbacks.

### Regression

Preserve deterministic coverage for:

- normal human actions;
- bot hidden-information guarantees;
- stepwise bot playback;
- round settlement;
- four-round lifecycle;
- M21 onboarding/name propagation;
- destructive leave flow.

Do not delete or weaken existing tests simply because persistence changes the shell state flow.

## Documentation updates

- Do **not** change `docs/RULES.md`; M22 introduces no Burraco behaviour.
- Update `docs/ARCHITECTURE.md` to document:
  - the versioned local-save boundary;
  - the persisted envelope;
  - shell ownership of storage;
  - validation-before-restore;
  - the exact persisted vs transient split;
  - how a restored setup recreates future-round factories.
- `docs/ROADMAP.md` does not need modification unless implementation discovers a genuine objective/dependency conflict.
- Do not document M23/M24/M25 implementation details.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

The implementation report must record the final verification result, test count, build result, `git diff --check`, working-tree state, deviations, known risks/ambiguities, incidental changes, and the exact persistence schema/version implemented.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- required persistence and integration regression tests exist and pass;
- `npm run verify` passes;
- the implementation report exists at `docs/milestones/reports/M22-implementation.md`;
- architecture documentation matches the implemented persistence boundary;
- no gameplay-rule or hidden-information regression exists;
- no M23+ or post-v1 scope was introduced;
- the completed implementation is committed and pushed to `milestone-22-local-save-resume`;
- the branch is left unmerged for independent review.
