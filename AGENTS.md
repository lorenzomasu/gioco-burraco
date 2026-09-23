# AGENTS.md

## Project

This repository implements a Burraco card game in TypeScript and React.

Development is incremental and milestone-based.

## Sources of truth

Before implementing any task, read:

1. the task or milestone specification;
2. `docs/RULES.md`;
3. `docs/ARCHITECTURE.md` when present;
4. the relevant implementation and tests.

`docs/RULES.md` is authoritative for implemented game behaviour.

Do not invent Burraco rules, product behaviour, or technical requirements.

If documentation, tests, and implementation materially conflict, report the conflict instead of silently choosing an interpretation.

## Git workflow

Work on a dedicated branch.

Never modify `main` directly.

Do not merge into `main`, force-push, rewrite history, or delete branches unless explicitly instructed.

## Implementation

Implement only the requested scope.

Preserve existing behaviour unless explicitly changed.

Do not perform unrelated refactors.

Prefer the smallest robust change that satisfies the specification.

Game rules belong under `src/game`, not in React components.

Bots and human players must use the same engine legality rules.

Preserve deterministic engine behaviour and physical card identity.

Do not expose hidden game information to bots.

## Tests

New or changed game behaviour requires automated regression tests.

Do not weaken or delete valid tests just to make an implementation pass.

Prefer deterministic tests.

## Verification

Before declaring a task complete, run:

npm run verify

Never claim that verification passed unless it was actually executed.

## Completion report

Report:

- current branch;
- commit SHA, if applicable;
- files changed;
- behaviour implemented;
- tests added or changed;
- npm run verify result;
- deviations from the specification;
- remaining risks or ambiguities.
