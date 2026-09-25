# Milestone Implementation Report

## Milestone

- Milestone: M36 — Guided First Match
- Branch: `milestone-36-guided-first-match`
- Implementer: Claude Code
- Base: specification commit `a821549` on top of the M35 baseline `e693a82` (current `main`).
  Final HEAD: the implementation commit carrying this report.

## Verification

- `npm run verify`: passed (exit 0) on the final working tree, report included
- Tests: Vitest 50 files / 967 tests passed (917 at `a821549`); Playwright Chromium 58/58 passed (56 at `a821549`)
- Build: `tsc -b && vite build` passed (part of `npm run verify`)
- `git diff --check`: passed
- Working tree at completion: clean

Targeted runs during implementation: `src/shell/guidancePreferences.test.ts`,
`src/components/guidedCoaching.test.ts`, `src/components/GameTableGuidance.test.tsx`,
`src/AppGuidance.test.tsx`, full Vitest and full Playwright — all green.

Environment note (as in M30–M35): the container ships Chromium headless shell 1194 while
`@playwright/test` 1.63 expects 1243. The unchanged repository command ran after a
container-only link of the 1194 binary under the expected 1243 path; no repository change.

## Behaviour implemented

- Preference (`src/shell/guidancePreferences.ts`): `{ enabled, completedOnce }`, own key
  `gioco-burraco:guidance-preferences` (wire `version: 1`), defaults `enabled: true`,
  `completedOnce: false`; defensive load/save mirroring the audio preferences (malformed,
  unsupported or unreadable → defaults; write failure → `false`, no throw).
  `guidanceAfterMatchCompletion` returns `{ enabled: false, completedOnce: true }` only for
  `enabled && !completedOnce`, otherwise the unchanged preference.
- Shell (`App.tsx`): loads the preference once, passes `guidance={{ enabled, onDismiss }}`
  to `GameTable`, writes it only when it changes, and applies
  `guidanceAfterMatchCompletion` when the authoritative `MatchState` received via
  `onMatchChange` is `completed` (same place the save is cleared). Settings gets one native
  «Guida contestuale» checkbox. Match save, `MatchSetup`, `GameState`, `MatchState` and
  `MATCH_SAVE_SCHEMA_VERSION` (3) are unchanged.
- Derivation seam (`src/components/guidedCoaching.ts`): pure `deriveCoaching(facts)` from
  bot/human turn, automation failure, phase, actual stock/discard-control availability,
  selection count, own-team public melds, the latest engine `GameErrorCode` of a rejected
  human command and the committed `TableFeedback` pozzetto/Burraco cues (own vs opponent
  team). Output: what to do now, structural unavailability reasons (acquire first; Cala
  needs ≥1 selected; discard needs exactly 1), one contextual note (engine rejection first,
  else pozzetto/Burraco event) and, in the human action phase, the reminder that closing
  happens with the final discard. No card identity, move enumeration, meld validation or
  Burraco classification.
- Table (`GameTable.tsx`, new `GuidedCoach.tsx`): with guidance enabled the coach replaces
  the one-line `turnGuidance` in the turn-status area as a `region` named «Guida
  contestuale» with heading and «Nascondi guida»; structural reasons and the closing
  reminder sit in a native `<details>`; not a live region, no focus movement, no
  blocking. The engine rejection code is kept as transient state next to `ruleError`
  (set only in the `GameRuleError` catch, cleared with the error and on every commit).
  Disabled/omitted guidance keeps the existing compact text; the result screens are
  untouched. Compact responsive CSS only.
- Help: one sentence that the contextual guide can be hidden/re-enabled from Settings.
- Docs: `docs/ARCHITECTURE.md` «Contextual guidance (M36)». `docs/RULES.md` and
  `docs/ROADMAP.md` unchanged.

Tests added: `src/shell/guidancePreferences.test.ts` (key distinctness, defaults,
round-trips, malformed data, read/write exceptions, completion semantics);
`src/components/guidedCoaching.test.ts` (acquisition variants, 0/1/many selection,
own melds, bot turn, every required rejection code, pozzetto/Burraco both sides,
precedence, facts contain no card identity); `src/components/GameTableGuidance.test.tsx`
(named region + dismiss, compact when disabled/omitted, control contracts unchanged,
engine-rejected invalid meld stays atomic, closure refusal via engine, human and opponent
pozzetto without hidden identities, Burraco cue, «Completa subito» usable, no focus
stealing); `src/AppGuidance.test.tsx` (fresh default, dismiss writes only the preference,
Settings disable/re-enable, restore with independent preference and unchanged v3 envelope,
malformed/unwritable preference non-fatal, guided across all four smazzate and auto-end on
authoritative completion, unguided completion, re-enabled guidance kept, Help copy);
`e2e/guidance.spec.ts` (first launch guided, dismiss + reload keeps it hidden while the
save resumes unchanged, re-enable from Settings).

## Review fix

- Finding: `eventContext()` returned pozzetto and Burraco notes as mutually exclusive, but
  one committed `playMeld`/`extendMeld` that uses the last cards of the first hand can make
  a meld Burraco and then take the pozzetto, so one `TableFeedback` cue carries both.
- Fix (`src/components/guidedCoaching.ts` only): per side, the pozzetto and Burraco notes
  are joined when both are present in the same cue; single events keep their exact copy
  and own-team events still precede opponent ones. Engine, `TableFeedback` and persistence
  unchanged.
- Regression tests: `guidedCoaching.test.ts` (own and opponent combined, single cases
  unchanged) and `GameTableGuidance.test.tsx` (real extension to Burraco with the last card
  taking the pozzetto). Both fail on the pre-fix code.
- Verification finding during the fix: the canonical gate failed once on
  `hand-manipulation.spec.ts` «a pointer reorder survives…» (1440×900). Root cause, not a
  flake: the M36 coach (238 px tall vs 49 px compact line) pushed the hand below the
  900 px fold, so the real mouse drag targeted off-viewport cards (9/15 failures on
  `28ffde2`, 0/15 on pre-M36 `a821549`). Fix, presentation only: shorter coaching copy,
  unavailable-control reasons and the closing reminder moved into a closed native
  `<details>` («Comandi disattivati e chiusura», keyboard operable), single-line header,
  slimmer dismiss button only for `pointer: fine` (touch keeps the 2.75rem target). Coach
  height now 115 px; the failing test passes 20/20 in isolation. New E2E guard: at
  1440×900 the guided hand stays inside the first viewport.

## Deviations from specification

None.

## Known risks and ambiguities

- Event notes (pozzetto/Burraco) live exactly as long as the committed `TableFeedback` cue,
  i.e. until the next committed change; during normal bot playback an opponent note can be
  replaced after one step. After «Completa subito» there is no cue, hence no note.
- A cue with events for both sides at once (not produced by a single human or bot step)
  still shows only the own-team notes.
- At 1440×900 with the «Partita ripresa» notice the hand bottom is ~13 px above the fold;
  larger coaching notes (e.g. combined pozzetto + Burraco) can still push it lower on
  short desktop viewports. The page scrolls normally; nothing is blocked.
- Structural unavailability reasons are visible after opening the disclosure, not by
  default; the enabled/disabled controls themselves are unchanged.
- An engine rejection note takes precedence over an event note while the error is shown.
  Rejection codes without extra coaching (e.g. `NOT_CURRENT_PLAYER`) keep only the alert.
- Structural drop refusals (multi-card discard drop, outside drop) have no engine code and
  therefore add no coach note; the existing alert still explains them.
- The first guided completion is recorded while the final result is displayed; the coach
  is not shown on result screens, so nothing visible changes there.

## Incidental changes

None.

## Notes for independent review

- `deriveCoaching` inputs (`CoachingFacts`) are counts/flags only; check that `GameTable`
  builds them from the same values that drive the rendered controls.
- `App.persistMatch` completion hook and `changeGuidancePreferences` no-op on unchanged
  values (no redundant writes).
- Copy for `CANNOT_CLOSE_*` codes follows `docs/RULES.md` «Chiusura definitiva» without
  adding rules.
