# Milestone Implementation Report

## Milestone

- Milestone: M29 — Hand Management & Direct Manipulation
- Branch: `milestone-29-hand-direct-manipulation`
- Implementer: Claude Code
- Specification HEAD at start: `16433cb` (`docs: specify M29 hand management and direct manipulation`)

## Verification

- `npm run verify` after the CI fix (real Chrome Headless Shell 1243, see «CI fix after
  review»): passed, exit code 0. The first delivery's run below used the 1194 symlink and is
  not equivalent to the CI browser.
- `npm run verify` at `c83e72b`: passed, exit code 0 (`npm test && npm run test:e2e && git diff --check`),
  run once as the final gate on the complete implementation. This report was written
  afterwards (documentation only) and `git diff --check` was re-run on it.
- Vitest: 621 tests passed across 34 files (585 before M29 + 36 new).
  - `src/components/handOrder.test.ts` (9): seed = display sort, reconciliation, group
    insertion, one-step shift with disabled cases, physical-ID identity.
  - `src/components/GameTableHand.test.tsx` (27): hand-order, direct-manipulation and
    accessibility/fallback coverage listed in the specification's «Required tests».
- Playwright: 30 tests passed (24 before M29 + 6 new in `e2e/hand-manipulation.spec.ts`).
  - 1440×900 mouse: reorder survives history toggle, speed change and selection; save
    unchanged; «Ordina mano» restores the sort and keeps the selection.
  - 1440×900 mouse: direct new meld, engine-rejected drop (alert, unchanged meld, order and
    save), exact extension of «Calata 2», multi-card discard refused, single-card discard.
  - 375 and 390 px real Chromium touch (CDP `Input.dispatchTouchEvent`): a quick swipe
    scrolls the page and never drags; long-press → touch reorder; touch direct discard; no
    document overflow.
  - 375 px keyboard only: Space/Enter selection, «Sposta a sinistra/destra» with disabled
    states, «Ordina mano», «Cala», «Aggiungi alla calata 2», «Scarta e passa».
  - 320 px: hand tools below the hand, no document overflow.
  - `e2e/persistence.spec.ts` adjusted (see Incidental changes).
- Build: passed (`tsc -b && vite build`).
- `git diff --check`: passed.
- Working tree at completion: clean after the milestone commit.

### Local environment note

At the first delivery (`c83e72b`) the container had only Chromium build 1194 while
`@playwright/test` 1.63 expects Chrome Headless Shell 1243; a local symlink 1243 → 1194 was
used. That run is **not** equivalent to the CI browser and is superseded: for the CI fix
below, `npx playwright install` was blocked by the environment's network policy
(`cdn.playwright.dev` → 403), so the exact expected build, Chrome for Testing
`153.0.8010.12` (`chrome-headless-shell-linux64.zip`, revision 1243 in
`playwright-core/browsers.json`), was installed from the official
`storage.googleapis.com/chrome-for-testing-public` bucket into the Playwright browsers
path. All E2E results in «CI fix» were produced with that browser. No repository file was
changed for it. GitHub CI remains the authoritative gate.

### CI fix after review (PR #23)

- **Failure.** GitHub Actions run `36102780305` on `c83e72b`: Vitest (621) and build green;
  `e2e/hand-manipulation.spec.ts › touch reorder and a direct discard work while the page
  still scrolls` failed — first at 390 px (hand order unchanged after the touch reorder),
  on the rerun at 375 and 390 px (`.playing-card--armed` never appeared).
- **Reproduction.** With the real 1243 browser the test was flaky locally too (1/10 and
  2/20 failures with parallel workers, 0/20 with one worker): load-dependent timing.
- **Cause (verified by an event log in the failing runs).** The preceding «quick swipe»
  assertion starts a native fling that keeps scrolling after `touchEnd` and even after the
  test's `window.scrollTo` restore (scroll events 636 → 714 after the restore). The next
  long-press `touchstart` then arrived during that fling; Chrome deliberately delivers a
  touchstart that interrupts a fling as non-cancelable (`touchstart(nc)`), so the gesture
  became a scroll and ended in `pointercancel` — either before the 250 ms arm (no
  `--armed` class) or before release (order unchanged). The pointer-capture handover, the
  fake clock and the React state were not involved: every failing log showed the
  non-cancelable touchstart inside a running fling.
- **Production verdict.** No `useHandDrag` defect: this is the browser's standard
  fling-interruption behaviour; a real user's first touch after a fling stops the fling,
  exactly as on any native page. `src/` is unchanged by this fix.
- **Fix (test only).** `touchDrag` now synchronises explicitly on public state: waits until
  the page scroll has settled (scrollY unchanged between polls) before the press; checks
  the card is not armed before the fake clock runs `TOUCH_DRAG_DELAY_MS` and is armed after;
  checks the drag really started (`.drag-proxy` «1 carta») on the first move past the
  threshold and still on the last move; checks the destination is `data-drop-state="active"`
  (the hand for the reorder, the discard pile for the discard) before `touchEnd`; then
  checks the proxy is gone and the result. After the swipe the test also waits for the
  fling to settle and verifies the restored scroll position. The swipe-scrolls, long-press
  reorder, touch discard and no-overflow assertions are all kept.
- **Targeted runs (browser 1243):** `--grep "touch reorder" --repeat-each=20`: 40/40
  passed; `--repeat-each=25`: 50/50 passed; `--repeat-each=10 --workers=1`: 20/20
  passed; the whole `e2e/hand-manipulation.spec.ts` with `--repeat-each=5`: 30/30 passed.
- **`npm run verify` after the fix (browser 1243):** passed, exit code 0 — Vitest 621 tests
  in 34 files, Playwright 30 passed, `git diff --check` clean.

### Rendered inspection

Production build in headless Chromium, fixture opened through the real M22 save boundary
(human in the action phase, 9 cards, own team with two melds). Screenshots were taken while
a two-card selection was being dragged over «Calata 2» and after release, then with a long
hand (42 cards) after collecting a 31-card discard pile; all were inspected visually.

| Viewport | Document overflow (drag fixture / long hand) | Observed |
| --- | --- | --- |
| 1440×900 | 0 / 0 | Whole table in one view; dimmed dashed payload, «2 carte» badge, dashed outlines on hand/discard/«Nuova calata»/melds, solid outline + «Rilascia su Calata 2» on the hovered meld; tools row under the hand. |
| 1280×800 | 0 / 0 | Same. Pre-existing (M27/M28, also on the pre-M29 build): the bottom of the centre column (discard spread, lower melds) sits under the hand panel at this height; M29 adds no height to the hand panel (tools share the actions column height). |
| 768×1024 | 0 / 0 | Stacked centre; meld outlines/labels kept inside each meld (the meld list clips outside outlines, fixed during inspection). |
| 390×844, 375×812 | 0 / 0 | «Nuova calata» full width in the own meld area; tools row under the hand; long hand scrolls locally. |
| 320×700 | 0 / 0 | Tools wrap to two rows instead of overflowing the panel (found during inspection, fixed); cards and actions readable. |

Input paths inspected: mouse/pointer (threshold click vs drag, insertion bar, targets),
real touch through CDP (swipe scrolls, long-press arms and drags), keyboard (focus rings on
the new buttons use the existing 3 px ring). Limitations: pen input and iOS/Android devices
were not available; screen-reader output was not checked with real assistive technology
(covered by role/name/description assertions).

## Behaviour implemented

- Transient hand order (`src/components/handOrder.ts`) keyed by physical card ID, per round,
  in `GameTable` state: seeded from `sortCardsForDisplay`, reconciled during render
  (survivors keep order, removed cards drop out, new cards appended in engine-hand order),
  reseeded for a new round or a remounted/restored session, never persisted.
- «Ordina mano», «Sposta a sinistra», «Sposta a destra» (one-step stable group move,
  disabled when impossible) in a `role="group"` «Ordine della mano» under the hand.
- `useHandDrag` (`src/components/useHandDrag.ts`): native Pointer Events, 6 px threshold for
  mouse/pen, 250 ms rest for touch before a drag (so swipes keep scrolling; a non-passive
  `touchmove` listener on the hand blocks scrolling only for an armed gesture), pointer
  capture, click suppression after a real drag (keyboard clicks never suppressed), clean
  cancel on pointer cancel, lost capture, session change, end of the human turn and unmount.
- Payload rule: selected card → whole selection in visible order; unselected card → itself.
- Destinations resolved from the element under the release point via `data-drop-target`,
  set only when valid: hand (human turn), discard pile / «Nuova calata» / each own-team meld
  (human action phase). Game drops call `discardCard`, `playMeld`, `extendMeld(N)` through
  the existing `commitAction` and cue path. Structural refusals (multi-card discard, outside
  drop, game destination outside the action phase) use the existing alert without an engine
  call.
- Visual state: dashed outline while available, solid outline and label under the pointer,
  dimmed dashed payload, insertion bar, count-only pointer badge (fixed, pointer-events none).

## Deviations from specification

None.

## Known risks and ambiguities

- Touch uses a 250 ms long-press before dragging. This is my resolution of «same semantics»
  vs «touch scrolling must keep working»: payload/destination semantics are identical, only
  the gesture start differs. A touch press that rests and is released without moving is
  still a tap (toggles selection).
- Pen follows the mouse path (threshold, no long-press). On devices where the browser pans
  with a pen, a pen drag may be cancelled by the browser (`pointercancel`, nothing
  committed). Not verifiable here.
- Real-device behaviour (iOS Safari, Android Chrome) of the long-press + non-passive
  `touchmove` arbitration was verified only through Chromium CDP touch input.
- No auto-scroll of an overflowing hand while dragging: to reorder into a hidden part of a
  very long hand, scroll first or use the «Sposta» buttons.
- A structural rejection message stays until dismissed or replaced by the next commit; a
  later presentation-only reorder does not clear it.
- After a draw the new card is appended at the end even when the player never reordered
  (spec §1); before M29 it was sorted into place. «Ordina mano» restores the sort.

## Incidental changes

- `e2e/persistence.spec.ts`: the reload check compared the pre-reload visible hand order
  with the post-reload one. With M29 a drawn card is appended while a reload reseeds from
  the display sort (spec §1, «Reload/resume reconstructs the hand using the deterministic
  initial sort»). The test now asserts the same physical cards and that the resumed order
  equals `sortCardsForDisplay` of the saved hand — a stricter check of the specified
  behaviour, not a weaker one.
- `docs/ARCHITECTURE.md`: new «Hand order and direct manipulation» section; the save and
  `onMatchChange` paragraphs list the new transient state.

## Notes for independent review

- `GameTable` render-time reconciliation (`setHandPresentation` during render only when the
  reconciled array differs) and the round-number key for reseeding.
- `useHandDrag` lost-capture filter (`event.target === element`): a real Chromium touch
  moves the implicit capture from the card's inner span to the card and fires
  `lostpointercapture` on the span; without the filter the touch drag was cancelled (found
  by the CDP E2E, covered by a unit test).
- No `src/game` change, no save-schema change, no new dependency.
