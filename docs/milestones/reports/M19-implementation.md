# Milestone Implementation Report

## Milestone

- Milestone: M19 — Bot playback controls
- Branch: `milestone-19-bot-playback-controls`
- Implementer: Claude Code

## Verification

- `npm run verify`: passed (vitest, `tsc -b && vite build`, `git diff --check`; exit code 0)
- Tests: 26 test files, 426 tests passed (29 new tests in `GameTablePlayback.test.tsx`)
- Build: passed
- `git diff --check`: passed
- Working tree at completion: clean after the milestone commit

## Behaviour implemented

- `GameTable` holds a transient `BotPlaybackSpeed` (`'normal' | 'fast'`) in React state,
  defaulting to `normal`. It is separate from the session state, so `Inizia smazzata N`
  and `Nuova partita` reset the session (match, events, progress), selection and rule
  error exactly as before while the chosen speed is kept for the mounted component.
  Nothing is persisted and no field is added to `GameState`, `MatchState` or `src/game`.
- `BOT_PLAYBACK_DELAYS_MS` (`{ normal: 550, fast: 150 }`) is the single authoritative
  speed → delay mapping. `BOT_STEP_DELAY_MS` is kept as an alias of the normal entry
  for the existing tests.
- The playback effect now depends on `[session, playbackSpeed]`. A speed change runs
  the effect cleanup (clearing the pending timer) and schedules exactly one replacement
  timer with the new delay, measured from the change. The session is not touched, so
  no bot step commits because of the change. Each timer firing still commits exactly
  one `playNextBotChainStep` progression through the unchanged `advanceBotPlayback`.
- The header shows a `Velocità bot` radio group (`Normale` / `Veloce`). Radios were
  chosen over toggle buttons so the speed control is not reported as a pressed
  gameplay button by the existing M17 lock test.
- `Completa subito` is rendered only while `hasPendingBot(match)` is true. It calls
  `completeBotPlayback`, which applies `advanceBotPlayback` from the current session
  (state, events, `BotChainProgress`) until it makes no further progress, meaning
  control is back with `player-1` or the round is completed. No new loop limit was
  added: termination relies on the existing chain-step safety guards, which throw
  `BotAutomationError`. The new session replaces the old one, so the pending timer is
  cleared by the effect cleanup and would also be ignored by the existing
  `current === scheduledSession` guard.
- `docs/ARCHITECTURE.md` (bot turn playback section) documents the speed preference,
  the delay mapping, rescheduling, immediate completion and the domain boundary.
  `docs/RULES.md` is unchanged.

## Deviations from specification

None.

## Known risks and ambiguities

- `BotAutomationError` during immediate completion is thrown inside the `setSession`
  updater, the same place as in delayed playback. In both modes the error propagates
  through React rendering, so there is no new error UI; this matches the M17
  behaviour. Tests check that `fireEvent.click` / `act` rethrows it.
- To observe the step primitive and inject smaller safety limits in UI tests,
  `GameTablePlayback.test.tsx` now uses a file-level `vi.mock('../game/bot')` that
  forwards to the real `playNextBotChainStep`. Limits are overridden only while
  `botStepSpy.limits` is set, which the safety tests do and `afterEach` resets. All
  pre-existing tests in that file run against the real implementation through this
  wrapper.
- The equivalence test compares the rendered table and timeline `innerHTML` across the
  normal, fast and immediate modes for a real dealt round 3, and compares the timeline
  with the primitive's trace. It does not compare `GameState` objects directly, because
  React state is not exposed.
- On very narrow screens (≤440 px) the header now holds more controls; the playback
  group wraps. There is only basic styling here, as the spec asks for no
  production-grade presentation work.

## Incidental changes

- Exported `BotPlaybackSpeed` and `BOT_PLAYBACK_DELAYS_MS` from `GameTable.tsx`.
- Added small `.playback-controls` styles to `src/styles.css`.

## Notes for independent review

- `src/components/GameTable.tsx`: the effect dependency on `playbackSpeed` is what
  makes rescheduling work. Removing it breaks the reschedule, toggle and fast-mode
  hidden-information tests (mutation-checked).
- `completeBotPlayback` must start from the current `botProgress`. Resetting it to
  `INITIAL_BOT_CHAIN_PROGRESS` breaks "continues from the partial chain…" and
  "enforces the existing chain safety limit with the current progress…"
  (mutation-checked). The `maxBotTurns: 2` test resumes at Partner's turn, where a
  counter restart would let the chain finish without error.
- Timer boundaries are tested at `delay − 1` and `delay` for both speeds, for
  normal→fast (300 ms elapsed, and the old 550 ms deadline is checked afterwards) and
  for fast→normal (100 ms elapsed).
- Stale work is tested for three cases: a timer pending at click time (`Completa
  subito`), a speed change right before `Nuova partita`, and the existing M17
  `Nuova partita` test.
- The hidden-information tests run for all three modes on a dealt round-2 chain, and
  the lock tests on the same chain, including clicks that try gameplay actions.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
