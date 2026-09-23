# Milestone 14 — Four-round match lifecycle

## Goal

Introduce a deterministic match layer above the existing single-round `GameState` so the local game can play a complete match of exactly four smazzate. Each completed smazzata must be scored once with the existing round scorer, accumulated across the match, and followed by a fresh round until the fourth result completes the match. The final result must expose cumulative points, Match Points, and the official F.I.Bur. 2026 Victory Points table for a four-smazzate match.

## Context

Milestone 13 completed the single-round lifecycle by supporting both legal round endings: ordinary closure and draw-pile exhaustion. `GameState` therefore already represents one complete smazzata from initial deal through scoring.

The existing boundaries remain authoritative:

- `src/game/state` owns immutable single-round state;
- `src/game/engine` owns single-round commands and legality;
- `src/game/scoring/calculateRoundScore.ts` is the only round-scoring implementation;
- `src/game/bot` automates the three non-human seats using the same engine;
- React renders state and invokes domain operations but must not become a second match/scoring engine.

The F.I.Bur. 2026 table defines Victory Points from Match Points, where Match Points are the point difference at the end of the four-smazzate turn. This milestone implements only the table for **PARTITA SU 4 SMAZZATE**.

## In scope

- A domain-level match model that owns the lifecycle of exactly four `GameState` rounds.
- Round-result history in chronological order.
- Exact-once settlement of completed rounds through `calculateRoundScore`.
- Cumulative team totals derived from the recorded round results.
- Match Points as the absolute difference between the two cumulative totals.
- Final leading-team / exact-tie information derived from cumulative totals.
- Official F.I.Bur. 2026 Victory Points for a four-smazzate match.
- Deterministic transitions from round 1 → 2 → 3 → 4 and then to match completion.
- Creation of a completely fresh single-round `GameState` for each subsequent smazzata.
- UI support for round number, intermediate round results, cumulative totals, next-round transition, and final match result.
- Regression tests for the existing single-round engine, scoring and bot flow.
- Documentation updates required by the new implemented match behaviour.

## Out of scope

- Any fifth smazzata or configurable match length.
- Two- or three-smazzate VP tables.
- Team-tournament VP tables.
- Tournament standings, Swiss pairing, score-sheet submission, ranking or event/session management.
- Arbitrator bonuses, penalties, absences, delays, timeout, stallo or other tournament procedures.
- Dealer rotation, cut mechanics, starting-player rotation, or physical table procedures between smazzate.
- Bot difficulty levels, new bot strategy, hidden-information changes, personalities or learning.
- Multiplayer/network play, persistence, accounts or save/resume.
- Major visual redesign or unrelated UI work.
- Refactoring the existing single-round rules unless strictly required to integrate the match layer.

## Required behaviour

### 1. Match state is a layer above `GameState`

`GameState` remains the authoritative state of one smazzata and must not be expanded into a multi-round aggregate.

Add a match-domain representation under `src/game` that keeps at least:

- the current round number, from 1 through 4;
- the current single-round `GameState`;
- an ordered history of settled round results;
- whether the overall match is still in progress or completed.

The round history is the source of truth for cumulative scoring. Do not persist a second independently mutable copy of cumulative totals when they can be derived from that history.

A recorded round result must retain enough information to identify its round number, its ending type, and the immutable `RoundScore` snapshot produced for that completed round.

### 2. Starting a match

A new match starts at smazzata 1 with:

- a fresh round produced by the existing round factory / `startGame`;
- empty round history;
- cumulative score 0–0;
- in-progress match status.

The match layer must support dependency injection of a round factory or equivalent deterministic seam so tests do not depend on random shuffle output.

### 3. Settling a completed round exactly once

When the current `GameState` becomes completed:

- calculate its score only through `calculateRoundScore`;
- append exactly one result for the current round to match history;
- preserve the completed `GameState` so its detailed end-of-round UI can still be rendered;
- derive updated cumulative totals from history.

Settlement must work for both:

- `ending: 'closure'`;
- `ending: 'draw-pile-exhausted'`.

Settlement must be idempotent for the already-settled current round: rendering again, re-running a synchronization helper, or otherwise processing the same completed round must not duplicate its score.

An in-progress round must never be added to history.

### 4. Advancing between smazzate

Rounds 1, 2 and 3 may advance only after the current round is completed and settled.

Advancing:

- retains all previous round results;
- increments the round number by exactly one;
- replaces the current round with a completely fresh `GameState` produced by the injected/default round factory;
- therefore resets hands, melds, pozzetti, discard pile, draw pile, round ending and turn state according to the existing `startGame` behaviour;
- preserves the fixed player/team identities already used by the local game.

Do not carry cards, melds, pozzetto ownership, turn acquisition state or any other single-round mutable state into the next smazzata.

Invalid lifecycle transitions must be rejected rather than silently ignored; for example, advancing while the round is still in progress.

### 5. Completing the match

When smazzata 4 is completed and settled:

- the match becomes completed;
- history contains exactly four results;
- cumulative totals are final;
- there is no legal transition to a fifth round.

Attempting to advance a completed four-round match must be rejected and must not create or mutate a new round.

### 6. Cumulative score and Match Points

For each team, the cumulative score is the arithmetic sum of that team's `RoundScore.total` across all settled rounds.

Negative round totals remain negative and are summed normally.

For the final match:

- `matchPoints = abs(team1Cumulative - team2Cumulative)`;
- the leading team is the team with the greater cumulative total;
- an exact equality of cumulative totals is an exact tie.

Match Points must not be calculated by summing absolute per-round differences.

### 7. F.I.Bur. 2026 Victory Points — four smazzate

Use the official four-smazzate table:

| Match Points | Victory Points |
| ---: | :--- |
| 0–100 | 10–10 |
| 105–300 | 11–9 |
| 305–500 | 12–8 |
| 505–700 | 13–7 |
| 705–900 | 14–6 |
| 905–1100 | 15–5 |
| 1105–1300 | 16–4 |
| 1305–1500 | 17–3 |
| 1505–1700 | 18–2 |
| 1705–2000 | 19–1 |
| over 2000 | 20–0 |

Under the implemented scoring system, legal score differences are multiples of 5, so the official ranges above have no reachable gaps.

For a result above the 10–10 band, assign the higher VP value to the team with the higher cumulative score and the lower value to the other team.

A difference from 0 through 100 produces 10–10 even when one team has a higher raw cumulative score.

Victory Point conversion must be a pure domain/scoring function. Do not implement the threshold table in React.

### 8. UI lifecycle

The local application must expose the four-round lifecycle without duplicating domain decisions.

During an active smazzata:

- preserve the current playable table and one-human/three-bot behaviour;
- show the current smazzata number out of 4.

After smazzate 1, 2 and 3 complete:

- preserve the existing detailed round breakdown;
- show cumulative team totals including the just-completed round;
- offer a clear action to start the next smazzata;
- do not start the next smazzata automatically before the player can inspect the result.

After smazzata 4 completes:

- show the final cumulative team totals;
- show Match Points;
- show the final VP allocation;
- do not show a control that creates smazzata 5;
- offer a way to start a completely new four-round match.

The existing “Nuova partita” concept must reset the entire match, not merely clear the current round history.

Bot automation must continue to stop on a completed round and must resume normally on the fresh next round; this milestone must not add new bot strategy.

React may be refactored to add a match-level parent/controller or equivalent, but all match lifecycle, cumulative-score and VP decisions must remain under `src/game`.

## Acceptance criteria

- [ ] AC1 — `GameState` still models exactly one smazzata; multi-round lifecycle is represented by a separate domain-level match abstraction.
- [ ] AC2 — A new match starts on round 1/4 with empty history, 0–0 cumulative totals and a fresh existing-engine round.
- [ ] AC3 — Completing a round records a `RoundScore` produced by `calculateRoundScore`, with no duplicated round-scoring implementation.
- [ ] AC4 — Both ordinary closure and draw-pile exhaustion can settle a round and enter match history.
- [ ] AC5 — Processing the same completed current round more than once does not duplicate its history entry or cumulative contribution.
- [ ] AC6 — An in-progress round cannot be settled into history and cannot advance to the next smazzata.
- [ ] AC7 — Valid transitions are exactly 1→2, 2→3 and 3→4, each creating one fresh round through the injected/default round factory.
- [ ] AC8 — A fresh round contains no mutable gameplay state carried from the previous round while prior score history remains intact.
- [ ] AC9 — Cumulative totals equal the signed sum of the recorded `RoundScore.total` values for each team.
- [ ] AC10 — Final Match Points equal the absolute difference between the two final cumulative totals, not a sum of per-round differences.
- [ ] AC11 — Exact cumulative equality is represented as a tie; otherwise the leading team is derived from the larger cumulative total.
- [ ] AC12 — Match Points 0–100 produce 10–10 VP, including cases with a non-zero raw-score difference.
- [ ] AC13 — Every official four-smazzate VP boundary is implemented exactly: 100/105, 300/305, 500/505, 700/705, 900/905, 1100/1105, 1300/1305, 1500/1505, 1700/1705 and 2000/over-2000.
- [ ] AC14 — For every non-10–10 band, the higher VP value is assigned to whichever team has the higher cumulative score, symmetrically for team 1 and team 2.
- [ ] AC15 — Settling round 4 completes the match with exactly four history entries and a stable final summary.
- [ ] AC16 — A completed match cannot advance or create a fifth smazzata.
- [ ] AC17 — The UI shows round x/4 during play and, after rounds 1–3, shows the round breakdown plus updated cumulative totals and an explicit next-round action.
- [ ] AC18 — After round 4 the UI shows final cumulative points, Match Points and VP, offers a new-match reset, and exposes no fifth-round action.
- [ ] AC19 — Existing single-round legality, scoring, physical-card identity, hidden-information guarantees and bot behaviour remain regression-covered, and React contains no duplicated round scoring or VP threshold logic.

## Required tests

Add deterministic automated tests covering at least:

- starting a new four-round match;
- empty history and zero cumulative totals before any settlement;
- settlement of a closure result;
- settlement of a draw-pile-exhaustion result;
- exact-once/idempotent settlement of the same completed round;
- rejection of settlement/advance while the current round is still in progress;
- transitions 1→2, 2→3 and 3→4;
- one factory call per new round and fresh single-round state after each transition;
- preservation of earlier history while later rounds start;
- cumulative totals with positive and negative round totals;
- Match Points from final cumulative difference;
- exact-tie leader state;
- all official VP threshold boundaries listed in AC13;
- symmetric VP assignment when team 1 leads and when team 2 leads;
- round-4 settlement completing the match;
- rejection of any attempt to create a fifth round;
- UI display of current round number;
- UI intermediate result → next-round flow;
- UI final result with cumulative points, Match Points and VP;
- full-match reset clearing history/totals and returning to round 1;
- regression protection for the existing round-end UI and one-human/three-bot flow.

For rule-critical and lifecycle-critical behaviour, include tests that would fail if:

- round settlement were appended twice;
- `calculateRoundScore` were bypassed;
- the fourth-round terminal check were weakened;
- a VP threshold moved to the wrong boundary;
- React independently reproduced the VP table.

## Documentation updates

Update `docs/RULES.md` to:

- add the implemented four-smazzate match lifecycle;
- define cumulative points and Match Points;
- include the four-smazzate F.I.Bur. 2026 VP table;
- remove or narrow the statement that Match Points, Victory Points and cumulative multi-round scoring are not implemented;
- keep two/three-smazzate tables, team-tournament scoring and tournament procedures explicitly deferred.

Update `docs/ARCHITECTURE.md` to document the match layer above single-round `GameState`, its pure derived scoring responsibilities, and the rule that React must not own match scoring/lifecycle logic.

Do not document future tournament behaviour as implemented.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- exactly four smazzate form one local match;
- every completed round is scored once and only once;
- cumulative score, Match Points and four-round VP are domain-derived and regression-tested;
- the fourth round is terminal and a fifth round cannot be created;
- the UI supports intermediate and final match states without duplicating domain rules;
- required documentation is consistent with implemented behaviour;
- `npm run verify` passes;
- no unrelated refactor, tournament subsystem or future-scope work was introduced;
- any remaining ambiguity, risk or deviation is explicitly reported.
