# Milestone Implementation Report

## Milestone

- Milestone: M35 — Bot Difficulty Levels
- Branch: `milestone-35-bot-difficulty-levels`
- Implementer: Claude Code
- Base: specification commit `75c4f33` on top of the M34 baseline `88d3018` (current `main`).
  Final HEAD: the implementation commit carrying this report.

## Verification

- `npm run verify`: passed (exit 0) on the final working tree, report included
- Tests: Vitest 46 files / 917 tests passed (832 at `88d3018`); Playwright Chromium 56/56 passed (55 at `88d3018`)
- Build: `tsc -b && vite build` passed (part of `npm run verify`)
- `git diff --check`: passed
- Working tree at completion: clean

Targeted runs during implementation: `npx vitest run src/game/bot`, `src/shell`,
`src/App.test.tsx`, `src/AppBotDifficulty.test.tsx`, `src/components/GameTablePlayback.test.tsx`
— all green.

Mutation checks (restored before verification): making `normal` use the easy action
comparator fails 4 bot tests; the easy discard comparator fails 4; making `normal` always
draw stock fails 9. The pre-M35 golden digests were recorded by running the same all-bot
simulation on an untouched checkout of `75c4f33`.

Environment note (as in M30–M34): the container ships Chromium headless shell 1194 while
`@playwright/test` 1.63 expects 1243. The unchanged repository command ran after a
container-only link of the 1194 binary under the expected 1243 path; no repository change.

## Behaviour implemented

- Domain (`src/game/bot/difficulty.ts`): `BOT_DIFFICULTIES = ['easy', 'normal']`,
  `BotDifficulty`, `DEFAULT_BOT_DIFFICULTY = 'normal'`, runtime guard `isBotDifficulty`;
  re-exported from `src/game/bot`.
- Strategy (`strategy.ts`): the pre-M35 `compareActions`/`compareDiscards` and acquisition
  logic are untouched and serve `normal`. `easy` adds `compareEasyActions` (cards played
  desc, wildcards asc, points desc, tie-break) and `compareEasyDiscards` (non-wildcard first,
  points desc, tie-break); `chooseDrawSource` draws stock whenever it is non-empty for
  `easy` and collects the discard pile only when the stock is empty. `chooseBestAction`,
  `chooseBestDiscard`, `chooseDrawSource`, `acquireForBot` take an optional trailing
  `difficulty` (default `normal`). Candidate generation is shared and unchanged.
- Orchestration (`playBotTurn.ts`): `playBotStep`, `playBotTurn[WithTrace]`,
  `playNextBotChainStep`, `playBotsUntilHumanTurn[WithTrace]` take an optional trailing
  `difficulty` (default `normal`) threaded through the single guarded step primitive, so
  one value reaches acquisition, every action and the discard. Limits, errors and public
  events are unchanged.
- Setup/UI: `MatchSetup.botDifficulty`; `StartScreen` fieldset «Difficoltà dei bot» with
  native radios Facile/Normale (accessible name = label, description via
  `aria-describedby`), Normale default; `App` retains the last choice like name/length and
  passes `setup.botDifficulty` to `GameTable`, which uses it for delayed playback and
  «Completa subito» (`normal` when the prop is omitted). No Settings switch.
- Persistence: schema version 3 writes `{ humanPlayerName, roundCount, botDifficulty }`;
  current saves reject a missing/unsupported difficulty. v1 → 4 rounds + `normal` (a stray
  length or difficulty is rejected); v2 → stored length + `normal` (a stray difficulty is
  rejected); both then pass the full current validation. Other versions stay rejected.
- Docs: `docs/ARCHITECTURE.md` (bot difficulty profiles, shell onboarding, save schema v3
  and v1/v2 migration). `docs/RULES.md` and the roadmap are unchanged.

Tests added/updated: new `src/game/bot/difficulty.test.ts` (domain, normal regression incl.
40-seed pre-M35 golden digests for default and explicit `normal`, easy acquisition/action/
discard rankings and tie-breaks, easy-vs-normal difference fixtures, hidden-information
per profile, stepwise/full-chain equivalence, safety limits and stopping per profile);
new `src/AppBotDifficulty.test.tsx` (onboarding choice, emitted setup, retention, cancel
keeps save, easy resume, profile across the next round, v2 resume); `GameTablePlayback`
(profile passed to delayed and immediate steps, default `normal`, profile-driven
acquisition); `matchPersistence` (v3 round-trips, invalid difficulties, v2 migration and
rejections, v1 stray difficulty); existing App/E2E expectations moved to version 3; E2E
Facile start + reload in `persistence.spec.ts`.

## Deviations from specification

None.

## Known risks and ambiguities

- A released v2 (or v1) envelope whose setup already contains a `botDifficulty` field is
  rejected rather than accepted: those formats never carried it, mirroring the existing v1
  stray-length rule. The specification does not state this case explicitly.
- Easy is weaker by construction but its strength was not measured statistically; the
  all-bot golden test only proves that it differs from normal on most of 40 seeded deals
  and always completes the round.
- The bot APIs take the difficulty as an optional trailing positional argument after
  `limits` (smallest change); callers that pass a difficulty must pass `limits` (`{}`)
  explicitly.

## Incidental changes

- `e2e/fixtures.ts`: `startNewMatch` accepts an optional difficulty, `openSavedMatch` an
  optional `botDifficulty` (default `normal`); new `difficultyRadio` helper.
- `src/styles.css`: layout rules for the difficulty options (wrapping description text).

## Notes for independent review

- `strategy.ts`: the normal comparators and discard-pile evaluation are byte-identical to
  the pre-M35 code; the golden digests in `difficulty.test.ts` are the regression anchor.
- `matchPersistence.ts`: `migrateVersion2MatchSave` relies on `isMatchSaveEnvelope` for
  every M34 check (length, setup/match length agreement, name consistency).
- `GameTable.tsx`: the playback effect depends on `botDifficulty`; the prop is constant for
  one mounted match.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
