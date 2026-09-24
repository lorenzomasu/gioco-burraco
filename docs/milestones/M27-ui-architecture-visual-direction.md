# Milestone 27 — UI Architecture & Visual Direction

## Goal

Implement the first v1.1 table redesign in the running app. The active game must read as a card table with the human hand anchored below, opponents and teammate visibly positioned around the shared surface, and secondary status/controls no longer competing with the cards. This milestone changes layout, visual hierarchy and the presentation of activity history; it preserves every v1.0 action and game state transition.

## Context

The current active view in src/components/GameTable.tsx renders a large shellHeader, a three-column table-surface, a turn banner and guidance block, separate pile and meld areas, a bordered active-player panel and a full-width BotActionTimeline after the table. The CSS lives in src/styles.css. The human is player-1; existing relativeSeats puts player-3 (teammate) on top and opponents at left/right. Clicking cards and using Cala, Scarta e passa or the meld extension button is the existing interaction model. The discard control shows only game.discardPile.at(-1); M28 will replace that presentation.

Important existing contracts: src/components/PlayingCard.tsx native card buttons and aria-pressed; src/components/BotActionTimeline.tsx mounted incremental role=log; src/components/tableFeedback.ts cues; src/App.tsx shell save/resume; docs/ARCHITECTURE.md focus, live-region, playback and engine boundaries; docs/ROADMAP.md v1.1 sequence. Inspect relevant GameTable, PlayerSeat, MeldArea, existing UI tests and browser paths before editing.

## In scope

- Recompose the active-match view into a tabletop-first responsive layout; adjust the existing components and CSS rather than introducing a separate static mockup.
- Show human at the bottom, teammate at the left, opponents at top and right at desktop widths. Make teammate/opponent roles legible in text in addition to team numbering. Seat remapping is visual only: IDs, team assignment and starting order remain unchanged.
- At narrow widths, adapt the same semantic grouping so all three bots, the central public area, team melds and the human hand remain identifiable and operable without page-level horizontal overflow. Do not force a four-seat desktop grid into a 320 px viewport.
- Keep the stock/discard controls and pozzetti count prominent near the center, with a clear current-turn/phase indicator; reduce persistent guidance and header visual weight while keeping contextual help available when useful.
- Keep selected-card count and the existing human actions discoverable adjacent to the hand; the human hand, table and available actions must not be buried under a dashboard of panels.
- Move the bot activity history into a compact, operable disclosure associated with the table. Keep the underlying log mounted and its entries ordered and polite announcements correct even when visual history is collapsed. Preserve the history on completed-round view.
- Refine the existing green/felt visual language, spacing, typography scale and card/seat contrast as needed to produce a coherent app-level hierarchy. Changes must be real code on the active table, not just a design document.

## Out of scope

- Full chronological discard spread and redesigned pile-specific interaction (M28); the existing top card/count and whole-pile action remain in M27.
- Manual reorder, auto-sort, drag/drop, alternate move semantics or removal of the button/click interaction paths (M29).
- Source-to-destination card animation (M30), sound/audio controls (M31), onboarding/scoreboard redesign (M32), and release/tagging (M33).
- Game engine, bot strategy, scoring, match lifecycle, save schema, hidden card visibility or new runtime UI/animation dependencies solely for this milestone.

## Required behaviour

### Table hierarchy and seating

The table is the main screen content; on a common desktop viewport (about 1280–1440 by 800–900) the player can see the three bot seats, stock/discard and human hand/action area in one coherent view without having to pass through large administrative panels first. The top opponent, left teammate, right opponent and bottom human are visually and textually distinguishable. Derive teammate/opponent labels from teamId relative to the human's team; do not hardcode a false identity into PlayerSeat or change domain player order.

Show a concise but unambiguous current player and phase. A turn change remains announced once through the established polite status, including when a bot is active. Preserve the existing no-focus-on-first-load policy and focus transitions for onboarding → match, fresh round and completed result. Keep the error alert and bot failure recovery message accessible and visible.

The stock and discard remain native clickable controls with current eligibility and accessible names/counts. Pozzetti, both teams' melds and Burraco annotations retain their content, differentiation and legibility. Maintain local scrolling for long hands/melds without clipping selectable cards or introducing viewport-wide sideways scrolling.

### Secondary controls and history

Keep bot speed, Completa subito (when available) and Nuova partita usable but visually secondary to the table. Do not silently hide active controls behind a non-discoverable affordance. If reorganized into a menu/disclosure, its open state must be keyboard/touch operable with clear names.

The bot history disclosure has an evident label and expanded/collapsed state. The activity log node stays mounted across toggles; new public bot events append in order and are announced only once, including while visual history is collapsed. If native details or CSS hiding suppresses announcements in the target browsers, choose an accessible mounted log representation that avoids duplicate announcements. Do not expose hidden bot information.

### Responsive and preservation

At 320, 375–390, 768 and desktop widths, cards, controls and seat labels remain readable, reachable and non-overlapping; the document has no unintended horizontal scroll. Long names and many melds do not break layout. The existing click/tap selection → Cala/Scarta/extend actions, stock/whole-pile acquisition, stepwise/fast/immediate bot playback, save/resume and round advancement retain their behaviour. Presentation-only changes never alter game legality or persisted match data. Respect keyboard focus visibility, adequate touch targets, contrast and prefers-reduced-motion.

## Acceptance criteria

- [ ] AC1 — Active match uses a materially new tabletop-first composition in the real app, with bottom human, left teammate, top/right opponents, clearly indicated teams and current turn; domain seating/teams are unchanged.
- [ ] AC2 — Stock, top discard/count, pozzetti, both meld areas, selected cards and original move controls remain usable and visually legible; all existing legal/illegal move feedback still works.
- [ ] AC3 — Header/guidance/bot activity no longer appear as dominant full-width dashboard blocks; secondary controls remain easy to find. History opens and closes by touch/keyboard without losing entries or repeating polite log announcements.
- [ ] AC4 — At representative 320, 375/390, 768 and desktop viewports no body-level horizontal overflow, clipped essential controls or blocked hand/meld interaction occurs; large hand/meld content has usable local overflow.
- [ ] AC5 — Focus moves, status/error announcements, native disabled controls, card accessible names/selection state, bot automation failure, reduced-motion and save/resume continue to work as before.
- [ ] AC6 — No changes under src/game or to the save schema; no M28–M33 features or new runtime dependencies are introduced.

## Required tests

Update focused GameTable/PlayerSeat/BotActionTimeline tests for seat identity and active-turn labels, disclosure operability and stable live-log node/ordered entries. Test at least one real action path (draw → select → discard or meld) and a bot step/complete action with collapsed history so regression in controls or public events is caught. Preserve existing App/persistence and error boundary tests. Extend the relevant browser smoke path only where existing selectors or new disclosure interaction require it; avoid screenshot snapshots coupled to incidental CSS. Record manual/rendered inspection at desktop, 768, 375 and 320 px, plus keyboard and reduced-motion inspection, in the implementation report.

## Documentation updates

Adjust docs/ARCHITECTURE.md only where its UI presentation contract changes (seat mapping, bot history display), retaining the mounted live-log and focus invariants. Do not change docs/RULES.md: M27 changes no Burraco behaviour. Keep README and release docs unchanged unless an existing product-facing statement becomes false.

## Verification

Before completion, run npm run verify on the milestone branch. Report exact commands/results and any browser-dependent live-region limitations observed during manual checks.

## Completion conditions

M27 is complete only when the redesigned active table is implemented, all acceptance criteria are met, relevant tests and canonical verification pass, documentation agrees with the UI, no future-scope behaviour is added, and the implementation report under docs/milestones/reports/ records the tested viewports, deviations and residual risks. Commit and push this branch; do not merge it into main.
