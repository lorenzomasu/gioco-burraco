# Milestone 19 — Bot playback controls

## Goal

Make the existing stepwise bot playback easier to use without changing any Burraco rule or bot decision.

The human can choose between a normal and a fast presentation speed and, while a bot chain is pending, can complete the remaining automated chain immediately. All three modes must execute the same committed bot steps in the same order, produce the same final game state and public timeline, preserve the existing safety limits, and keep timing/configuration entirely in React.

## Context

M16 introduced round-local public bot action events.

M17 introduced synchronous one-step bot execution and React-owned delayed playback through `playNextBotChainStep`. The current UI schedules one committed bot step every `BOT_STEP_DELAY_MS = 550` ms and keeps bot playback state, counters, timers, and timeline events outside `GameState` and `MatchState`.

M18 made rounds 2–4 start on bots and deliberately routes those fresh-round bot turns through the same M17 playback path.

The current fixed delay is correct but offers no user control. M19 changes only presentation pacing. It must not create a second bot execution policy or make domain code time-aware.

## In scope

- A small transient React playback preference with two speeds:
  - normal;
  - fast.
- A visible playback-speed control in the game UI.
- A "Completa subito" control while a bot chain is pending.
- Rescheduling an already-pending bot step safely when the user changes playback speed.
- Completing the remaining pending bot chain synchronously through the existing stepwise execution primitive when the user requests immediate completion.
- Preserving the complete ordered M16 public-event timeline in every playback mode.
- Preserving bot safety counters and their existing failure behaviour.
- Preserving hidden-information boundaries.
- Preserving the existing human-control lock while bots are pending.
- Deterministic React integration tests using fake timers.
- A focused architecture update documenting that playback pacing and playback controls remain transient UI concerns.

## Out of scope

- Changing bot strategy, candidate generation, ranking, tie-breaking, difficulty, or hidden-information rules.
- Changing engine legality, scoring, match lifecycle, starter rotation, wildcard behaviour, pozzetto behaviour, or any Burraco rule.
- Pause/resume.
- Replay, scrubber, rewind, step-back, undo, or persisted playback history.
- User-selectable arbitrary millisecond values or a continuous speed slider.
- Saving playback preference to local storage, accounts, URL state, backend state, `GameState`, or `MatchState`.
- Sound, haptics, CSS-heavy card movement, physics, particles, or production-grade animation.
- Human-action animation.
- Replacing the existing bot step API with a new batch/full-chain execution implementation.
- Refactoring unrelated UI or bot code.
- Changing the existing round-local timeline lifecycle.
- Adding a fifth round or changing round starter rotation.

## Required behaviour

### 1. Playback speed is transient React presentation state

Introduce one React-owned playback preference with exactly two supported modes:

- `normal`;
- `fast`.

The exact type/location is an implementation choice, but it must not be stored in:

- `GameState`;
- `MatchState`;
- bot domain state under `src/game`;
- persisted browser storage.

The preference belongs to the mounted game UI only.

Changing the preference must not mutate game state, match state, bot progress, selected cards, score, or timeline content.

### 2. Use one authoritative delay mapping

The UI must have one authoritative mapping from playback mode to presentation delay.

Required defaults:

- normal: `550 ms` — preserving the current M17 timing;
- fast: `150 ms`.

Do not scatter independent delay constants across effects, event types, rounds, or bot seats.

The delays are presentation timing only. They must not alter bot decisions or domain transitions.

### 3. The selected speed survives round and match resets within the mounted UI

Starting:

- the next smazzata;
- `Nuova partita`;

must reset the existing round/session transient gameplay state exactly as today, including selected cards, rule error, bot timeline and bot safety progress where appropriate.

The chosen playback speed, however, is a UI preference and must remain selected while the same `GameTable` component stays mounted.

A full component unmount/remount may return to the default normal speed. M19 does not persist the preference outside the mounted UI.

### 4. Speed changes affect only future scheduled playback

When no bot is pending, changing playback speed updates the preference only.

When a bot chain is pending and a timer has already been scheduled:

1. the old scheduled callback must be cancelled;
2. one replacement callback must be scheduled using the newly selected delay;
3. no bot action may commit merely because the speed changed;
4. no duplicate bot step may be committed;
5. no timeline event may be duplicated.

The replacement delay is measured from the speed change. M19 does not preserve the partially elapsed fraction of the previous timer.

### 5. Normal and fast modes still commit exactly one step per delay

In delayed playback, every timer firing must continue to execute exactly one `playNextBotChainStep` progression from the current UI session.

Do not use a full-turn/full-chain API as the delayed path.

The visible table and timeline must still progress through real committed intermediate states one step at a time.

The only difference between normal and fast modes is the delay before each committed step.

### 6. "Completa subito" is available only while bots are pending

While `hasPendingBot(match)` is true, expose one clear control labelled `Completa subito` or an equivalent accessible Italian label.

When no bot is pending, the control must be absent or disabled in a way that cannot trigger execution.

The control is a presentation shortcut. It must not change strategy, legality, ordering, hidden information, or safety policy.

### 7. Immediate completion must reuse the existing chain-step primitive

Activating `Completa subito` must complete the current pending bot chain synchronously by repeatedly applying the same existing stepwise primitive used by delayed playback.

It must start from the current:

- `GameState`;
- `MatchState`;
- `botEvents`;
- `BotChainProgress`.

It must not restart the chain from fresh counters and must not call an alternative full-chain implementation as a shortcut.

The completion loop must stop when:

- control returns to `player-1`; or
- the round completes; or
- the existing bot safety guard raises its diagnostic error.

No unbounded custom loop or second safety policy may be introduced.

### 8. Immediate completion produces the same result as delayed playback

From the same pending session, assuming no user reset occurs, normal playback, fast playback and `Completa subito` must produce:

- the same final `GameState`;
- the same final `MatchState`;
- the same ordered `BotPublicActionEvent[]`;
- the same bot decisions;
- the same physical card identities;
- the same pozzetto acquisition effects;
- the same terminal round result when the bot chain closes the round.

Only the number/timing of intermediate React renders may differ.

### 9. Immediate completion preserves all public events

`Completa subito` must append every event returned by every committed step in exact order.

Do not collapse the chain into a synthetic summary event.

Do not lose:

- draw/take-discard events;
- meld events;
- extension events;
- discard events;
- pozzetto side-effect events;
- the terminal event when a bot closes the round.

If the chain completes the round, the completed-round screen must render with the full bot timeline, exactly as delayed M17 playback does.

### 10. Pending timers cannot mutate a chain after immediate completion

If `Completa subito` is activated while a delayed bot callback is pending, that stale callback must be cancelled or otherwise rendered harmless.

After immediate completion:

- no later timer may append another bot action;
- no event may be duplicated;
- the state must not advance beyond the valid chain endpoint.

The existing session-replacement safety pattern should be reused rather than adding unrelated timer-generation logic unless a small refactor makes the invariant clearer.

### 11. Human gameplay remains locked for the whole pending chain

Normal, fast, and immediate modes preserve the existing rule that human state-changing gameplay controls cannot act while a bot chain is pending.

Changing playback speed is allowed during the pending chain because it does not mutate the game.

`Completa subito` is allowed because it advances only automated bot execution.

Human draw, discard, meld, extend, card-selection-for-gameplay, and related state-changing controls remain blocked until control returns to the human or the round ends.

### 12. Hidden information guarantees remain unchanged

Playback controls must not reveal hidden card identities.

In every mode:

- bot hands remain face-down/count-only;
- stock-draw identities remain hidden;
- unrevealed pozzetto identities remain hidden;
- public timeline events expose only the same information already allowed by M16/M17;
- immediate completion must not render or emit rejected candidates, future stock order, strategy internals, or other hidden data.

Tests must protect rendered text, accessible names, DOM attributes, and public events as appropriate.

### 13. Round and match lifecycle behaviour remains unchanged

Playback controls must work for pending bots reached through all existing M17/M18 entry points:

- after the human passes control to a bot;
- an injected initial pending-bot state;
- `Inizia smazzata 2`;
- `Inizia smazzata 3`;
- `Inizia smazzata 4`;
- any new match/test fixture that legitimately starts with a bot.

M19 must not add a special round-start bot path.

The M18 round starter mapping remains owned by the match layer.

### 14. Resetting the game remains safe

Starting `Nuova partita` while a delayed bot callback is pending must keep the existing M17 cancellation guarantee.

Starting `Nuova partita` after or during interaction with the speed controls must not carry over:

- old bot events;
- old bot progress;
- old scheduled callbacks;
- old selected cards;
- old rule errors.

Only the selected playback-speed preference survives within the mounted component.

### 15. Domain code remains timing-free

Do not add to `src/game`:

- timers;
- promises used for presentation delay;
- `Date` / wall-clock dependencies;
- React dependencies;
- playback-speed preferences.

No game rule or bot strategy API may depend on playback mode.

If a tiny pure helper is extracted to make synchronous completion easier to test, it must remain presentation/orchestration logic and must not redefine bot decisions or safety limits.

## Acceptance criteria

- [ ] AC1 — The UI exposes exactly two playback speeds: normal and fast.
- [ ] AC2 — Normal uses 550 ms and fast uses 150 ms from one authoritative delay mapping.
- [ ] AC3 — Changing speed while no bot is pending mutates no game/match/timeline state.
- [ ] AC4 — Changing speed during pending playback cancels the old timer and reschedules one step with the new delay.
- [ ] AC5 — A speed change itself commits zero bot actions and zero timeline events.
- [ ] AC6 — Delayed normal playback commits exactly one bot step per 550 ms interval.
- [ ] AC7 — Delayed fast playback commits exactly one bot step per 150 ms interval.
- [ ] AC8 — The speed preference survives `Inizia smazzata N` and `Nuova partita` while `GameTable` remains mounted.
- [ ] AC9 — A `Completa subito` control is available only while a bot chain is pending.
- [ ] AC10 — Immediate completion continues from the current partial chain and current `BotChainProgress`; it does not restart the chain.
- [ ] AC11 — Immediate completion repeatedly uses the same existing chain-step execution primitive rather than an alternative full-chain shortcut.
- [ ] AC12 — Normal, fast and immediate completion end in the same state and ordered public event trace for the same pending session.
- [ ] AC13 — Immediate completion preserves every committed public event, including pozzetto side effects and a terminal round event.
- [ ] AC14 — A stale timer scheduled before immediate completion cannot commit an extra bot step afterwards.
- [ ] AC15 — Existing bot safety limits and `BotAutomationError` behaviour are preserved in delayed and immediate execution.
- [ ] AC16 — Human state-changing gameplay controls remain unable to mutate state for the whole pending bot chain.
- [ ] AC17 — Bot hand, stock and unrevealed pozzetto identities remain hidden in every playback mode.
- [ ] AC18 — New-round bot starters from M18 use the same controls and execution path without duplicated round-start logic.
- [ ] AC19 — `GameState`, `MatchState`, match history and bot domain state gain no playback-speed or UI-control fields.
- [ ] AC20 — Existing M16/M17 timeline order, round-local reset behaviour, and bot-caused completion behaviour remain intact.
- [ ] AC21 — Existing engine, meld, wildcard, scoring, match, bot and UI tests remain green.
- [ ] AC22 — `npm run verify` passes.

## Required tests

### Playback speed tests

Use fake timers and add deterministic coverage proving at least:

- default playback is normal and preserves the existing 550 ms delay;
- switching to fast while no bot is pending changes no game or timeline state;
- in fast mode no step commits at 149 ms and exactly one step commits at 150 ms;
- in normal mode no step commits at 549 ms and exactly one step commits at 550 ms;
- switching from normal to fast with a normal timer already partly elapsed:
  - commits no step at the moment of the change;
  - cancels the old timer;
  - commits exactly one step only after 150 ms from the change;
- switching from fast to normal has the symmetric behaviour using 550 ms from the change;
- repeated speed toggles never leave multiple active callbacks that can commit duplicate steps;
- the selected speed remains selected after `Inizia smazzata N`;
- the selected speed remains selected after `Nuova partita` while the component remains mounted.

Do not sleep in real time.

### Immediate-completion tests

Cover at least:

- after zero delayed bot steps, `Completa subito` reaches the same result/events as fully delayed playback;
- after one or more delayed bot steps, `Completa subito` continues from the partial state rather than replaying prior actions;
- timeline events that already existed before the click remain exactly once and later events append exactly once;
- a pending timer before the click cannot fire afterwards and duplicate/advance the chain;
- immediate completion traverses consecutive bot players until the human regains control;
- immediate completion stops when a bot completes the round and retains the terminal event on the completed-round screen;
- pozzetto side-effect events are preserved in their existing order;
- the resulting final trace equals the trace obtained from repeated `playNextBotChainStep` progression from the same starting session.

### Safety and reset regression

Cover at least:

- the same bot safety limit is still enforced when immediate completion encounters a malformed/non-progressing chain;
- `Nuova partita` during pending delayed playback still cancels stale work;
- changing speed immediately before `Nuova partita` does not let an old callback mutate the fresh match;
- a new match resets bot timeline/progress while retaining the selected speed preference;
- human gameplay controls remain locked until bot completion regardless of speed.

### Hidden-information regression

At minimum, extend the existing M17 hidden-information tests so that:

- normal mode still leaks no hidden bot-hand, stock, or pozzetto identity;
- fast mode leaks no hidden identity;
- immediate completion leaks no hidden identity in final DOM, accessible names, attributes, or public events.

The tests should fail if implementation shortcuts expose drawn cards, unrevealed pozzetto contents, or bot-hand identities.

## Documentation updates

Do not change `docs/RULES.md`: M19 changes only presentation controls and no Burraco behaviour.

Update `docs/ARCHITECTURE.md` in the existing bot playback section to state that:

- playback speed is transient React presentation state;
- the UI owns the normal/fast delay mapping;
- changing speed cancels/reschedules only presentation timers and does not commit domain actions;
- immediate completion is a UI orchestration mode that repeatedly uses the same chain-step primitive and current safety progress;
- no playback preference or timing state belongs in `GameState`, `MatchState`, or `src/game`.

Do not document pause/resume, replay, persistence, sound, advanced animation, or difficulty controls as implemented.

## Verification

Before completion, run:

`npm run verify`

All existing and new tests must pass.

The implementation report required by `docs/WORKFLOW.md` must be created/updated at:

`docs/milestones/reports/M19-implementation.md`

and must include the actual verification result, deviations, known risks/ambiguities, incidental changes, and notes for independent review.

## Completion conditions

The milestone is complete only when:

- all acceptance criteria are satisfied;
- normal and fast playback differ only in presentation delay;
- immediate completion reuses the current stepwise bot execution path and safety progress;
- all playback modes are behaviourally equivalent in final state and public event ordering;
- stale timers cannot commit after speed changes, resets, or immediate completion;
- human-control locking and hidden-information guarantees remain intact;
- M18 fresh-round bot starters work through the same playback controls;
- no playback field is added to domain or match state;
- required deterministic tests exist and pass;
- `npm run verify` passes;
- the M19 implementation report is versioned on the milestone branch;
- documentation is consistent;
- no bot-strategy, game-rule, replay, persistence, multiplayer, animation, or unrelated future-scope work is introduced.
