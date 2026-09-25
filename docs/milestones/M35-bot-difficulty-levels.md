# Milestone 35 — Bot Difficulty Levels

## Goal

Add a player-facing bot-difficulty choice for local matches while preserving the current deterministic strategic bot as the default behavioural baseline.

M35 introduces exactly two profiles: **Facile** and **Normale**. `Normale` must preserve the decisions produced by the current pre-M35 strategy for the same visible game state. `Facile` must remain fully legal and deterministic but intentionally use simpler heuristics, giving the player a meaningfully easier option without introducing randomness, cheating, lookahead search, Monte Carlo, ML, or a second rules engine.

The selected difficulty is match setup, applies to all three bot-controlled seats for the lifetime of that match, and must resume consistently from the active local save.

## Context

The M34 baseline on `main` is `88d30182a4c442b641571618b5a2824f62335372`.

Relevant current architecture:

- `src/game/bot/candidates.ts` generates legal deterministic action/discard candidates by invoking the same engine commands used by normal gameplay.
- `src/game/bot/strategy.ts` ranks those candidates and chooses draw source, action, and discard.
- `src/game/bot/playBotTurn.ts` owns deterministic bot execution and the stepwise/full-chain orchestration APIs.
- `GameTable` advances bots one committed step at a time through `playNextBotChainStep`; presentation timing is React-only.
- bot legality remains engine-owned, and bot strategy may not inspect hidden opponent hands, future stock identities/order, or unrevealed pozzetti.
- `MatchSetup` currently contains the human name and M34 round count.
- save schema version 2 persists that setup plus authoritative `MatchState`; released schema version 1 is migrated to a four-smazzate current match.
- the current bot strategy is already deterministic and strategic. It is the required `Normale` baseline, not a draft to be replaced.

The roadmap explicitly leaves deeper/highest-difficulty bot strategy for later reassessment. M35 therefore implements the smallest useful difficulty set rather than inventing a third profile without evidence.

## In scope

- a finite bot-difficulty domain with exactly `easy` and `normal`;
- user-facing labels **Facile** and **Normale**;
- `normal` as the default for fresh matches and all compatibility paths;
- exact preservation of the current pre-M35 strategy under `normal`;
- a deliberately simpler deterministic `easy` strategy, specified below;
- propagation of the selected profile through every bot execution path;
- one difficulty value for all three bot seats in a match;
- onboarding choice and same-mounted-app retention alongside the existing name/round-count setup;
- persistence of the selected profile in the active match save;
- migration of valid schema-v1 and schema-v2 saves to `normal`;
- save schema evolution to the next explicit version;
- deterministic unit/integration coverage, including hidden-information and stepwise/full-chain regression;
- directly coupled UI/persistence/E2E updates;
- architecture documentation updates.

## Out of scope

- a `hard` / `expert` / highest-difficulty profile;
- Monte Carlo, minimax, tree search, multi-turn lookahead, probability simulation, ML, LLMs, or server-side bot logic;
- randomness added to make a bot weaker;
- cheating by reading hidden opponent hands, stock cards/order, or unrevealed pozzetti;
- changing engine legality, Burraco rules, scoring, match length, starter rotation, or M33.2 wildcard behaviour;
- per-seat difficulty, bot personalities, asymmetric teammate/opponent profiles, adaptive difficulty, Elo/ranking, or player profiling;
- changing difficulty during an active match;
- treating playback speed as difficulty;
- artificial handicaps such as fewer cards, score modifiers, illegal passes, or altered draw rules;
- M36 guided-first-match coaching;
- M37 PWA/offline infrastructure;
- M38 release/tag work;
- unrelated UI, animation, audio, or table-layout refactors.

## Required behaviour

### 1. Difficulty domain and default

Define one shared finite bot-difficulty domain under the bot/game boundary, with exactly:

- `easy` → player-facing **Facile**;
- `normal` → player-facing **Normale**.

Expose a type guard or equivalent runtime validator suitable for persistence validation.

Define one default:

`DEFAULT_BOT_DIFFICULTY = 'normal'`

A fresh match with no explicit difficulty must behave exactly as the pre-M35 game.

Do not encode the difficulty as free-form text in multiple layers.

### 2. Normale is the pre-M35 behavioural baseline

For the same visible `InProgressGameState` and player, `normal` must preserve the current pre-M35 decisions.

The current baseline is:

#### Acquisition

- if stock is empty, collect the discard pile;
- if discard pile is empty, draw stock;
- otherwise, virtually evaluate collecting the discard pile through the existing legal candidate generator;
- collect it only when at least one resulting legal action uses at least one card that came from that visible discard pile;
- otherwise draw stock.

No hidden stock identity/order is inspected.

#### Action ranking

Preserve the existing ordered priorities:

1. enables ordinary closure;
2. takes pozzetto;
3. improves Burraco classification;
4. stronger resulting Burraco classification;
5. more cards played;
6. fewer wildcards played;
7. more card points played;
8. deterministic existing tie-break.

#### Discard ranking

Preserve the existing ordered priorities:

1. closes the round;
2. avoid discarding a wildcard;
3. avoid discarding a card that extends the bot team's existing melds;
4. preserve cards with more future three-card meld potential;
5. avoid a visible card that extends an opponent public meld;
6. discard more card points when prior criteria tie;
7. deterministic existing tie-break.

Refactoring these comparisons is allowed only if regression tests prove the resulting `normal` decisions are unchanged.

Existing callers that do not explicitly provide a difficulty should resolve to `normal`, so current low-level tests and non-product seams do not silently change behaviour.

### 3. Facile uses simpler deterministic heuristics

`easy` must use the same candidate generation and engine commands. It must never bypass or weaken legality.

Its strategy is intentionally simpler:

#### Acquisition

- if stock contains at least one card, draw from stock;
- only when stock is empty, collect the discard pile.

Do not inspect the identities/order of hidden stock cards.

#### Action ranking

From the existing legal action candidates, choose by:

1. more cards played;
2. fewer wildcards played;
3. more card points played;
4. the existing deterministic tie-break.

Do **not** add special easy-profile weighting for closure, pozzetto, Burraco classification, opponent modelling, or future search.

This still allows closure/pozzetto/Burraco when they naturally result from the chosen legal move; it merely does not deliberately optimize for them.

#### Discard ranking

From existing legal discard candidates, choose by:

1. avoid discarding a wildcard;
2. discard more card points;
3. the existing deterministic tie-break.

Do **not** use `extendsOwnMeld`, `futureMeldCount`, or `helpsOpponent` to improve the easy decision.

A legal round-closing discard remains available naturally: with one card left it is the only legal candidate if closure is possible. Do not introduce a special rule that blocks closure.

### 4. Candidate generation and legality remain shared

Do not fork or duplicate `candidates.ts` into separate easy/normal legality implementations.

Both profiles must:

- consume candidates produced through the same engine-backed generation;
- commit through the same engine commands;
- preserve physical card identity;
- preserve the same pozzetto, closure, wildcard, scoring and turn rules;
- preserve atomic failure semantics;
- never create a move React could commit but the engine would reject.

Difficulty changes **which legal candidate is preferred**, not what is legal.

### 5. Hidden-information boundary is unchanged

Neither profile may inspect or rank using:

- opponent hand card identities;
- future draw-pile card identities or order;
- unrevealed pozzetto identities;
- rejected/internal candidate details exposed to React;
- any information the current bot architecture treats as hidden.

Public opponent melds remain public information, but only `normal` currently uses them in discard ranking. `easy` does not need that heuristic.

Changing hidden card identities/order while keeping all information visible to the bot equivalent must not change a profile's decision merely because of those hidden identities.

### 6. Bot execution APIs carry one stable difficulty

The selected difficulty must reach every bot decision in the turn/chain without being stored in `GameState` or `MatchState`.

Use the smallest API change consistent with the current architecture. Preserve existing default-normal call behaviour where practical.

The same difficulty must be used for:

- delayed `GameTable` bot playback;
- `Completa subito`;
- one-step bot execution;
- one-turn execution;
- full consecutive-bot execution;
- any compatibility/state-only wrappers.

A bot chain must not switch profile between acquisition, meld/extend actions, and discard.

The per-turn/per-chain safety limits and `BotAutomationError` semantics remain unchanged.

For a given state and difficulty, stepwise and full-chain APIs must remain behaviourally equivalent: same final state and ordered public events.

### 7. Match setup owns the selected difficulty

Extend `MatchSetup` with the selected bot difficulty.

The setup for one match therefore contains at least:

- trimmed non-empty human player name;
- supported round count from M34;
- supported bot difficulty.

The difficulty applies to all three bot seats, including the human player's teammate and both opponents.

Do not persist it redundantly into `GameState` or `MatchState`. It is match configuration consumed by the shell/table when invoking bot strategy, not a Burraco rule or scoring field.

Changing difficulty requires starting a new match through onboarding. Do not add an active-match difficulty switch to Settings.

### 8. Onboarding

Extend `StartScreen` with one clear, keyboard-operable single-choice control labelled for bot difficulty.

Requirements:

- choices are exactly **Facile** and **Normale**;
- **Normale** is selected by default on a fresh application;
- each option has concise player-facing explanatory text;
- submitting onboarding includes the supported difficulty in `MatchSetup`;
- the existing name and 2/3/4-smazzate choices continue to work unchanged;
- the control uses native/standard accessible selected-state semantics;
- returning to onboarding within the same mounted application retains the last selected difficulty, consistent with the existing retained name and round count;
- no `Difficile` placeholder or disabled future option is shown.

Suggested product copy may be refined for clarity without changing semantics:

- **Facile** — scelte più semplici e meno strategiche;
- **Normale** — strategia completa, difficoltà predefinita.

Avoid technical implementation language in the UI.

### 9. Save schema evolution and compatibility

Use the existing storage key:

`gioco-burraco:active-match`

M35 must advance the active-save wire format from schema version 2 to **schema version 3**.

The current writer stores:

- version 3;
- setup with `humanPlayerName`, supported `roundCount`, and supported `botDifficulty`;
- authoritative `MatchState`;
- no transient bot playback state, timeline, timers, hand presentation state, or UI preferences.

Support exactly these compatibility paths:

#### Valid schema v1

Released pre-M34 meaning:

- no round count;
- no bot difficulty.

Normalize to:

- `roundCount = 4`;
- `botDifficulty = 'normal'`.

All existing v1 validity checks remain in force.

#### Valid schema v2

M34 meaning:

- explicit supported round count;
- no bot difficulty.

Normalize to:

- the stored valid round count;
- `botDifficulty = 'normal'`.

All existing v2 validity checks remain in force.

#### Current schema v3

Require:

- valid human name;
- supported round count;
- supported bot difficulty;
- the existing internally consistent authoritative match state.

Reject malformed or unsupported difficulty values rather than silently coercing them.

Unsupported versions other than v1, v2 and current v3 remain rejected.

Once a migrated v1/v2 match is later written, the writer emits only v3.

Do not introduce a general migration framework beyond these concrete released formats.

### 10. Save/resume semantics

Reloading an active v3 match must restore the exact selected difficulty.

After restore:

- every subsequent bot step uses the restored profile;
- later rounds of the same match use the same profile;
- the configured profile does not revert to default after a round transition;
- delayed playback and `Completa subito` use the same restored profile;
- the resumed match remains otherwise identical to the committed saved domain state.

A valid legacy v1/v2 save resumes on `normal`, preserving pre-M35 behaviour.

The difficulty itself is not a standalone preference. With no active save, a fresh page load still starts onboarding on `normal`.

### 11. New-match lifecycle

The existing destructive `Nuova partita` contract is unchanged.

- cancelling preserves the exact active match/save and therefore its difficulty;
- confirming clears the active save and returns to onboarding;
- while the same app remains mounted, onboarding may retain the last selected difficulty as form convenience;
- starting the next match commits the newly submitted setup;
- no active match is silently mutated from one difficulty to another.

### 12. Public bot events and presentation remain unchanged

Difficulty must not change the shape or privacy contract of `BotPublicActionEvent`.

The UI may naturally display different legal actions because the selected strategy chose differently, but it must not expose:

- the profile's candidate ranking internals;
- rejected candidates;
- hidden cards;
- strategy scores or diagnostics.

Bot playback speed, delays, sounds, motion, and timeline mechanics remain presentation-only and independent of difficulty.

### 13. Architectural boundaries

M35 must preserve these boundaries:

- engine legality remains under `src/game/engine`;
- candidate generation continues to reuse engine legality;
- strategy selection remains deterministic under `src/game/bot`;
- `GameState` remains one-smazzata authoritative state;
- `MatchState` remains lifecycle/scoring state and does not gain presentation/setup-only bot configuration;
- shell/setup owns the selected match configuration and persistence;
- React collects the difficulty choice and passes it to bot orchestration, but does not rank moves;
- no wall-clock, browser API, timer, or random source enters `src/game/bot` strategy;
- hidden-information protections remain exactly as strict as before.

Avoid unrelated refactors. Prefer small profile-aware ranking functions around the existing candidate model rather than replacing the bot system.

## Acceptance criteria

- [ ] AC1 — The supported bot-difficulty domain is exactly `easy` and `normal`, with one shared runtime-validatable definition.
- [ ] AC2 — `normal` is the default whenever no explicit difficulty is supplied.
- [ ] AC3 — For representative acquisition, action and discard fixtures, `normal` produces the same decisions as the pre-M35 strategy.
- [ ] AC4 — Existing bot callers/tests that omit difficulty continue to receive normal-profile behaviour unless deliberately made explicit.
- [ ] AC5 — `easy` draws stock whenever stock is non-empty and collects the discard pile only when stock is empty.
- [ ] AC6 — `easy` action selection uses exactly cards-played descending, wildcards ascending, points-played descending, then deterministic tie-break over the shared legal candidates.
- [ ] AC7 — `easy` discard selection uses exactly non-wildcard before wildcard, points descending, then deterministic tie-break over legal discards.
- [ ] AC8 — A fixture exists where easy and normal intentionally choose different legal acquisitions.
- [ ] AC9 — A fixture exists where easy and normal intentionally choose different legal action and/or discard candidates because normal uses strategic criteria omitted by easy.
- [ ] AC10 — Repeating the same decision with the same visible state and same difficulty is deterministic.
- [ ] AC11 — Both profiles commit only through existing legal engine transitions and preserve physical card identity.
- [ ] AC12 — Neither profile bases decisions on hidden opponent hands, future stock identities/order, or unrevealed pozzetto identities.
- [ ] AC13 — The same selected difficulty is propagated through acquisition, repeated action steps and discard for a complete bot turn.
- [ ] AC14 — Stepwise and full-chain bot execution remain equivalent for each supported difficulty.
- [ ] AC15 — Existing bot safety limits and `BotAutomationError` behaviour are unchanged for both profiles.
- [ ] AC16 — One selected difficulty applies to all three bot-controlled seats; no per-seat profile is introduced.
- [ ] AC17 — `MatchSetup` contains the selected supported difficulty; `GameState` and `MatchState` do not redundantly store it.
- [ ] AC18 — Fresh onboarding exposes accessible Facile/Normale choices with Normale selected by default.
- [ ] AC19 — Submitting Facile or Normale starts a match whose bot orchestration actually uses that profile.
- [ ] AC20 — Returning to onboarding within the same mounted application retains the last selected difficulty alongside the existing retained setup fields.
- [ ] AC21 — The active-save writer emits schema version 3 with the selected supported difficulty.
- [ ] AC22 — A valid schema-v3 save round-trips both supported difficulties without semantic loss.
- [ ] AC23 — A valid released schema-v2 save resumes with its stored round count and `normal` difficulty.
- [ ] AC24 — A valid released schema-v1 save resumes as four smazzate with `normal` difficulty.
- [ ] AC25 — Invalid/unsupported current difficulty values and unsupported save versions are rejected without weakening existing save validation.
- [ ] AC26 — A resumed easy/normal match continues using the restored difficulty after reload and across later rounds.
- [ ] AC27 — Playback speed, motion, sounds, public timeline shape, rules, scoring, match length and M33.2 wildcard behaviour remain unaffected.
- [ ] AC28 — No hard/expert, lookahead/search/Monte Carlo/ML, adaptive difficulty, per-seat difficulty, M36+, or unrelated feature scope is introduced.

## Required tests

Add/update deterministic automated coverage proportional to the bot/persistence risk.

### Difficulty domain

Cover at least:

- exact supported values;
- default is `normal`;
- runtime guard accepts only supported values;
- invalid strings/unknown values are rejected.

### Normal regression

Preserve the existing bot suite and add focused golden/regression fixtures where useful for:

- current draw-source behaviour;
- current action ordering priorities;
- current discard ordering priorities;
- tie-break determinism.

Tests must fail if `normal` silently falls back to the new easy rankings.

### Easy strategy

Cover at least:

- stock available + attractive discard pile → easy still draws stock;
- empty stock + available discard pile → easy collects it;
- action candidates with different cards-played counts;
- cards-played tie resolved by fewer wildcards;
- next tie resolved by points played;
- final deterministic tie-break;
- discard chooses non-wildcard over wildcard;
- non-wildcard tie chooses higher points;
- final deterministic discard tie-break;
- fixture where normal deliberately makes a stronger strategic choice than easy using the existing normal criteria.

Do not test easy by bypassing candidate generation with illegal synthetic moves unless the lower-level ranking helper itself is the explicit unit under test.

### Bot execution/orchestration

For both difficulties cover at least:

- selected profile reaches acquisition;
- selected profile remains stable through multiple same-turn actions and discard;
- `playBotStep` / one-turn / full-chain compatibility paths use the intended default or supplied profile;
- stepwise chain and full-chain final state/events are equivalent;
- `Completa subito` and delayed table playback share the selected profile;
- existing action/turn safety limits still fire identically;
- completed-round and human-turn stopping behaviour is unchanged.

### Hidden information

Retain existing hidden-information regressions and add profile-aware coverage where needed to prove:

- changing future stock identities/order without changing stock availability does not affect a decision through hidden inspection;
- unrevealed pozzetto identities are not used for ranking;
- opponent hand identities are not read for ranking;
- public opponent melds remain the only opponent card structure normal discard heuristics may consult.

Do not expose hidden values in public action events to make tests easier.

### Setup/UI

Cover at least:

- Normale selected by default;
- selecting Facile and submitting emits `botDifficulty: 'easy'`;
- selecting Normale emits `botDifficulty: 'normal'`;
- name and round-count behaviour from M34 remains intact;
- returned onboarding retains last selected difficulty;
- the control is queryable by accessible role/name, not only CSS;
- `GameTable` receives/uses the submitted profile;
- a standalone/default table path still behaves as normal if the profile prop/seam is omitted.

### Persistence

Update `src/shell/matchPersistence.test.ts` and shell/application integration coverage for at least:

- current writer emits schema v3 and selected difficulty;
- v3 easy round-trip;
- v3 normal round-trip;
- invalid/missing current difficulty is rejected;
- valid v2 becomes current in-memory setup with normal while preserving its M34 round count;
- valid v1 becomes current in-memory setup with four rounds + normal;
- malformed v1/v2 cases already rejected remain rejected;
- unsupported versions remain rejected;
- migrated v1/v2 state subsequently writes v3;
- reload of an easy current save causes subsequent bot play to use easy, not default normal;
- storage exception behaviour remains non-fatal;
- transient bot playback state still is not persisted.

### Browser regression

Keep browser coverage focused; M38 owns the exhaustive v1.2 release matrix.

At minimum:

- the onboarding browser flow exposes Facile/Normale with Normale as default;
- one non-default Facile start persists `easy` in the current save;
- reload/resume preserves that saved setup;
- the existing default-normal critical path remains green.

Prefer deterministic lower-level/React integration fixtures to prove exact easy-vs-normal move differences rather than making production E2E depend on a random deal.

## Documentation updates

Do **not** change `docs/RULES.md`: bot difficulty is not a Burraco rule.

Update `docs/ARCHITECTURE.md` to document:

- the two-profile bot strategy boundary;
- `normal` as the preserved pre-M35 default;
- the deliberately simpler easy heuristics at an architectural level;
- difficulty as explicit match setup passed into bot execution, not `GameState`/`MatchState`;
- the unchanged hidden-information and determinism guarantees;
- save schema v3;
- concrete legacy migration semantics: v1 → 4 rounds + normal, v2 → stored round count + normal.

Update other directly stale product-facing text only if it claims there is no bot difficulty choice.

Do not mark M35 complete in the roadmap before the implementation/review/merge gate actually completes, and do not add future hard/expert behaviour to the roadmap as committed scope.

## Verification

M35 is a standalone delivery unit.

Use focused tests/typechecks during implementation as useful, then run the canonical gate once at completion:

`npm run verify`

Also run:

`git diff --check`

Do not report verification as passed unless the unchanged repository commands complete successfully.

## Completion report

Create/update:

`docs/milestones/reports/M35-implementation.md`

using the repository report template.

Record concisely:

- branch and final implementation SHA;
- files changed;
- difficulty domain/default;
- exact easy behaviour implemented;
- confirmation that normal preserves the pre-M35 baseline;
- bot API/orchestration changes;
- save schema v3 and v1/v2 migration behaviour;
- tests added/updated;
- final `npm run verify` result;
- final `git diff --check` result;
- deviations from this specification;
- remaining risks/ambiguities;
- incidental changes, if any.

## Completion conditions

M35 is complete only when:

- every acceptance criterion is satisfied;
- Facile and Normale are the only supported profiles;
- Normale remains the default and preserves pre-M35 decisions;
- Facile is meaningfully simpler while remaining legal, deterministic and hidden-information-safe;
- one selected profile is used consistently by all three bots and all execution paths;
- current saves persist the profile as schema v3;
- valid v1/v2 saves resume on normal without losing their existing match semantics;
- canonical verification and `git diff --check` pass;
- documentation matches the implemented architecture;
- no M36+ or deeper bot-strategy scope is included.
