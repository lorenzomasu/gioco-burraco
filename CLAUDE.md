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

Do not commit, push, merge into `main`, force-push, rewrite history, or delete branches unless explicitly instructed.

If the requested behaviour materially conflicts with `docs/RULES.md`, `docs/ARCHITECTURE.md`, existing tests, or the implementation, report the conflict before introducing an undocumented assumption.

Do not implement future milestone scope speculatively.

When a milestone formally introduces or changes implemented Burraco behaviour, keep `docs/RULES.md` consistent with the accepted specification.

Before declaring implementation complete, run:

npm run verify

Never claim that a validation command passed unless it was actually executed.

Use the completion-report format defined in `AGENTS.md`.
