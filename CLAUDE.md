# CLAUDE.md

This repository uses shared project instructions so Claude Code, Codex, and human reviewers work from the same sources of truth.

Before starting any implementation or review, read:

1. `AGENTS.md`;
2. `docs/RULES.md`;
3. `docs/ARCHITECTURE.md`;
4. the current milestone or task specification;
5. the relevant implementation and tests.

Follow `AGENTS.md` completely.

## Claude Code workflow

Inspect the relevant existing implementation and tests before editing.

Do not merge into `main`, force-push, rewrite history, or delete branches unless explicitly instructed. Commit/push behavior follows `docs/WORKFLOW.md`: standalone milestones and approved batches may be committed/pushed when their delivery instructions require it.

If the requested behaviour materially conflicts with `docs/RULES.md`, `docs/ARCHITECTURE.md`, existing tests, or the implementation, report the conflict before introducing an undocumented assumption.

Do not implement future milestone scope speculatively.

When a milestone formally introduces or changes implemented Burraco behaviour, keep `docs/RULES.md` consistent with the accepted specification.

Before declaring a standalone milestone or approved batch complete, run:

npm run verify

Inside an approved batch, prefer targeted tests after each milestone checkpoint and run the canonical full gate once at batch completion unless a concrete risk justifies an earlier full run.

Keep context/token use lean: read only directly relevant files first, reference repository sources instead of reproducing them, prefer direct inspection over unnecessary subagents, and keep the completion report compact.

Never claim that a validation command passed unless it was actually executed.

Use the completion-report format defined in `AGENTS.md`.
