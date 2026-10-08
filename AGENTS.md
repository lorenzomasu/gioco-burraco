# AGENTS.md

## Project

Burraco in TypeScript and React, developed through incremental milestones. Roles, models, review and merge: `docs/WORKFLOW.md`.

## Sources of truth (single read order)

Read in this order, proportionally to risk:

1. the versioned delivery-unit specification (`docs/milestones/MXX-*.md`);
2. `docs/WORKFLOW.md`;
3. `docs/ROADMAP.md`, only for milestone or planning work;
4. `docs/RULES.md`, only when the task affects rules, scoring, bots or rule-facing UI;
5. `docs/ARCHITECTURE.md`;
6. the directly relevant code and tests.

Do not load unrelated rule or implementation context for documentation-only or isolated presentation work.

`docs/RULES.md` is authoritative for implemented behaviour. `docs/ROADMAP.md` is authoritative for release sequence and boundaries. A milestone specification is authoritative for concrete scope and may refine the roadmap without changing its objective or dependencies. Do not invent rules, behaviour or requirements. If documents, tests and implementation materially conflict, report it instead of choosing an interpretation.

## Git

- Work only on the existing delivery branch that already contains the specification(s); do not recreate it. A batch uses one branch.
- No agent modifies `main` directly.
- The implementer does not review, open PRs, merge or tag. After a green review the reviewer opens the PR; the user merges and creates release tags (`docs/WORKFLOW.md`, `docs/RELEASE.md`).
- Never force-push, rewrite history or delete branches without explicit user instruction.

## Implementation

- Implement only the specification. The implementer never writes or redefines it.
- Preserve existing behaviour unless explicitly changed. No unrelated refactors; prefer the smallest robust change.
- Game rules belong under `src/game`, not in React components.
- Bots and human players use the same engine legality rules.
- Keep the engine deterministic and physical card identity intact; never expose hidden information to bots.
- If a request materially conflicts with the specification, `docs/RULES.md`, `docs/ARCHITECTURE.md` or tests, report it before introducing an undocumented assumption.
- When accepted work formally changes implemented behaviour, keep `docs/RULES.md` consistent.

## Tests and verification

- New or changed behaviour requires deterministic regression tests. Never weaken or delete valid tests to make code pass.
- During implementation use targeted tests. Run `npm run verify` once, when the delivery unit (standalone milestone or batch) is complete.
- Cloud runtime mismatch: only ephemeral environment adaptation, never committed. Never claim `npm run verify` passed unless it completed successfully.

## Completion report

Compact; do not restate the specification or paste logs. Use `docs/milestones/reports/TEMPLATE.md` (standalone) or `BATCH-TEMPLATE.md` (batch).
