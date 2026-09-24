# Milestone 17 — Bot turn playback

## Goal

Make automated turns visually followable instead of resolving as one instantaneous UI jump. M17 introduces a deterministic one-committed-action-at-a-time bot execution boundary and uses it in React to play bot actions sequentially with a short presentation delay, while preserving exactly the same bot decisions, final game state, rules, hidden-information guarantees, and M16 public timeline events.

The engine and bot domain remain synchronous and deterministic. Timing belongs only to the UI.

## Context

M16 introduced `BotPublicActionEvent`, traced bot execution, and the round-local bot timeline. The current UI still calls `playBotsUntilHumanTurnWithTrace`, so all pending bot turns are resolved synchronously before React renders again. The player can read what happened afterwards, but cannot observe the table progressing through those actions.

The existing boundaries remain authoritative:

- `src/game/engine` owns legality and state transitions;
- `src/game/bot` owns deterministic bot decisions and committed bot execution;
- M16 public events describe committed actions and must not leak hidden information;
- React may orchestrate presentation timing but must not decide game legality or bot strategy;
- `GameState` and `MatchState` remain domain state, not animation state.

M17 must build on the M16 trace instead of reconstructing actions from state diffs.

## In scope

- A bot execution primitive that advances exactly one committed bot action from the current state.
- Behavioural equivalence between repeated stepping and the existing full-turn/full-chain APIs.
- React playback of pending bot actions with a short deterministic presentation delay between committed steps.
- Visible intermediate table states after each committed bot step.
- Incremental append of the existing M16 public events as each step commits.
- Blocking human gameplay controls while automated playback is in progress.
- Correct playback for:
  - stock draw;
  - discard-pile collection;
  - meld;
  - extension;
  - pozzetto acquisition side effects;
  - discard;
  - transitions across consecutive bot players;
  - bot-caused round completion.
- Playback on initial injected states, post-human-discard chains, new rounds, and new matches when a bot is pending.
- Safe cancellation/replacement of pending UI timers when the session is reset.
- Deterministic tests using fake timers or an equivalent controllable scheduling mechanism.
- Focused architecture documentation for the UI playback boundary.

## Out of scope

- Changing bot strategy, ranking, candidate generation, tie-breaking, or difficulty.
- Changing any Burraco rule, scoring rule, match lifecycle, wildcard behaviour, or physical-card semantics.
- Human-action animation.
- CSS-heavy card movement, drag trajectories, physics, sound, particle effects, or production-grade motion design.
- Pause/resume, replay, scrubber, speed controls, undo, or persisted playback history.
- Storing playback state or event history in `GameState` or `MatchState`.
- Reconstructing intermediate actions by diffing before/after states.
- Introducing async behaviour, timers, promises, or wall-clock dependencies inside `src/game`.
- Exposing hidden stock identities, hidden pozzetto cards, rejected candidates, or strategy internals.

## Required behaviour

### 1. Add a one-step committed bot execution API

Introduce one exported bot API that advances the current automated player by exactly one committed action.

The exact function/type names are implementation choices. For a non-completed state where the current player is the bot being advanced, one call must commit exactly one of these logical steps:

- acquire from stock;
- collect the discard pile;
- play one selected new meld;
- extend one selected existing meld;
- discard.

The returned value must include:

- the resulting `GameState`;
- the public event or events caused by that one committed step.

A pozzetto acquisition remains a side effect event of its triggering meld/extension/discard, so one step may return the triggering action event followed immediately by one `take-pozzetto` event.

Do not treat `take-pozzetto` as a separate engine action requiring an extra bot decision step.

### 2. The step API must share the existing execution logic

There must still be one authoritative bot execution path.

Refactor the current traced execution if necessary so that:

- the step API;
- `playBotTurnWithTrace`;
- `playBotsUntilHumanTurnWithTrace`;
- the state-only compatibility APIs

derive from shared primitives rather than duplicating strategy or command logic.

Candidate generation and ranking must not be copied into React.

### 3. Repeated stepping is behaviourally equivalent

Starting from the same valid state and using the same limits, repeatedly applying the step API until control returns to the human or the round completes must produce:

- the same final `GameState` as `playBotsUntilHumanTurnWithTrace`;
- the same ordered `BotPublicActionEvent[]`;
- the same bot decisions;
- the same physical card identities;
- the same pozzetto acquisition modes;
- the same terminal round result.

The same equivalence must hold for a single bot turn versus `playBotTurnWithTrace`.

### 4. Safety limits remain effective

Existing action/turn safety guarantees must not be weakened.

If a refactor changes where counters live, the full-turn/full-chain APIs must preserve their current `BotAutomationError` behaviour.

The UI playback loop must also have a bounded failure guard so that a malformed future bot state cannot schedule unbounded steps forever. Reuse the existing bot limits or expose enough metadata to apply an equivalent bound; do not invent a second unrelated policy.

### 5. Domain code remains timing-free

No `setTimeout`, `setInterval`, Promise delay, Date-based scheduling, animation frame, or React dependency may be added under `src/game`.

The step API is synchronous: one call in, one committed deterministic transition out.

Presentation timing belongs to React.

### 6. React plays bot actions sequentially

When a human action passes control to a bot, React must not immediately resolve the entire chain with `playBotsUntilHumanTurnWithTrace`.

Instead it must:

1. commit the human action immediately;
2. render the resulting bot-turn state;
3. mark automated playback as active;
4. after the configured presentation delay, execute exactly one bot step;
5. update the visible game/match state to that step's resulting state;
6. append only that step's public events to the round timeline;
7. schedule the next step only if another bot action remains pending;
8. stop playback when control returns to the human or the round completes.

The visible table must therefore pass through the real committed intermediate states rather than jumping directly to the final state.

### 7. One configurable playback delay

Use one local UI constant or equivalent injected scheduling value for the delay between bot steps.

The exact default duration is an implementation choice in the approximate range of 350–800 ms; choose a value that makes actions readable without making a three-bot chain excessively slow.

Do not scatter different magic delays across event types.

Tests must not rely on real elapsed wall-clock time.

### 8. Human controls are locked during bot playback

While automated playback is active:

- the human must not be able to draw;
- collect the discard pile;
- select cards for gameplay;
- play a meld;
- extend a meld;
- discard.

Controls may remain visible when appropriate, but must not allow state-changing human actions.

The UI should expose a clear, non-interactive indication that bots are playing, using the existing turn/player presentation where possible rather than adding a modal.

Starting a new match remains allowed and must safely cancel/replace any pending playback.

### 9. Timeline becomes incremental, not reconstructed

Reuse the exact M16 `BotPublicActionEvent` contract.

For every playback step:

- append the returned events in order;
- do not pre-populate events from future bot actions;
- do not derive descriptions by comparing states;
- do not duplicate events after rerenders;
- keep all previous events from the same smazzata.

The timeline remains round-local and clears under the same conditions defined in M16.

### 10. Hidden information guarantees remain unchanged

Playback must not expose information earlier than the committed public action allows.

In particular:

- a stock acquisition step may visibly reduce the draw-pile count and increase the bot hand count, but must not reveal the drawn card face/ID;
- taking the pozzetto may update public counts/flags but must not reveal its card identities;
- cards become visible in timeline content only through existing public meld/extension/discard events;
- intermediate rendering must never render bot hand faces.

Do not add debug attributes containing hidden card identities.

### 11. Consecutive bots transition naturally

After a bot discards and the engine advances to the next bot, playback remains active.

The UI must visibly reflect the new current player and continue stepping that bot after the same presentation delay.

No special three-bot batch path may bypass the step API.

### 12. Bot-caused round completion renders the final action first

If a committed bot step completes the round:

- that step's public event(s) must be appended;
- the resulting completed `GameState` must be committed;
- pending playback must stop;
- the completed-round UI must then render with the full timeline including the terminal discard/action.

Do not lose the final event by switching views first.

### 13. Initial, next-round, and new-match pending bots use the same playback mechanism

A session may start with a bot already current because of an injected test state or future setup behaviour.

Do not synchronously auto-resolve those states during session construction.

The same playback effect/orchestrator used after a human turn must handle pending bots for:

- initial render;
- `Nuova partita`;
- `Inizia smazzata N`.

A fresh round/match clears the old timeline before any new bot step is appended.

### 14. Resetting the session cancels stale scheduled work

If the user starts a new match while a bot playback timer is pending, stale callbacks from the previous session must not mutate the new session.

Use React effect cleanup, a session token/generation, timer cancellation, or an equivalently robust mechanism.

Tests must cover this race.

### 15. Existing full-chain APIs remain available

M17 must not remove or semantically change the public state-only and traced full-turn/full-chain APIs introduced before it.

They remain useful for domain tests and non-animated callers.

The UI may stop using the full-chain API for normal playback, but behavioural-equivalence tests must protect it.

## Acceptance criteria

- [ ] AC1 — An exported synchronous bot step API commits exactly one acquisition, meld, extension, or discard action.
- [ ] AC2 — A step returns only the public M16 event(s) caused by that committed action.
- [ ] AC3 — Pozzetto acquisition remains immediately paired with its triggering step and is not a separate decision step.
- [ ] AC4 — Repeated step execution for one bot turn yields the same final state and event sequence as `playBotTurnWithTrace`.
- [ ] AC5 — Repeated step execution across consecutive bots yields the same final state and event sequence as `playBotsUntilHumanTurnWithTrace`.
- [ ] AC6 — Existing deterministic strategy choices and physical card identities are unchanged.
- [ ] AC7 — Existing bot safety-limit behaviour remains covered and green.
- [ ] AC8 — No timing or React dependency exists under `src/game`.
- [ ] AC9 — React applies bot steps one at a time with one shared presentation delay.
- [ ] AC10 — The visible table state updates after each committed bot step instead of jumping directly to the chain result.
- [ ] AC11 — Timeline events appear incrementally in the exact committed order.
- [ ] AC12 — Future bot events are not visible before their corresponding step executes.
- [ ] AC13 — Human gameplay actions cannot mutate state while bot playback is active.
- [ ] AC14 — Consecutive bot players continue through the same playback mechanism without a batch shortcut.
- [ ] AC15 — A bot-caused completed round retains and renders the terminal action event.
- [ ] AC16 — Initial pending bots use the same stepwise playback path.
- [ ] AC17 — Pending bots after a new round use the same stepwise playback path and the previous round timeline is cleared.
- [ ] AC18 — Pending bots after a new match use the same stepwise playback path and the previous match timeline is cleared.
- [ ] AC19 — Resetting the match during pending playback prevents stale scheduled callbacks from mutating the fresh session.
- [ ] AC20 — Stock and pozzetto hidden card identities remain absent from rendered output, accessible names, DOM attributes, and public events.
- [ ] AC21 — `GameState` and `MatchState` gain no animation/timeline fields.
- [ ] AC22 — Existing full-turn/full-chain APIs remain exported and behaviourally compatible.
- [ ] AC23 — Existing engine, bot, match, scoring, wildcard, and UI tests remain green.
- [ ] AC24 — `npm run verify` passes.

## Required tests

### Bot step domain tests

Add deterministic tests covering at least:

- a must-draw bot state advances by exactly one acquisition step and stops in action phase;
- a discard-pile acquisition advances by exactly one collection step;
- a state with a selected best meld commits exactly that one meld and does not also discard in the same step;
- an extension step commits exactly one extension;
- a discard step advances the turn exactly once;
- a meld/extension that takes the pozzetto returns action event then `take-pozzetto: flight`;
- a discard that takes the pozzetto returns discard then `take-pozzetto: discard`;
- a terminal discard returns its event and completed state;
- looping the step API through one bot turn equals `playBotTurnWithTrace` in both state and events;
- looping the step API through a three-bot chain equals `playBotsUntilHumanTurnWithTrace`;
- existing safety-limit regression tests continue to pass.

Include at least one equivalence fixture where a bot performs multiple action-phase moves before discarding, so the test would fail if the step API accidentally batches actions.

### UI playback tests

Use fake timers or an injected scheduler/delay. Cover at least:

- after the human discards, the first bot state is visible before that bot has completed its whole turn;
- before timers advance, future bot timeline events are absent;
- advancing one delay commits only one bot step and appends only that step's events;
- advancing successive delays walks through multiple actions and then multiple bot players in order;
- human gameplay controls cannot change state during playback;
- bot hand faces remain hidden throughout intermediate states;
- stock draw does not reveal the drawn card;
- pozzetto acquisition does not reveal hidden pozzetto cards;
- a bot-caused round completion shows the terminal event on the completed-round screen;
- an initial state whose current player is a bot starts stepwise playback instead of resolving synchronously in the render initializer;
- starting smazzata 2 clears prior events and step-plays any pending bot in the fresh round;
- `Nuova partita` clears prior events and step-plays any pending bot in the fresh match;
- triggering `Nuova partita` while an old playback callback is pending prevents that stale callback from changing the new state;
- existing human-turn controls still work normally once playback ends.

Tests must be deterministic and must not sleep in real time.

## Documentation updates

Do not change `docs/RULES.md`: M17 changes presentation/orchestration, not Burraco behaviour.

Update `docs/ARCHITECTURE.md` with a focused playback invariant:

- bot domain stepping is synchronous and deterministic;
- presentation timing is owned by React;
- React advances only through the bot step API and never reconstructs actions from state diffs;
- the full-chain and stepwise execution paths must remain behaviourally equivalent;
- UI timers/playback state are transient and never stored in `GameState` or `MatchState`.

Do not document replay controls, persistence, sound, advanced animation, or multiplayer as implemented.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- the stepwise and full-chain bot paths are proven behaviourally equivalent;
- intermediate UI states and timeline events progress one committed action at a time;
- hidden-information guarantees from M16 remain intact;
- reset/cancellation races are covered;
- required tests exist and pass;
- `npm run verify` passes;
- documentation is consistent;
- no bot-strategy, game-rule, scoring, or unrelated visual-refactor scope is introduced.
