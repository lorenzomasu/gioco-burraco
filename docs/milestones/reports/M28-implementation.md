# Milestone Implementation Report

## Milestone

- Milestone: M28 — Tabletop & Discard Pile UX
- Branch: `milestone-28-tabletop-discard-pile`
- Implementer: Claude Code
- Specification HEAD at start: `4c42b9e` (`docs: specify M28 tabletop discard pile UX`)

## Verification

- `npm run verify`: passed, exit code 0 (`npm test && npm run test:e2e && git diff --check`),
  run as the final step after this report was written and before the commit.
- Vitest: 585 tests passed across 32 files (573 in M27 + 12 new).
  - Added a `GameTable discard pile (M28)` block (12 tests) to
    `src/components/GameTable.test.tsx`.
  - Updated existing unit tests only for the renamed/split control: the whole-pile button
    is now «Raccogli tutto il monte degli scarti, N carte» (also for an empty pile, where
    it is disabled and the pile shows «Monte degli scarti vuoto»), and the M24 discard cues
    are asserted on the `Monte degli scarti` group instead of the old button. No assertion
    was removed or weakened.
- Playwright: 24 tests passed (Chromium, `vite preview` of the production `dist`;
  16 in M27 + 8 new in `e2e/discard-pile.spec.ts`).
  - 320 / 375 / 390 px (touch): long pile (31 cards) in engine order, «In cima», count and
    scroll hint visible, spread overflows locally and opens on the newest card, older cards
    reachable, no document overflow, manual position kept across history toggle and speed
    change.
  - 375 px keyboard: Tab from the stock reaches the spread (one stop), arrow keys scroll it,
    Tab reaches the collection button, Enter collects the whole pile → empty state, `0 carte`,
    disabled button, 42 cards in hand, no document overflow.
  - Resume: a long pile scrolled to its oldest card reopens on the newest card after reload.
  - 1440×900, 1280×800, 768×1024: overlapping spread with each older card exposing ≥ 16 px,
    newest card within the spread, collection button not overlapping the cards, no document
    overflow.
  - `smoke`, `persistence` and `hidden-information` specs were updated to the new locators
    (`e2e/fixtures.ts`: `discardPile`, `discardPileCards`, `collectDiscardPileButton`);
    persistence now compares the full list of pile card labels before/after reload.
- Build: passed (`tsc -b && vite build`).
- `git diff --check`: passed as part of `npm run verify`.
- Working tree at completion: clean for tracked files after the milestone commit.
  Pre-existing untracked Finder duplicates (`* 2.md`, `* 2.ts`, …) and `test-results/`
  were left alone and not committed.

### Rendered inspection

Headless Chromium screenshots of the production build, opened through the real M22 save
boundary with the seeded smazzata 1 plus 30 stock cards moved onto the discard pile
(31 cards, human in the draw phase), `prefers-reduced-motion: reduce`. The screenshots
were inspected visually; figures are `document.documentElement` scrollWidth/clientWidth
and the spread's scrollLeft / scrollWidth / clientWidth right after load.

| Viewport | Document | Spread | Result |
| --- | --- | --- | --- |
| 1440×900 | 1440/1440 | 408 / 717 / 309 | Whole table in one view; spread in the centre column under stock and pozzetti, «In cima» on the newest card, text scroll hint. |
| 1280×800 | 1280/1280 | 445 / 717 / 272 | As above; meld columns unchanged in role, still scroll locally. |
| 768×1024 | 768/768 | 340 / 717 / 377 | Stacked centre; pile on its own row between the meld areas. |
| 390×844 | 390/390 | 255 / 593 / 338 | Pile full-width in the public area, local horizontal scroll. |
| 375×812 | 375/375 | 270 / 593 / 323 | Same. |
| 320×740 | 320/320 | 325 / 593 / 268 | Same; corners of each card readable, hand and actions below. |

In every case scrollLeft equals scrollWidth − clientWidth, i.e. the newest card is in view.

Also inspected:

- A short pile (6 cards) at 1280×800: the spread fits without scrolling and shows no hint
  (the absence of a tab stop for a fitting pile is covered by a unit test).
- Transition to empty after collection (375 px): dashed «Monte degli scarti vuoto» box,
  `0 carte`, disabled «Raccogli tutto». This inspection found a stale scroll hint on the
  empty pile; it was fixed and is covered by a unit test.
- Resumed long pile at 1280×800 after a reload: scrollLeft 445 = maximum, document
  1280/1280.
- Keyboard at 375 px: the spread and the collection button both show the existing 3 px
  gold focus ring.

Limitations: headless Chromium draws no scrollbars in screenshots, so the thin styled
scrollbar was not visually checked; the text hint «‹ scorri per i precedenti» and the
partly clipped cards are the affordance that does not depend on hover or the scrollbar.
Screen-reader output was not checked with a real assistive technology; the semantics are
covered by accessible-name/role assertions.

## Behaviour implemented

- **Complete discard pile (AC1).** New `src/components/DiscardPile.tsx` renders
  `game.discardPile` directly in array order as an `<ol role="list">` named «Carte scartate,
  dalla più vecchia alla più recente»; each item is the existing static `PlayingCard`
  (`role="img"`, `cardLabel` with deck number). No sort, reverse or event-based rebuild.
  The last item is marked by position, a lift, a gold ring and the text «In cima».
- **Spread and overflow (AC2).** Cards overlap (`-2.2rem`), leaving the rank/suit corner of
  every older card visible. The list scrolls horizontally inside its own box
  (`overflow-x: auto`, `min-width: 0` down the chain), so a long pile never widens the
  page. On ≥ 1200×640 px the central public column widens from a fixed 17.5 rem to
  `clamp(17.5rem, 23vw, 22rem)` to give the spread more room.
- **Newest card in view (AC3).** A layout effect keyed only on the top card's id scrolls to
  the end on mount/resume and when a new card becomes the top; any other render (selection,
  speed, history, cues) leaves the user's scroll position alone. The state is local to the
  component and never enters `GameState`, `MatchState` or the save.
- **Collection and empty state (AC4).** One native button «Raccogli tutto» (accessible name
  «Raccogli tutto il monte degli scarti, N carte»), outside the card list, calling the
  unchanged `takeDiscardPile(game, humanPlayerId)` with the unchanged draw-phase condition
  (now written as `discardPile.length > 0`). Cards are not buttons. An empty pile shows
  «Monte degli scarti vuoto», `0 carte`, no card and a disabled button.
- **Accessibility (AC5).** The pile is a `group` «Monte degli scarti» containing the count,
  the ordered list and the button. While the spread overflows it gets `tabIndex=0` (one tab
  stop, native arrow-key scrolling) and a visible text hint; otherwise no extra tab stop.
  Newest and count cues are text. Turn status, alerts, focus management and the bot log are
  untouched.
- **Stock, pozzetti, melds (AC6).** The stock button is unchanged (face-down back + count).
  The pozzetti counter adds two `aria-hidden` face-down stacks: filled for as many as
  `game.pozzetti` has non-empty entries, dashed for the rest — derived from the count only,
  so no position, owner or content is implied. `MeldArea` is unchanged.
- **Feedback (AC7).** The M24 `discard` / `collect` cues now sit on the discard group (ring;
  the new top card pops on `discard`). No source-to-destination motion was added.

## Deviations from specification

None known.

## Known risks and ambiguities

- **Button name change.** The collection control's accessible name changed from
  «Raccogli il monte degli scarti, N carte» / «Monte degli scarti vuoto» to «Raccogli tutto
  il monte degli scarti, N carte» (including `0 carte` when empty) to state that the whole
  pile is collected and to keep the count. `scripts/deployed-smoke.mjs` does not reference it.
- **Empty-pile control.** The button stays rendered and disabled when the pile is empty
  (the spec allows "disable/withdraw"); the empty state itself is the text box.
- **Tab order vs. visual order.** The button is drawn on the header row, above the spread,
  but follows it in DOM/tab order (stock → spread → «Raccogli tutto»), so a keyboard user
  inspects the cards before the action.
- **Overflow detection** uses `ResizeObserver` plus a re-measure on pile length; in an
  environment without `ResizeObserver` it measures only on pile-length changes.
- **Top-card cue with identical labels.** Both jokers of the same deck share an accessible
  label («Jolly, mazzo 1»); this is the pre-existing `cardLabel` behaviour and is outside
  M28 scope.
- **Hub width** at ≥ 1200 px changed from a fixed 17.5 rem; the meld columns are slightly
  narrower at 1280–1440 px (they still scroll locally).

## Incidental changes

- Removed the now-unused `.pile-control__card` and `.empty-card` CSS and folded the
  `.card-back` size into its main rule.
- `e2e/fixtures.ts` gains `discardPile`, `discardPileCards` and `collectDiscardPileButton`.
- `docs/ARCHITECTURE.md` gains a "Public table cards" section (chronological rendering,
  top = final element, presentation-only scroll state, stock/pozzetti hidden-information
  boundary). `docs/RULES.md` is unchanged.

## Notes for independent review

- `src/components/DiscardPile.tsx`: the two layout effects (top-card scroll keyed on the
  top id; overflow measurement with the empty-pile reset).
- `src/components/GameTable.test.tsx` → `GameTable discard pile (M28)`: order/once-only,
  engine-path collection (`onMatchChange` equals `takeDiscardPile(state)`), 40-card
  unsorted pile with an unchanged state, scroll preservation with mocked geometry, hidden
  stock/pozzetto identities.
- `e2e/discard-pile.spec.ts`: narrow/desktop geometry, keyboard path and resume.
- No change under `src/game`, `src/shell` or the save schema; no new dependencies.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
