# Milestone Template

Use this file as the starting point for each implementation milestone.

Copy it to:

`docs/milestones/MXX-short-name.md`

Replace every placeholder before implementation begins.

---

# Milestone XX — Title

## Goal

Describe the concrete outcome of this milestone in 2–5 sentences.

## Context

Explain only the existing behaviour and architectural context needed to implement this milestone.

Reference existing files, rules, or previous milestones when relevant.

## In scope

- ...
- ...
- ...

## Out of scope

- ...
- ...
- ...

## Required behaviour

Describe the behaviour that must exist after this milestone.

Be explicit about:
- state transitions;
- legal and illegal actions;
- edge cases;
- deterministic behaviour;
- UI behaviour, only when part of this milestone.

Do not define behaviour that belongs to a future milestone.

## Acceptance criteria

- [ ] AC1 — ...
- [ ] AC2 — ...
- [ ] AC3 — ...

Each acceptance criterion must be objectively verifiable.

## Required tests

Add or update automated tests covering:

- happy paths introduced by this milestone;
- illegal or rejected behaviour;
- relevant boundary conditions;
- regression protection for existing behaviour affected by the change.

For rule-critical behaviour, include tests that would fail if the relevant rule check were removed or weakened.

## Documentation updates

Update `docs/RULES.md` only when this milestone formally introduces or changes implemented Burraco behaviour.

Update `docs/ARCHITECTURE.md` only when this milestone intentionally changes a technical invariant or architectural boundary.

Do not change documentation for speculative future behaviour.

## Verification

If this milestone is delivered standalone, run before completion:

`npm run verify`

If this milestone is an internal checkpoint of an approved delivery batch, run the targeted tests/checks required by this specification and defer the canonical `npm run verify` to batch completion as defined in `docs/WORKFLOW.md`.

All relevant existing and new tests must pass.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- required tests exist and pass;
- canonical verification passes at the standalone-milestone or batch delivery gate;
- documentation is consistent with implemented behaviour;
- no unrelated refactor or future-scope work was introduced;
- any remaining ambiguity, risk, or deferred work is explicitly reported.
