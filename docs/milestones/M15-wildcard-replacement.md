# Milestone 15 — Existing-sequence wildcard replacement

## Goal

Complete the missing lifecycle rule for jokers and pinelle already placed in an existing sequence. Extending a sequence must no longer be allowed to silently reinterpret an already-active wildcard as a different rank unless the player has first supplied the exact natural card that replaces the wildcard's previous represented rank.

Keep validation of brand-new melds stateless and deterministic. Add the minimum history-aware validation needed for extending an existing meld, preserve physical-card identity, and make engine, bots, and UI consume the same legality decision.

## Context

Milestone 3 introduced pure, stateless meld validation. Milestone 5 integrated extension of existing team melds by collecting every physical card in the stored meld, adding the selected hand cards, and calling `validateMeld` again.

That model is sufficient for ordinary extensions, but it loses one rule-relevant fact: an active wildcard already on the table has a current semantic position. The F.I.Bur. Codice di Gara — Edizione Gennaio 2026, art. 10 ("Jolly e Pinelle") states that, in a sequence, a joker or pinella may be replaced only by the card it represents and must otherwise remain in the game and in the position where it was placed, including during the same player's turn.

The current validator intentionally chooses a deterministic semantic interpretation from the physical cards it receives. Therefore an existing sequence may currently become legal after an extension only because the validator silently assigns an already-placed wildcard a different represented rank. That is correct for a new sequence candidate, but not necessarily for an existing table sequence.

Example of the gap:

- existing sequence: `3♠ - 4♠ - 5♠ - Joker(2♠)`;
- player adds `7♠`;
- stateless revalidation can reinterpret the Joker as `6♠`, producing `3-4-5-Joker(6)-7`;
- this must be rejected because the Joker previously represented `2♠` and no natural `2♠` was supplied to replace it.

By contrast, if a wildcard representing `4♣` in `3♣ - Joker(4♣) - 5♣` is extended with a natural `4♣`, that exact replacement frees the wildcard to be repositioned within the same sequence according to the existing deterministic sequence rules.

The existing architecture remains authoritative:

- `validateMeld` / `validateSequence` validate new meld candidates from physical cards without table history;
- `src/game/engine` owns gameplay legality and immutable state transitions;
- bots must use the same legality semantics as human players;
- React renders the result and must not duplicate wildcard-replacement rules.

## In scope

- History-aware validation for extending an already-existing meld.
- Enforcement of the F.I.Bur. art. 10 replacement/position rule for an active wildcard already present in an existing sequence.
- Exact natural-card replacement using rank **and suit** of the sequence position represented before the extension.
- Legal deterministic repositioning of the same physical wildcard after its previous represented position has been replaced.
- Legal transition of a same-suit pinella from natural `2` to active wildcard when a valid extension requires it.
- Locking that pinella to its new represented rank after it becomes an active wildcard.
- Legal return of an active same-suit pinella to its natural `2` role when its previous represented rank is exactly replaced and the resulting sequence is valid.
- Preservation of all existing physical-card identities and existing deterministic sequence normalization.
- Reuse of the same extension-legality primitive by the engine and any bot heuristic that reasons about whether a card can extend an existing meld.
- Regression coverage for groups, turn/pozzetto/closure guards, bots, and UI integration affected by the change.
- Documentation updates required by the newly implemented rule.

## Out of scope

- Moving a wildcard from one meld to another.
- Returning a wildcard from a table meld to a player's hand.
- A standalone "rearrange meld" action that changes a table meld without adding at least one hand card.
- Free-form drag-and-drop ordering or manual wildcard positioning in React.
- Arbitrator procedures, exposed-card penalties, irregular-play restoration, or other physical-table sanctions.
- New rules for combinations/groups beyond regression-preserving the current behaviour.
- Bot difficulty levels, personality, lookahead, probability modelling, or unrelated strategy changes.
- Persistence/save-resume, accounts, multiplayer/network play, tournament management, standings, or configurable match length.
- Major visual redesign or unrelated UI polish.
- Refactoring the meld validator beyond what is required to make existing-meld extension semantics explicit and reusable.

## Required behaviour

### 1. New-meld validation remains stateless

`validateMeld`, `validateSequence`, and `validateGroup` must continue to answer whether a set of physical cards can form a new legal meld.

Do not make those APIs depend on a previous meld state or table history.

Their current deterministic normalization rules remain authoritative for:

- Ace-low / Ace-high interpretation;
- natural same-suit pinella selection;
- active-wildcard represented rank;
- free-wildcard end selection;
- physical-card preservation.

M15 must not make brand-new meld validation history-dependent.

### 2. Existing-meld extension gets an explicit history-aware legality boundary

Introduce a pure domain helper for validating an extension of an existing `ValidatedMeld` with one or more physical cards from hand.

The exact name/file layout is an implementation choice, but there must be one reusable source of truth under `src/game/melds` (or an equivalently appropriate domain module) that:

- receives the existing validated meld;
- receives the added physical cards;
- validates the complete resulting physical-card set through the existing meld validator;
- applies the history-aware wildcard rule described below;
- returns the complete resulting `ValidatedMeld` on success or a stable invalid result on failure.

`extendMeld` must consume this helper rather than performing its own looser `validateMeld([...existingCards, ...addedCards])` check.

Bot heuristics that ask whether a card can extend an existing meld must consume the same helper rather than bypassing it with raw stateless validation.

Do not duplicate the historical rule in engine, bot, and React.

### 3. Group extensions preserve current behaviour

For an existing `group`, M15 introduces no new lifecycle rule.

The history-aware extension helper may delegate group legality to the existing stateless meld validation, provided:

- the result is still a group;
- existing and added physical-card identities are preserved;
- all current group tests continue to pass.

Do not invent wildcard movement rules for groups in this milestone.

### 4. An already-active wildcard in a sequence is locked to its current represented position

For an existing `sequence` with `activeWildcard !== null`, capture the wildcard's current physical card and its current `representedRank` before considering the extension.

If the resulting validated sequence contains that same physical card as an active wildcard with the same represented rank, the historical constraint is satisfied.

If the resulting sequence would assign that already-active wildcard a **different** represented rank, or change it from active wildcard to natural same-suit `2`, that semantic change is legal only when the extension supplies the exact natural card that replaces the wildcard's **previous** represented position.

"Exact natural card" means:

- the card's printed rank equals the wildcard's previous non-null `representedRank`;
- the card's suit equals the sequence suit;
- the card is one of the physical cards added by the current extension.

Equivalent physical copies from deck 1 or deck 2 are both acceptable. The selected physical card ID must be preserved.

A card that was already in the table sequence before the command does not count as the replacement supplied by this extension.

A same-rank card of another suit does not count.

### 5. A free wildcard with no represented rank remains anchored unless a legal rule transition resolves it

The current validator can represent a wildcard beyond a complete natural Ace-to-King sequence with `representedRank: null`.

An existing active wildcard with `representedRank: null` must not be arbitrarily reassigned to a ranked gap merely because added cards make another stateless normalization possible.

Because there is no exact natural rank to replace when `representedRank` is `null`, M15 must preserve that wildcard's free semantic position unless the resulting legal interpretation leaves it free with `representedRank: null`.

Do not invent a replacement rank for a previously free wildcard.

### 6. Exact replacement frees the wildcard, but it remains in the same meld

When the added cards contain the exact natural replacement for the existing wildcard's previous represented rank:

- the extension may be valid even if deterministic normalization assigns the same wildcard a new represented rank;
- the wildcard may instead become a natural same-suit `2` when that interpretation is legal;
- the wildcard physical card must remain in that same resulting meld;
- the replacement natural card must also remain in the resulting meld;
- neither card may disappear, return to hand, or move to another meld.

The resulting semantic ordering is the one produced by the existing deterministic validator. M15 does not add a user-selectable target position.

### 7. A natural same-suit pinella may become the active wildcard through a legal extension

A same-suit pinella that is currently stored as a natural `2` is not already an active wildcard and therefore is not locked by the prior-position rule before the command.

A legal extension may cause that same physical pinella to become the sequence's active wildcard if the complete resulting sequence is valid.

This models the F.I.Bur. art. 10 case where a pinella can be moved from its natural `2` position to serve as a wildcard while adding a card that makes the resulting sequence legal.

Once the command commits and that pinella is stored as `activeWildcard` with a non-null represented rank, subsequent extensions must treat it as locked to that represented rank until its exact natural replacement is supplied.

### 8. Existing two-matta sequence semantics remain deterministic

M15 must not replace the existing finite interpretation logic for sequences containing a natural same-suit `2` plus one active wildcard.

If the existing validator can legally normalize a two-matta sequence, the extension helper may accept that normalization only when it also satisfies the historical constraint for any wildcard that was already active before the command.

Do not introduce manual "invert the two wildcards" state or order metadata solely to simulate physical card placement.

### 9. Illegal historical reinterpretation is rejected atomically

If the resulting physical cards form a statelessly valid sequence but violate the existing-wildcard historical rule, the extension must fail before any mutation.

The command must preserve:

- player hand;
- team melds;
- turn phase and acquisition data;
- pozzetto ownership;
- piles;
- all unrelated state references where current immutable-update conventions already preserve them.

Use the existing `GameRuleError` mechanism from `extendMeld`.

A dedicated stable validation reason/error code may be introduced if it materially improves testability and UI messaging, but do not create parallel rule paths. If the existing `INVALID_MELD` engine error remains the external command error, tests must still prove the specific historical rejection through the pure extension validator.

### 10. Existing turn, pozzetto, and closure guards still apply

A historically legal extension is not automatically a legal engine command.

`extendMeld` must continue to enforce all existing requirements, including:

- current player;
- `action` phase;
- valid team meld index;
- non-empty unique physical-card selection from the player's hand;
- final-discard requirement after the pozzetto has already been taken;
- pozzetto acquisition when the first hand is emptied by the legal extension.

The new rule must slot into the existing command rather than bypassing or reimplementing those guards.

### 11. Bot legality and heuristics use the same existing-meld semantics

Actual bot extension candidates already execute through `extendMeld`; preserve that authority.

Any bot helper that only *predicts* whether a card extends a stored meld — including discard ranking such as `extendsOwnMeld` or `helpsOpponent` — must use the history-aware extension validator for existing melds.

A bot must not:

- generate an extension candidate that is legal only under stateless wildcard reinterpretation;
- preserve/discard a card based on a false assumption that such an illegal reinterpretation is available;
- inspect hidden information as part of this change.

No new strategic ranking is introduced.

### 12. UI remains a renderer of domain semantics

The current `MeldArea` annotation for an active wildcard should continue to display the represented rank produced by the domain model.

No React component may determine whether a wildcard replacement/reposition is legal.

If a specific engine error code/message is added for this rule, add the corresponding Italian user-facing message in the existing error mapping. Otherwise preserve the current generic invalid-meld error flow.

No new interaction mode is required: selecting hand cards and using the existing "Aggiungi alla calata" action is sufficient.

## Acceptance criteria

- [ ] AC1 — New-meld validation remains stateless and existing validation behaviour is regression-protected.
- [ ] AC2 — Existing-meld extension uses one pure reusable history-aware validation boundary rather than raw stateless revalidation in each consumer.
- [ ] AC3 — Group extension behaviour remains unchanged.
- [ ] AC4 — An already-active sequence wildcard can remain active at the same represented rank during a legal extension.
- [ ] AC5 — An extension is rejected when an already-active wildcard would change represented rank without an added exact natural replacement for its previous rank and sequence suit.
- [ ] AC6 — A same-rank card of the wrong suit does not unlock the existing wildcard.
- [ ] AC7 — Either physical deck copy of the correct natural rank/suit can unlock the wildcard, and the selected physical card identity is preserved.
- [ ] AC8 — Supplying the exact natural replacement permits deterministic repositioning of the same physical wildcard within the same sequence when the complete result is valid.
- [ ] AC9 — The existing wildcard cannot disappear, return to hand, or move to another meld as part of replacement.
- [ ] AC10 — An existing free wildcard with `representedRank: null` cannot be silently reassigned to a ranked gap by a later extension.
- [ ] AC11 — A natural same-suit pinella may become an active wildcard through a legal extension; after that committed state, its represented rank is locked for subsequent extensions until exact replacement.
- [ ] AC12 — An active same-suit pinella may return to natural-`2` role only through a legal extension that exactly replaces its previous represented rank.
- [ ] AC13 — Existing two-matta normalization remains deterministic and is accepted only when the historical rule is also satisfied.
- [ ] AC14 — Historical-rule rejection is atomic and preserves all existing command guards/state invariants.
- [ ] AC15 — Bot action candidates and existing-meld discard heuristics share the same extension legality and cannot rely on looser stateless wildcard reinterpretation.
- [ ] AC16 — Existing pozzetto acquisition, final-discard, closure, scoring, match lifecycle, physical-card identity, and hidden-information guarantees remain regression-covered.
- [ ] AC17 — React contains no duplicate wildcard-replacement legality and continues to render the domain-provided wildcard role/represented rank.
- [ ] AC18 — `docs/RULES.md` no longer lists replacement/repositioning of table wildcards as wholly deferred and accurately documents the implemented M15 subset.
- [ ] AC19 — `npm run verify` passes.

## Required tests

Add deterministic automated tests covering at least the following.

### Pure existing-meld extension validation

- a group extension that remains valid exactly as before;
- an ordinary sequence extension with no active wildcard;
- an active wildcard that remains on the same represented rank;
- rejection of the canonical illegal reinterpretation:
  - existing `3♠-4♠-5♠-Joker(2♠)`;
  - add `7♠`;
  - raw stateless validation could make Joker represent `6♠`;
  - history-aware extension must reject;
- exact replacement and reposition:
  - existing `3♣-Joker(4♣)-5♣`;
  - add natural `4♣`;
  - extension is legal and keeps that same Joker physical card in the meld;
- wrong-suit same-rank replacement rejection;
- acceptance of either deck copy of the exact natural face, preserving the chosen physical ID;
- an existing free wildcard with `representedRank: null` remaining free rather than being silently converted into a ranked gap;
- a natural same-suit pinella becoming an active wildcard through a valid extension;
- the now-active pinella being locked on the next extension when its represented rank is not replaced;
- the same active pinella returning to natural-`2` role after its represented rank is exactly replaced, when the full sequence remains valid;
- relevant two-matta interpretations without losing deterministic physical-card identity.

### Engine integration

- `extendMeld` accepts a legal exact replacement/reposition command;
- `extendMeld` rejects the canonical illegal reinterpretation atomically;
- hand, melds, turn acquisition, pozzetto state and unrelated game state remain unchanged on rejection;
- legal replacement still triggers existing pozzetto-at-flight behaviour when it empties the first hand;
- legal replacement after pozzetto still respects `CANNOT_CLOSE_WITHOUT_DISCARD`;
- completed-round and phase/player/index/card-selection guards still win where applicable according to existing command ordering.

### Bot regression

- extension candidate generation does not include an action that requires illegal historical wildcard reinterpretation;
- a legal exact replacement can still appear as an extension candidate;
- discard heuristics that ask whether a card extends the bot's own meld use the same history-aware rule;
- opponent-help heuristics use the same history-aware rule;
- deterministic tie-breaking and hidden-information tests remain green.

### UI regression

- wildcard annotations continue to display the post-command represented rank from the stored `ValidatedMeld`;
- if a dedicated new error code is introduced, the UI maps it to an Italian message;
- otherwise the existing invalid-meld UI path remains covered.

For rule-critical behaviour, include mutation-resistant tests that would fail if:

- the history-aware check were replaced again by raw `validateMeld([...existing, ...added])`;
- the replacement check compared rank but ignored suit;
- a pre-existing table card were incorrectly allowed to count as the newly supplied replacement;
- the bot heuristic bypassed the history-aware validator;
- a wildcard could be removed from the resulting meld after replacement.

## Documentation updates

Update `docs/RULES.md` to add a new M15 section describing the implemented subset of F.I.Bur. art. 10:

- an active wildcard already placed in a sequence is tied to its current represented position;
- it may change semantic position only after the exact natural rank/suit it represented is supplied by the extension;
- the wildcard remains in the same meld after replacement;
- a same-suit pinella may move from natural `2` to active-wildcard role through a legal sequence extension and is then subject to the same lock;
- the digital implementation normalizes legal resulting order deterministically instead of simulating physical card movement;
- moving wildcards between melds, returning them to hand, physical-table irregularity procedures, and standalone rearrangement remain out of scope.

Remove or narrow the older blanket deferral that says replacement/movement of jokers and pinelle already on the table is not implemented.

Update `docs/ARCHITECTURE.md` only as needed to document the intentional distinction between:

- stateless validation of a new meld;
- history-aware validation of an extension to an existing meld.

State that engine and bot extension reasoning must share that domain helper.

Do not document out-of-scope physical-table or tournament procedures as implemented.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- new meld validation remains stateless;
- existing sequence extensions enforce the prior represented position of active wildcards;
- exact natural replacement is the only path that unlocks deterministic repositioning of an already-active wildcard;
- same-suit pinella role transitions are correctly locked after commitment;
- engine and bot heuristics share the same extension legality;
- physical-card identity, deterministic behaviour, hidden-information boundaries, pozzetto/closure/scoring/match behaviour remain intact;
- required documentation is consistent with implemented behaviour;
- `npm run verify` passes;
- no unrelated bot strategy, persistence, multiplayer, tournament, or visual-redesign work is introduced;
- any remaining ambiguity, risk, or deviation is explicitly reported.
