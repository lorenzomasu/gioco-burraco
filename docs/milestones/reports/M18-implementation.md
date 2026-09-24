# Milestone Implementation Report

## Milestone

- Milestone: M18 — Round starter rotation
- Branch: `milestone-18-round-starter-rotation`
- Implementer: Claude Code

## Verification

- `npm run verify`: passed (vitest, `tsc -b && vite build`, `git diff --check`)
- Tests: 26 test files, 397 tests passed
- Build: passed
- `git diff --check`: passed
- Working tree at completion: clean after the milestone commit

## Behaviour implemented

- `dealInitialState(orderedDeck, options?)` and `startGame(random?, options?)` accept an
  optional `RoundSetupOptions.startingPlayerId`. The default remains `player-1`
  (`DEFAULT_STARTING_PLAYER_ID`). The starter only sets `round.turn.currentPlayerId`;
  the deal (hands, pozzetti, opening discard, draw pile, teams, card identities) is
  unchanged. An unknown starter is rejected with a `RangeError`, like an incomplete deck.
- The match layer owns the single schedule `getRoundStartingPlayerId`
  (1→`player-1`, 2→`player-2`, 3→`player-3`, 4→`player-4`).
- `RoundFactory` now receives a transient `RoundFactoryContext`
  (`{ roundNumber, startingPlayerId }`). `startMatch` requests round 1 and
  `advanceMatch` requests the next round only after all existing guards pass.
  The new default factory `createMatchRound` honors the context via `startGame`.
- `MatchState` is unchanged: no starter field is stored.
- `GameTable` no longer imports `startGame`; its `createGame` prop is typed as
  `RoundFactory` and, when omitted, the match-layer default factory is used. React has
  no round→starter mapping. Rounds that start on a bot enter the unchanged M17
  stepwise playback effect (same `BOT_STEP_DELAY_MS` timer, same `playNextBotChainStep`).
- `docs/RULES.md` replaces the MVP placeholder statement with the implemented digital
  rotation; `docs/ARCHITECTURE.md` gains a "Round starter rotation" invariant section.

## Deviations from specification

None.

## Known risks and ambiguities

- The lifecycle does not verify that an injected factory honored the requested
  starter. This is deliberate: existing UI tests inject fixed-state factories that
  ignore the context (e.g. a bot-pending round 1 after `Nuova partita`), and the spec
  requires factories to be *able* to observe or honor the context rather than
  enforcing it. The default factory always honors it.
- `startGame`'s new second parameter is an options object; callers passing only a
  random source are unaffected.
- With the ordered (unshuffled) test deck, bots starting a round collect the opening
  discard rather than drawing from stock. UI tests therefore derive expected first-step
  events from `playNextBotChainStep` instead of hard-coding `draw-stock`.

## Incidental changes

- Exported `createMatchRound`, `getRoundStartingPlayerId`, and the
  `RoundFactoryContext` type from `src/game/match/index.ts`.
- Added `DEFAULT_STARTING_PLAYER_ID` and `RoundSetupOptions` to
  `src/game/engine/startGame.ts`.
- Added a runtime guard rejecting an unknown starting player id.

## Notes for independent review

- `src/game/match/lifecycle.ts`: `createRound` is invoked only after the guards in
  `advanceMatch`; the lifecycle test "does not call the factory or skip a starter when
  a transition is rejected" protects this.
- `src/game/engine/startGame.test.ts`: starter-invariance tests compare full state
  with `round` normalized, plus consumption-order card ids.
- `src/components/GameTablePlayback.test.tsx` → "GameTable round starter rotation":
  immediate render of rounds 2–4 with the scheduled bot, empty timeline before the
  delay, exactly one committed step after one `BOT_STEP_DELAY_MS` (checked at
  `delay - 1` too), human controls locked for the whole fresh-round chain, final
  timeline equal to the full-chain trace, human controls restored, and `Nuova partita`
  from pending rounds 2–4 resetting to round 1 / `player-1` with no pending timer.
- Hidden-information check in the fresh-round UI test treats cards that were ever
  face-up (collected from the discard pile) as public; all other bot-hand, stock and
  pozzetto cards must never appear in the DOM.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
