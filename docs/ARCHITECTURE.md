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
- `src/shell` — application-shell helpers that turn onboarding choices into match configuration, persist the one active local match and store the separate sound preferences.
- `src/audio` — the presentation-only sound service (locally synthesized effects) and its React context.

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
table owns the single authoritative delay function (`botPlaybackDelay`). Normal playback
has a variable, followable cadence (M33.1): 900 ms before an ordinary step and 1200 ms
after a significant public change — a meld play or extension, a discard or player
hand-off (the human's own discard included), a newly reached/changed Burraco or a pozzetto
acquisition. The classification reads only the committed `TableFeedback` cue of the
previous change (public facts), never bot internals; a session without a cue (mounted,
restored or fresh round) uses the ordinary delay. Fast playback keeps 150 ms for every
step. Timing only schedules presentation: engine commits, bot legality and the save are
unchanged.
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
mounted match), the onboarding name, the bot-speed preference, the sound preferences and
the app-level overlays. Onboarding trims the
human name and refuses an empty one; starting a match turns it into a round factory via
`src/shell/matchSetup.ts` and mounts `GameTable` with it. No game or match decision is
made by the shell: the match layer still owns the lifecycle, starter schedule,
settlement and outcome.

`GameTable` owns exactly one match session. Leaving it goes through the shell's
`onLeaveMatch` callback: an in-progress match (including between smazzate) requires an
explicit in-app confirmation (`alertdialog` «Abbandonare la partita?», focus on
«Annulla»; Escape and «Annulla» cancel and change nothing; «Abbandona partita» leaves
exactly once), a completed match («Gioca ancora») does not. While the confirmation is
open the table is `inert` and no bot step is scheduled, so the match cannot change under
it; cancelling reschedules the pending step with the full delay. Leaving unmounts the
table, whose effect cleanup cancels any pending bot playback step; the shell returns to
onboarding and never starts another match on its own. Confirmation state, screen state
and timers never enter `src/game` or the save.

### Settings, Help and resume status

- One Settings dialog (`SettingsDialog`) holds the shell-owned bot speed (same
  normal/fast semantics and timer rescheduling) and the M31 sound controls; one Help
  dialog (`HelpDialog`) describes only the implemented digital flow. Both are opened from
  the same «Come si gioca» / «Impostazioni» entries on onboarding and in every match
  view (active, between smazzate, final result), passed to `GameTable` as `shellActions`.
  A standalone table without a shell keeps only its own bot-speed control.
- Overlays use the shared `Dialog`: `role="dialog"`/`alertdialog`, `aria-modal`, a heading
  as name; opening moves focus inside, Tab stays inside, Escape closes (never confirms),
  and closing returns focus to the invoker when it still exists. The background stays
  mounted but `inert`. Opening or using them never touches `GameState`, `MatchState` or
  the match save.
- A valid restored save still mounts the match directly and additionally shows a
  dismissible `role="status"` «Partita ripresa · Smazzata N/4». It is transient UI: it
  never moves focus, never writes the save and disappears when the match is left; a
  storage notice takes its place when present.

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
selected cards, the manual hand order, drag payloads/targets/pointer state, rule errors,
callbacks and the playback-speed preference. Future
rounds are not pre-generated, so their shuffle is not part of the save.

`GameTable` reports every committed `MatchState` (the initial one included) through
`onMatchChange`, from an effect keyed on the match object, so selection, rule errors,
hand sorting/reordering, drag gestures, timeline-only updates and speed changes never write, and a scheduled bot step that has
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
  ordinary card actions or bot events never do. App overlays (Settings, Help, the
  abandonment confirmation) take focus while open and give it back to their invoker.
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

The active match is a tabletop that follows the clockwise turn order (M33.1): the human's
hand and actions sit at the bottom, the opponent who plays right after the human on the
left, the teammate opposite on top and the remaining opponent on the right. The mapping
is derived from the player order and `teamId` relative to the human and is visual only:
player IDs, teams and turn order are never changed, and each seat states its relation
(«Compagno» / «Avversario») and team in text; seats are in clockwise document order. The
current player is emphasised where they sit — a gold seat with a halo and the «Di turno»
text marker, or the same emphasis on the human's hand area — while the polite turn banner
stays the authoritative announcement. The opponents' melds are on the far side and the
human's team melds next to the hand, with the stock, pozzetti count, discard pile and the
turn status between them; on wide desktop viewports they form three columns. Narrower
layouts keep the same grouping in document order (seats, history, opponents' melds,
public area, own melds, hand).

Public melds are board state, never scroll content (M33.1): neither the meld list nor a
meld's card row scrolls or clips. `meldDensity` chooses a team area's density
(`roomy` / `compact` / `dense`) from public meld and card counts only; CSS then adapts
tile width, card size and overlap to the available width, wraps a long sequence onto
another row, gives a meld of eight or more cards a whole grid row, and keeps every
overlapped card's rank/suit corner visible and wildcard/pinella annotations uncovered.
Burraco labels stay text; in dense tiles the meld type word is visually hidden but
remains in the document. Narrow meld tiles shorten the visible extension label while its
accessible name and 44 px target are unchanged. When content exceeds the viewport the
page grows (document scroll) instead of hiding melds; there is never document-level
horizontal overflow. The application header is a
slim bar for the round indicator, a compact settled match score («La tua squadra» /
«Avversari», from `calculateCumulativeScores`, never a partial-round score), the «Come si
gioca» and «Impostazioni» entries and «Nuova partita»; «Completa subito» sits with the
turn status while bots are playing. Between smazzate the result explains why the round
ended, its score, the oriented cumulative score and progress, with one primary action;
the final view states win, loss or tie only from `getFinalMatchOutcome` relative to the
human's team, with the existing Match and Victory Points.

### Public table cards

The public zone renders only public state; overflow and scroll positions are transient
React presentation state, never stored in `GameState`, `MatchState` or the local save.

- The face-up discard pile (`src/components/DiscardPile.tsx`) renders `game.discardPile`
  exactly in its stored order, oldest first: the final array element is the newest/top
  card and is marked in text («In cima»). The array is never sorted, reversed or rebuilt
  from bot events. The cards are static, individually described images in an ordered list;
  collection is one separate native button for the whole pile (`takeDiscardPile`, enabled
  by the same draw-phase condition as before). A long pile scrolls inside its own spread,
  which becomes one keyboard tab stop only while it overflows; a new top card (first
  render, resume or a committed discard) brings the newest card into view, other renders
  leave a manual scroll position alone.
- The stock is a face-down back with its remaining count, and the pozzetti are face-down
  stacks derived only from how many pozzetti are still non-empty. Neither ever renders a
  card face, identity, order or team assignment, including in accessible names or
  attributes.

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

### Card motion

Card flights (`src/components/tableMotion.ts`, `src/components/MotionLayer.tsx`) explain a
committed transition; they are never part of it. They are transient presentation only and
never enter `GameState`, `MatchState` or the local save.

- Provenance: a flight is planned only from the session's `TableFeedback` cue, so a human
  flight exists only after the engine command returned a new state, and a bot flight only
  from that committed step's public events. Rejected `GameRuleError`s and structural drop
  refusals produce none. The cue also carries the public moved-card count and the melds
  whose `classifyBurraco` result is new or changed between the committed before/after
  states; presentation compares the domain helper's results and never classifies itself.
- Geometry: endpoints are public anchors (`data-motion-anchor`: stock, discard pile,
  pozzetti, hand, bot seat, meld by team and index). The human's own moved cards are
  measured after the successful command but before the new view renders, and that
  rectangle belongs only to that cue. A missing source or destination simply has no
  flight.
- Hidden information: proxies are neutral card shapes — face down for stock, bot hands and
  pozzetti — with at most a public card count; no rank, suit, card ID or pozzetto content
  reaches markup, attributes or accessible text.
- The layer is one `aria-hidden`, `pointer-events: none`, fixed overlay with no focusable
  content, so it never intercepts M29 drag, scroll, click or keyboard input and never
  remounts a focus target.
- Timing and lifecycle: flights use the Web Animations API on transform/opacity. A new
  cue cancels the running flights (no queue); a cleared cue (fresh session, «Completa
  subito»), the completed-round view and unmount cancel and remove them. A bot flight is
  kept within 80% of the ordinary delay of the current speed (so within every delay of
  that speed) and playback never waits for it.
- Reduced motion (`prefers-reduced-motion: reduce`) skips every flight in script and hides
  the layer in CSS; a missing or failing Web Animations API leaves the static committed
  table. The M24 cues and the newly reached Burraco/pozzetto accents stay static-safe
  under the existing reduced-motion policy.

### Sound effects

Sound is optional presentation feedback owned by the application shell
(`src/audio/soundEffects.ts`, `src/audio/SoundContext.ts`, `src/components/tableSound.ts`).
It never enters `src/game`, `GameState`, `MatchState` or the match save.

- Provenance: committed-action sounds come only from the same M30 `TableFeedback` cue, once
  per committed session change (mounting, restoring, a fresh round and re-renders are
  silent); card selection and refused actions (`GameRuleError` or a structural drop
  refusal) request UI-only sounds. Sound names carry no card or hidden data.
- Priority: one primary action sound plus at most one accent — match completion, round
  completion, a new/changed Burraco, a taken pozzetto — and a turn cue only when no accent
  applies; the human's returning turn has its own cue. Fast playback drops ordinary
  bot-to-bot turn cues. «Completa subito» has no intermediate cues, so only one final accent
  (completion or the human turn) may sound for the final state. There is no queue.
- Non-gating: requests are fire-and-forget; no commit, bot timer, focus change, save or
  playback delay waits for or depends on them, and every backend failure is swallowed.
- Activation: the shell creates the Web Audio output lazily on the first trusted pointer or
  keyboard gesture; requests before it (for example a restored bot turn) are dropped, never
  replayed, and activating plays nothing by itself. Cues are synthesized locally: no asset,
  network request or runtime dependency.
- Preferences: `muted` and `volume` (`0..1`) live in `src/shell/audioPreferences.ts` under
  their own versioned key `gioco-burraco:audio-preferences`, never `MATCH_SAVE_STORAGE_KEY`.
  Corrupt, unsupported or unreadable data falls back to sound on at 60%; a failed write is
  silent and never affects the match save. `AudioControls` is a reusable native checkbox
  and slider shown in the shared Settings dialog. Reduced motion does not mute sound, and every state stays expressed in text
  and visuals without it.

### Hand order and direct manipulation

The human hand's visible order is presentation state (`src/components/handOrder.ts`),
held by `GameTable` as physical card IDs per round; the engine hand stays authoritative
for which cards are held. None of it — nor the selection, drag payload, hovered target or
pointer coordinates — ever enters `GameState`, `MatchState` or the local save, and no
order-only change calls `onMatchChange`.

- A new round, a restored save or a replaced session seeds the order from the existing
  deterministic `sortCardsForDisplay`; a manual order is deliberately not persisted, so a
  reload shows the sorted hand again.
- After each committed transition the order is reconciled during render: surviving cards
  keep their relative visible order, cards that left the hand are dropped and newly held
  cards are appended in their engine-hand order.
- «Ordina mano» reapplies the display sort; «Sposta a sinistra/destra» move the selected
  cards one insertion step as one stable group; a pointer drop in the hand inserts the
  payload as one contiguous group at the insertion boundary. None of them clears the
  selection or commits anything.
- Pointer Events (`src/components/useHandDrag.ts`, no drag-and-drop library, no HTML5
  `dragstart/drop`) only collect intent for mouse, pen and touch. A mouse/pen press becomes
  a drag after a small movement threshold, otherwise it stays the card's click; a touch
  press must rest briefly before it can drag, so an ordinary swipe keeps scrolling the page
  and the hand natively. The payload is fixed when the drag begins: a selected card drags
  the whole selection in visible order, any other card only itself. Pointer cancel, lost
  capture, a session change, the end of the human turn and unmount drop the gesture and
  commit nothing.
- Destinations are identified by the element under the release point
  (`data-drop-target`), and only valid ones carry it: the hand while it is the human's turn;
  the discard pile, the own team's «Nuova calata» target and each own-team meld (by index)
  only in the human action phase. Opponent melds never are. A drop on the discard pile, the
  new-meld target or meld `N` calls exactly `discardCard`, `playMeld` or `extendMeld(N)`
  through the same commit and cue path as «Scarta e passa», «Cala» and «Aggiungi alla
  calata»; React never pre-validates melds. Only interaction-structural cases are refused
  before the engine (a multi-card discard, a drop outside every destination), with the same
  single `role="alert"` surface used for translated `GameRuleError`s; a refusal keeps state,
  selection and order.
- Drag feedback is text plus outline shape (dashed while available, solid under the
  pointer), independent of hover and colour; the pointer badge shows only a card count. The
  native card buttons, «Cala», «Scarta e passa», «Aggiungi alla calata» and the reorder
  buttons remain the complete keyboard and screen-reader path; drop surfaces add no tab stop.

## Browser end-to-end release gate

`e2e/` holds Playwright tests that run in Chromium against the production build served by
`vite preview` (`playwright.config.ts`); `npm run verify` runs them after the Vitest suite
and the build. They drive the built client only through its public browser surface:
roles and accessible names, real controls, in-app dialogs and browser `localStorage`.

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
