# Milestone 18 — Round starter rotation

## Goal

Remove the MVP assumption that every smazzata starts with `player-1`.

In the four-smazzate local match, the player of hand must rotate deterministically in table order so that the four rounds start with `player-1`, `player-2`, `player-3`, and `player-4` respectively. This must integrate with the M17 stepwise bot playback: rounds that start on a bot become visibly pending bot turns and are advanced only by the existing playback mechanism.

M18 formalizes only the digital starting-player rotation. It does not simulate the physical dealer, cutting, or card-dealing gestures.

## Context

The current setup path in `src/game/engine/startGame.ts` hardcodes:

`round.turn.currentPlayerId = 'player-1'`.

`docs/RULES.md` explicitly describes this as a temporary MVP product assumption.

The match layer introduced in M14 creates four fresh smazzate through a round factory, but the factory currently has no round-specific starting-player requirement. Consequently every new smazzata starts on the human player.

M17 deliberately made the UI capable of starting a fresh session with a bot already current and of step-playing pending bots after `Inizia smazzata N`. M18 must use that existing path rather than adding a second auto-resolution mechanism.

The implemented table order remains:

`player-1 → player-2 → player-3 → player-4 → player-1`.

The four-round local match therefore uses this deterministic starting-player schedule:

| Smazzata | Giocatore di mano iniziale |
| --- | --- |
| 1 | `player-1` |
| 2 | `player-2` |
| 3 | `player-3` |
| 4 | `player-4` |

## In scope

- Allowing round setup to create a valid `InProgressGameState` with an explicit initial `PlayerId`.
- Preserving `player-1` as the standalone/default starter when the engine setup API is used without match context.
- Making the match lifecycle choose the initial player from the current round number.
- Rotating the four match starters exactly `player-1`, `player-2`, `player-3`, `player-4`.
- Passing enough round context through the round-factory path for deterministic starter selection.
- Preserving all existing deck, hand, pozzetto, discard-pile, team, card-identity, scoring, and lifecycle behaviour.
- Integrating naturally with the existing M17 pending-bot playback on rounds 2–4.
- Resetting a new match back to round 1 / `player-1`.
- Updating rules and architecture documentation for the new invariant.
- Deterministic regression tests across engine setup, match lifecycle, and React integration.

## Out of scope

- Modelling or rendering the physical dealer/mazziere.
- Modelling cutting the deck, the player making the pozzetti, or physical dealing gestures.
- Random selection of the first dealer or first player.
- User-selectable starting seats.
- Renaming players or changing team composition.
- Rotating the human seat or changing the existing relative table layout.
- Bot strategy, ranking, difficulty, hidden-information rules, or candidate generation.
- Bot playback timing changes, speed controls, pause/resume, or replay.
- Dealing animations, card-motion animation, sound, haptics, or visual redesign.
- Persistence, networking, multiplayer, matchmaking, or tournament seating.
- Changes to scoring, Victory Points, Burraco validation, wildcard replacement, pozzetto rules, or round-closing rules.
- Unrelated cleanup of M17 implementation deviations or risks.

## Required behaviour

### 1. Round setup accepts an explicit starting player

The engine setup layer must support constructing a fresh valid round whose initial turn belongs to a caller-specified `PlayerId`.

The exact API shape is an implementation choice, but:

- the starting player must be selected during round construction, not patched later by React;
- the resulting turn must be `{ currentPlayerId: <requested player>, phase: 'mustDraw' }`;
- all four defined player IDs must be supported;
- setup must otherwise remain identical to the existing deterministic deal for the same ordered deck/random source.

Standalone compatibility must be preserved: existing callers that start a single game without specifying a starting player still start on `player-1`.

### 2. Starting-player choice does not affect the deal

For the same ordered deck, changing only the requested starting player must not change:

- player hands;
- physical card identities;
- team membership;
- pozzetti;
- opening discard;
- draw-pile order;
- round status other than `turn.currentPlayerId`.

The starting-player option is turn metadata, not a second shuffle/deal policy.

### 3. The match layer owns round-to-starter mapping

The four-round match lifecycle must own the schedule:

- round 1 → `player-1`;
- round 2 → `player-2`;
- round 3 → `player-3`;
- round 4 → `player-4`.

Do not duplicate this mapping in React.

The implementation may expose a small pure helper for the mapping when useful, but there must be one authoritative mapping.

### 4. Round factories receive sufficient match context

The match round-creation path must provide enough information for a factory to create the correct fresh round.

The exact type signature is an implementation choice. A solution may pass the round number, the required starter, or a small typed context object.

Requirements:

- `startMatch` must create round 1 with the round-1 starter;
- `advanceMatch` must create the next round with that next round's starter;
- injected factories used by tests/UI must remain deterministic and must be able to observe or honor the requested starter;
- do not infer the starter from mutable UI state;
- do not mutate a factory result after construction merely to force its turn owner if the factory API can express the requirement directly.

Prefer the smallest type change that makes the contract explicit.

### 5. Existing single-round engine APIs remain compatible

M18 must not turn the engine into a match-aware layer.

`startGame` / `dealInitialState` remain valid for isolated single-round tests and callers.

Without explicit match starter context they retain their previous default of `player-1`.

The match layer may depend on the engine setup API; the engine setup layer must not depend on `MatchState` or round-history types.

### 6. Advancing the match rotates exactly once

After a completed, settled round:

- advancing 1 → 2 creates a fresh round starting on `player-2`;
- advancing 2 → 3 creates a fresh round starting on `player-3`;
- advancing 3 → 4 creates a fresh round starting on `player-4`.

Existing M14 guards remain unchanged:

- no advancement while the current round is in progress;
- no advancement before settlement;
- no fifth round;
- settled history and cumulative scoring remain unchanged.

Repeated or illegal lifecycle calls must not cause the starter schedule to skip or advance twice.

### 7. A new match always resets the schedule

A newly created four-round match always starts at:

- round number 1;
- `player-1`;
- phase `mustDraw`;
- empty round history.

Starting `Nuova partita` from any previous round must not carry over the previous match's next starter.

### 8. Rounds 2–4 may immediately be bot turns

In the current product setup `player-1` is the only human player.

Therefore, under the M18 schedule:

- round 2 initially belongs to bot `player-2`;
- round 3 initially belongs to bot `player-3`;
- round 4 initially belongs to bot `player-4`.

This is expected behaviour, not a condition to normalize back to the human.

### 9. Fresh-round bot turns use M17 playback unchanged

When the user clicks `Inizia smazzata 2` (and analogously for later rounds), React must:

1. commit the fresh round with the correct bot as current player;
2. render that real fresh-round state before the bot completes its turn;
3. keep the new round timeline empty initially;
4. allow the existing M17 effect/orchestrator to schedule one bot step after the shared playback delay;
5. append only committed bot events as those steps occur.

Do not call a full-turn/full-chain bot API as a shortcut.

Do not add a second timer or a special “round start bot” path.

### 10. Human controls remain unavailable until control returns

A round that starts with a bot must respect the same M17 lock as any other bot playback.

The human must not be able to draw, collect, select for gameplay, meld, extend, or discard while the initial bot chain is pending.

When control reaches `player-1`, the existing human controls resume normally.

### 11. Hidden-information guarantees remain unchanged

Rotating the starter must not change what is visible to the human.

In particular:

- bot hands remain face-down/count-only;
- stock draw identities remain hidden;
- unrevealed pozzetto identities remain hidden;
- no starter/dealer helper may expose card identities or inspect future stock order.

### 12. No starter state is duplicated in MatchState

Do not add a mutable `startingPlayerId` field to `MatchState` merely to mirror a value already derivable from `currentRoundNumber`.

The authoritative match-level schedule is derived from the round number.

The current round's actual turn owner remains in `GameState.round.turn.currentPlayerId`, as before.

If an implementation requires temporary factory context, keep it outside persisted domain state.

## Acceptance criteria

- [ ] AC1 — Fresh round setup can be created with each of the four `PlayerId` values as initial current player.
- [ ] AC2 — An explicitly selected starter begins in `mustDraw`.
- [ ] AC3 — For the same ordered deck, changing only the starter changes only the initial turn owner and not the dealt cards/piles/teams.
- [ ] AC4 — Existing standalone setup without an explicit starter still begins with `player-1`.
- [ ] AC5 — Match round 1 starts with `player-1`.
- [ ] AC6 — Advancing to round 2 starts with `player-2`.
- [ ] AC7 — Advancing to round 3 starts with `player-3`.
- [ ] AC8 — Advancing to round 4 starts with `player-4`.
- [ ] AC9 — The round-to-starter mapping exists in one authoritative domain location and is not duplicated in React.
- [ ] AC10 — Existing match settlement, cumulative scoring, round-history identity, and fifth-round guards remain behaviourally unchanged.
- [ ] AC11 — `Nuova partita` from any prior point resets to round 1 starting with `player-1`.
- [ ] AC12 — Starting round 2 in the UI first renders `player-2` as current player before any bot step commits.
- [ ] AC13 — The new round bot timeline is empty before the first playback delay elapses.
- [ ] AC14 — Advancing one playback delay from the fresh bot-start round commits only one bot step through the existing M17 stepwise mechanism.
- [ ] AC15 — Human state-changing gameplay controls remain locked while the fresh-round bot chain is pending.
- [ ] AC16 — Bot hand/stock/pozzetto hidden-information guarantees remain intact.
- [ ] AC17 — No match-level mutable starter field is added solely to duplicate the deterministic round-number mapping.
- [ ] AC18 — Existing bot full-chain and stepwise equivalence behaviour remains unchanged.
- [ ] AC19 — Existing engine, meld, wildcard, scoring, match, bot, and UI tests remain green.
- [ ] AC20 — `npm run verify` passes.

## Required tests

### Engine setup tests

Add deterministic tests covering at least:

- the existing default setup still starts `player-1` in `mustDraw`;
- explicit setup for `player-2`, `player-3`, and `player-4` starts the requested player in `mustDraw`;
- two setups using the same ordered deck but different starters have identical hands, teams, draw pile, discard pile, and pozzetti;
- physical card IDs are unchanged by starter selection.

Prefer direct ordered-deck fixtures so these tests do not depend on random shuffle output.

### Match lifecycle tests

Add/update deterministic tests covering at least:

- `startMatch` requests/creates round 1 with starter `player-1`;
- the complete 1 → 2 → 3 → 4 lifecycle requests/creates starters `player-1`, `player-2`, `player-3`, `player-4` exactly once and in order;
- advancement guards do not call the round factory or consume/advance starter context on rejected transitions;
- a fresh second match restarts the schedule at `player-1`;
- score history and cumulative totals remain unchanged by starter rotation.

Use a factory spy/context-aware fixture where useful so the test protects the lifecycle contract rather than merely inspecting a manually patched state.

### UI integration tests

Use fake timers, as in M17, and cover at least:

- after completing round 1 and clicking `Inizia smazzata 2`, the immediate render shows round 2 with `player-2` current;
- before advancing timers, no round-2 bot action has already been committed and the round-local timeline is empty;
- after one `BOT_STEP_DELAY_MS`, exactly one bot step has committed;
- human gameplay controls cannot mutate the fresh round while the bot chain is active;
- when the chain eventually returns to `player-1`, the normal human controls work;
- `Nuova partita` resets to round 1 / `player-1` and does not inherit a pending round-2/3/4 starter.

Do not sleep in real time.

## Documentation updates

### `docs/RULES.md`

Replace the temporary statement that the initial identity of `player-1` is an MVP placeholder with the implemented digital match rule:

- the standalone/default single-round setup starts with `player-1`;
- in the four-smazzate local match the starting player rotates in table order:
  `player-1`, `player-2`, `player-3`, `player-4`;
- this is the digital abstraction used by the product;
- physical dealer/cut/dealing procedures are not simulated.

Do not document unimplemented tournament or seating behaviour.

### `docs/ARCHITECTURE.md`

Add a focused invariant that:

- engine round setup can accept an explicit initial player without becoming match-aware;
- the match layer owns the round-number → starting-player schedule;
- React renders the resulting state and relies on the existing M17 playback when that starter is a bot;
- starter selection must not affect card distribution or hidden-information boundaries.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

The implementation report required by `docs/WORKFLOW.md` must be created/updated at:

`docs/milestones/reports/M18-implementation.md`

and must include the actual verification result, deviations, known risks/ambiguities, incidental changes, and notes for independent review.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- all four smazzate use the required deterministic starter rotation;
- standalone engine setup remains backward-compatible;
- the starter choice changes no dealt card identity or pile content;
- rounds 2–4 enter the already-existing M17 bot playback naturally;
- no React-level starter mapping or batch bot shortcut is introduced;
- no duplicated mutable starter state is added to the match model;
- required deterministic tests exist and pass;
- `npm run verify` passes;
- the M18 implementation report is versioned on the milestone branch;
- documentation is consistent;
- no bot-strategy, scoring, animation, persistence, networking, or unrelated future-scope work is introduced.
