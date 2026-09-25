# Milestone Implementation Report

## Milestone

- Milestone: M34 — Configurable Match Length
- Branch: `milestone-34-configurable-match-length`
- Implementer: Claude Code
- Base: specification commit `6b2185f` on top of `v1.1.2` (`d97b909`). Final HEAD: the
  implementation commit carrying this report.

## Verification

- `npm run verify`: passed (exit 0) on the final working tree, report included
- Tests: Vitest 44 files / 826 tests passed (722 at `v1.1.2`); Playwright Chromium 55/55 passed (53 at `v1.1.2`)
- Build: `tsc -b && vite build` passed (part of `npm run verify`)
- `git diff --check`: passed
- Working tree at completion: clean

Targeted runs during implementation: `npx vitest run src/game/match`, `src/shell`,
`src/App.test.tsx`, `src/components/GameTableMatchContext.test.tsx` — all green.

Mutation checks: forcing the four-smazzate VP table for every length makes 48 match/UI
tests fail; forcing the terminal round back to 4 (`isFinalRound`) makes 4 lifecycle/App
tests fail. Both were restored before verification.

Environment note (as in M30–M33.2): the container ships Chromium headless shell 1194 while
`@playwright/test` 1.63 expects 1243. The unchanged repository command ran after a
container-only link of the 1194 binary under the expected 1243 path; no repository change.

## Behaviour implemented

- Domain (`src/game/match`): `MATCH_ROUND_COUNTS = [2, 3, 4]`, `MatchRoundCount`,
  `DEFAULT_MATCH_ROUND_COUNT = 4`, `isMatchRoundCount`. `MatchState.roundCount` is set once by
  `startMatch(factory, roundCount = 4)` (unsupported values throw `RangeError`).
  `isFinalRound` drives settlement completion and the `advanceMatch` guard; the starter
  schedule is unchanged and naturally truncated. `MATCH_ROUND_COUNT` is removed.
- Victory Points: `calculateMatchOutcome(cumulativeScores, roundCount)` replaces
  `calculateFourRoundOutcome` and selects the official 2/3/4-smazzate F.I.Bur. 2026 table;
  Match Points, leader/tie and symmetry are unchanged. Unreachable gap values still throw.
- Onboarding (`StartScreen`): native radio fieldset «Durata della partita» (2/3/4 smazzate,
  4 preselected); `MatchSetup` now carries `roundCount`. The shell retains the last choice,
  like the name, only while mounted. Copy no longer claims a fixed four-smazzate match
  (onboarding list, Help dialog, README).
- Presentation (`GameTable`, `App`): header `Smazzata N/X`, `Smazzata N di X conclusa`,
  round-track step count and the resume notice read `match.roundCount`; the final-vs-next
  decision stays on the domain `status`. `GameTable` gains an optional `roundCount` prop used
  only for a freshly started match.
- Persistence (`src/shell/matchPersistence.ts`): writer emits schema version 2 with
  `roundCount` in both setup and match. Loader accepts v2 (supported length, setup/match
  agreement, round number ≤ length, completed final round is stale) and exactly one legacy
  path: a v1 save without length fields is normalized to `roundCount: 4` and then fully
  revalidated (`normalizeMatchSave`). It is rewritten as v2 by the initial save notification
  after restore. Same storage key; storage-failure handling unchanged.
- Docs: `docs/RULES.md` (2/3/4 presets, default 4, starter prefix, 2/3-smazzate tables, no
  longer deferred) and `docs/ARCHITECTURE.md` (domain length, terminal lifecycle, VP
  selection, `MatchSetup`, schema v2 + v1 path, dynamic progress).

## Deviations from specification

None.

## Known risks and ambiguities

- «oltre 1000 / 1500 / 2000» is encoded, as the pre-existing four-smazzate table already did,
  as a lower bound of X+1; values X+1…X+4 are unreachable with five-point scores and would map
  to 20–0 rather than throw. Behaviour of the four-smazzate table is unchanged.
- A v1 save that already contains a `roundCount` field in setup or match is rejected rather
  than trusted, since the released v1 format never had it.
- The legacy v1 migration is covered by unit and App integration tests; no browser test
  seeds a v1 save (the spec requires browser coverage only for non-default lengths).

## Incidental changes

- `resumeNotice` in `App.tsx` now takes the restored match (round number and length) instead
  of a bare round number.
- Test fixtures that build `MatchState`/`MatchSetup` literals now include `roundCount: 4`;
  the E2E `roundIndicator` locator accepts `/2`, `/3`, `/4`, and `startNewMatch` can select a
  length. The four-smazzate E2E lifecycle loop was extracted into a helper reused by the new
  two-smazzate test.

## Notes for independent review

- `src/shell/matchPersistence.ts`: `isActiveMatchState` round-number bound and stale-terminal
  check against `roundCount`; `migrateLegacyMatchSave`/`normalizeMatchSave`.
- `src/game/match/victoryPoints.ts`: the three band tables against the specification.
- Tests: `victoryPoints.test.ts` (all boundaries per table, same-MP different-table check),
  `lifecycle.test.ts` «configured match length», `matchPersistence.test.ts` «configured match
  length in saves» and «legacy version-1 saves», `App.test.tsx` «App configurable match
  length», `e2e/lifecycle.spec.ts` two-smazzate test, `e2e/persistence.spec.ts` three-smazzate
  reload test.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
