# Development Workflow

## Purpose

Standard milestone workflow: separate specification, implementation, independent review and merge, with minimal repeated reading and output. Stable context lives in the repository; prompts and briefs carry only the task-specific instruction.

`specify → implement → review → PR → user merge`

A delivery unit is one standalone milestone or one approved batch of sequential milestones. Milestones are the specification units; batching only groups implementation, verification, review, PR and CI.

## Roles and models

| Role | Where | Model |
| --- | --- | --- |
| Orchestrator: planning, specifications, briefs, task decomposition | planning chat | Opus |
| Implementer: one per delivery unit | one thread per delivery unit | Sonnet 5.5, medium effort |
| Mechanical tasks (docs, version bump, rename) | thread | Haiku 5.5 |
| Independent reviewer | new thread that reads only the specification(s) and the diff | Opus |
| Merge, release tags | the user | n/a |

Rules:

- Use Haiku only for clearly mechanical tasks. Game rules, scoring, bots and persistence go to Sonnet.
- Do not switch implementer within a delivery unit unless there is a concrete reason. Escalate to Opus only when the plan or specification proves wrong; then return to the orchestrator for re-planning instead of patching repeatedly.
- The reviewer must not be the planning chat or the implementer thread: it starts cold from the specification(s) and the diff, so it does not inherit their assumptions.
- A second implementation or audit agent is introduced only on explicit user request, for an unusually complex blocker, or when the primary path is materially stuck.

### Orchestrator

- Analyses the repository before a milestone; defines scope and acceptance criteria.
- Writes and versions the specification in `docs/milestones/` on the delivery branch (template: `docs/milestones/TEMPLATE.md`).
- Sends the implementer a brief of a few lines that points at the specification (`docs/milestones/BRIEF-TEMPLATE.md`). Specifications belong in the repository, not in prompts.
- Never implements the delivery unit it specified.

### Implementer

- Works on the existing delivery branch containing the versioned specification(s); does not recreate it.
- Implements sequentially, with no future-scope work, using targeted tests.
- Verifies once at delivery-unit completion as described under Implementation (`verify:fast` plus targeted E2E; full `npm run verify` only when required), writes the report, commits and pushes only the delivery branch.
- Never writes or redefines the specification; never reviews, opens PRs, merges or tags.
- Review-driven fixes stay in the same thread while its context remains useful.
- May use a subagent only for bounded, independent analysis, test investigation or audit work, never to split the implementation.

## Delivery modes

### Standalone milestone

Use for high-risk work or work that benefits from an isolated merge gate: engine, rules, scoring, bot legality or hidden information; persistence or schema changes; CI, deployment or release work; architectural boundary changes; work whose acceptance criteria are hard to review inside a larger diff.

### Milestone batch

Batch sequential milestones that share an implementation surface, have a clear dependency order, and are cheaper to review together than separately. A batch is approved once the orchestrator has selected the grouping and versioned all included specifications on the shared branch; no separate user confirmation is needed unless the user asks for it. Fewer threads also means fewer repeated reads of the shared documents.

A batch uses one branch from current `main`, specifications committed before implementation, one implementer thread, one commit per milestone, targeted checks at each checkpoint, one `npm run verify` after the whole batch, one compact report, one review, one PR.

Do not run the full verification or push at internal checkpoints unless a concrete risk justifies it. Split a batch if implementation crosses into engine semantics, persistence format, CI/deployment or release mechanics, or the cumulative diff is too large to review confidently. Default grouping for a release cycle lives in `docs/ROADMAP.md`; the orchestrator may change it when risk or coupling justifies.

## Preparing a delivery unit

1. Inspect current `main`, `docs/ROADMAP.md` and only the code, rules and prior reports needed.
2. Define scope, behaviour, acceptance criteria, tests, documentation impact and out-of-scope items.
3. Create the delivery branch from updated `main`.
4. Write the specification(s) under `docs/milestones/` and push the branch before implementation.
5. Give the implementer a short brief.

A material change to a milestone's objective, ordering, dependency or release boundary updates `docs/ROADMAP.md` explicitly.

## Brief

A brief is a few lines: repository, existing delivery branch, specification path(s), anything not obvious from the repository (a decision already made, a chosen default), and the closing rule. It points at `AGENTS.md` for the read order and never restates documents. Add no deliverables, checklists or guardrails the specification does not already contain.

## Implementation

1. Read the sources in the order in `AGENTS.md`, then the directly relevant code and tests.
2. Implement only the specification; add the required deterministic regression tests; use targeted checks while iterating.
3. Review your own complete diff.
4. Run `npm run verify:fast` (Vitest, production build, `git diff --check`; no Playwright) plus the targeted E2E specs of the touched areas (`npx playwright test e2e/<spec>`; the browser runtime is installed once per machine with `npx playwright install chromium`). The full local `npm run verify` (adds the whole E2E suite) is mandatory only when the delivery unit touches CI, build or verify scripts, the PWA, persistence/saves, or the implementer judges it necessary. The full E2E suite is otherwise gated by CI on the exact HEAD (see Pull requests and CI). Outside CI both scripts print compact output (summary, failures in full). Report the result as a pass/fail summary with counts, not as logs, stating which of `verify:fast`, targeted E2E and full `verify` ran.
5. Fix failures caused by the change and rerun what is needed. A known failing verification is blocking.
6. Write the report (`docs/milestones/reports/TEMPLATE.md` or `BATCH-TEMPLATE.md`), commit, push the delivery branch only.

In cloud or ephemeral environments a runtime mismatch may be corrected only by adapting that environment, never by a committed change. Verification may be reported as passed only when the unchanged repository command actually succeeded.

The report is advisory context. It does not redefine scope or make a deviation acceptable by declaration.

## Thread closure

After implementation, verification (`verify:fast` plus targeted E2E, or full `verify` where required), report, commit and push, the implementer's work is complete and the thread is closed; it is not left waiting for a PR, merge or tag. A thread reopens only for review-driven fixes of the same delivery unit, and closes again once they are pushed.

## Independent review

Started by the user or the orchestrator as a new Opus thread with: the specification path(s) and the delivery branch. The reviewer reads the specification(s), the implementation report and the complete diff against `main`, plus directly coupled code and tests where regressions are plausible. It does not read the planning conversation.

It must verify every acceptance criterion, the exact reviewed HEAD, tests added or changed, unrelated or future-scope changes, and verification evidence.

Depth is proportional to risk. A standard pass is the default. Go deep only on:

- rules, scoring, closure and meld legality: also `docs/RULES.md`, edge cases, determinism, physical card identity;
- bots: also hidden-information guarantees and shared legality;
- persistence and migration: schema versioning, corrupt or incompatible data, round trip, transient-vs-domain boundary;
- release, CI and deployment: reproducibility, exact-SHA guarantees, failure behaviour;
- UI: state transitions, user flows, responsive and accessibility behaviour, engine boundaries (focused, not exhaustive);
- documentation-only work: correctness, consistency, stale references, source-of-truth effects.

Findings are grouped as blocker, important or optional, each with area, failing scenario or risk, required correction and, when apt, a regression test. A self-review by the implementer does not replace this review.

## Green path

If the review has no unresolved blocker or important finding, the reviewer:

1. confirms the branch HEAD is still the reviewed HEAD;
2. opens the pull request to `main` (one PR per delivery unit; none before the review is green);
3. checks that CI is green on exactly that HEAD;
4. reports to the user: reviewed SHA, CI result, ready to merge.

The green gate for the review and the PR is a green CI run (the canonical `npm run verify`) on exactly the reviewed HEAD, whether or not the implementer ran the full suite locally.

The reviewer never merges. The user merges with one action. A review that is not green produces one focused fix brief (actionable findings only, no repeated specification) for the same implementer thread; after the fix the reviewer re-checks the previous findings and plausible regressions.

## Fix loop

The implementer changes only what the findings require, reruns targeted tests and `verify:fast` (full `verify` where required), updates the report if evidence or risks changed, and pushes the same branch. A failing E2E in CI is a review-fix: it is fixed in the same thread, reproduced with the targeted spec before pushing.

## Pull requests and CI

CI runs the canonical `npm run verify` on pull requests to `main` and on pushes to `main`, after installing Playwright Chromium. CI complements local verification and does not replace review. Obsolete in-progress runs for the same branch or PR are cancelled.

CI is the authoritative full gate. Missing local full-`verify` evidence does not block merge when all of these hold: the review is green; the reviewed HEAD equals the HEAD verified by CI; CI ran the canonical `npm run verify` successfully; nothing was pushed after that run; no local failure is known. It never overrides a known local failure, and units that require a full local `verify` (above) still need it.

## Merge and completion

The user merges after: every included specification is satisfied, the review is green, local verification passed or the CI fallback above applies, and PR CI passed on the HEAD being merged. Prefer a linear history that keeps the exact reviewed SHA (fast-forward) when possible.

When `reviewed HEAD = PR CI HEAD = main HEAD` the milestone is closed at once; the later push CI on `main` is a health signal, not a second merge gate. If it fails, investigate before starting further work.

## Production release gate

A production release and its tag additionally require the post-merge `main` workflow for the exact release SHA to be green: canonical verify, Pages deployment of that run's verified `dist`, and the deployed Chromium smoke. Only then is the version tag created on that SHA: automatically by the `tag` job of the same workflow run (it runs after `deployed-smoke` and creates `v<version>` from `package.json` if missing), or, as a fallback, by the user locally (the cloud environment cannot push tags). The implementer and the reviewer never merge or tag. Checklist: `docs/RELEASE.md`.

## Efficiency rules

Optimise delivery speed, correctness, human intervention and token cost together.

- Specifications live in `docs/milestones/`; briefs stay a few lines.
- Prefer a batch of small, coherent milestones in one thread over many threads.
- Use targeted tests and `verify:fast` while implementing; the full E2E gate is CI on the exact HEAD, with a full local `verify` only where required.
- Keep reports and verification output to pass/fail, counts, SHA and actionable failures; never paste full logs into reports or prompts.
- Read in proportion to risk; start from the directly relevant files; use direct search over spawning a subagent.
- Use no more than one independent review pass per delivery unit, plus re-checks after fixes.
- Do not route between models for its own sake: use the cheaper model only for bounded work where the saving beats the coordination cost.
- Do not ask the user for diffs, reports, test output or CI results that can be retrieved from the repository.
- Add no artefact, tool or gate that does not solve an observed problem; simplify again when evidence shows one is redundant. Propose further efficiency changes when a bottleneck is observed.
