# Milestone 40 — CI gate for E2E, automatic release tags, compact verify output

## Goal

Cut the cost of each delivery unit without weakening the gate: the implementer verifies with a fast local script and targeted E2E, CI stays the authoritative full gate on the exact HEAD, release tags are created by CI instead of locally, and verify output stays small.

## Context

`npm run verify` = Vitest + production build + Playwright E2E + `git diff --check`, run both locally and in `.github/workflows/ci.yml`. Release tags are created locally by the user (the cloud cannot push tags). Process documents: `docs/WORKFLOW.md`, `docs/RELEASE.md`, `AGENTS.md`, `docs/milestones/*TEMPLATE.md`, `docs/milestones/reports/*TEMPLATE.md`.

## In scope

- A. Automatic tags. A CI job runs only on push to `main`, after `verify` is green. If tag `v<version>` (version from `package.json`) does not exist, it creates a lightweight tag on that commit and pushes it with `GITHUB_TOKEN` (`permissions: contents: write`). If the tag exists, it does nothing and does not fail. `docs/RELEASE.md`: tag becomes automatic; the local manual tag remains as fallback.
- B. `npm run verify:fast` = everything `verify` does except the full E2E suite. `npm run verify` stays canonical and unchanged in behaviour; CI keeps running it. Update `WORKFLOW.md` and templates: the implementer runs `verify:fast` plus targeted E2E for the touched areas; full local `verify` is mandatory only if the unit touches CI, build or verify scripts, PWA, persistence/saves, or the implementer judges it necessary; the gate for a green review and the PR is green CI on the exact HEAD; an E2E failure in CI is fixed as a review-fix in the same thread.
- C. Compact output. Outside CI, `verify` and `verify:fast` show only the summary and failures in full (dot-style reporters). In CI output is unchanged. Failures are never hidden.

## Out of scope

- App code. Changing what `verify` checks. Tag creation from the cloud thread.

## Acceptance criteria

- [ ] AC1 — CI has a tag job gated on push to `main` and a green `verify`, with `contents: write` limited to that job; it is idempotent when the tag exists.
- [ ] AC2 — `npm run verify:fast` exists and runs Vitest, production build and `git diff --check`, no Playwright.
- [ ] AC3 — `npm run verify` still runs the same steps; CI still runs it.
- [ ] AC4 — Outside CI Vitest and Playwright use compact reporters; with `CI` set they keep the previous reporters; a failing test still prints its full failure.
- [ ] AC5 — `WORKFLOW.md`, `AGENTS.md`, templates and `RELEASE.md` are consistent with A–C.
- [ ] AC6 — `npm run verify` passes and `git diff --check` is clean.

## Required tests

No app tests. Evidence: `npm run verify:fast`, full `npm run verify`, reporter check with and without `CI`, a deliberately failing test showing its failure is printed (not committed).

## Documentation updates

`docs/WORKFLOW.md`, `docs/RELEASE.md`, `AGENTS.md`, `README.md` (script list), templates. Not `RULES.md`/`ARCHITECTURE.md`, except the CI description in `ARCHITECTURE.md` if it contradicts the tag job.

## Verification and completion

Standalone, touches CI and verify scripts: full `npm run verify` required. Complete when all criteria hold and the report lists what the tag job cannot verify before the first merge to `main`.
