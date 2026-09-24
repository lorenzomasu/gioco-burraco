# Milestone 29 — Hand Management & Direct Manipulation

## Goal

Make the human hand behave like a real card-game hand instead of a permanently auto-sorted button grid. The player must be able to reorder cards manually, restore the existing deterministic sort on demand, and use pointer/touch drag gestures to express discard, new-meld and exact-meld-extension intent while preserving the current click/tap/keyboard controls.

This milestone changes interaction and presentation only. The existing engine commands remain the sole authority for game legality, drag state is transient UI state, and no hand order, pointer state or drop metadata enters `GameState`, `MatchState` or the local save.

## Context

M28 is merged on `main`; the workflow-v2 batching update is also merged, and M29 is intentionally a standalone milestone because it changes the interaction contract that M30–M32 will build on.

The live table currently renders the human hand through `sortCardsForDisplay(humanPlayer.hand)` on every render. Therefore the visible order is deterministic but cannot be rearranged manually. Card buttons already support multi-selection through `aria-pressed`; the action bar uses the selected physical card IDs for `playMeld` and `discardCard`, and each own-team meld exposes a button that passes the same selected IDs to `extendMeld`.

Existing engine APIs already express every game commit M29 needs:

- `discardCard(game, humanPlayerId, cardId)`;
- `playMeld(game, humanPlayerId, cardIds)`;
- `extendMeld(game, humanPlayerId, meldIndex, cardIds)`.

Their `GameRuleError` results are already translated by the table and shown through the existing alert surface. M29 must reuse those commands rather than duplicating meld, turn, pozzetto, closure, wildcard or discard legality in React.

M27/M28 established the stable table geometry and public destinations: the discard pile is in the central public zone, the human team's meld area is visible as a distinct table region, and each existing meld has a stable zero-based index in the current team state. M30 will later add source-to-destination motion; M29 must not pre-implement that choreography.

## In scope

- Replace unconditional render-time hand sorting with a transient presentation order that the player can rearrange.
- Preserve the existing deterministic `sortCardsForDisplay` ordering as the initial/default presentation and expose a clear `Ordina mano` control that reapplies it on demand.
- Reconcile presentation order safely when committed game state adds or removes cards.
- Preserve physical card identity: presentation ordering is always keyed by card ID, never by face alone.
- Add direct pointer manipulation using the platform/React Pointer Events path; do not add a drag-and-drop runtime dependency.
- Support mouse, pen and touch pointer intent with the same interaction semantics.
- Define one explicit multi-card drag payload rule, used consistently for hand reorder, new meld and meld extension.
- Allow direct discard by dropping exactly one dragged card on the discard destination.
- Allow direct creation of a new meld by dropping one or more dragged cards on a clearly labeled new-meld target for the human team.
- Allow direct extension by dropping one or more dragged cards on one specific existing meld belonging to the human team.
- Show an immediate visible and accessible explanation when a direct drop is structurally invalid or the engine rejects the attempted command.
- Preserve click/tap multi-selection plus the existing `Cala`, `Scarta e passa` and per-meld `Aggiungi alla calata` controls as complete non-drag fallbacks.
- Provide a keyboard/button path for manual hand reordering, not only pointer drag.
- Keep direct manipulation disabled when the human cannot currently perform game actions; presentation-only sorting/reordering may remain available only where doing so cannot race bot/session replacement.
- Add deterministic unit/integration and browser-level regression coverage for the new interaction contract.
- Update `docs/ARCHITECTURE.md` with the transient hand-order and direct-manipulation boundary.

## Out of scope

- Any change under `src/game`, including rules, command semantics, validation, scoring, bot strategy or hidden-information behaviour.
- Save schema changes or persistence of manual hand order, selected cards, drag payloads, hover/target state or pointer coordinates.
- Source-to-destination animation, FLIP/WAAPI choreography, card flight paths or bot motion (M30).
- Sound, haptics, mute/volume controls or sensory feedback beyond visual/accessible interaction state (M31).
- Broad onboarding, settings, score/result redesign or unrelated app-wide polish (M32).
- Dragging cards out of the discard pile, stock, bot hands or opponent melds.
- Reordering cards inside a committed meld.
- Moving a card from one existing meld to another.
- Partial discard-pile pickup.
- Undo.
- New gameplay shortcuts that bypass the current engine commands.
- A third-party drag/drop library unless a concrete platform defect is proven during implementation; the expected implementation uses native Pointer Events and existing React/CSS.

## Required behaviour

### 1. Transient hand presentation order

The engine's `humanPlayer.hand` remains authoritative for card ownership. M29 introduces presentation-only hand order, represented by physical card IDs.

On a fresh mounted round/session, seed the visible hand from the same deterministic `sortCardsForDisplay(humanPlayer.hand)` order used before M29. This preserves the current baseline rather than exposing raw engine insertion order by default.

After that seed:

- manual reordering changes only the transient visible order;
- `Ordina mano` replaces the transient order with `sortCardsForDisplay` of the current hand;
- selecting or deselecting cards does not change their positions;
- toggling history, bot speed, errors or other unrelated presentation state does not change hand order;
- removing cards after a successful meld/extension/discard removes only those IDs from the presentation order;
- cards newly added by a committed engine transition are appended after surviving visible cards in their current engine-hand order;
- existing surviving cards keep their current relative presentation order across such committed updates;
- a new round or replaced/restored session starts a fresh presentation order and does not inherit the previous session's manual layout.

Manual hand order is deliberately not persisted. Reload/resume therefore reconstructs the hand using the deterministic initial sort. This is a presentation contract, not lost domain data.

No hand-order-only change may call `onMatchChange` or mutate the current `MatchState`.

### 2. Auto-sort control

Expose one clear native button labeled `Ordina mano` close to the hand controls.

Activating it:

- reorders every current human-hand card through the existing `sortCardsForDisplay` function;
- does not mutate `GameState` or `MatchState`;
- does not commit a game action;
- does not clear a valid current selection;
- does not emit game feedback cues;
- does not write local save state.

Do not add multiple sort modes in M29. Suit/rank/deck ordering remains the single existing presentation order.

### 3. Multi-card drag payload

The drag payload is defined once from the visible hand at the moment a drag actually begins, after a small movement threshold so an ordinary click/tap still toggles selection rather than accidentally starting a drag.

Use these semantics:

1. If the dragged card is already selected and at least one card is selected, the payload is the complete selected set, ordered by the current visible hand order.
2. If the dragged card is not selected, the payload contains only that dragged card.
3. Creating a drag payload does not itself commit game state.
4. A pure click/tap with no drag keeps the existing selection toggle behaviour.
5. Manual reordering does not clear selection; selected cards remain selected after a presentation-only reorder.
6. A successful game commit follows the existing table behaviour and clears selection/rule error through the normal transient-state reset.
7. A rejected engine command keeps the committed game state unchanged and leaves the selected set available for correction, as the existing button path does.

The implementation may show a lightweight drag proxy/count badge, but it must never duplicate hidden card information or become a second source of card identity.

### 4. Manual hand reordering

Dragging a payload back within the hand is a presentation-only reorder.

The insertion result must be deterministic:

- remove every payload card from its current visible position;
- insert the payload as one contiguous group at the chosen insertion boundary;
- preserve the payload cards' existing relative visible order;
- preserve every non-payload card's relative order.

Dragging one card therefore moves one card; dragging one already-selected card while several cards are selected moves the selected group together.

Do not reinterpret a reorder as a game action even during the action phase.

Provide a non-drag reorder path for keyboard users. The preferred compact contract is two native controls associated with the current selection, e.g. `Sposta a sinistra` and `Sposta a destra`, which move the selected cards as the same stable group by one insertion step. They must be disabled when no move is possible. An equivalent equally clear button-based implementation is acceptable, but do not create a large per-card control explosion.

Reorder controls are presentation-only and must follow the same persistence/onMatchChange rules as pointer reorder.

### 5. Direct discard

During the human `action` phase, the discard pile/table surface becomes an explicit direct-manipulation destination.

Dropping a payload containing exactly one hand card attempts:

`discardCard(game, humanPlayerId, cardId)`

through the same commit boundary and `humanActionFeedback` path used by `Scarta e passa`.

A payload with more than one card cannot be represented by the single-card engine command. Reject it at the interaction layer without calling the engine and explain immediately in Italian, for example: `Per scartare trascina una sola carta.`

Outside the human action phase, the destination must not appear actionable and no discard command may be attempted.

The existing `Scarta e passa` button remains present and functionally unchanged.

### 6. Direct new meld

During the human `action` phase, the own-team meld area exposes a persistent, clearly labeled target such as `Nuova calata`.

Dropping the current payload on that target attempts:

`playMeld(game, humanPlayerId, payloadCardIds)`

with physical IDs in payload order. React must not pre-validate whether the cards form a sequence/combo, whether a wildcard placement is legal, whether the move leaves a required final discard, or whether pozzetto/closure conditions allow it. The engine decides and the existing translated `GameRuleError` is shown if rejected.

The target must remain discoverable when the team currently has no melds.

The existing `Cala` button remains the complete click/tap/keyboard fallback and must produce the same committed result for the same card IDs.

### 7. Direct extension of one exact meld

Each existing meld belonging to the human team is a distinct drop destination during the human `action` phase.

Dropping the payload on meld index `N` attempts:

`extendMeld(game, humanPlayerId, N, payloadCardIds)`

through the same commit and feedback path as the existing `Aggiungi alla calata N` button.

The pointer target must make the exact destination visually clear while dragging. Do not infer a target from card geometry after the pointer is released; use the meld element/index that received the drop intent.

Opponent melds are never drop destinations.

The existing per-meld `Aggiungi alla calata` buttons stay available and unchanged as accessible fallback controls.

### 8. Pointer/touch interaction and scrolling

Implement direct manipulation with Pointer Events so the same logic supports mouse, pen and touch. Do not rely on HTML5 `dragstart/drop`, which is not the touch contract for this milestone.

Requirements:

- a small movement threshold distinguishes tap/click from drag;
- use pointer capture or equivalent ownership so a drag is not lost when the pointer crosses child elements;
- active drag state is canceled cleanly on `pointercancel`, lost capture, round/session replacement and component unmount;
- canceling a drag commits nothing;
- prevent text/image ghost selection or browser-native drag behaviour from competing with the gesture;
- do not globally disable page scrolling;
- touch scrolling of the page and local overflow regions outside an active card drag must continue to work;
- at narrow widths, hand and table layout must not gain document-level horizontal overflow because of drag affordances or proxies.

Direct game-action drops are available only when the human is the current player in `action` phase. Do not race an in-flight pointer sequence against bot playback or a replaced round/session; if the session changes before release, cancel the gesture.

### 9. Drop target feedback and rejection

While dragging, valid destination categories must be visually recognizable without relying on colour alone. Use text, outline/shape and/or an explicit target label/state. A hovered/active target may receive stronger emphasis.

There are two rejection classes:

1. **Interaction-structural rejection** — for example multi-card payload to discard, drop outside every supported destination after a real drag, or a stale/canceled target. No engine command is called. Show a concise UI-level explanation through the existing rule-error/alert surface.
2. **Domain rejection** — `discardCard`, `playMeld` or `extendMeld` throws `GameRuleError`. Keep the current state unchanged and show the existing translated domain explanation.

A rejected action must not produce a success feedback cue, clear the hand order, or write a new match state.

Successful direct actions must produce the same state transition and M24 feedback cue as their existing button equivalents.

### 10. Accessibility and fallback parity

Drag is an enhancement, never the only path.

Preserve:

- each playable hand card as a native button with its current accessible physical-card label and `aria-pressed` selected state;
- click/tap multi-selection;
- native `Cala`;
- native `Scarta e passa`;
- native per-meld `Aggiungi alla calata`;
- the single `role="alert"` rule-error surface;
- current focus management, polite turn status and bot log semantics.

Add:

- an accessible `Ordina mano` button;
- a keyboard/button reorder path;
- accessible names/instructions for the new-meld target and any direct-manipulation status that is semantically exposed;
- visible focus indication on every new native control.

Do not make every drop surface an extra keyboard tab stop merely because it is a pointer target when an equivalent native button already exists. The direct target can be semantically described without duplicating the tab sequence.

A screen reader or keyboard-only user must still be able to perform every game action available before M29 and must also be able to reorder/sort the hand without dragging.

### 11. Responsive behaviour

At approximately 320, 375/390, 768, 1280×800 and 1440×900:

- the hand remains readable and usable;
- manual reorder affordances do not cover card faces;
- drop destinations do not overlap unrelated controls;
- the discard pile remains fully inspectable as established by M28;
- long hands after collecting a large discard pile remain locally manageable;
- there is no body-level horizontal overflow introduced by M29;
- touch targets remain usable;
- pointer feedback does not depend on hover.

M29 may refine hand-area CSS and own-meld target styling but must preserve the M27/M28 table hierarchy rather than redesigning it.

## Acceptance criteria

- [ ] AC1 — The human hand has a transient ID-based presentation order seeded from the existing deterministic sort; manual order survives unrelated rerenders and committed additions/removals as specified, without mutating or persisting domain state.
- [ ] AC2 — `Ordina mano` reapplies `sortCardsForDisplay` to the current hand, preserves selection and causes no game/save commit.
- [ ] AC3 — Pointer dragging works with the defined payload rule: dragging a selected card moves the full selected set in current visible order; dragging an unselected card moves only that card; ordinary click/tap selection remains unchanged.
- [ ] AC4 — Pointer hand reorder moves the payload as one stable contiguous group, and a keyboard/button fallback can perform manual reorder without drag.
- [ ] AC5 — Dropping exactly one card on the discard destination calls the existing discard engine command and produces the same committed result/feedback as the button path; multi-card discard is rejected clearly without an engine call.
- [ ] AC6 — Dropping one or more cards on `Nuova calata` calls `playMeld`; engine legality is not duplicated in React and engine rejection is explained through the existing alert surface.
- [ ] AC7 — Dropping one or more cards on a specific own-team meld calls `extendMeld` with that exact meld index; opponent melds are never valid targets and existing extension buttons remain available.
- [ ] AC8 — Canceled, stale and invalid drops commit nothing; rejected actions emit no success cue, do not reset manual hand order and do not trigger `onMatchChange`.
- [ ] AC9 — Direct manipulation works for mouse/touch Pointer Events with a tap-vs-drag threshold, cleans up pointer state on cancel/session replacement/unmount and introduces no document-level horizontal overflow at supported narrow widths.
- [ ] AC10 — Existing click/tap/keyboard gameplay, save/resume, bot playback, table/discard behaviour, accessibility/live-region contracts and hidden-information boundaries remain intact; no `src/game` or save-schema change and no M30–M33 feature scope is introduced.

## Required tests

Add or update deterministic tests covering at least:

### Hand-order unit/integration coverage

- fresh hand uses the existing `sortCardsForDisplay` order;
- manual single-card reorder changes rendered order only;
- selected multi-card reorder preserves selected cards' stable relative order;
- `Ordina mano` restores deterministic sort and preserves selection;
- selection/unrelated rerenders do not reset manual order;
- a committed draw appends the newly acquired card after the manually ordered survivors;
- collecting multiple discards appends the newly acquired cards in engine-hand order while keeping existing manual survivor order;
- successful meld/extension/discard removes committed cards from the visible order without scrambling survivors;
- a replaced/new round reseeds order; a reloaded save does not persist prior manual order;
- reorder/sort does not call `onMatchChange`.

### Direct-manipulation coverage

- below-threshold pointer movement still behaves as click/tap selection;
- dragging an already selected card creates the full selected payload; dragging an unselected card creates a one-card payload;
- pointer cancel/lost capture/session replacement clears drag state and commits nothing;
- single-card direct discard succeeds through `discardCard`;
- multi-card discard is rejected with the UI-level explanation and no state commit;
- valid direct new meld commits through `playMeld`;
- invalid direct new meld surfaces the translated engine error and preserves state/selection/order;
- direct extension targets the exact own-team meld index and commits through `extendMeld`;
- invalid extension surfaces the engine error;
- opponent melds do not become drop targets;
- successful direct actions produce the same feedback cue/action type as the existing button path;
- invalid/outside drop produces immediate accessible rejection and no success cue.

### Accessibility/regression coverage

- card buttons retain accessible names and `aria-pressed`;
- `Ordina mano` and reorder fallback controls are keyboard operable with correct disabled states;
- `Cala`, `Scarta e passa` and `Aggiungi alla calata` still work without drag;
- no new pointer-only surface is required for keyboard game actions;
- hidden stock/pozzetto/bot identities remain absent;
- M28 discard chronology/whole-pile collection remains unchanged.

### Browser coverage

Extend Playwright with a focused M29 interaction spec using the real production build and current save-fixture boundary. Cover at least:

- desktop pointer reorder followed by an unrelated UI rerender, verifying order is retained;
- auto-sort restoring the deterministic order;
- one direct discard;
- one direct new meld;
- one direct extension to a chosen existing meld;
- one engine-rejected direct drop with the visible alert and unchanged committed state;
- a 375/390 px touch-pointer path for at least hand reorder plus one direct action;
- a keyboard-only path proving selection + action buttons and reorder controls work without drag;
- no document-level horizontal overflow on the narrow interaction fixture.

Do not add production-only test routes, globals or hidden-card instrumentation. Reuse the existing deterministic save/E2E fixture approach.

In the implementation report, record rendered interaction inspection at 1440×900, 1280×800, 768, 390/375 and 320 px, including a long hand after discard-pile collection. Explicitly inspect mouse/pointer, touch-pointer and keyboard fallback behaviour. Note any browser limitation honestly.

## Documentation updates

Update `docs/ARCHITECTURE.md` to document:

- human hand presentation order is transient UI state keyed by physical card ID;
- a new/restored session seeds from deterministic display sort, while manual order is not persisted;
- reconciliation preserves surviving visible order and appends newly acquired cards;
- Pointer Events collect drag intent only;
- direct discard/new-meld/extension commits still go through the existing engine commands;
- selected card IDs, drag payload/target/pointer state and manual order never enter `GameState`, `MatchState` or the local save;
- button/keyboard paths remain the accessibility fallback.

Do not change `docs/RULES.md`: M29 does not change Burraco behaviour.

Do not change the save schema or release documentation.

## Verification

During implementation, prefer focused Vitest/Playwright runs while iterating.

Before completion run the canonical standalone gate once:

`npm run verify`

Record the exact final result, test counts, browser inspection, material deviations and residual risks in `docs/milestones/reports/M29-implementation.md`.

## Completion conditions

M29 is complete only when every acceptance criterion is satisfied, direct manipulation and fallback paths are both usable, engine authority and hidden-information boundaries are preserved, the supported responsive/touch/keyboard checks pass, documentation agrees with the interaction contract, and the canonical verification is green.

Commit and push the implementation plus report to `milestone-29-hand-direct-manipulation`. Do not merge into `main`.
