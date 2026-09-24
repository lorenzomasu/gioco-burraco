# Milestone Implementation Report

## Milestone

- Milestone: M24 — Game Feel & Visual Polish
- Branch: `milestone-24-game-feel-visual-polish`
- Implementer: Claude Code
- Specification HEAD at start: `72d0060` (`docs: specify game feel and visual polish milestone (M24)`)

## Verification

- `npm run verify`: passed. This was the final run, after this report was written and before the commit. Exit code 0.
- Tests: 553 passed across 29 test files.
  - Baseline before M24: 536 in 28 files.
  - Added: the new file `src/components/GameTableFeedback.test.tsx` with 17 tests.
  - No existing test was deleted. One existing test helper changed; see "Tests added or changed".
- Build: passed (`tsc -b && vite build`).
- `git diff --check`: passed. It ran as part of `npm run verify`. `git diff --cached --check` also passed on the staged milestone diff, which includes the new files and this report.
- Working tree at completion: clean after the milestone commit.

## Behaviour implemented

- **Presentation-only feedback layer** (`src/components/tableFeedback.ts`).
  - The `GameTable` session gains one `feedback` value. It describes the latest committed change. It is never stored in `GameState`, `MatchState` or the M22 save.
  - A human cue is built only after the engine call has returned. It comes from the control that was used, plus the public before/after state (new meld index, current player/phase, `hasTakenPozzetto`).
  - The newly drawn card's ID comes from the engine's own `turn.acquisition.cardIds`, and only for the human's own stock draw.
  - A bot cue comes only from that step's public `BotPublicActionEvent`s. Turn and pozzetto cues compare public, durable state only.
  - A `GameRuleError` path never reaches the cue code, so a rejected action produces no cue and leaves any earlier cue untouched.
  - There are no timers, listeners or effects. A cue is rendered as `data-feedback` / `data-feedback-cycle` attributes, and CSS animations end in the element's static state.
  - `data-feedback-cycle` alternates `a`/`b` on every new cue. Each effect has two identical keyframe sets, so an element cued by two consecutive changes restarts its animation without being remounted. Focus, live regions and DOM identity are unaffected.
- **Human action feedback (AC1–AC4).**
  - Stock draw: a ring and pop on the stock, and a rise-in on the newly drawn card only.
  - Discard-pile collection: a ring on the discard source and one inset glow on the whole hand. The collected cards get no per-card animation.
  - `Cala`: rise-in and ring on the new meld.
  - Extension: a ring on the extended meld only.
  - Discard: ring and pop on the new visible discard top.
  - The committed state renders in the same commit. Card selection is unchanged and has no delay.
- **Bot playback (AC5).** Each committed step cues:
  - the acting bot's seat, with a quieter `bot-step` ring;
  - the affected public pile or meld, from the step's events;
  - the newly appended timeline `<li>`, with a mount-only fade. Existing entries keep their node and never replay.

  No card face is cued for a bot, and bot timing and events are unchanged.
- **`Completa subito` (AC6).** Immediate completion still applies the same chain steps synchronously. The resulting session's cue is set to `null`, so nothing cosmetic remains once the jump is made.
- **Turn and phase (AC7).**
  - The turn banner gets `data-feedback="player"` or `"phase"`. Only attributes change, so the polite atomic live region is never remounted or duplicated.
  - A newly active bot seat, or the human area when the turn returns, gets a `turn` ring.
  - The `Di turno` badges get a mount-only scale-in.
  - `aria-current`, labels and focus are unchanged.
- **Pozzetto (AC8).**
  - When a team's `hasTakenPozzetto` changes from false to true in a committed step, that team's meld area, its pozzetto status and the central pozzetti counter get a positive cue.
  - `Pozzetto preso` stays as text. It gains a decorative `✓` (`aria-hidden`) and a tinted outline.
  - The cue does not repeat on later steps.
- **Burraco (AC9).**
  - The badge now reads `Burraco Pulito` / `Burraco Semipulito` / `Burraco Sporco`. The original label text is kept, and a decorative shape per classification (`★` / `✦` / `◆`, `aria-hidden`) is added.
  - The badge is stronger, with a shadow and bolder weight, and it scales in when it first appears. It is keyed by classification, so a change replays the treatment.
  - The meld frame is tinted per classification through `data-burraco`.
  - The badge background and text colours are unchanged, so the M23 contrast figures still hold. `classifyBurraco` is untouched.
- **Results (AC10).**
  - Round result:
    - a decorative suit emblem and a rise-in panel;
    - negative team totals use the existing penalty colour;
    - the closing team's score card gets a `Chiusura` text tag and a gold frame, taken from the domain `closingTeamId`.
  - Match summary: a decorative, `aria-hidden` four-step round track next to the existing `Dopo N smazzate` text.
  - Final result:
    - the outcome line (`Prima la Squadra N.` / `Parità esatta.`) is now the headline, with a decorative `♛` or `=`;
    - Match Points follow it;
    - only the domain `leadingTeamId`'s VP card is emphasised, and a tie emphasises neither.

  All values are rendered exactly as before, and focus still lands on the result heading.
- **Table, cards and controls polish.**
  - A felt rail on the table surface.
  - Hover lift and press feedback on piles, and a stacked-edge look on the stock.
  - A subtle inner edge on cards.
  - Highlight and press states on primary and secondary buttons. The fills are unchanged.
  - Active seat and meld-area depth.
  - A frame for meld containers.
- **Reduced motion (AC15).** The existing global rule now also forces `animation-delay: 0s`. Every M24 animation and transition therefore collapses to 0.01 ms with no delay, and each ends in its static state.
- **Documentation.** `docs/ARCHITECTURE.md` gained a "Transient visual feedback" subsection that records the cue's domain boundary, its lack of timers, the cycle restart and its cleanup. `docs/RULES.md` and `docs/ROADMAP.md` are unchanged.

### Tests added or changed

- `src/components/GameTableFeedback.test.tsx` (new, 17 tests):
  - no cue on a fresh or restored table;
  - stock draw: the stock plus only the drawn card, with the committed hand count and no focus change;
  - discard-pile collection: the discard source plus the hand, and no per-card cue;
  - `Cala` cues the created meld; an extension cues only the extended meld, with the cycle flipped;
  - discard: the discard top, then the next bot's seat `turn` with `aria-current`, and the banner `player`;
  - a rejected `Cala` produces no cue, and after a successful draw a rejected action leaves the existing cue attributes identical;
  - bot steps: stock `draw` plus seat `bot-step`, no card cue and no hidden stock card rendered, then discard plus the next seat `turn`;
  - a bot meld plus pozzetto al volo: the team area, the status and the counter cue while `Pozzetto preso` is shown, and no repeat on the next step;
  - a human pozzetto cues team 1 only;
  - `Completa subito` leaves no cue and no pending timer;
  - `Inizia smazzata 2` starts without a cue;
  - the turn banner keeps the same live-region node, one polite atomic region, cycles `a` → `b`, and focus stays on a speed radio;
  - Burraco `clean` / `semi-clean` / `dirty` / none map one-to-one to `classifyBurraco`, and the label text and `aria-hidden` icon are present;
  - the final leader emphasis for team 1 and team 2 matches the domain outcome, and an exact tie emphasises neither;
  - on a closure result only the closing team is tagged, and the round track is `aria-hidden`.
- `src/components/GameTablePlayback.test.tsx`: the `renderedOutcome()` helper, used by the stepped/fast/immediate equivalence and speed-change tests, now removes `data-feedback*` attributes before comparing.
  - Stepped playback leaves the last step's cue, while immediate completion clears it by design (AC6).
  - Without the change, the equivalence test failed only on those attributes.
  - The comparison of committed table state and timeline is otherwise unchanged. AC6 is asserted separately in the new file.
- **Mutation checks** (run locally, then reverted). Each change below was caught:
  - keeping the cue after `Completa subito`: 1 failure;
  - dropping the collect cue: 1 failure;
  - not deriving bot-step cues: 3 failures;
  - a pozzetto cue on every step instead of only the transition: 1 failure;
  - no cycle alternation: 3 failures.

## Responsive and rendered verification

- **Method.** I ran the Vite dev server locally and opened the app in the Claude desktop app's built-in browser pane, which uses a real Chromium engine. I emulated each width with the pane's viewport tool. At each width a script played real UI turns: it drew from the stock, selected a card and pressed `Scarta e passa`, with bot playback at `Veloce`. During playback it polled every 40–60 ms. Each poll ran an in-page audit that checked:
  - `scrollWidth` against `clientWidth`;
  - every element extending past the viewport that is not inside a local horizontal scroller;
  - every button, text input and speed label smaller than 43.5 px;
  - the currently cued elements.

  I also inspected screenshots.
- **Widths.** 320×740, 360×780, 390×844, 768×1024 and 1440×900 (desktop). A 1024 px pane width was also used during the first checks.
- **Cue states observed.** Over the runs, every width showed these cues:
  - turn banner `phase` and `player`;
  - stock `draw`;
  - `received` card;
  - discard pile `collect` and `discard`;
  - seat `turn` and `bot-step`;
  - human area `turn`;
  - `meld-created`, and `meld-extended` at 390, 768 and 1440 px.

  A pozzetto cue did not occur in the rendered sessions and is covered by the component tests. At 320 px a full four-round match was played through, including `Burraco Sporco` and `Burraco Semipulito` badges, round results, the between-round summary, the closure `Chiusura` tag and the final leader result.
- **Results.**
  - Every audit at every width reported no document-level overflow and no undersized target.
  - At 360 px a selected, keyboard-focused hand card kept 11 px above and 10 px beside it, against a 6 px ring. This matches M23.
- **Lifecycle focus.**
  - Onboarding → the turn status.
  - Round end → `#round-complete-title`, including the final round.
  - `Inizia smazzata 2` → the turn status.
  - Draws, discards and bot steps did not move focus.
- **`Completa subito`.** Right after a human discard, with cues present, clicking it removed every `data-feedback`, removed the button and returned the turn to the human.
- **Reduced motion.**
  - The pane cannot emulate `prefers-reduced-motion`. I read the page's own parsed `@media (prefers-reduced-motion: reduce)` rule from `document.styleSheets` and applied its contents unconditionally, then triggered a discard and a bot turn.
  - `document.getAnimations()` showed every cue, mount and transition animation with duration 0.01 ms and delay 0. After the next rendered frame none was running.
  - The `Di turno` badge was at opacity 1, the ring overlays were at opacity 0, and all text states were present.
- **Limitations.**
  - The emulated viewport is desktop Chromium, not a physical phone. Real touch, iOS Safari and Firefox were not checked.
  - Reduced motion was verified through the page's own rule, not through a real OS setting.
  - The pane was sometimes hidden. While hidden, Chromium does not advance animation time, so animation timing was only inspected with rendering active.
  - jsdom tests do not prove geometry or animation, and none claims to.

## Deviations from specification

None.

## Known risks and ambiguities

- **Cue attributes persist until the next committed change.** When there are no timers, a cue's attributes stay on the element after its animation has finished, until the next commit, a fresh session or `Completa subito` replaces them. The animation runs once and ends in the static state, so nothing stays visibly highlighted. Anyone inspecting the DOM will still see the last cue. I chose this over effect timers, so there is nothing to clean up.
- **Human pozzetto and turn cues compare before/after public state.** For human actions, `turnChange` and newly taken pozzetti are derived by comparing the committed `GameState` with the previous one. The spec allows this for cosmetic data the UI can derive safely. Bot actions never use state comparison for the action itself: they use events only. Pozzetto and turn cues use the same durable-state comparison for bots and humans.
- **Timeline entry animation on the result view.** The completed-round view renders `BotActionTimeline` at a different tree position, so its entries mount fresh and all fade in once, briefly. Within one view, existing entries never replay. The log's semantics are unchanged.
- **Mount animations on restore.** A restored match plays the short `badge-in` for the badges already present. No cue attribute is set, so no action feedback plays.
- **The final-result reading order changed.** The outcome line (`Prima la Squadra N.` / `Parità esatta.`) now comes before Match Points and VP. The text and values are identical.
- **Burraco badge text.** The visible and accessible badge text is now `Burraco Pulito` and so on. The original label is still present as its own text. No test or rule depends on the old text.
- **Individual `scale` / `translate` properties.** The mount animations use these, so they compose with existing transforms such as the positioned seat badge. Browsers without support would show the elements without that entry motion. The static state is unaffected.
- **Contrast.** No existing text or background colour pairing was changed. New text elements reuse existing pairings: the `Chiusura` tag uses the `Di turno` badge colours, and negative totals use the existing penalty colour. The new gradients and translucent tints sit behind unchanged text, and were not re-measured numerically.

## Incidental changes

- `PlayingCard` and `PlayerSeat` accept an optional `cue` attribute object, and `MeldArea` an optional `feedback`. Callers that omit them are unaffected.
- The final-result outcome paragraph moved above Match Points.
- `.meld__meta` now wraps, so a longer Burraco badge never forces overflow.
- The reduced-motion rule adds `animation-delay: 0s !important`.

## Notes for independent review

- `GameTable.tsx`:
  - `commitAction` builds the cue only after `action()` returns, and the `catch` path is unchanged.
  - `advanceBotPlayback` and `completeBotPlayback` handle the cue as described above.
  - `seatCue` gives `turn` priority over `bot-step`.
- `tableFeedback.ts`: the only bot input is `step.events` plus public before/after `GameState`. `receivedCardIds` is set only for a human stock draw.
- `styles.css`, "M24 transient feedback" block:
  - cycle-b selectors must match the specificity of their cycle-a counterparts;
  - the ring overlay uses `inset: 0` plus `box-shadow`, so it never adds scrollable overflow;
  - check the reduced-motion block.
- `GameTablePlayback.test.tsx`: the `withoutFeedbackCues` normalisation in `renderedOutcome()`.
- No change under `src/game`, `package.json`, `docs/RULES.md` or `docs/ROADMAP.md`. No new dependency and no M25 tooling.
