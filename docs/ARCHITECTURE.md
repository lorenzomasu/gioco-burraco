# Architecture

## Overview

This project implements Burraco in TypeScript and React.

The architecture separates the deterministic game/domain layer from the React UI.

Game rules and state transitions belong under `src/game`.
React components render state, collect player intent, and invoke the game engine.

## Repository structure

- `src/game/cards` — physical card model, deck creation, stable card identities, and deterministic shuffling support.
- `src/game/state` — immutable `GameState` types for players, teams, melds, piles, pozzetti, turn state, and round status.
- `src/game/engine` — deterministic game commands and state transitions.
- `src/game/melds` — pure meld validation and Burraco classification.
- `src/game/scoring` — pure round-scoring logic.
- `src/game/match` — four-round match lifecycle, settled round history, cumulative totals, Match Points, and Victory Points.
- `src/game/bot` — deterministic bot candidate generation, ranking, and turn execution.
- `src/components` — React UI for human and bot-controlled seats.
- `src/shell` — application-shell helpers that turn onboarding choices into match configuration and persist the one active local match.

Tests live next to the code they cover as `*.test.ts` or `*.test.tsx`. Browser
end-to-end tests of the built application live in `e2e/` as `*.spec.ts`. `scripts/`
holds the deployed-site smoke command.

## Game engine invariants

The game engine must remain deterministic for the same input state and explicit random source.

Prefer pure functions and immutable state transformations.

Illegal commands must not partially mutate game state.

Use the existing typed `GameRuleError` mechanism for game-rule violations where appropriate.

Game-rule legality must be decided by the engine, not by React components or bot strategy.

## Card identity

Physical card identity must be preserved.

Equivalent cards from the two decks are not interchangeable when a command or state transition refers to a specific card.

Do not replace physical cards with abstract rank/suit representations when state mutation requires the original card.

## Melds

Meld validation and Burraco classification are derived behaviour.

Validated meld logic must preserve the original physical cards and their semantic roles.

New-meld validation through `validateMeld`, `validateSequence`, and `validateGroup`
is stateless. Extending a stored meld uses the separate pure history-aware extension
validator, which reuses stateless validation and then enforces the prior represented
position of any already-active sequence wildcard.

Do not persist derived classification into state unless a future milestone explicitly changes this architecture.

Wildcard semantics must remain consistent with `docs/RULES.md` and the existing validator tests.

## Bots

Bots use the same engine APIs and legality checks as human players.

Bot behaviour must remain deterministic for the same visible game state.

Bots may not inspect hidden opponent hands, future draw-pile order or identity, or pozzetti that have not yet been taken.

Candidate generation may propose moves, but the engine remains authoritative for legality.

Bot heuristics that predict whether a visible card extends an existing meld use the
same history-aware extension validator as the engine.

Do not duplicate game-rule validation inside bot strategy code.

Bot public action events are transient execution metadata produced only by the bot
orchestration layer after successful engine transitions commit. They are not stored
in `GameState` or `MatchState`. React may retain and render these events for the
current smazzata, but must not infer them by diffing game states. Public events must
never expose stock identities, unrevealed pozzetto contents, rejected candidates,
or other hidden strategy information.

### Bot turn playback

`playBotStep` commits exactly one bot action (one acquisition, meld, extension, or
discard) synchronously and deterministically; a pozzetto taken by that action is
reported as a side-effect event of the same step. `playNextBotChainStep` wraps it with
the existing per-turn action and per-chain turn safety limits. The single-turn and
full-chain traced and state-only APIs are loops over these same primitives, so the
stepwise and full-chain paths must remain behaviourally equivalent: same final state,
same ordered public events, same decisions, and the same `BotAutomationError` limits.

Presentation timing is owned exclusively by React. The UI advances pending bots only
through the chain-step API, one committed step per presentation delay, and appends only
that step's public events. It never reconstructs bot actions from state diffs. No
timers, promises, or wall-clock dependencies exist under `src/game`. Playback timers,
the chain-step safety counters, and the event timeline are transient UI session state
and are never stored in `GameState` or `MatchState`; replacing the session cancels any
pending playback step.

Playback speed (`normal` / `fast`) is transient React presentation state. The game
table owns the single authoritative speed → delay mapping (normal 550 ms, fast 150 ms).
The application shell owns the preference, so it survives new rounds and new matches
started from onboarding while the application stays mounted; a standalone table keeps
its own. It is never persisted. Changing speed only cancels and reschedules the
pending presentation timer (measured from the change); it never commits a domain action.
Immediate completion ("Completa subito") is a UI orchestration mode that repeatedly
applies the same chain-step progression from the current session state, events, and
safety progress until control returns to the human or the round ends, appending every
committed step's public events in order; the existing safety limits and
`BotAutomationError` still apply, and replacing the session cancels any pending
delayed step. No playback preference or timing state belongs in `GameState`,
`MatchState`, or `src/game`.

### Bot automation failure

`GameTable` is the bot-automation presentation boundary. Both delayed one-step playback
and "Completa subito" run chain steps through one guard that catches only
`BotAutomationError`:

- the failing step commits nothing; the last committed `MatchState` and the public
  timeline stay as they were (steps committed earlier in the same "Completa subito"
  are kept, exactly as delayed playback would have kept them);
- the session is marked as failed: no further step is scheduled, a speed change does
  not reschedule, and "Completa subito" is withdrawn;
- a concise Italian `role="alert"` message tells the player that automatic play cannot
  continue and that "Nuova partita" starts a new match; no exception text, hidden bot
  state or card data is rendered.

The failure flag is transient session state: it is never stored in `GameState`,
`MatchState` or the local save, it does not notify `onMatchChange`, and it disappears
when the session is replaced (new round, left/replaced match, unmount). The saved match is
not discarded because of it. Any other exception is a defect and still propagates.

## Match lifecycle

`GameState` remains the complete state of exactly one smazzata. The match layer owns
the current round number, current `GameState`, chronological settled-result history,
and the terminal state of the fixed four-smazzate match.

Completed rounds are settled exactly once through `calculateRoundScore`. Cumulative
team totals are derived from the immutable score snapshots in match history rather
than stored as a second mutable total. Match Points, the leading team or exact tie,
and the four-smazzate Victory Points allocation are also pure derived domain values.

Only the match layer may advance to a fresh `GameState`, and round four is terminal.
React may render match state and invoke match operations, but it must not implement
settlement, cumulative scoring, VP thresholds, or lifecycle decisions itself.

### Round starter rotation

Engine round setup (`dealInitialState` / `startGame`) accepts an optional explicit
starting `PlayerId` and defaults to `player-1`. It stays single-round and never depends
on `MatchState` or round-history types. The starter is turn metadata only: it must not
change card distribution, physical card identities, pozzetti, the opening discard, the
draw-pile order, or any hidden-information boundary.

The match layer owns the single authoritative round-number → starting-player schedule
(`getRoundStartingPlayerId`: rounds 1–4 start with `player-1`…`player-4`). `startMatch`
and `advanceMatch` pass a transient `RoundFactoryContext` (`roundNumber`,
`startingPlayerId`) to the round factory; the default factory honors it through the
engine setup API. The starter is not stored in `MatchState`; it is derived from
`currentRoundNumber`, and the actual turn owner remains `round.turn.currentPlayerId`.

Engine round setup also accepts optional per-seat display names (`playerNames`). They
are configuration metadata copied into `Player.name` only: player IDs, teams, the deal,
card identities and turn order never depend on them. `createMatchRoundFactory` builds a
match's round factory from that configuration (and an optional explicit shuffle source),
so every round the match layer creates, including rounds 2–4, carries the same names.

React does not map rounds to starters. It renders the resulting fresh round and, when
the starter is a bot, relies on the existing stepwise bot playback without any special
round-start path.

## Application shell

`App` is the application shell. It owns transient screen selection (onboarding or one
mounted match), the onboarding name, and the bot-speed preference. Onboarding trims the
human name and refuses an empty one; starting a match turns it into a round factory via
`src/shell/matchSetup.ts` and mounts `GameTable` with it. No game or match decision is
made by the shell: the match layer still owns the lifecycle, starter schedule,
settlement and outcome.

`GameTable` owns exactly one match session. Leaving it goes through the shell's
`onLeaveMatch` callback: an in-progress match (including between smazzate) requires an
explicit native confirmation, a completed match does not. Leaving unmounts the table,
whose effect cleanup cancels any pending bot playback step; the shell returns to
onboarding and never starts another match on its own. Confirmation primitives, screen
state and timers never enter `src/game`.

### Local save and resume

The application shell keeps one active local match in browser-local storage so a
refresh or closed tab can resume it. Storage access lives only in
`src/shell/matchPersistence.ts`; nothing under `src/game` knows about storage, schema
versions, `window` or React.

The wire format is an explicit versioned JSON envelope stored under the single key
`MATCH_SAVE_STORAGE_KEY` (`gioco-burraco:active-match`):

- `version` — `MATCH_SAVE_SCHEMA_VERSION`, currently `1`;
- `setup` — the M21 `MatchSetup` (`humanPlayerName` only);
- `match` — the authoritative committed `MatchState`, stored as-is.

Nothing derived (cumulative totals, Match/Victory Points, Burraco classification) is
stored. Transient machinery is never serialized: the round factory and its random
source, bot public events, bot chain-progress counters, pending playback timers,
selected cards, rule errors, callbacks and the playback-speed preference. Future
rounds are not pre-generated, so their shuffle is not part of the save.

`GameTable` reports every committed `MatchState` (the initial one included) through
`onMatchChange`, from an effect keyed on the match object, so selection, rule errors,
timeline-only updates and speed changes never write, and a scheduled bot step that has
not fired has not produced a save. The shell writes the envelope for an active match
and removes it once the match is completed; a confirmed `Nuova partita` also removes it
(a cancelled one changes nothing).

Stored content is `unknown` until validated. `loadMatchSave` accepts only a version-1
envelope with a trimmed non-empty setup name and an `in-progress` match whose round
number, fixed seats and teams, and turn/round state are structurally valid, and whose
`player-1` name matches the setup. It also enforces locally verifiable domain
invariants by reusing the engine's deterministic primitives rather than a second rules
implementation:

- the hands, meld placements, stock, discard pile and pozzetti hold the complete
  canonical 108-card universe, each physical card exactly once and with its real face;
- every stored meld equals `validateMeld` of its own cards (the engine always stores that
  result, including after history-aware extension or wildcard replacement), so impossible
  roles, represented ranks, ace positions or active wildcards are rejected;
- the settled history has exactly one result per finished round, every team total follows
  the round-scoring formula, and the result of a completed current round equals
  `calculateRoundScore` of that round;
- the current turn's acquisition IDs are distinct canonical cards that the current player
  still holds or has played into their own team's melds.

The validator does not replay the match or prove reachability. Anything else (invalid
JSON, another version, a completed or stale match, an inconsistent setup) is discarded:
removal is attempted and the shell opens onboarding with a minimal notice. Read, write
and remove failures are contained at this boundary; a failed write keeps the live match
playable and shows a minimal notice.

On load, a valid save mounts `GameTable` directly with the saved `MatchState` as
`initialMatch` (never calling `startMatch`), and the shell recreates the round factory
from the saved setup with the same `createSetupRoundFactory` path used by onboarding.
Later rounds therefore keep the name and the match-layer starter schedule. The restored
table starts with fresh transient state; a pending bot turn is resumed by the ordinary
stepwise playback from the committed state, with fresh safety counters.

## UI

React components are not an alternative game engine.

UI responsibilities are limited primarily to:

- rendering game state;
- collecting player intent;
- invoking engine operations;
- displaying valid errors and resulting state transitions.

Domain decisions belong under `src/game`.

### Interaction and accessibility invariants

These presentation contracts are transient React concerns; none of them is stored in
`GameState`, `MatchState` or the local save.

- Keyboard focus moves only on major view replacements, to a non-tab-stop context
  target (`tabIndex={-1}`): onboarding → match and a fresh round focus the table's turn
  status; a completed round focuses its result heading; returning to onboarding focuses
  its heading. The first page load, including a restored save, never moves focus, and
  ordinary card actions or bot events never do.
- The bot timeline is a mounted `role="log"` polite region announcing additions only;
  existing entries are never re-rendered as new nodes, so history is not re-announced.
  It is presented as a compact disclosure (a native button with `aria-expanded` and
  `aria-controls`, closed by default, Escape closes it): collapsing only clips the panel
  visually and never uses `hidden`, `display: none` or `aria-hidden`, so the log stays in
  the accessibility tree and each appended event is still announced exactly once. The
  collapsed view shows an `aria-hidden` preview of the newest entry. The expanded state is
  transient table state shared by the active table and the completed-round view.
- The turn banner is the single polite status for turn and phase; rule errors are
  `role="alert"`, storage notices `role="status"` in normal document flow. Contextual
  guidance is plain text derived from the same enabled/disabled values as the controls,
  never an independent legality check.
- Critical states (selected card, current player, active team, pozzetto) carry a text or
  shape cue in addition to colour, and unavailable actions stay native `disabled`.
- Responsive behaviour lives in CSS breakpoints (1000 px, 760 px, 440 px, plus the
  wide-desktop fit at 1200 px width and 640 px height), not in JavaScript viewport
  branching.

### Table composition

The active match is a tabletop: the human's hand and actions sit at the bottom, the
teammate on the left, and the two opponents on top and on the right — the opponent who
plays right after the human sits on the right. The mapping is derived from `teamId`
relative to the human and is visual only: player IDs, teams and turn order are never
changed, and each seat states its relation («Compagno» / «Avversario») and team in text.
The human's team melds are on the teammate's side and the opponents' melds on the
opponents' side, with the stock, pozzetti count, discard pile and the turn status
between them. On wide desktop viewports the table fits the screen and each meld area
scrolls locally; narrower layouts keep the same grouping in document order (seats,
history, opponents' melds, public area, own melds, hand). The application header is a
slim bar for the round indicator, bot speed and «Nuova partita»; «Completa subito» sits
with the turn status while bots are playing.

### Transient visual feedback

Game-feel cues are presentation only (`src/components/tableFeedback.ts`). The game
table session holds at most one cue for the latest committed change; it is never stored
in `GameState`, `MatchState` or the local save.

- A human cue is built only after the engine call has returned the new state, from the
  control that was used; a rejected `GameRuleError` action produces none. A bot cue comes
  only from that step's public events. Turn and pozzetto cues compare public, durable state
  (current player/phase, `hasTakenPozzetto`); no cue re-decides legality.
- Cues never delay or gate committed state, and no game logic waits for them. There are
  no effect timers: a cue is rendered as `data-feedback` attributes and CSS animations
  that end in the element's static state. An alternating `data-feedback-cycle` restarts an
  animation without remounting the element, so focus and live regions are untouched.
- A fresh session (new round, restored or replaced match) starts without a cue, and
  immediate bot completion ("Completa subito") clears it.
- Every state a cue decorates stays expressed in text or static styling, and the
  reduced-motion policy collapses all animation and transition timing.

## Browser end-to-end release gate

`e2e/` holds Playwright tests that run in Chromium against the production build served by
`vite preview` (`playwright.config.ts`); `npm run verify` runs them after the Vitest suite
and the build. They drive the built client only through its public browser surface:
roles and accessible names, real controls, native dialogs and browser `localStorage`.

Determinism is test-side only. Before the bundle loads, each test replaces `Math.random`
with a fixed-seed Mulberry32 sequence and installs a paused Playwright fake clock, so bot
playback advances only through the real "Completa subito" control or an explicit clock
advance. Focused fixtures enter through the real M22 boundary: a save envelope produced by
`serializeMatchSave` from real domain helpers. The shipped application exposes no test
route, query parameter, global API, debug control or hidden-card instrumentation for E2E,
and none may be added.

## Production build and deployment

The application is a static client: `vite build` emits `dist/` (HTML, JS, CSS and the
repository-owned `public/favicon.svg`) and nothing else runs at deploy or run time. There
is no backend, runtime server, router or path detection; all state lives in the browser.

- `vite.config.ts` sets `base: './'`, so every emitted asset URL is relative to the page.
  The same `dist` runs from the local `vite preview` root and from the GitHub Pages
  project path `/gioco-burraco/`; `e2e/deployment.spec.ts` guards both.
- Production is the GitHub Pages project site `https://lorenzomasu.github.io/gioco-burraco/`.
- Deployment is verified-artifact only: on a push to `main`, the `verify` job of
  `.github/workflows/ci.yml` runs `npm run verify` and then uploads the very `dist` it
  verified; the downstream `deploy` job publishes that artifact with the official Pages
  actions. Pull requests never deploy, and a failed verify cannot deploy.
- The downstream `deployed-smoke` job runs `scripts/deployed-smoke.mjs`
  (`npm run smoke:deployed`) in real Chromium against the deployed URL. Like the E2E
  suite, it uses only the public UI; no test hook ships in the application.

The release procedure and tag gate are in `docs/RELEASE.md`.

## Source-of-truth relationship

`docs/RULES.md` is authoritative for implemented Burraco behaviour.

This document describes technical architecture and invariants.

Milestone specifications define the scope and acceptance criteria for individual changes.

If rules, architecture, tests, and implementation materially conflict, report the conflict instead of silently resolving it.
