# Milestone Implementation Report

## Milestone

- Milestone: M21 — Game Shell & Match Onboarding
- Branch: `milestone-21-game-shell-onboarding`
- Implementer: Claude Code
- Specification HEAD at start: `ecadfd981795a459162f7474a218cf0d82e4603d`

## Verification

- `npm run verify`: passed (final run after the report was written, before commit)
- Tests: 440 passed across 27 test files (baseline before M21: 426 in 26 files; 11 obsolete in-place-reset tests were rewritten to the new contract, not deleted without replacement)
- Build: passed (`tsc -b && vite build`)
- `git diff --check`: passed (as part of `npm run verify`, and run again before commit)
- Working tree at completion: clean after the milestone commit

## Behaviour implemented

- **Onboarding first.** `App` now opens on `StartScreen` (`src/components/StartScreen.tsx`). It explains the fixed local setup (local match; 1 human + 3 bots, with one bot as the human's partner; 4 smazzate) and has a labelled `Il tuo nome` input. `Inizia partita` stays disabled while `name.trim()` is empty, and the submit handler repeats that check. No `GameTable`, header, hand or timer exists before a match starts.
- **Name propagation through real state.** `RoundSetupOptions` (engine) gained an optional `playerNames` map, which is copied only into `Player.name`. The match layer gained `createMatchRoundFactory({ playerNames, random })`, and the existing `createMatchRound` is now `createMatchRoundFactory()`, so its behaviour is unchanged. `src/shell/matchSetup.ts` maps the trimmed onboarding name to `player-1` and builds the factory. `App` passes that factory to `GameTable` as `createGame`, so `startMatch` and `advanceMatch` put the name into rounds 1–4. There is no presentation-only alias.
- **Leaving a match.** `GameTable` takes an optional `onLeaveMatch`. `Nuova partita` calls `window.confirm(LEAVE_MATCH_CONFIRMATION)` while `match.status === 'in-progress'`, which includes the screen between smazzate:
  - Cancel changes nothing.
  - Confirm calls `onLeaveMatch`. `App` then returns to onboarding, which unmounts the table. The existing effect cleanup cancels the pending bot timer, and the existing session-identity guard is still in place.
  - The shell never starts a match on its own. The onboarding field is prefilled with the last name and can be edited.
- **Terminal restart.** The final-result panel shows `Gioca ancora`. On a completed match, both `Gioca ancora` and the header `Nuova partita` return to onboarding without confirmation. A new match starts from round 1 and can use a different name.
- **In-place reset removed.** The old in-table fresh-match reset (`beginNewMatch`) is gone, as the specification requires.
- **Test seams kept.** `GameTable` still accepts `initialState`, `initialMatch` and `createGame`. `App` accepts an optional `createRoundFactory(setup)` test seam; production uses freshly shuffled named rounds.
- **Separation of concerns.** Nothing under `src/game` imports React or browser APIs. The shell makes no lifecycle, starter, scoring or outcome decisions.
- `docs/ARCHITECTURE.md` documents the application-shell boundary, the `playerNames` setup metadata and `createMatchRoundFactory`, and the move of speed-preference ownership to the shell. `docs/RULES.md` and `docs/ROADMAP.md` are unchanged.

### Tests added or changed

- New `src/App.test.tsx` (9 tests):
  - fresh load shows onboarding with no table;
  - the configuration copy is present;
  - an empty or whitespace-only name cannot start;
  - a trimmed name reaches the actual `player-1` state and the table UI;
  - cancel keeps the exact match and its pending playback;
  - confirm returns to onboarding, kills a timer that was about to fire, and a second match with a different name starts at round 1;
  - a timer rescheduled by a speed change does not survive leaving;
  - the speed preference carries into the next match;
  - a full four-smazzate match played through the UI keeps the name in every created round with the M18 starters, and `Gioca ancora` returns to onboarding without confirmation.
- `src/game/engine/startGame.test.ts`: default names are unchanged; a configured name changes only `Player.name` (same deal, card order, IDs, teams and starter).
- `src/game/match/lifecycle.test.ts`: `createMatchRoundFactory` gives the name to rounds 1–4 with unchanged IDs, teams and starter schedule, and deals exactly the same cards as an unnamed factory with the same seed.
- `src/components/GameTable.test.tsx`: in-place-reset tests replaced by:
  - cancel preserves the selection, rule error and hand;
  - confirm calls `onLeaveMatch` without creating a round;
  - no exit button when there is no shell owner;
  - cancel during bot playback keeps the pending step and timeline;
  - the between-smazzate screen requires confirmation;
  - on the terminal result, `Gioca ancora` or `Nuova partita` leaves without confirmation.
- `src/components/GameTablePlayback.test.tsx`: in-place-reset tests replaced by:
  - a confirmed leave followed by unmount cancels a bot step that was about to fire;
  - pending smazzata 2/3/4 requires confirmation, cancel keeps it intact, and confirm then unmount leaves no timer;
  - the shell-controlled speed prop is honoured.

  The two stale-timer tests from this file moved to `App.test.tsx`, where they now cover the real shell.

## Deviations from specification

None.

## Known risks and ambiguities

- **Speed-preference ownership moved.** M19 stated that the bot-speed preference survives new matches while the table stays mounted. Because a new match now unmounts the table, the preference was moved up to `App` to keep that product behaviour: it survives new matches while the application is mounted. `docs/ARCHITECTURE.md` was updated. A standalone `GameTable` without the controlled props still keeps its own local preference.
- **Native `window.confirm`.** The specification allows it, and it is easy to test by stubbing `window.confirm`. It cannot be styled, and in some embedded contexts the browser may block it. When a browser blocks it, it returns `false`, so a blocked dialog is treated as cancel: safe, but the in-progress match could not be left. M23 may want an in-app dialog.
- **Nuova partita on a completed match.** On a completed match the header `Nuova partita` also leaves without confirmation, which matches the specification's rule that a terminal match needs no destructive confirmation. `Gioca ancora` is the prominent action.
- **`GameTable` without `onLeaveMatch`** renders no `Nuova partita` or `Gioca ancora`. This only affects direct component use and tests. The app always provides the callback.
- **Name validation lives in the shell.** Trimming and empty-name refusal happen there. The engine and match layer accept any `playerNames` string as opaque metadata and do not validate it.
- **Duplicated human seat constant.** The human seat is `player-1` in both `GameTable` (`humanPlayerId`, existing) and `src/shell/matchSetup.ts` (`HUMAN_PLAYER_ID`). They must stay in sync. I did not unify them, to avoid making `GameTable` depend on the shell module.
- **No visual browser check.** Onboarding styling was not checked in a real browser during this implementation. Behaviour is covered by jsdom tests only.

## Incidental changes

- **Name length limit.** The name input has `maxLength={24}` and `autoComplete="nickname"`. This is a small guard so an extreme name cannot break the existing seat and header layout. The specification does not set a length limit.
- **Prefilled name.** Onboarding prefills the last used name when the user returns to it. The field is editable and a different name is accepted (AC12).
- **`createMatchRound` refactor.** It is now defined as `createMatchRoundFactory()`. Behaviour is unchanged: a fresh `Math.random` shuffle, honouring the requested starter.
- **Cleanup in test files.** `vi.restoreAllMocks()` was added to `afterEach` in the affected `GameTable` test suites so the `window.confirm` spies do not leak between tests.

## Notes for independent review

- **Leave logic:** `GameTable.leaveMatch` (`src/components/GameTable.tsx`) is the only place that decides whether confirmation is needed. It checks `match.status`, not the round status, so a match between smazzate is still protected.
- **Timer cleanup:** stale-timer protection relies on the unmount cleanup of the existing playback effect. See `App.test.tsx` › "confirming Nuova partita returns to onboarding…" (the step is 1 ms from firing when the user leaves) and the speed-change variant.
- **Name placement:** check that the name exists only in `GameState.players[].name`. It is written by `dealInitialState` and passed through `createMatchRoundFactory` → `startMatch`/`advanceMatch`, and is never patched at render time.
- **Rewritten tests:** confirm that the 11 old in-place-reset tests are covered by the new contract tests rather than silently dropped.
- **Future scope:** no M22+ scope was added. There is no storage access, no settings, no difficulty selection and no redesign beyond the minimal start-screen styles in `src/styles.css`.
