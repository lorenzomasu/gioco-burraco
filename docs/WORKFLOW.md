# Development Workflow

## Purpose

This document defines the standard milestone workflow for this repository.

The workflow separates specification, implementation, independent review, and merge while minimizing repeated manual work. Stable project context belongs in the repository; prompts should carry only the task-specific instructions needed to act on that context.

The default v1 workflow is intentionally lean:

`prepare → implement → review → automatic PR/CI/merge when green`

The user should normally need only two project-level commands for a milestone:

- `Prepara MXX`
- `Review MXX`

If the independent review is green, ChatGPT should complete the PR/CI/merge gate directly when repository access permits, without requiring a separate `procedi` message.

## Roles

### ChatGPT — architect, independent reviewer, and merge-gate operator

ChatGPT is responsible for:

- analysing the current repository before a milestone is implemented;
- defining milestone scope and acceptance criteria;
- producing and versioning the milestone specification;
- recommending one implementation agent/model and the most efficient task/workspace strategy for that milestone;
- reviewing the completed implementation independently from the implementer;
- producing focused fix instructions when review findings require changes;
- opening the pull request, checking GitHub CI, and completing the merge gate after a green review when repository access is available.

ChatGPT should inspect repository branches, reports, diffs, tests, pull requests, and CI directly through GitHub when access is available. The user should not need to paste information that can already be retrieved from the repository.

### Implementation agent — one primary implementer per milestone

Use one primary implementation agent per milestone. The normal choices are Codex or Claude Code.

ChatGPT should recommend the better fit during milestone preparation based on the concrete task, current tooling, and risk. The user may override that recommendation.

Do not routinely run Codex and Claude Code in series on the same milestone. A second implementation/audit agent is optional and should be introduced only when:

- the user explicitly requests it;
- a blocker or unusually complex investigation benefits from another independent opinion;
- the primary implementation path is materially stuck.

For each new milestone, the selected implementation agent should:

- use a new task when practical so milestone context is isolated;
- reuse the existing repository/workspace;
- fetch and switch to the dedicated milestone branch that already contains the versioned specification;
- implement the already-versioned milestone specification;
- use targeted tests during implementation as useful;
- run the repository's full verification before declaring the milestone complete;
- create/update the implementation report;
- commit and push only the milestone branch;
- stop before merging into `main`.

The implementation agent must not invent or author the milestone specification it is implementing.

## Preparing a milestone

When the user asks to prepare a milestone, for example:

`Prepara M21`

the standard workflow is:

1. inspect the current `main`, `docs/ROADMAP.md`, relevant rules, architecture, implementation, tests, and prior milestone reports;
2. use the roadmap objective, dependencies, sequence, and v1 boundary as the planning baseline;
3. inspect only the additional repository areas needed to define the milestone correctly;
4. define scope, required behaviour, acceptance criteria, tests, documentation impact, and out-of-scope items;
5. create the dedicated milestone branch from updated `main`;
6. create the milestone specification under `docs/milestones/`;
7. commit and push the specification before implementation begins;
8. provide a short implementation prompt for one recommended implementation agent.

Use `docs/milestones/TEMPLATE.md` as the structural starting point.

The milestone specification is the authoritative contract for that milestone's concrete scope and acceptance criteria.

`docs/ROADMAP.md` is the authoritative planning source for the broader v1 sequence and product boundary. A milestone specification may refine implementation details from the roadmap, but a material change to objective, ordering, dependency, release-critical status, or v1 boundary should update the roadmap explicitly rather than drifting silently.

## Implementation prompt

The implementation prompt should be short and should reference repository sources of truth rather than reproducing them.

A normal milestone prompt should tell the selected implementation agent to read:

- `AGENTS.md`;
- `docs/WORKFLOW.md`;
- `docs/ROADMAP.md`;
- `docs/RULES.md` when relevant to the milestone;
- `docs/ARCHITECTURE.md`;
- the relevant `docs/milestones/MXX-....md`;
- the directly relevant implementation and tests.

Do not copy the full milestone specification into the prompt.

Do not restate large sections of repository documentation when a reference is sufficient.

The prompt should normally contain only:

- repository/workspace instruction;
- required existing milestone branch containing the versioned specification;
- authoritative files;
- instruction to implement exactly the milestone specification;
- verification command;
- report/commit/push instruction;
- explicit instruction not to merge into `main`.

Stable rules belong in the repository, not in repeated prompts.

## Implementation workflow

For a new milestone:

1. start from updated `main`;
2. work on the dedicated milestone branch;
3. read the required sources of truth;
4. inspect the directly relevant code and tests;
5. implement only the milestone specification;
6. add or update required deterministic regression tests;
7. use focused tests/typechecks during development when they accelerate iteration;
8. review the complete implementation diff;
9. run the full repository gate:

`npm run verify`

   It runs, in one command, the Vitest suite, the production build, the Playwright Chromium E2E suite against that build (`npm run test:e2e`) and `git diff --check`. The browser suite needs the local Playwright Chromium runtime, installed once per machine with `npx playwright install chromium`.

10. fix failures caused by the milestone and rerun the necessary verification;
11. create or update `docs/milestones/reports/MXX-implementation.md` using `docs/milestones/reports/TEMPLATE.md`;
12. record the final `npm run verify` result, material deviations, known risks/ambiguities, and incidental changes;
13. commit the completed implementation and report;
14. push only the milestone branch;
15. stop before merging.

The intent is to run the expensive full verification at the end of a normal implementation cycle rather than repeatedly after every small edit. Targeted tests are preferred during active implementation. A known failing full verification is always blocking.

The implementation report is review context, not an authoritative specification. It must not redefine scope or make deviations acceptable by declaration.

## Independent review

When the user asks:

`Review MXX`

ChatGPT performs an independent review directly from the milestone branch or pull request.

Every review must verify:

- the milestone specification and acceptance criteria;
- the implementation report, when present;
- the complete milestone diff;
- tests added or changed;
- directly relevant existing behaviour;
- unrelated or future-scope changes;
- verification evidence;
- exact reviewed HEAD.

### Risk-proportional depth

Review depth should match the milestone's actual risk. Do not reread or re-audit unrelated project areas merely because they exist.

For all milestones:

- verify every acceptance criterion;
- inspect every changed file;
- inspect directly coupled code/tests where regressions are plausible;
- verify architectural boundaries affected by the change.

Expand the review when relevant:

- game engine/rules/scoring/closure/meld legality → inspect `docs/RULES.md`, relevant engine paths, edge cases, deterministic behaviour, physical card identity;
- bots → additionally inspect hidden-information guarantees, shared legality rules, deterministic strategy behaviour;
- persistence/state migration → inspect schema/versioning, corruption/incompatibility handling, round-trip integrity, transient-vs-domain boundaries;
- UI/product shell → focus on state transitions, user flows, relevant responsive/accessibility behaviour, and preservation of engine boundaries;
- documentation-only work → validate correctness, consistency, stale references, and workflow/source-of-truth effects without re-reviewing unrelated game code;
- release/CI/deployment → inspect reproducibility, exact-SHA guarantees, failure behaviour, and release gates.

Review findings should be grouped by severity:

- blocker;
- important;
- optional.

Each actionable finding should identify the affected file or area, failing scenario or risk, required correction, and regression test when appropriate.

A self-review by the implementation agent does not replace this independent review.

## Automatic green path

If the independent review has no unresolved blocker or important finding, ChatGPT should continue directly when repository access is available unless the user explicitly asked to stop after review.

The normal green path is:

1. confirm the milestone branch HEAD is still exactly the reviewed HEAD;
2. open the pull request to `main` if one is not already open;
3. wait for GitHub CI on the exact reviewed HEAD;
4. if CI succeeds and the HEAD has not changed, complete the merge gate;
5. prefer a linear fast-forward of that exact reviewed/verified SHA into `main`;
6. report the milestone closed.

A separate user message such as `procedi` is not required on the normal green path.

User intervention is required only when an operation cannot be performed with available repository permissions/tools, an explicit product decision is needed, or the user asked to retain manual control.

## Fix loop

If the review finds a blocker or important issue:

1. ChatGPT produces one focused fix prompt containing only the actionable findings;
2. continue in the same implementation-agent milestone task when practical because its implementation context is already loaded;
3. the same implementation agent changes only what the findings require;
4. it reruns targeted tests as useful and the full `npm run verify` before completion;
5. it updates the implementation report when verification evidence, deviations, risks, ambiguities, or incidental changes changed;
6. it commits and pushes the same milestone branch;
7. ChatGPT re-reviews the previous findings plus plausible regressions caused by the fixes.

Do not repeat the full milestone specification in a fix prompt.

Do not switch implementers during the fix loop unless there is a concrete reason.

## Pull requests and CI

Milestone branches are verified through pull requests to `main`.

GitHub CI runs the canonical `npm run verify` for pull requests to `main` and pushes to `main`, after installing Playwright Chromium and its system dependencies. There is no separate browser-only gate.

CI complements implementer-local verification and does not replace independent review.

If evidence of the implementation agent's local `npm run verify` is unavailable or cannot be independently verified, that missing evidence alone does not block merge when all of the following are true:

- independent review is green with no unresolved blocker or important finding;
- the reviewed HEAD is exactly the same commit SHA verified by GitHub CI;
- GitHub CI successfully ran the repository's canonical `npm run verify`;
- no changes were pushed after that successful CI run;
- there is no known local verification failure.

Under those conditions, successful CI on the exact reviewed HEAD satisfies the executable-verification gate. Missing local evidence should be noted as a non-blocking procedural deviation.

This fallback never overrides a known failing local verification result.

CI should cancel obsolete in-progress runs for the same branch/PR when a newer commit supersedes them.

## Merge and completion

Merge only after:

- the milestone specification is satisfied;
- independent review has no unresolved blocker or important finding;
- implementer-local verification passed, or the exact reviewed HEAD satisfies the CI fallback;
- pull-request CI passed on the exact HEAD being merged.

Prefer linear history by fast-forwarding the exact reviewed milestone HEAD into `main` when possible.

When the merge is an exact fast-forward:

`reviewed HEAD = PR CI HEAD = main HEAD`

the milestone is considered closed immediately after the fast-forward and confirmation that `main` points to that SHA.

A push CI run on `main` may still execute as an additional repository health signal, but it is not a second merge gate and ChatGPT should not wait for it before declaring the milestone closed. If a later main-branch CI run reports a failure, investigate that failure before starting or merging subsequent work.

## Production release gate

Normal milestones close as described above: after independent review, PR CI on the exact
reviewed HEAD and the merge of that HEAD into `main`.

A production release and its version tag (for example M26 and `v1.0.0`) additionally
require the post-merge `main` workflow for the exact release SHA to be green: canonical
verify, GitHub Pages deployment of that run's verified `dist`, and the deployed Chromium
smoke against the real Pages URL. Only then is the version tag created on that same SHA.
The implementation agent never merges or tags. The full checklist is in
`docs/RELEASE.md`.

GitHub CI on a push to `main` therefore also deploys. Obsolete pull-request runs are
still cancelled; a running `main` workflow is not cancelled mid-deployment.

## Efficiency rules

The workflow is intentionally optimized for a single human owner working with AI implementation agents.

Therefore:

- the user should normally need only `Prepara MXX` and `Review MXX` for each milestone;
- after a green review, ChatGPT should handle PR/CI/merge directly when access permits;
- use one primary implementation agent per milestone;
- do not ask the user to paste repository diffs, reports, test output, CI results, or risk notes that can be retrieved directly;
- do not run a second implementation/audit agent without a concrete reason;
- do not generate large prompts that duplicate versioned documentation;
- do not make the implementation agent author its own milestone contract;
- use targeted tests during implementation and the full repository gate at milestone completion;
- review proportionally to risk rather than rereading every source of truth for every kind of change;
- keep each milestone isolated in its own branch and implementation task;
- keep fix prompts narrow and review-driven;
- do not add process artifacts, tools, or gates unless they solve an observed problem;
- treat this workflow as stable through the v1 path unless a concrete failure demonstrates that it needs adjustment.

The repository should carry stable context. Prompts should carry only the task-specific instruction needed to act on that context.
