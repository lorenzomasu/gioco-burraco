# AGENTS.md

## Project

This repository implements a Burraco card game in TypeScript and React.

Development is incremental and milestone-based.

## Sources of truth

Before implementing any task, read:

1. the task or milestone specification;
2. `docs/WORKFLOW.md`;
3. `docs/ROADMAP.md` when the task is a milestone or v1 planning work;
4. `docs/RULES.md` when the task can affect game behaviour, rule enforcement, scoring, bots, or rule-facing UI;
5. `docs/ARCHITECTURE.md` when present;
6. the directly relevant implementation and tests.

`docs/RULES.md` is authoritative for implemented game behaviour.

`docs/ROADMAP.md` is authoritative for the agreed release-cycle milestone sequence and product boundaries. A versioned milestone specification remains authoritative for the concrete implementation scope of that milestone and may refine the roadmap's higher-level details without silently changing its objective or dependencies.

Do not invent Burraco rules, product behaviour, or technical requirements.

Read proportionally to task risk: do not load unrelated game-rule or implementation context for documentation-only or isolated presentation work.

If documentation, tests, and implementation materially conflict, report the conflict instead of silently choosing an interpretation.

Milestone preparation, implementation, independent review, fix, and merge responsibilities are defined in `docs/WORKFLOW.md`.

Follow `docs/WORKFLOW.md` unless the user explicitly requests a different process.

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
