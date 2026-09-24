# Milestone 28 — Tabletop & Discard Pile UX

## Goal

Turn the M27 public table area into a usable card-table surface centered on the real shared cards. The complete face-up discard pile must be visible in its stored chronological order, with the newest/top card immediately recognizable, while stock, available pozzetti and both teams' melds remain coherent table elements across desktop, touch and keyboard use.

This milestone changes presentation and pile interaction only. The existing engine remains authoritative, collecting discards still takes the entire pile, and no drag/drop or alternate move semantics are introduced.

## Context

M27 is merged on `main` at `3250be152148322ab9331bd5128f31958eaa1df0`. It established the tabletop composition: human hand/actions at the bottom, teammate left, opponents top/right, opponent/own meld areas around a central `.table-hub`, and a compact bot-history disclosure.

The current discard control in `src/components/GameTable.tsx` reads `game.discardPile.at(-1)` and renders only that top card plus the pile count inside one `.pile-control` button. The engine contract in `src/game/engine/turn.ts` is explicit: the discard-pile top is the final array element, a new discard is appended, and `takeDiscardPile` transfers the entire array without reordering it. Therefore `game.discardPile[0]` is the oldest visible discard and `game.discardPile.at(-1)` is the newest/top discard. M28 must render that array order directly; it must never sort or reconstruct the pile.

`PlayingCard` already supports non-interactive card faces with accessible `cardLabel` descriptions that include physical deck number. `MeldArea` already renders public meld cards, Burraco labels, pozzetto status and the existing extension button. M24/M27 feedback cues, focus/live-region behaviour and the M27 responsive table geometry are existing contracts to preserve.

## In scope

- Replace the top-card-only discard presentation with the complete face-up `game.discardPile`, rendered from oldest to newest.
- On desktop, present the pile as a compact overlapping spread/fan where every card's rank/suit corner remains identifiable and the newest/top card is visually prominent.
- For piles that exceed the available width, preserve access to every older card with local pile overflow rather than clipping cards or causing body-level horizontal scrolling. Narrow layouts must use an obvious horizontal scroll region; no mandatory popup/modal may be required to inspect old discards.
- Keep the newest/top discard visible on initial render/resume and when a new discard is appended, while still allowing the user to scroll back through older cards. Do not continuously snap an unchanged pile while the user is inspecting it.
- Keep a clear pile count and an explicit empty-pile state.
- Preserve collection as one action on the whole pile. Individual discard cards are informative, not individually collectible or draggable in M28.
- Ensure the whole-pile collection control remains a native, clearly named, keyboard/touch operable button and uses the same `canTakeDiscardPile` eligibility as today. If necessary, separate the collection button from the face-up card list so card descriptions remain exposed correctly to assistive technology.
- Keep stock as a face-down public table stack with remaining-card count and the existing draw action/eligibility. Never reveal stock identities.
- Represent the remaining pozzetti as face-down/public availability only (for example two/one/zero stack indicators plus text/count). Never render unrevealed pozzetto card identities or imply a team assignment that does not exist in domain state.
- Keep both teams' meld areas integrated into the table around the public zone. Long meld content must remain locally scrollable/usable and must not be displaced into a modal/sidebar by the larger discard presentation.
- Preserve the existing M24 visual feedback for draw, discard, whole-pile collection and pozzetto acquisition; M28 may retarget those cues to the new pile surfaces but must not add source-to-destination motion.

## Out of scope

- Hand reordering, auto-sort controls, drag/drop, touch-drag, drop targets or new direct-manipulation semantics (M29).
- Card movement choreography, FLIP/WAAPI/source-to-destination animation (M30).
- Sound, volume/mute preferences or haptics (M31).
- Broad onboarding, settings, score/result redesign (M32).
- Game rules, bot strategy, scoring, match lifecycle, save schema or any change under `src/game`.
- Revealing stock order, unrevealed pozzetto contents, bot hands or any other hidden information.
- Partial discard-pile collection, selecting an individual discard, or changing the stored discard order.
- New runtime dependencies for pile layout/scrolling unless a concrete browser limitation makes the existing React/CSS stack insufficient.

## Required behaviour

### Discard order and visibility

Render the discard pile in the exact array order already stored by the engine:

1. first rendered card = `game.discardPile[0]` = oldest visible discard;
2. last rendered card = `game.discardPile.at(-1)` = newest/top discard.

Do not call `sortCardsForDisplay`, reverse the domain array, or derive order from bot events/history. React must render committed public state directly.

Every face-up discard remains inspectable. Overlap is allowed only when enough of each card remains exposed to identify its rank/suit using the existing card-face language. The top/newest card must be distinguished by more than colour alone: use position plus a persistent text/shape cue such as «Ultimo scarto» / «In cima». This is a static state cue, not M30 motion.

A large pile must stay inside the table geometry. At desktop widths it should read as an overlapping tabletop spread and may use local overflow as a fallback when the spread no longer fits. At approximately 320–390 px the discard area must be horizontally scrollable without widening the document. Scrollbars may be visually subtle but the affordance cannot depend on hover.

When the pile first appears/resumes, and when its length grows because a discard is committed, the newest card must be brought into view if local overflow is present. Once the pile is unchanged, manual inspection of older cards must not be forcibly reset by unrelated renders such as selection changes, speed changes or history toggles.

### Collection action and empty state

The collection command remains exactly `takeDiscardPile(game, humanPlayerId)`. The UI offers one collection action for the entire pile; individual rendered cards are not buttons/drop targets.

The collection control is enabled only when the existing `canTakeDiscardPile` condition is true. Its accessible name includes that it collects the whole discard pile and communicates the current pile count. When disabled because it is not the human draw phase, the pile remains fully visible and inspectable.

When `discardPile.length === 0`:

- show a clear «Monte degli scarti vuoto» state in the same table location;
- expose a zero count;
- disable/withdraw the collection action in the same way as current legality requires;
- render no stale previous top card.

After a successful whole-pile collection, the visible spread becomes empty and the existing committed state/feedback/turn phase behaviour is preserved.

### Accessible pile semantics

The pile must expose a meaningful label such as «Monte degli scarti» and a chronological sequence of the visible card descriptions. Reuse the existing `cardLabel`/static `PlayingCard` semantics where practical so equivalent faces from the two physical decks remain distinguishable to assistive technology.

Do not put interactive card controls inside the pile in M28. Avoid a structure where one giant button causes all child card identities to disappear or become ambiguous in the accessibility tree; separating the collection button from the visual/semantic card sequence is acceptable and preferred when needed.

The local horizontal scroll surface must be keyboard reachable/usable when overflow requires scrolling, with an evident focus indicator. Do not add extra tab stops for every non-interactive discard solely to satisfy scrolling.

The newest-card cue and pile count must not rely on colour alone. Preserve the existing turn polite status, error alerts, focus management, bot log and native disabled-control semantics.

### Stock, pozzetti and melds as table elements

Stock stays visually face-down and exposes only its remaining count; drawing continues through the existing native control and engine command. No stock card identity may be rendered, including through accessibility labels or data attributes added for presentation.

Pozzetti remain hidden until taken by the engine. The public area may show up to two face-down stack indicators based only on which `game.pozzetti` arrays remain non-empty, plus concise availability text/count. Do not show card faces, IDs, order, or speculative ownership.

Both `MeldArea` instances remain visible as public table regions with the current team/owner labels, Burraco classification, wildcard annotations, pozzetto status and extension action. Adjust layout/scroll constraints as necessary so a long discard spread, many melds and the human hand coexist without body-level sideways overflow.

### Responsive and preservation

At representative 320, 375/390, 768, 1280×800 and 1440×900 viewports:

- no body-level horizontal overflow is introduced;
- the full discard history remains reachable;
- the newest card and pile count are easy to locate;
- stock, pozzetti, both meld areas, turn context and the human hand/actions remain identifiable and operable;
- essential controls do not overlap the card spread;
- touch targets and keyboard focus remain usable.

Preserve save/resume, bot step/fast/immediate playback, round advancement, new-match confirmation, M24 feedback cues, reduced-motion behaviour and all current game legality. Presentation state used only to keep a local scroll position/current newest card visible must not enter `GameState`, `MatchState` or persisted save data.

## Acceptance criteria

- [ ] AC1 — The live table renders every card in `game.discardPile` exactly once and in engine order from oldest to newest; the final/top card is clearly marked as the newest without changing domain state.
- [ ] AC2 — Desktop uses an overlapping discard spread and large piles remain fully reachable; 320–390 px layouts provide local horizontal scrolling with no body-level horizontal overflow or mandatory popup.
- [ ] AC3 — Initial/resumed and newly appended piles keep the newest card visible when overflow exists, while unrelated rerenders do not reset a user's manual scroll through an unchanged pile.
- [ ] AC4 — Whole-pile collection remains one native action using the existing legality/engine command; individual discards are non-interactive. Empty pile, disabled phases and successful collection render correctly.
- [ ] AC5 — The discard sequence exposes useful accessible card descriptions/order, the overflow surface is keyboard usable, newest/count cues do not rely on colour alone, and existing focus/live-status/error/history contracts remain intact.
- [ ] AC6 — Stock exposes only a back/count, pozzetti expose only face-down availability, and both team meld areas remain integrated/usable; no hidden card identity is leaked.
- [ ] AC7 — Existing gameplay, save/resume and playback behaviour are preserved; no changes under `src/game`, no save-schema changes, no new runtime dependency, and no M29–M33 feature scope is introduced.

## Required tests

Add/update deterministic UI tests that cover at least:

- a multi-card discard fixture with distinguishable faces and deck numbers, asserting DOM/accessibility order oldest → newest and exactly one rendered representation per discard;
- newest/top-card text/state cue and current pile count;
- empty discard pile;
- collection enabled in the human `mustDraw` phase and disabled outside it, while cards remain visible when collection is unavailable;
- successful whole-pile collection clears the spread and transfers through the existing engine path rather than a UI-side reconstruction;
- a long discard pile (large enough to exercise the spread/overflow structure) without changing or sorting the underlying state;
- stock remains face-down/no stock identities are rendered;
- pozzetto presentation is derived only from public availability and reveals no contents;
- regression protection for meld extension, card selection and bot playback/history around the reorganized public area.

Do not use screenshot snapshots for incidental CSS. Extend a browser/mobile path where useful to assert no document-level horizontal overflow and that the discard region itself can overflow/scroll at a narrow viewport; do not add production-only test hooks just to seed a pile.

In the implementation report, record rendered inspection with an intentionally long pile at 1440×900, 1280×800, 768, 390/375 and 320 px, plus keyboard inspection of the pile scroll surface and collection action. Also inspect a resumed long-pile state and the transition to an empty pile after collection. Record `document.scrollWidth` versus `clientWidth` for the narrow cases as M27 did.

## Documentation updates

Update `docs/ARCHITECTURE.md` only where the UI presentation contract changes: document that the face-up discard array is rendered chronologically oldest → newest, that the newest/top card is the final element, that overflow/scroll state is presentation-only, and that stock/pozzetti remain hidden-information boundaries.

Do not change `docs/RULES.md`: M28 does not change Burraco behaviour or the engine's discard representation.

README/release docs should remain unchanged unless an existing statement becomes false.

## Verification

Before completion, run:

`npm run verify`

Report the exact result and any browser/accessibility limitation found during rendered inspection.

## Completion conditions

M28 is complete only when all acceptance criteria are met, the complete discard pile is usable across the required viewports/input modes, hidden information remains protected, focused automated tests and the canonical verification pass, documentation agrees with the new presentation contract, and `docs/milestones/reports/M28-implementation.md` records verification, rendered checks, deviations and residual risks.

Commit and push the milestone branch. Do not merge into `main`.
