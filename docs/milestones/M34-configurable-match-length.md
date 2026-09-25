# Milestone 34 — Configurable Match Length

## Goal

Let the player choose a supported local match length during onboarding instead of hard-coding every match to four smazzate.

M34 supports exactly **2, 3, or 4 smazzate**, with **4 smazzate as the default** so the released v1.1.2 flow remains unchanged unless the player chooses otherwise. The match domain remains authoritative for lifecycle/completion and Victory Points; React only collects the setup choice and renders the resulting state.

The chosen length must survive local save/resume. Existing valid v1.1/v1.1.1/v1.1.2 version-1 saves must remain resumable and be interpreted as four-smazzate matches.

## Context

The v1.1.2 baseline is at the current `main` after M33.2.

The existing implementation is intentionally fixed to four smazzate:

- `src/game/match/types.ts` exposes `MATCH_ROUND_COUNT = 4`, `MatchRoundNumber = 1 | 2 | 3 | 4`, and a `MatchState` without match-length configuration;
- `src/game/match/lifecycle.ts` completes only on round 4 and rejects a fifth round;
- `src/game/match/victoryPoints.ts` contains only the four-smazzate Victory Points table;
- `src/components/GameTable.tsx`, `src/App.tsx`, browser fixtures and tests render progress with a fixed `/4`;
- `src/shell/matchSetup.ts` stores only the human player's name;
- `src/shell/matchPersistence.ts` writes schema version 1 and validates round numbers against the fixed four-round lifecycle.

This milestone is the roadmap-approved point at which those fixed-four assumptions become explicit match configuration. It does **not** change the rules inside a single smazzata.

The implemented rules baseline already uses the F.I.Bur. Code of Game — January 2026 for the four-smazzate VP table and explicitly deferred the two- and three-smazzate tables. The same Code, section **“Le tabelle”** (printed page 23), defines separate VP tables for matches of 2, 3 and 4 smazzate. M34 brings the already-deferred 2- and 3-smazzate tables into the implemented product model; no arbitrary custom length is introduced.

Relevant sources of truth include:

- `AGENTS.md`;
- `docs/WORKFLOW.md`;
- `docs/ROADMAP.md`;
- `docs/RULES.md`;
- `docs/ARCHITECTURE.md`;
- `docs/milestones/M14-match-lifecycle.md`;
- `docs/milestones/M22-local-save-resume.md`;
- `src/game/match/*`;
- `src/shell/matchSetup.ts`;
- `src/shell/matchPersistence.ts`;
- `src/App.tsx`;
- `src/components/StartScreen.tsx`;
- `src/components/GameTable.tsx`;
- their directly coupled unit/integration/E2E tests.

## Supported presets

The supported match lengths are exactly:

- **2 smazzate**;
- **3 smazzate**;
- **4 smazzate** — default.

Use one domain-level finite type/value source for these presets rather than duplicating loose numeric checks across shell, UI and persistence. A shape equivalent to `MatchRoundCount = 2 | 3 | 4` plus an exported default of `4` is expected; exact naming may follow the existing module style.

`MatchRoundNumber` may remain bounded to `1 | 2 | 3 | 4`, because four is still the maximum supported length. Runtime/domain logic must additionally guarantee that the current round never exceeds the configured match length.

No 1-smazzata, 5+-smazzata or arbitrary numeric/custom mode belongs to M34.

## In scope

- Add an onboarding choice for 2, 3 or 4 smazzate.
- Keep 4 selected by default on a fresh onboarding.
- Carry the selected match length into the authoritative match domain.
- Make match completion depend on the configured length.
- Preserve the existing round-start rotation and truncate it naturally at the configured terminal round.
- Generalize progress/result presentation from fixed `/4` to the configured length.
- Implement the official two- and three-smazzate F.I.Bur. 2026 VP tables in addition to the existing four-smazzate table.
- Derive final Match Points, leader/tie and VP from the configured match length in the game/match layer.
- Add the chosen length to `MatchSetup` and the current resumable save format.
- Introduce the minimum save-schema evolution needed for that new persisted configuration.
- Restore valid legacy version-1 saves as four-smazzate matches.
- Keep all current storage-failure and corrupt-save safety behaviour.
- Update rule and architecture documentation for the now-configurable 2/3/4 lifecycle.
- Update deterministic unit/integration/browser coverage directly affected by fixed-four assumptions.

## Out of scope

- One-smazzata matches.
- Five or more smazzate.
- Free-form/custom numeric match length.
- Tournament/team-event administration, standings, pairings, score sheets, arbitration or timing.
- Changes to single-round deal, turn, meld, pozzetto, closure, exhaustion or round-scoring rules.
- Changes to wildcard rules introduced by M33.2.
- Bot difficulty or strategy changes (M35).
- Guided first-match coaching (M36).
- PWA/offline-cache infrastructure (M37).
- Release/version/tag work for v1.2 (M38).
- Accounts, backend, cloud save, multiple save slots, cross-device sync, replay/history archive.
- Refactoring unrelated UI, animation, sound or table layout.
- A general migration framework beyond the concrete legacy-v1 → current-save compatibility required here.

## Required behaviour

### 1. Match length is authoritative domain configuration

The configured round count must travel with the authoritative `MatchState` (or an equivalently domain-owned immutable match configuration), not live only in React.

A match operation must be able to determine its own terminal round from its domain state. React must not pass “is final round” decisions into settlement or advancement.

A fresh match created without an explicit length must still use four smazzate, preserving the current default behaviour and existing non-product test seams unless deliberately updated.

The configured value is immutable for the lifetime of a started match. Changing duration requires starting a new match through the existing onboarding/new-match flow.

### 2. Lifecycle for 2, 3 and 4 smazzate

All existing lifecycle invariants continue to apply:

- a completed round is settled exactly once;
- an in-progress round cannot be settled/advanced;
- a completed but unsettled round cannot advance;
- each valid advance creates exactly one fresh `GameState`;
- prior settled history remains immutable;
- cumulative totals remain the signed sum of settled `RoundScore.total` values;
- no single-round mutable state leaks into the next smazzata.

The terminal boundary becomes the configured match length:

- a 2-smazzate match completes when round 2 is settled;
- a 3-smazzate match completes when round 3 is settled;
- a 4-smazzate match completes when round 4 is settled.

No match may advance beyond its configured terminal round.

The existing digital starter rotation remains:

- round 1 → `player-1`;
- round 2 → `player-2`;
- round 3 → `player-3`, when present;
- round 4 → `player-4`, when present.

Thus shorter presets use the same schedule prefix; they do not invent a different dealer/starter rule.

### 3. Victory Points use the table for the configured length

Match Points remain:

`abs(team-1 cumulative total - team-2 cumulative total)`.

Leader/tie semantics remain unchanged.

The match layer must choose the VP table from the configured match length. React must not contain VP thresholds.

Use the F.I.Bur. January 2026 tables below.

#### Partita su 2 smazzate

| Match Points | Victory Points |
| ---: | :--- |
| 0–40 | 10–10 |
| 45–120 | 11–9 |
| 125–200 | 12–8 |
| 205–300 | 13–7 |
| 305–400 | 14–6 |
| 405–500 | 15–5 |
| 505–620 | 16–4 |
| 625–740 | 17–3 |
| 745–870 | 18–2 |
| 875–1000 | 19–1 |
| oltre 1000 | 20–0 |

#### Partita su 3 smazzate

| Match Points | Victory Points |
| ---: | :--- |
| 0–50 | 10–10 |
| 55–150 | 11–9 |
| 155–250 | 12–8 |
| 255–350 | 13–7 |
| 355–500 | 14–6 |
| 505–650 | 15–5 |
| 655–800 | 16–4 |
| 805–1000 | 17–3 |
| 1005–1250 | 18–2 |
| 1255–1500 | 19–1 |
| oltre 1500 | 20–0 |

#### Partita su 4 smazzate

Preserve the currently implemented table exactly:

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
| oltre 2000 | 20–0 |

As in the existing implementation, legal round scores are in five-point increments. Threshold handling must preserve the official boundaries and reject/avoid silently classifying impossible gaps if a lower-level pure helper is called with an unreachable value.

The higher VP share outside the 10–10 band goes to whichever team has the higher cumulative score, symmetrically.

### 4. Onboarding

`StartScreen` must expose one clear, keyboard-operable single-choice control for match length with options 2, 3 and 4 smazzate.

Requirements:

- 4 smazzate is selected by default on a fresh application with no restored match;
- the choice is programmatically labelled and exposes its selected state with native/standard accessible semantics;
- submitting onboarding creates a `MatchSetup` containing the trimmed non-empty human name and selected supported round count;
- the onboarding explanation must no longer claim that every match always has four smazzate;
- do not add bot difficulty, tutorial mode or other M35+ controls.

The shell may retain the form choice while the same mounted application returns to onboarding, consistent with the existing retained-name behaviour, but no separate persistent preference for match length is required. The authoritative persisted value belongs to an active match save.

### 5. Match and result presentation

Every fixed-four player-facing indicator must derive from the active match configuration, including at least:

- active header: `Smazzata N/X`;
- resumed-match notice;
- between-round copy such as `Smazzata N di X conclusa`;
- decorative/progress step count;
- final-vs-next-round decision;
- any directly coupled tests/fixtures/selectors.

For a non-terminal completed round, show exactly one existing next-round action.

For the configured terminal completed round:

- show the existing final result presentation;
- show cumulative totals, Match Points and VP computed from the correct table;
- expose no next-round action;
- preserve `Gioca ancora` and ordinary shell actions.

Do not infer the configured total from `roundResults.length` or the current round number. Read it from the authoritative match configuration.

### 6. Setup and round factory boundary

`MatchSetup` must include the selected supported match length.

The human name still configures the round factory exactly as today. Match length itself is match-lifecycle configuration; it must not alter card dealing, shuffle semantics, physical card identity, player/team composition or hidden information.

Future rounds after save/resume continue to be created through the normal setup/factory path and existing starter schedule.

### 7. Save schema evolution and legacy compatibility

The current version-1 save does not contain match length, so M34 requires an explicit wire-format evolution.

Use the existing stable storage key `gioco-burraco:active-match`; do not create a second key.

The current writer must move to **schema version 2** (or an equivalent explicit next version) and persist enough information to resume the selected length unambiguously. With the expected domain shape this means:

- current schema version;
- setup including `humanPlayerName` and supported round count;
- authoritative match including the same domain-owned configured round count;
- no transient presentation machinery.

The loader must support exactly one legacy migration path:

**valid version-1 save → four-smazzate current match**.

A valid v1 save has the released pre-M34 meaning: four-smazzate match, setup containing the human name and a `MatchState` with no length field. On load it must be normalized to the current in-memory shape with round count 4 and restored normally.

Requirements:

- do not discard an otherwise valid v1 active save merely because M34 added configuration;
- do not reinterpret v1 as 2 or 3 rounds;
- continue to reject malformed/stale/internally inconsistent v1 data;
- current-version saves must explicitly contain a supported round count;
- setup and authoritative match length must agree;
- current round number and settled history must be valid for the configured length;
- a current save claiming round 3 of a 2-round match is invalid;
- unsupported versions other than the explicit legacy v1/current version remain rejected;
- all existing card-ledger, meld, score, turn, team, setup-name and stale-terminal validation remains in force;
- storage exceptions remain contained as before;
- once a migrated legacy match is subsequently written, the writer emits only the current schema.

Whether a valid v1 save is rewritten immediately on restore or on the first ordinary save notification is an implementation detail, provided the user can resume it correctly and no future write emits schema v1.

### 8. Save/resume behaviour for configured matches

A current-version active save must restore the selected match length exactly.

After restore:

- progress uses the restored denominator;
- later rounds preserve the same configured length;
- the terminal boundary does not revert to four;
- final VP uses the restored length's table;
- pending bot playback still resumes from committed state with fresh transient playback machinery as in M22;
- selected cards, hand presentation order, timers, bot timeline/progress and other transient UI remain outside the save.

A between-round save for a 3- or 4-smazzate match must resume the same result/progress and allow only the correct next round.

There is no resumable between-round state after the configured final round: terminal matches continue to clear the active-match save.

### 9. New-match and completion integration

The existing destructive `Nuova partita` contract is unchanged:

- cancelling preserves the exact active match and save, including configured length;
- confirming clears the active save and returns to onboarding.

Completing the configured final round clears the active-match save while keeping the final result visible in the mounted session.

A later page load after terminal completion opens onboarding rather than restoring a completed archive.

### 10. Architectural boundaries

M34 must preserve these boundaries:

- `GameState` still represents exactly one smazzata;
- match lifecycle/completion and VP selection live under `src/game/match`;
- round scoring continues to use `calculateRoundScore`;
- shell/persistence owns browser storage and schema migration;
- React collects setup intent and renders domain results, but does not implement terminal-round or VP-table logic;
- bots and human actions continue to use the same single-round engine;
- no hidden information boundary changes;
- match length must not enter `GameState` merely for presentation convenience.

Avoid unrelated refactors. Generalize only the code currently coupled to the fixed-four assumption.

## Acceptance criteria

- [ ] AC1 — The supported match-length set is exactly 2, 3 and 4 smazzate, represented by one shared finite domain definition; 4 remains the default.
- [ ] AC2 — Starting a match without an explicit length preserves the existing four-smazzate behaviour.
- [ ] AC3 — A started match carries its configured round count in authoritative immutable match-domain state (or an equivalent domain-owned configuration), rather than relying on React to decide when it ends.
- [ ] AC4 — A 2-smazzate match settles rounds 1 and 2 exactly once, becomes terminal on round 2 and cannot create round 3.
- [ ] AC5 — A 3-smazzate match becomes terminal on round 3 and cannot create round 4.
- [ ] AC6 — A 4-smazzate match preserves the existing round-4 terminal behaviour and cannot create round 5.
- [ ] AC7 — Starter rotation remains the existing prefix of player-1 → player-2 → player-3 → player-4 for every supported length.
- [ ] AC8 — Cumulative scoring remains the signed sum of settled existing round scores for every supported length.
- [ ] AC9 — Final Match Points and leader/tie semantics remain unchanged and are domain-derived.
- [ ] AC10 — Every official two-smazzate VP boundary in this specification maps to the correct VP split.
- [ ] AC11 — Every official three-smazzate VP boundary in this specification maps to the correct VP split.
- [ ] AC12 — Every existing four-smazzate VP boundary remains unchanged.
- [ ] AC13 — VP assignment is symmetric for either leading team and the configured match length, not UI state, chooses the table.
- [ ] AC14 — Fresh onboarding offers accessible 2/3/4 choices with 4 selected by default and submits the chosen value as part of `MatchSetup`.
- [ ] AC15 — Starting a selected 2- or 3-smazzate match renders `Smazzata 1/2` or `Smazzata 1/3` respectively; the existing default renders `Smazzata 1/4`.
- [ ] AC16 — Between-round copy, progress-track length and next-round action use the configured total without duplicated terminal logic in React.
- [ ] AC17 — The configured final round shows the existing final-result flow and no further-round control.
- [ ] AC18 — The current active-save writer uses schema version 2 (or the explicit next schema version adopted by the implementation) and stores the supported length unambiguously.
- [ ] AC19 — A valid released version-1 save is restored as a four-smazzate match instead of being discarded.
- [ ] AC20 — Malformed/inconsistent v1 saves remain rejected; unsupported versions outside the explicit v1/current contract remain rejected.
- [ ] AC21 — Current-version persistence rejects unsupported lengths, setup/match length mismatch, and any current round/history impossible for the configured length.
- [ ] AC22 — Reloading a current 2- or 3-smazzate active/between-round save preserves its configured total and later lifecycle terminal boundary.
- [ ] AC23 — Completing the configured terminal round clears the active save; cancelling/confirming `Nuova partita` retains/clears it exactly as before.
- [ ] AC24 — Single-round legality, scoring, physical-card identity, M33.2 wildcard behaviour, deterministic bots and hidden-information guarantees are unchanged.
- [ ] AC25 — No M35+ bot difficulty, coaching, PWA, release or unrelated feature work is introduced.

## Required tests

Add/update deterministic automated coverage proportional to the lifecycle/persistence risk.

### Match lifecycle

Cover at least:

- supported/default round-count definitions;
- start of 2-, 3- and 4-smazzate matches;
- default/no-explicit-config start remains 4;
- exact transitions and terminal boundary for 2 rounds;
- exact transitions and terminal boundary for 3 rounds;
- existing 4-round transitions and terminal boundary;
- rejection of advancing beyond each configured terminal round;
- settlement idempotency for each relevant terminal boundary;
- starter schedule prefix for all three presets;
- cumulative totals independent of preset;
- no mutation of prior history or round state.

### Victory Points

Use table-driven tests covering every lower/upper official boundary for:

- 2 smazzate;
- 3 smazzate;
- 4 smazzate regression.

Also cover:

- exact tie;
- non-zero Match Points that still produce 10–10;
- team-1 and team-2 leading symmetrically;
- use of the selected table for the same Match Points value;
- invalid/unreachable low-level input behaviour consistent with the existing five-point-increment contract.

Tests must fail if the implementation always falls back to the four-round table.

### Setup and UI integration

Cover at least:

- 4 selected by default;
- selection/submission of 2 and 3;
- `MatchSetup` contains name + selected length;
- dynamic `Smazzata N/X`;
- dynamic between-round copy and progress steps;
- correct next-round action on non-terminal rounds;
- final result on round 2/3/4 according to configuration;
- no extra next-round action after terminal;
- existing four-round default presentation remains green;
- resumed notice uses the restored configured total.

Use accessible role/name queries for the onboarding choice; do not make tests depend only on CSS classes.

### Persistence

Update `src/shell/matchPersistence.test.ts` and shell/application integration coverage for at least:

- current writer emits the new schema and selected match length;
- current 2/3/4 saves round-trip without semantic loss;
- valid legacy v1 save restores as current configuration with length 4;
- migrated v1 state subsequently writes only the current schema;
- malformed/inconsistent v1 still fails;
- unsupported version still fails;
- unsupported current length fails;
- setup/match length mismatch fails;
- `currentRoundNumber > configured length` fails;
- impossible settled-history/terminal relationships for the selected length fail;
- current shorter match reload resumes with the correct denominator and terminal boundary;
- current storage read/write/remove failure behaviour remains non-fatal;
- persistence still excludes transient UI/playback data.

### Browser regression

Update the directly coupled Playwright fixtures so they do not assume `/4` globally.

At minimum:

- preserve the existing complete default four-smazzate E2E path;
- add a browser-level non-default lifecycle assertion proving a selected shorter preset terminates at its configured round rather than continuing to four;
- add/adjust a persistence browser path proving a non-default configured match survives reload with the same total.

Do not duplicate the exhaustive all-presets release matrix reserved for M38 when lower-level tests already cover equivalent boundaries.

## Documentation updates

Update `docs/RULES.md` to:

- replace the “exactly four smazzate” product statement with the implemented 2/3/4 preset model;
- state that 4 is the default;
- document the unchanged starter-rotation prefix;
- add the official two- and three-smazzate VP tables alongside the existing four-smazzate table;
- remove the statement that 2/3-smazzate VP tables are deferred;
- keep tournament/team-event administration and other unrelated procedures out of scope.

Update `docs/ARCHITECTURE.md` to document:

- configured match length as match-domain state;
- 2/3/4 terminal lifecycle;
- VP-table selection by domain configuration;
- `MatchSetup` now carrying the length;
- current save schema and the single explicit v1 → four-round compatibility path;
- dynamic UI progress deriving from match state rather than a fixed constant.

Update other product-facing documentation only where it currently states that every match is necessarily four smazzate. Do not make release/version/tag changes belonging to M38.

The roadmap does not require a scope change: M34 is resolving the exact presets explicitly requested by the existing v1.2 plan.

## Verification

M34 is a standalone delivery unit.

Use focused tests/typechecks during implementation as useful, then run the canonical gate once at completion:

`npm run verify`

Do not report verification as passed unless the unchanged repository command completes successfully.

## Completion report

Create/update:

`docs/milestones/reports/M34-implementation.md`

using the repository report template.

Record concisely:

- branch and final implementation SHA;
- files changed;
- behaviour implemented;
- tests added/updated;
- final `npm run verify` result;
- save-schema migration behaviour;
- deviations from this specification;
- remaining risks/ambiguities;
- incidental changes, if any.

## Completion conditions

M34 is complete only when:

- every acceptance criterion is satisfied;
- 2/3/4 match lengths are domain-owned and 4 remains default;
- all three official VP tables are correctly implemented and tested;
- a valid pre-M34 v1 active save resumes as a four-smazzate current match;
- current configured saves restore without changing length;
- UI progress and terminal behaviour derive from authoritative configuration;
- canonical verification passes;
- documentation matches the implemented behaviour;
- no unrelated M35+ scope is included.
