# Milestone Implementation Report

## Milestone

- Milestone: M27 — UI Architecture & Visual Direction
- Branch: `milestone-27-ui-architecture`
- Implementer: Claude Code
- Specification HEAD at start: `e7db98f` (`docs: align milestone guidance with v1.1 roadmap`)

## Verification

- `npm run verify`: passed, exit code 0, run as the final step after this report was
  written and before the commit (`npm test && npm run test:e2e && git diff --check`).
- Vitest: 573 tests passed across 32 files (562 in M26 + 11 new).
  - Added `src/components/BotActionTimeline.test.tsx` (3) and
    `src/components/PlayerSeat.test.tsx` (2).
  - Added a `GameTable tabletop composition (M27)` block (6 tests) to
    `src/components/GameTable.test.tsx`.
  - No existing unit test was modified or removed.
- Playwright: 16 tests passed (Chromium, `vite preview` of the production `dist`).
  - `smoke.spec.ts`: after «Completa subito», the collapsed history keeps every entry and
    opens with Enter / closes with Escape (focus returns to the toggle).
  - `mobile.spec.ts` (320 px, touch): the disclosure opens and closes by tap with no
    document overflow.
  - `persistence.spec.ts`: the one assertion that required a visible entry now opens the
    history first (entries are clipped while collapsed).
- Build: passed (`tsc -b && vite build`).
- `git diff --check`: passed as part of `npm run verify`.
- Working tree at completion: clean for tracked files after the milestone commit. Pre-existing
  untracked Finder duplicates (`* 2.md`, `* 2.ts`, …) and `test-results/` were left alone
  and not committed.

### Rendered inspection

Checked with headless Chromium screenshots against the dev server, after starting a match
through onboarding with a long human name («Massimiliano Bartolomeo Della Rovere») and
playing several turns so both teams had several melds, a Burraco and wildcards
(document `scrollWidth` vs `clientWidth` in brackets):

| Viewport | Result |
| --- | --- |
| 1440×900 | Whole table in one view (page height = viewport); three-column centre. [1440/1440] |
| 1280×800 | Whole table in one view; each meld area scrolls locally. [1280/1280] |
| 1024×768 | Stacked centre, page scrolls vertically; no horizontal overflow. [1024/1024] |
| 768×1024 | Seats around the stacked centre; readable, no overlap. [768/768] |
| 390×844, 375×812 | Narrow layout: seat row, history bar, melds, public area, own melds, hand. [390/390, 375/375] |
| 320×740 | As above; seat names wrap to two lines instead of truncating. [320/320] |

Also inspected: the expanded history (overlay at ≥ 761 px, in flow below), the
completed-round view with the preserved history, keyboard order from the focused turn
status (stock → discard → hand cards, all with the visible focus ring), focus moving to
the turn status on onboarding → match, and all shots taken with
`prefers-reduced-motion: reduce`.

Live-region limitation: announcements were not checked with a real screen reader. The
collapsed log is clipped with the standard visually-hidden technique (never `hidden`,
`display: none` or `aria-hidden`), so browsers keep it in the accessibility tree; this is
covered by DOM assertions, not by an assistive-technology run.

## Behaviour implemented

- **Tabletop composition (AC1).** The human hand/actions sit at the bottom, the teammate on
  the left and the opponents on top and right. `tableSeats` derives the mapping from
  `teamId` relative to the human (the opponent who plays next is on the right); domain IDs,
  teams and turn order are untouched. Seats state «Compagno» / «Avversario» and the team
  in text (plus a shape marker), and expose the position as `data-seat`. The turn banner
  adds the active player's relation and team («Tu · Squadra 1», «Avversario · Squadra 2»).
- **Table hierarchy (AC1, AC2).** Opponents' melds face their side and the human team's
  melds the teammate's side, with the turn status, stock, pozzetti count and discard
  between them. On ≥ 1200 × 640 px viewports the table fits the screen in three centre
  columns (own melds | public area | opponents' melds), each meld area scrolling locally;
  narrower layouts stack the same groups. Meld areas are headed «La tua squadra» /
  «Avversari» with «Calate · Squadra N»; region names, Burraco badges, wildcard
  annotations, pozzetto status and «Aggiungi alla calata» are unchanged.
- **Hand and actions.** Selected-card count, «Cala» and «Scarta e passa» sit beside the hand
  on wide tables (with the name, team, turn badge and card count) and below it on narrower
  ones. Rule errors stay `role="alert"` inside the hand area.
- **Secondary controls (AC3).** The header is a slim bar with the round indicator, the
  bot-speed radio group and «Nuova partita» (all still visible, 44 px touch targets).
  «Completa subito» moved next to the turn status while bots play. Guidance text is a
  small caption under the turn banner, same wording as before.
- **History disclosure (AC3).** `BotActionTimeline` is a closed-by-default disclosure: a
  native button inside the heading with `aria-expanded`/`aria-controls`, an entry count and
  Escape to close. The `role="log"` node stays mounted and in the accessibility tree when
  collapsed; the visual `Ultima: …` preview is `aria-hidden` to avoid a double
  announcement. The expanded state is owned by `GameTable`, so it carries over to the
  completed-round view, where the history remains available.
- **Visual refinements.** Felt gradient centred on the public area, lighter header,
  smaller meld cards with tighter overlap (rank/suit corner still visible), compact seats.

## Deviations from specification

None known.

## Known risks and ambiguities

- **Opponent placement.** The specification fixes teammate left and opponents top/right
  but not which opponent goes where; the next player after the human (`player-2`) is on
  the right, the other (`player-4`) on top. Tests pin this choice.
- **1001–1199 px.** Only the ≥ 1200 × 640 px layout guarantees a single-screen view; the
  1001–1199 px range (and short desktop windows) uses the stacked centre with vertical page
  scrolling. The specification's desktop target (1280–1440 × 800–900) is met.
- **Collapsed log visibility.** Screen-reader users can still reach the full log while
  the disclosure reports `aria-expanded="false"`; this is intentional so announcements
  keep working (the specification allows it). The reviewer may want to confirm this with a
  real screen reader.
- **Overlay history.** On ≥ 761 px the expanded history overlays the top-left of the table
  (including part of the own-team meld area) until closed; it never blocks the hand.
- **Tab order at ≥ 1200 px.** DOM order stays opponents' melds → public area → own melds →
  hand (the natural stacked order). In the three-column layout the own melds are drawn on
  the left, so keyboard focus moves from the piles to the own-team «Aggiungi alla calata»
  buttons on the left before reaching the hand.
- A one-frame artifact: under the existing reduced-motion rule (`transition-duration:
  .01ms` on everything) the history panel's size transitions for one frame when opened.

## Incidental changes

- `MeldArea` accepts an optional `owner` text used for its visible heading.
- `PlayerSeat` exports `SeatPosition`, `SeatRelation` and `seatRelationLabels`, and takes a
  required `relation` prop.
- `e2e/fixtures.ts` gains a `historyToggle` locator.
- The previous `.team-areas` wrapper and its CSS were removed (the meld areas are placed
  directly by the new centre layout).

## Notes for independent review

- `src/components/BotActionTimeline.tsx` and the `.bot-timeline__panel--collapsed` /
  `.visually-hidden` CSS: confirm the log is never removed from the accessibility tree.
- `GameTablePlayback.test.tsx` compares rendered HTML across playback modes; the panel id is
  therefore a fixed `bot-timeline-panel` (a `useId` value differed between renders).
- Responsive CSS: `@media (min-width: 1200px) and (min-height: 640px)` block, and the
  existing 1000/760/440 px breakpoints in `src/styles.css`.
- No change under `src/game`, `src/shell` or the save schema; no new dependencies.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
