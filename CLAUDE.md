# CLAUDE.md

## Project

This repository implements a Burraco card game in TypeScript and React.

Development is incremental and milestone-based.

The game engine must remain deterministic, testable, and separated from the UI.

`docs/RULES.md` is the authoritative specification for implemented Burraco rules.
It distinguishes official FIBUR rules, digital-implementation abstractions, and
temporary product assumptions.

Do not invent Burraco rules that are not documented.

If a requested feature exposes an ambiguity or conflict in the rules documentation
that materially affects the requested behaviour, stop and report the ambiguity
before implementing behaviour based on an assumption.

## Repository architecture

- `src/game/cards` — card model, deck creation with stable physical card
  identities, and shuffling with an optional seeded random source for
  reproducibility.
- `src/game/state` — immutable `GameState` types describing players, teams and
  their shared melds, piles, pozzetti, turn, and round status.
- `src/game/engine` — pure, deterministic game commands (dealing, turn actions,
  melds, pozzetto, round closure). Illegal commands throw a typed
  `GameRuleError` and leave the previous state unchanged.
- `src/game/melds` — pure meld validation and Burraco classification. Validated
  melds keep the physical cards and each card's semantic role; classification is
  derived from the current meld rather than stored in state.
- `src/game/scoring` — pure round scoring derived from a completed round state.
- `src/game/bot` — deterministic bot automation: candidate generation, ranking,
  and turn execution. Legality is always decided by the engine commands.
- `src/components` — React UI for the human player and the bot-controlled seats.
  It renders state and invokes the engine; it contains no game rules.

Tests live next to the code they cover as `*.test.ts` / `*.test.tsx`.

## Development workflow

Before implementing a task:

1. Read the task completely.
2. Inspect the relevant existing implementation.
3. Read the relevant sections of `docs/RULES.md`.
4. Check existing tests covering the affected behaviour.
5. Understand the current architecture before modifying code.

Implementation must happen on a dedicated branch.

Never modify `main` directly for feature work.

Do not merge into `main` unless explicitly instructed.

Do not push unless explicitly instructed.

Do not create commits unless explicitly instructed.

Do not force-push, rewrite Git history, or delete branches.

## Scope discipline

Implement only the requested scope.

Preserve existing behaviour unless the task explicitly changes it.

Do not perform unrelated refactors or cleanup.

Do not introduce speculative abstractions for future milestones.

Prefer the smallest change that correctly implements the requested behaviour.

Reuse existing abstractions when they already represent the required behaviour.

## Game engine

Game rules belong in the game/domain layer (`src/game`), not in React components.

The UI must call the engine rather than reproduce game-rule logic.

Bots must use the same engine APIs and rule validation as human players.

Do not duplicate rule validation inside bot code.

Engine operations should remain deterministic.

Illegal moves must preserve the previous game state.

Use the existing typed `GameRuleError` mechanism where appropriate.

Prefer pure functions and immutable state transformations.

## Melds and card identity

Preserve physical card identity. Commands identify cards by physical card ID;
equivalent cards from the two decks are not interchangeable.

Do not replace physical cards with abstract rank/suit representations when state
mutation requires the original card.

Meld validation and Burraco classification must remain derived behaviour unless
the architecture is explicitly changed by a future milestone.

Do not change wildcard semantics without checking `docs/RULES.md` and the existing
validator tests.

## Bots

Bot behaviour must remain deterministic for the same game state.

Bots may only use information legitimately available to the player they represent.

Bots must not inspect hidden opponent hands when evaluating decisions. The same
applies to the order or identity of draw-pile cards and to the contents of a
pozzetto not yet taken.

Candidate generation may propose moves, but legality must ultimately be determined
by the game engine.

Do not reimplement game rules inside bot strategy code.

## Testing

New game behaviour requires automated tests.

Before changing existing behaviour, inspect the tests that currently define it.

Prefer deterministic tests.

Existing passing tests must continue to pass unless the requested task explicitly
changes the expected behaviour.

The current commands are:

- tests: `npm test`
- standalone type check: `npx tsc -b`
- build: `npm run build`
- development server: `npm run dev`

There is currently no lint script.

When completing implementation work, normally run:

1. `npm test`
2. `npx tsc -b`
3. `npm run build`
4. `git diff --check`

Never claim a validation command passed unless it was actually executed.

## UI

React components must not become an alternative game engine.

Keep domain decisions in `src/game`.

UI components should primarily:

- render game state;
- collect player intent;
- invoke engine operations;
- display valid errors and state transitions.

Preserve the current human/bot architecture unless a milestone explicitly changes it.

## Documentation

Update `docs/RULES.md` when a milestone introduces or formally decides game
behaviour that belongs in the documented rules or digital-game abstractions.

Do not silently resolve discrepancies between documentation, tests, and
implementation.

Report conflicts explicitly.

## Completion report

At the end of an implementation task, report:

- current branch;
- files changed;
- behaviour implemented;
- tests added or changed;
- `npm test` result;
- type-check result;
- build result;
- `git diff --check` result;
- remaining risks, assumptions, ambiguities, or deferred work.

Be precise.

Do not report a command as successful unless you actually ran it.
