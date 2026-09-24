# Milestone Implementation Report

## Milestone

- Milestone: M23 — UX, Mobile & Accessibility Hardening
- Branch: `milestone-23-ux-mobile-accessibility`
- Implementer: Claude Code
- Specification HEAD at start: `1049488` (`docs: specify UX mobile accessibility hardening milestone (M23)`)

## Verification

- `npm run verify`: passed. This was the final run, after this report was written and before the commit. Exit code 0.
- Tests: 536 passed across 28 test files.
  - Baseline before M23: 518 in 28 files.
  - Added: 12 `GameTable` tests and 6 `App` tests.
  - No existing test was deleted. The existing tests that changed are listed under "Tests added or changed".
- Build: passed (`tsc -b && vite build`).
- `git diff --check`: passed. It ran as part of `npm run verify`, and `git diff --cached --check` passed on the staged milestone diff, which includes the new report.
- Working tree at completion: clean after the milestone commit.

## Behaviour implemented

- **Responsive shell and header.**
  - The header wraps. The round indicator sits next to the brand and stays visible.
  - The playback-speed `fieldset` keeps its legend and stays one labelled group. Each option is a pill whose whole label is the 44 px target.
  - `Completa subito` and `Nuova partita` wrap onto their own row instead of compressing.
  - The ≤ 440 px column-reverse header and the 36 px `Nuova partita` override were removed.
- **Table layout.**
  - The ≤ 1000 px grid now uses `minmax(0, 1fr)` for the centre column. Previously it used `minmax(28rem, 1fr)` together with `overflow: hidden`, which clipped content between about 761 and 830 px.
  - `overflow: hidden` was removed from `.table-surface`.
  - Team meld areas use an intrinsic `auto-fit` two-column or one-column grid.
- **Hand and meld overflow.**
  - The hand keeps local horizontal scrolling. Its padding now leaves room for the lift, the focus ring and the selected border, and it uses `scroll-padding-inline`.
  - On ≤ 760 px the meld list has no nested vertical scroll. Meld rows still scroll sideways.
  - Meld actions stay outside the card strip.
  - Long names wrap (`overflow-wrap: anywhere`) or truncate with an ellipsis in seats. The full name is kept in the accessible name.
- **Card readability.**
  - Wildcard and pinella annotations went from 0.48 to 0.56 rem.
  - The card after an annotated card no longer overlaps it, so labels such as `Matta → 9` stay readable.
  - Red suits were darkened slightly (`#bd3f37` → `#b0362f`) for AA contrast on the card face.
- **Touch targets.** The following now have a 44×44 px or larger hit area:
  - `.button` and `.button--small`, which cover the meld-extension buttons;
  - the speed options;
  - the rule-error dismiss control;
  - the pile controls.

  Cards were not shrunk.
- **Focus visibility.**
  - One `:focus-visible` outline applies to buttons, inputs and `[tabindex]`.
  - Radio focus is drawn on the whole option label.
  - Programmatic context targets get a dashed ring only when the focus is visible.
- **Lifecycle focus.** Focus moves only on major view replacements. The target is an element that is not a tab stop (`tabIndex={-1}`):
  - onboarding → match: `GameTable` gets `focusContextOnMount`, and focus goes to the turn status (turn banner plus guidance);
  - active round → completed round: the result heading `h1`;
  - completed round → next round: the turn status;
  - confirmed `Nuova partita` or `Gioca ancora` → onboarding: the onboarding heading, through `StartScreen` `focusOnMount`.

  The first page load, including a restored save, never moves focus. Card actions and bot events never move it either.
- **Accessible names and states.**
  - Each extension button is named `Aggiungi alla calata N della squadra T`. Its visible text keeps the same prefix.
  - Each meld is an article named `Calata N squadra T`, and each meld shows a visible `Calata N` label.
  - Round-score cards are named per team.
  - Existing names for piles, cards, hand, seats and scores were kept.
- **Bot timeline.** A log container stays mounted with `role="log"`, `aria-live="polite"` and `aria-relevant="additions"`. It is labelled by the timeline heading.
  - Existing `<li>` entries keep their DOM identity when an event is appended.
  - The empty-state text is outside the log.
  - Restore still starts with an empty timeline.
- **Live regions.**
  - The turn banner stays the single polite turn and phase status. `aria-atomic="true"` was added so it is read as one coherent update.
  - Rule errors stay `role="alert"`, and storage notices stay `role="status"`.
  - The guidance text is not a live region.
- **Contextual guidance.** `turnGuidance` builds a short Italian help line from the same `canDrawStock` and `canTakeDiscardPile` booleans that disable the pile buttons. It also uses the active team's meld count, because extension buttons exist only for existing melds, and whether bots are playing, because that is exactly when `Completa subito` is rendered. Four cases:
  - draw phase, stock and discard pile both available;
  - draw phase, stock only;
  - action phase, with or without extension help;
  - bot phase.

  It has no legality logic of its own.
- **State cues beyond colour.**
  - A selected hand card shows a ✓ marker (`aria-hidden`), a thicker border and the lift, in addition to `aria-pressed`.
  - The current player's seat, the human hand header and the active team's meld area show a `Di turno` text badge. The seat badge overlaps the seat border, so the layout does not shift.
  - Disabled buttons lose their fill and get a dashed outline, and they stay natively `disabled`.
  - A disabled pile dims only its artwork. The pile name and card count keep full contrast.
  - The pozzetto state was already stated in text.
- **Persistence notices.** The match notice is no longer `position: fixed`. It sits in normal flow above the header and is aligned with the shell padding. Both notices wrap and use an opaque `#7a2e27` background.
- **Reduced motion.** The existing rule now also suppresses animation duration and iteration count. M23 adds no animation and nothing that needs motion to be understood.
- **Documentation.** `docs/ARCHITECTURE.md` gained an "Interaction and accessibility invariants" subsection covering focus, the log, live regions, non-colour cues and CSS-only responsiveness. `docs/RULES.md` and `docs/ROADMAP.md` are unchanged.

### Tests added or changed

- `src/components/GameTable.test.tsx`, new suite `GameTable accessibility and interaction semantics` (8 tests):
  - a card's name and `aria-pressed` before and after selection, with the ✓ marker present only while selected;
  - disabled draw, collect, `Cala`, `Scarta e passa` and extension controls;
  - two unique extension names, where the second one extends meld 2;
  - `Di turno` and `aria-current` for the human turn versus a bot turn, including the active team;
  - the log role, `aria-live` and `aria-relevant`, and that existing `<li>` nodes stay identical (`toBe`) after an append;
  - a single polite, atomic turn banner, guidance outside every live region, a single alert and dismissal;
  - guidance for draw with both piles, draw with an empty discard pile (disabled) and the action phase;
  - extension help only with team melds, and `Completa subito` guidance only while the button is rendered.
- `src/components/GameTable.test.tsx`, new suite `GameTable lifecycle focus` (4 tests):
  - no focus on mount unless `focusContextOnMount` is set;
  - a bot closure focuses the result heading, even when focus was previously on a speed radio;
  - `Inizia smazzata 2` focuses the turn status;
  - card toggling, committed actions and bot timeline events do not steal focus.
- `src/App.test.tsx`, new suite `App lifecycle focus` (6 tests):
  - no focus on the first load or on a restored match;
  - onboarding → turn status;
  - round summary → result heading, then `Inizia smazzata 2` → turn status;
  - a cancelled `Nuova partita` keeps focus, and a confirmed one focuses the onboarding heading;
  - `Gioca ancora` focuses the onboarding heading;
  - the save-failure notice is the single `status`, placed before the table in document order, and the controls stay enabled.
- Existing tests that changed:
  - `GameTable.test.tsx`: two extension tests now use the new name `Aggiungi alla calata 1 della squadra 1`.
  - `GameTablePlayback.test.tsx`: the two "every extension control is disabled" loops now match `/^Aggiungi alla calata/`. Keeping the old exact name would have matched nothing and left the loops empty.
  - Six timer assertions in `App.test.tsx` (2) and `GameTablePlayback.test.tsx` (4) now call `flushFocusSelectionChange()` first. It is documented next to its definition. Programmatic `focus()` makes jsdom queue an asynchronous 0 ms `selectionchange` timer (`Selection-impl.js`, `_associateRange`). The helper advances fake time by 0 ms only. Every bot playback timer (150 or 550 ms) stays pending, so the following `getTimerCount()` still proves the same thing as before.
- **Mutation checks** (run locally, then reverted). Each change below was caught by the new tests:
  - removing the focus call: 5 failures;
  - re-keying the timeline items so history re-renders: 1 failure, after the identity assertion was strengthened from `toEqual` to `toBe`;
  - removing the extension `aria-label`: 4 failures;
  - dropping the stock-only guidance branch: 1 failure.

## Responsive and rendered verification

- **Method.** I ran the Vite dev server locally. I opened the app in the Claude desktop app's built-in browser pane, which is a real Chromium rendering engine. I emulated each width with the pane's viewport tool.
- **Checks at each width.** At each width I ran an in-page script that checked:
  - `documentElement.scrollWidth` against `clientWidth`;
  - every element whose box extends past the viewport and is not inside a local horizontal scroller;
  - every button, text input and speed-option label smaller than 43.5 px in either dimension.

  I also inspected screenshots.
- **Widths checked.** 320×740, 360×780, 390×844, 440, 600, 761, 768×1024 (tablet portrait), 1024×768 (tablet landscape), 1280×800 and 1440×900.
- **States exercised at 320 px** (using a 23-character name):
  - onboarding, with and without a discarded-save notice;
  - the active table in the draw, action and bot phases, with `Completa subito` visible;
  - a selected and keyboard-focused hand card;
  - long melds with wildcard annotations;
  - the in-match save-failure notice, triggered by replacing `localStorage.setItem` in the page;
  - the round result, the between-round summary, the round 2 table, the final result with Victory Points, and `Gioca ancora`.

  The 360, 390, tablet and desktop widths were checked on the active table with the in-match notice. The rounds were played by a script that clicked the real UI controls.
- **Results.**
  - Every check at every width showed `scrollWidth == clientWidth`, no element overflowing the viewport and no undersized target.
  - The hand and meld rows scroll locally.
  - The focus ring and the selected card are not clipped: the lifted card keeps at least about 11 px above it and about 9.6 px to its side, against a 6 px ring.
- **Rendered focus checks.**
  - Pressing Enter on `Inizia partita` focused the turn status.
  - A round end focused `#round-complete-title`.
  - `Inizia smazzata 2` focused the turn status.
  - `Gioca ancora` focused `#start-title`.
  - The first load, including one with a discarded save, left focus on `body`.
- **Limitations.**
  - The emulated viewport is a desktop Chromium engine with a mobile-sized viewport, not a physical phone. Touch was not exercised with real touch input, and iOS Safari and Firefox were not checked.
  - `prefers-reduced-motion` could not be emulated in the pane. It was checked statically: the page's parsed stylesheet contains the rule with transition and animation duration suppressed.
  - jsdom tests do not prove geometry, and none claims to. Browser-level viewport and E2E automation remains M25 scope.

## Accessibility and contrast checks

- **Contrast.** WCAG 2 relative-luminance ratios were computed with a local Node script. Translucent layers were alpha-composited over the lightest felt colour (`#1f7557`) or the page background, whichever applies.
- **Fixed** (normal-text minimum 4.5:1):

  | Item | Before | After |
  | --- | --- | --- |
  | Pile card count, on felt | 3.42 | 5.07 |
  | Pozzetti counter, on felt | 3.42 | 5.07 |
  | Empty-meld text | 3.46 | 5.83 |
  | Red card suits | 4.21 | 4.84 |

  Other text was raised from `#b9cfc5` to `#cfe0d8`/`#dbe8e1` or larger sizes, although it already passed. For example, the meld meta went from 6.78 to 8.12. The storage notice went from 4.68 to 8.65.
- **Confirmed at or above 4.5:1:**
  - body, header, guidance, turn-banner, seat, hand-count and selection text;
  - rule-error and timeline text;
  - score, penalty and final-result text;
  - pozzetto badges;
  - the `Di turno` badge (10.67);
  - the primary (10.70) and secondary (4.87) buttons;
  - the Burraco badges (the lowest is 4.63);
  - wildcard annotations (10.12).
- **Non-text elements** (minimum 3:1):
  - the focus ring `#f6c760`: 11.16 on the page, 3.54 on the lightest felt and 9.79 on panels;
  - the selected-card ✓ circle on the card: 9.05;
  - the active-seat border on the felt: 3.54.
- **Disabled controls** are exempt from the contrast requirement. They still show a dashed outline and muted text at about 5.9:1.
- **Semantics.** Semantics were verified with the component tests listed above and by reading the rendered DOM in the browser pane: the log markup, the extension names, `role="status"` on the notice and focus targets.
- **Scope of the claim.** This is not a WCAG conformance audit or certification. Screen-reader output (NVDA, VoiceOver) was not tested. The live-region and focus semantics follow ARIA practice but were not heard in an assistive technology.

## Deviations from specification

None.

## Known risks and ambiguities

- **Focus on bot-driven round end.** When a bot closes the round, focus moves to the result heading even if the user had focus on a control that still exists, such as a speed radio. The spec requires focus for the active round → result transition, and the whole view is replaced. The only surviving controls are in the header. I judged moving focus to be the clearer contract.
- **Announcement density during bot playback.** Each bot step may update the atomic turn banner, when the player or phase changes, and append one log entry. Both are polite. The banner was required to be preserved, and the log was required to be added. Deduplicating them would need a different announcement design, so I did not attempt it.
- **Guidance fallback.** The draw-phase fallback `Nessuna pesca è disponibile.` shows only if both piles are unavailable in a human draw phase. The engine should not produce that state in normal play.
- **`:has()` selector.** The checked and focused styling of the speed option uses `:has()`. In a browser without `:has()`, the native radio dot and its focus ring still show the state.
- **Contrast figures.** The ratios were computed for the documented layer stacks. Gradients and `backdrop-filter` can make the real background lighter or darker in places. I used the lightest felt stop as the worst case.
- **Test seam.** `flushFocusSelectionChange()` relies on jsdom's current behaviour: focus schedules a 0 ms `selectionchange` timer. If jsdom stops doing this, the helper is a harmless no-op.

## Incidental changes

- The round indicator moved from inside `.game-header__actions` to a direct child of the header, so it stays next to the brand when the actions wrap. Tests query it by text and are unaffected.
- The turn banner is now wrapped in a `.turn-status` container, which is the focus target and also holds the guidance.
- The legacy selector `.rule-error button` became the class `.rule-error__dismiss`.
- The empty-timeline `<p>` now renders after the log container instead of in place of the list.

## Notes for independent review

- `GameTable.tsx`: the `viewKey` / `focusedViewRef` effect. Check that it fires once per view replacement, never on the first mount without `focusContextOnMount`, and is safe under StrictMode's double effects, because the ref makes it idempotent. Also check `turnGuidance`, which reuses the same booleans as the `disabled` props.
- `App.tsx`: `startedFromOnboarding` / `returnedFromMatch` are transient screen flags. They are not persisted, and the M22 envelope is unchanged.
- `BotActionTimeline.tsx`: the log container stays mounted, and the `<li key={index}>` identity is kept for append-only events.
- `styles.css`: check the ≤ 1000 px grid change and the removal of `.table-surface { overflow: hidden }` at 761–1000 px. Check the media-query source order for `.storage-notice--match`, which has its own ≤ 760 px block after the base rule.
- The timer-assertion helper in the playback and App tests: confirm that it only advances 0 ms.
- No M24 animation or visual-polish scope, no M25 E2E tooling, no new dependency and no gameplay, bot, persistence-schema or rules change.
