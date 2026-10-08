# Milestone Template

Copy to `docs/milestones/MXX-short-name.md` and replace every placeholder before implementation begins. Written by the orchestrator, never by the implementer. Keep it as short as the milestone allows.

---

# Milestone XX — Title

## Goal

Concrete outcome in 2–5 sentences.

## Context

Only the existing behaviour and files needed to implement this milestone.

## In scope

- ...

## Out of scope

- ...

## Required behaviour

State transitions, legal and illegal actions, edge cases, determinism, and UI behaviour only if part of this milestone. Nothing that belongs to a future milestone.

## Acceptance criteria

- [ ] AC1 — ... (each objectively verifiable)

## Required tests

Happy paths, rejected behaviour, boundaries, regression of affected behaviour. For rule-critical behaviour, tests that fail if the rule check is removed or weakened.

## Documentation updates

`docs/RULES.md` only if implemented behaviour formally changes; `docs/ARCHITECTURE.md` only if an invariant or boundary changes.

## Verification and completion

Standalone: `npm run verify:fast` plus targeted E2E before completion; full `npm run verify` instead when the unit touches CI, build or verify scripts, PWA or persistence. Batch checkpoint: targeted checks only; the same gate at batch completion (`docs/WORKFLOW.md`). CI on the exact HEAD is the full E2E gate.

Complete when: all acceptance criteria hold, required tests exist and pass, canonical verification passes at the delivery gate, documentation matches behaviour, no unrelated or future-scope work, and remaining risks are reported.
