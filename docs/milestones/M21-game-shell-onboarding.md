# Milestone 21 — Game Shell & Match Onboarding

## Goal

Turn the current direct-to-table vertical slice into a coherent application entry flow for a first-time player.

The application must open on a clear start screen, explain the fixed local match setup, let the human player choose the name shown in the game, start the existing four-round match intentionally, protect an in-progress match from accidental replacement, and provide an obvious path to start again after the match ends.

This milestone is product-shell work. It must preserve all M1–M20 gameplay behaviour and the existing engine/React boundary.

## Context

Current `main` opens `<GameTable />` directly from `src/App.tsx`.

`GameTable` currently owns the active `MatchState` plus transient UI playback state. It can start a fresh match internally through `startMatch(createGame)`, advance rounds through `advanceMatch(match, createGame)`, and expose a header-level `Nuova partita` action that currently replaces the active match immediately.

Round setup currently defines fixed player metadata in `src/game/engine/startGame.ts`, including the human placeholder name `You`. Match round factories already receive the round number and correct rotating starter from the match layer.

Relevant sources of truth:

- `docs/ROADMAP.md`
- `docs/RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/WORKFLOW.md`
- `src/App.tsx`
- `src/components/GameTable.tsx`
- `src/components/GameTable.test.tsx`
- `src/game/engine/startGame.ts`
- `src/game/match/lifecycle.ts`

M20 froze the v1 gameplay rules baseline. No gameplay-rule change is part of M21.

## In scope

- Add an application-level start/onboarding screen before the game table is mounted.
- Present the fixed local match configuration clearly:
  - one human player;
  - three bots;
  - four smazzate.
- Let the human player enter the name used for `player-1`.
- Trim leading and trailing whitespace from the submitted human name.
- Prevent starting a match while the trimmed human name is empty.
- Propagate the chosen human name into every round created for that match, including rounds 2–4.
- Preserve the existing fixed player IDs, team membership and round-starter schedule.
- Transition clearly from onboarding into the existing playable table.
- Change the in-game `Nuova partita` flow so an in-progress match cannot be discarded without explicit user confirmation.
- If the user cancels that confirmation, preserve the current match and transient table state.
- If the user confirms, leave the current table and return to the start/onboarding screen rather than silently replacing the match in place.
- Add a prominent post-match action that returns to onboarding so another match can be started without an unnecessary destructive confirmation.
- Ensure leaving/replacing the mounted game table cancels any pending bot playback timer through normal React cleanup.
- Add only the minimal shell/onboarding styling needed for a coherent usable flow.
- Update architecture documentation if needed to record the new application-shell responsibility and the way player display configuration reaches new rounds.

## Out of scope

- Local persistence, save, resume or refresh recovery. These belong to M22.
- Accounts, profiles, backend storage or cloud sync.
- Difficulty selection or bot personality settings.
- Configurable number of rounds.
- Configurable teams or seating.
- Renaming bots.
- New gameplay rules.
- Changes to scoring, Match Points, Victory Points, pozzetto logic, meld legality or bot strategy.
- Reworking bot playback semantics or timing.
- Broad mobile/accessibility hardening. That belongs to M23.
- Visual redesign, animation polish or new game-feel systems. Those belong to M24.
- Browser-level E2E tooling. That belongs to M25.

## Required behaviour

### 1. Initial application state

Opening the application must render a start/onboarding screen, not an already-active game table.

The screen must make the fixed local configuration understandable without repository knowledge. At minimum it must communicate that the game is:

- local;
- one human versus/with three bots at the four-seat table;
- played over four smazzate.

The game table, hand controls and active-match header must not be rendered before the user starts a match.

### 2. Human player name

The start screen must provide a labelled text input for the human player's name.

The start action must be unavailable while `name.trim()` is empty.

Starting a match must use the trimmed value as the display name of `player-1`.

The chosen name must be present in the actual round state used by the table so all existing UI that reads `Player.name` sees the same value. Do not maintain a second presentation-only alias that can diverge from game state.

The chosen name must also be used when fresh rounds 2–4 are created for the same match.

Player identity must remain `player-1`; team membership must remain `team-1`. Naming must not affect deal order, card identity, starter rotation, hidden information or any other game semantics.

Implementation may extend setup/factory configuration or introduce a focused pure helper, but it must not patch names through ad-hoc render-time mutation of an already-active state.

### 3. Starting the match

Submitting the valid start form must mount the existing playable match flow at round 1.

The existing match layer remains authoritative for:

- four-round lifecycle;
- starter rotation;
- round settlement;
- cumulative scoring;
- final outcome.

The onboarding layer must not reproduce any of those decisions.

If round 1 or a later round starts on a bot according to existing match rules, the existing bot playback path must continue to handle it normally.

### 4. Active-match replacement

While `MatchState.status === 'in-progress'`, choosing `Nuova partita` must require an explicit confirmation before the current match is destroyed.

The confirmation mechanism may be a native browser confirmation or an equivalent in-app confirmation UI, but both outcomes must be testable:

- cancel → remain in the same match;
- confirm → leave the match and return to onboarding.

Cancelling must not:

- create a fresh round;
- reset scores;
- clear the current hand or melds;
- clear bot event history;
- restart bot playback;
- change the chosen player name.

Confirming must unmount/replace the game session cleanly. Any pending delayed bot playback callback must not mutate the new onboarding state after the table is gone.

Returning to onboarding after confirmation must not automatically start another match.

### 5. Completed-match restart

After round 4 has produced the terminal match result, the result view must expose an obvious action such as `Gioca ancora` / `Nuova partita`.

Because the current match is already terminal, this path must return directly to onboarding without showing the destructive active-match confirmation.

Starting again from onboarding creates a new match from round 1 and may use a newly entered human name.

### 6. Existing direct component testability

Preserve the useful direct-test seams of `GameTable` unless there is a strong reason to replace them.

Existing tests that inject `initialState`, `initialMatch` or a deterministic `createGame` factory must remain supportable or be migrated to an equally deterministic explicit test seam.

Do not make ordinary tests depend on random deck order or wall-clock timing.

### 7. Separation of concerns

React owns:

- onboarding form state;
- application screen/session selection;
- confirmation presentation;
- transient UI state and timers.

The domain/match layer remains authoritative for game and match behaviour.

If setup code is extended to carry player display names, that change is configuration metadata only. It must not introduce React dependencies under `src/game`.

No timer, browser API, confirmation primitive or onboarding state may move into `src/game`.

## Acceptance criteria

- [ ] AC1 — Fresh application load shows onboarding/start UI and does not render the active Burraco table.
- [ ] AC2 — Onboarding clearly states the fixed local setup: one human, three bots and four smazzate.
- [ ] AC3 — The human-name field is labelled, and a blank/whitespace-only trimmed name cannot start a match.
- [ ] AC4 — Starting with surrounding whitespace uses the trimmed human name in the actual `player-1` state and visible table UI.
- [ ] AC5 — The chosen human name is preserved in every newly created round of the same four-round match.
- [ ] AC6 — Player IDs, team membership, card dealing, hidden information and the M18 round-starter rotation are unchanged by player naming.
- [ ] AC7 — Starting from onboarding enters the existing playable round-1 table without duplicating match/game rules in React.
- [ ] AC8 — `Nuova partita` during any non-terminal match requires explicit confirmation before the match is discarded.
- [ ] AC9 — Cancelling the destructive confirmation preserves the exact active match/session instead of resetting or recreating it.
- [ ] AC10 — Confirming the destructive action returns to onboarding and prevents stale bot-playback timers from mutating the replacement screen/session.
- [ ] AC11 — The terminal four-round result exposes a clear restart/play-again action that returns to onboarding without a destructive confirmation.
- [ ] AC12 — A second match can be started from onboarding with a different human name and begins from round 1.
- [ ] AC13 — Existing M1–M20 gameplay, bot playback, scoring and hidden-information regression tests remain green.
- [ ] AC14 — No persistence, settings, difficulty selection, redesign or other M22+ scope is introduced.

## Required tests

Add or update deterministic automated tests covering at least:

### Application shell / onboarding

- fresh `App` renders onboarding and not `GameTable`;
- fixed match configuration copy is present;
- whitespace-only name cannot start;
- a valid name starts the game;
- surrounding whitespace is trimmed before entering game state;
- after returning to onboarding, another name can start a fresh round-1 match.

Prefer a focused `src/App.test.tsx` or equivalent application-shell test file rather than overloading all shell behaviour into `GameTable.test.tsx`.

### Name propagation

Protect the configuration path that creates named rounds:

- round 1 uses the selected human name;
- a later-round factory call also uses the same human name;
- starting-player context is still honored;
- non-human player IDs/team assignments remain unchanged.

The test should fail if the name is applied only to the first round or only as presentation text.

### Destructive new-match flow

Cover both branches:

- cancellation leaves the current match/session intact;
- confirmation returns to onboarding.

Include a case with pending bot playback or otherwise verify unmount cleanup so a scheduled bot step cannot update a discarded session.

### Terminal restart

Cover a completed four-round match showing the restart action and returning directly to onboarding without active-match confirmation.

### Regression

Keep the existing `GameTable` coverage for:

- normal human actions;
- bot playback;
- next-round transition;
- scoring/final outcome;
- transient-state reset where still relevant.

If implementation changes the location of the old in-table fresh-match reset behaviour, update the old tests to assert the new product contract rather than preserving obsolete behaviour.

## Documentation updates

- Do **not** change `docs/RULES.md`; M21 introduces no Burraco rule.
- Update `docs/ARCHITECTURE.md` if the implementation establishes an application-shell/session boundary or adds player-display configuration to the round-creation path.
- Do not document M22 persistence details yet.
- The roadmap objective and ordering do not change, so `docs/ROADMAP.md` should not need modification unless implementation discovers a genuine planning conflict.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

The implementation report must record the final verification result, test count, build result, `git diff --check`, working-tree state, deviations, known risks/ambiguities, and incidental changes.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- required tests exist and pass;
- `npm run verify` passes;
- the implementation report exists at `docs/milestones/reports/M21-implementation.md`;
- documentation is consistent with the implemented application-shell boundary;
- no gameplay-rule regression or M22+ scope has been introduced;
- the completed implementation is committed and pushed to `milestone-21-game-shell-onboarding`;
- the branch is left unmerged for independent review.
