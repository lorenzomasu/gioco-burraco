# Milestone Implementation Report

- Milestone: M40
- Branch: `milestone-40-ci-gate-release-tags`
- Implementer: Sonnet 5.5
- Final HEAD: see branch tip (report committed last)

## Verification

- `npm run verify:fast`: passed · targeted E2E: n/a (no app code)
- `npm run verify` (full, required: touches CI/verify scripts): passed
- Tests: 973 · Build: passed · E2E: 69 · `git diff --check`: passed
- Working tree at completion: clean
- Reporter check: a deliberately failing Vitest test prints its full failure with and without `CI` (not committed).

## Behaviour implemented

- `verify:fast` = Vitest + build + `git diff --check`; `verify` unchanged.
- Vitest `dot` and Playwright `dot` reporters when `CI` is unset; CI keeps `default`/`list`.
- CI `tag` job (needs `deployed-smoke`, push to `main`, `contents: write` only there): lightweight `v<version>` on `GITHUB_SHA` if missing, no-op if present.
- WORKFLOW, RELEASE, AGENTS, README and templates updated. Base branch merged (622dcf8); RELEASE checklist intro rewritten (steps 3–4 reviewed HEAD, 5–11 `main` SHA).

## Deviations, risks and incidental changes

- The tag job depends on `deployed-smoke` (stricter than "after verify"), matching the release gate in RELEASE.md. A tag is created for any push to `main` whose `package.json` version has no tag yet.
- Not verifiable before the first merge to `main`: `GITHUB_TOKEN` tag push permitted by repository rules/tag protection and workflow-permission settings; the shell logic on a real runner; behaviour when the tag exists on a different SHA (only logged, never moved).
- Tags pushed with `GITHUB_TOKEN` do not trigger other workflows (none expected).
- Environment only (ephemeral, not committed): Playwright 1.63 chromium symlinks, and rejecting the locally installed Inter font, which made two 320 px E2E tests overflow (334 px) here and on the M38 base commit alike.

## Review focus

`.github/workflows/ci.yml` tag job; reporter conditionals in `vite.config.ts` and `playwright.config.ts`; consistency of verify rules across WORKFLOW/AGENTS/templates.
