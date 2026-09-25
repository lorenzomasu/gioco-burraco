# CLAUDE.md

This repository uses shared project instructions so Claude Code, Codex, ChatGPT, and human reviewers work from the same versioned sources of truth.

Before starting implementation, fix work, or repository analysis, follow the source-loading policy and order in `AGENTS.md`. Do not maintain a separate competing read order here.

## Claude Code workflow

When Claude Code is the selected primary implementation agent, use one task/thread per delivery unit: one standalone milestone or one approved batch. Keep review-driven fixes in that same task/thread while its context remains useful.

Use one primary implementer. Subagents are optional only for bounded, genuinely independent analysis, test investigation, or audit work when they reduce time/context cost. Do not split implementation of the same delivery unit across competing agents by default.

Inspect the directly relevant existing implementation and tests before editing. Read additional repository context only when the task or risk requires it.

The implementation agent must not author or redefine the milestone specification it is implementing. Implement only the versioned delivery-unit specification(s), without speculative future-scope work.

Commit and push behavior follows `docs/WORKFLOW.md`. The implementation agent stops before independent review, PR merge, release tagging, branch deletion, history rewrite, or force-push. Those operations are governed separately by `docs/WORKFLOW.md`.

If the requested behaviour materially conflicts with the specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, existing tests, or implementation invariants, report the conflict before introducing an undocumented assumption.

When accepted work formally changes implemented Burraco behaviour, keep `docs/RULES.md` consistent with the accepted specification.

Before declaring a standalone milestone or approved batch complete, run:

`npm run verify`

Inside an approved batch, prefer targeted tests after each internal milestone checkpoint and run the canonical full gate once at batch completion unless a concrete risk justifies an earlier full run.

If a cloud environment has a tooling/runtime mismatch, only ephemeral environment adaptation is allowed. Do not commit repository workarounds for an environment-only problem, and never claim `npm run verify` passed unless the command actually completed successfully.

Keep context/token use lean: reference repository sources instead of reproducing them, prefer direct inspection over unnecessary subagents, and keep completion reports compact.

Use the completion-report format defined in `AGENTS.md`.
