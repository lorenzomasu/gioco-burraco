# Milestone 32 — App-wide UX Polish

## Goal

Bring the rest of the application to the same product standard as the M27–M31 tabletop: onboarding, resume feedback, settings/help, new-match confirmation, match score context, between-round progression and final result should feel like one coherent app rather than separate utility screens. Resolve the remaining responsive and accessibility rough edges across approximately 320–390 px mobile, tablet and desktop without changing Burraco rules or duplicating game logic.

## Context

M32 is the final implementation checkpoint of the approved M30–M32 presentation batch and must build on the same branch after M30 and M31.

The current shell already provides:

- onboarding with human-name entry;
- automatic resume of a valid M22 local save;
- a slim game header with round indicator, bot-speed controls and `Nuova partita`;
- native `window.confirm` before abandoning an in-progress match;
- contextual turn guidance;
- round score, cumulative score, between-round CTA and final result;
- M27–M29 responsive/accessibility contracts;
- M30 motion and M31 reusable audio preferences/controls.

The remaining work is integration and polish, not new game functionality.

## In scope

- A coherent reusable app-level settings surface using existing bot-speed state and M31 audio controls.
- A concise app-level help/how-to-play surface available from onboarding and active/completed match views.
- Product-quality in-app confirmation for abandoning an active match.
- Clear feedback when an existing valid match has been resumed.
- A compact match-score context during active play, derived from existing match helpers.
- Visual/information-hierarchy polish for onboarding, between-round screens and final result.
- Clear relative team labels where useful (human team versus opponents) without changing team identity.
- Responsive/accessibility fixes at approximately 320–390 px, tablet and desktop.
- Focused tests and architecture updates for changed shell/focus contracts.

## Out of scope

- New Burraco rules, scoring logic, bot strategy or game-engine behaviour.
- New save fields or a match-save schema version change.
- Accounts, cloud save, online play, difficulty selection, configurable match length, statistics, achievements, cosmetics or replay.
- Background music.
- A rules encyclopedia or tournament procedures not implemented by the game.
- Broad E2E/release hardening; M33 owns the release matrix, deployment and v1.1.0 tag.
- A visual rebrand that replaces the established M27 tabletop direction.

## Required behaviour

### 1. Shared settings surface

Provide one reusable app-level settings experience accessible from:

- onboarding;
- active match;
- completed-round/final-result views.

It must expose:

- **Bot speed** using the existing shell-owned `BotPlaybackSpeed` state and the existing normal/fast semantics;
- **Sound** using the M31 mute + volume control/preferences.

The final M32 UI should remove duplicate/provisional settings controls that are no longer needed once the shared settings surface exists.

Requirements:

- opening settings never changes game state;
- changing bot speed preserves the existing timer-reschedule semantics;
- changing audio preferences preserves M31 local persistence;
- settings state never enters `GameState`, `MatchState` or the match save;
- opening/closing settings is keyboard-accessible, Escape-closeable and returns focus to the invoking control;
- use a robust accessible dialog/disclosure pattern. If a modal is used, background controls must not remain accidentally operable by keyboard while it is open.

### 2. App-level help

Provide a concise `Come si gioca` / help surface accessible from onboarding and the game shell.

It should explain only the implemented digital flow:

- draw from stock or collect the discard pile;
- select cards and use buttons or M29 drag/touch direct manipulation;
- create a new meld or extend an own-team meld;
- discard to end the turn;
- what pozzetto and Burraco indicators mean at a high level;
- bot turns and `Completa subito`;
- the four-smazzate local match and automatic local resume;
- keyboard/button alternatives remain available when drag is not used.

Do not duplicate detailed legality rules in React. Static help text must stay consistent with `docs/RULES.md` and existing controls. It must not claim behaviours the engine does not implement.

The help surface follows the same focus/Escape/return-focus requirements as settings.

### 3. New-match confirmation

Replace the native `window.confirm` abandonment prompt with an in-app accessible confirmation surface for an in-progress match.

Required behaviour:

- `Nuova partita` during an in-progress/between-round match opens confirmation instead of immediately leaving;
- **Annulla** closes the prompt and changes nothing;
- **Abbandona partita** invokes the existing leave/reset path exactly once, clears the active save through the existing shell path and returns to onboarding;
- a completed match still allows `Gioca ancora` without destructive confirmation;
- while confirmation is open, pending bot automation must not be accidentally committed by interacting with background controls. It is acceptable for the already scheduled bot timer to continue only if the implementation proves state cannot surprise/replace the confirmation; otherwise pause/cancel presentation scheduling while the modal is open without changing domain state;
- confirmation state is transient presentation state and is never saved.

Update the architecture documentation because this intentionally replaces the prior native-confirmation invariant.

### 4. Resume feedback

A valid M22 save still resumes directly into the match; do not add a second start/resume decision screen.

On a successful restore:

- show a concise non-blocking status such as `Partita ripresa · Smazzata N/4`;
- do not move focus on initial page load, preserving the existing restore focus invariant;
- do not announce hidden cards or internal save details;
- the notice is transient UI only and must not cause an extra save write;
- it may be dismissible or naturally disappear, but must not require dismissal before play.

Invalid/corrupt save behaviour remains the existing M22 fallback to onboarding with its current notice.

### 5. Match score context during active play

During an active round, expose a compact cumulative match-score summary derived from existing domain helpers such as `calculateCumulativeScores`.

Requirements:

- show only settled-round cumulative points; do not invent a live partial-round score;
- label the human player's team as `La tua squadra` (or equivalent clear text) and the other team as `Avversari`, while preserving the canonical Team 1/Team 2 identity where useful;
- before any round is settled, represent the cumulative score correctly as 0–0 / no completed rounds;
- the summary must not compete visually with the table or become another large dashboard block;
- no scoring formula is duplicated in React.

### 6. Onboarding polish

Retain the existing simple flow: name → `Inizia partita`.

Polish the screen so it visually belongs to the tabletop product:

- clear brand/title hierarchy;
- concise explanation of 1 human + 3 bots + 4 smazzate;
- visible access to Settings and Help;
- concise note that an active match is saved locally in the browser;
- existing trimmed non-empty name validation remains unchanged;
- no extra setup options are introduced.

### 7. Between-round progression

Keep the existing authoritative `RoundScore`, settled result, cumulative score and `advanceMatch` path.

Improve hierarchy so the player can immediately understand:

- why the round ended;
- this round's score;
- cumulative match score;
- progress through 4 smazzate;
- the single primary action to start the next smazzata.

Do not pre-generate the next round or expose hidden next-round data for preview.

Bot history remains available through its existing accessible disclosure but must not visually dominate the progression screen.

### 8. Final result polish

Use `getFinalMatchOutcome` and existing cumulative/VP data only.

The final state should clearly communicate:

- whether the human's team won, lost or tied, derived only from `outcome.leadingTeamId` versus the human player's team;
- final cumulative Team 1/Team 2 totals;
- Match Points and Victory Points already provided by the domain layer;
- team composition/names where it improves orientation;
- one clear `Gioca ancora` action returning to onboarding while retaining the last entered player name.

Do not create a second winner/scoring calculation in presentation code.

### 9. Contextual guidance

Keep the existing turn/phase guidance as a concise actionable hint. It may be shortened or visually deemphasized now that global Help exists, but:

- it must still reflect enabled/disabled controls rather than an independent legality check;
- bot-automation failure guidance remains visible and distinct;
- no important instruction may exist only in hover text or animation/audio.

### 10. Responsive polish

Audit and fix the integrated M30–M32 UI at minimum around:

- 320 px width;
- 390 px width;
- tablet-sized layouts;
- desktop/wide desktop.

Required outcomes:

- no page-level horizontal overflow caused by header, settings/help/confirmation, score summary or result content;
- hand, discard and meld areas keep their intentional local overflow behaviour;
- settings/help/confirmation fit within the viewport and remain usable with browser zoom;
- primary controls keep practical touch targets;
- the active table remains visually dominant on desktop;
- no JavaScript viewport branching is introduced for layout.

### 11. Accessibility and focus

Preserve all existing M23/M27–M31 accessibility contracts and additionally ensure:

- Settings, Help and confirmation have programmatic names/headings.
- Opening an overlay moves focus into it; closing returns focus to its invoker when that invoker still exists.
- Escape closes Settings/Help and cancels confirmation; Escape must never confirm abandonment.
- Major view replacement focus rules remain unchanged: first load/restore does not steal focus; onboarding→match/fresh round/completed round still moves focus as documented.
- Resume/status text uses an appropriate live/status pattern without duplicate repeated announcements.
- Motion remains decorative and audio remains optional; neither is required to understand any state.

## Acceptance criteria

- [ ] AC1 — One shared Settings surface is reachable from onboarding and all match/result states and controls existing bot speed plus M31 mute/volume without touching domain state.
- [ ] AC2 — One shared Help surface is reachable from onboarding and match/result states and accurately describes only implemented controls/flow.
- [ ] AC3 — In-progress `Nuova partita` uses an accessible in-app confirmation with safe cancel/confirm semantics; completed `Gioca ancora` remains non-destructive.
- [ ] AC4 — A valid restored save still mounts the match directly, shows a concise resume status and does not steal initial focus or cause an extra persistence write.
- [ ] AC5 — Active play shows a compact cumulative score derived from settled results/domain helpers, clearly oriented to the human team, with no partial-round scoring invention.
- [ ] AC6 — Onboarding retains the single name→start flow, adds settings/help/local-save context and introduces no new match configuration.
- [ ] AC7 — Between-round presentation clearly separates round result, cumulative match progress and the single next-round action without changing `advanceMatch`.
- [ ] AC8 — Final result clearly expresses win/loss/tie relative to the human team using `getFinalMatchOutcome`, preserves MP/VP data and provides one `Gioca ancora` action.
- [ ] AC9 — Contextual turn guidance remains derived from rendered action availability and bot-failure state rather than duplicated game legality.
- [ ] AC10 — Integrated UI has no new page-level horizontal overflow at approximately 320 px and 390 px and remains coherent on tablet/desktop.
- [ ] AC11 — Overlay focus, Escape and focus-return behaviour are keyboard-accessible and do not break existing major-view focus rules/live regions.
- [ ] AC12 — No `src/game` semantics, bot legality, scoring formula, match-save schema or hidden-information boundary changes.
- [ ] AC13 — No M33 release/deployment/version scope is implemented early.

## Required tests

Add or update deterministic unit/component tests covering at least:

- Settings open/close/focus return and integration with existing bot-speed + M31 audio preferences;
- Help availability/content anchors from onboarding and game/result surfaces;
- new-match confirmation cancel/confirm behaviour, including no duplicate leave/reset and no accidental background action;
- restored-match status without initial focus movement or extra save writes;
- active cumulative score using existing helpers and correct human-team orientation;
- onboarding preserving name validation and start semantics;
- between-round next-round action still using the existing lifecycle path;
- final human-team win/loss/tie presentation derived from existing outcome data;
- overlay Escape behaviour;
- regression protection for bot timeline, live regions and major view focus.

Add focused Playwright coverage for integration behaviours that benefit from a real browser:

- one 320–390 px viewport smoke covering the integrated header/settings/help/table without page-level horizontal overflow;
- new-match confirmation keyboard/Escape flow;
- settings/help focus return;
- restored-save status;
- audio-muted and reduced-motion integration may be sampled here only as needed to prove M32 integration, not to duplicate the full M33 matrix.

At the M32 checkpoint, after focused tests are green, complete the full approved batch gate with `npm run verify`.

## Documentation updates

- Update `docs/ARCHITECTURE.md` for the final app-shell settings/help ownership, in-app destructive confirmation, resume status and any focus invariant intentionally changed.
- Do not modify `docs/RULES.md` unless implementation discovers a genuine documentation inconsistency; M32 itself changes no game rule.
- Do not change the active-match save schema.
- The M27–M33 roadmap objective/order remains unchanged unless repository evidence requires an explicit material update.

## Verification

M32 closes the approved M30–M32 implementation batch.

After M30 and M31 have their own distinct checkpoint commits and M32 focused checks pass:

1. review the complete batch diff locally;
2. run the canonical repository gate once:

`npm run verify`

3. fix any batch-caused failures and rerun the necessary checks;
4. create `docs/milestones/reports/M30-M32-implementation.md` from `docs/milestones/reports/BATCH-TEMPLATE.md`;
5. record each milestone commit + targeted checks and the final batch verification;
6. commit the M32 implementation and the final batch report without squashing away milestone traceability;
7. push the shared batch branch;
8. stop before opening/merging a PR unless the review workflow is being executed by ChatGPT.

## Completion conditions

The M30–M32 batch implementation is ready for independent review only when:

- M30, M31 and M32 acceptance criteria are satisfied in order;
- each milestone has a distinct implementation checkpoint commit;
- all required targeted tests pass;
- `npm run verify` passes on the complete batch;
- `docs/ARCHITECTURE.md` is consistent with the integrated motion/audio/shell behaviour;
- `docs/milestones/reports/M30-M32-implementation.md` records final evidence, deviations/risks and review focus;
- no unrelated refactor or M33 release scope was introduced;
- the batch branch is pushed and the implementer stops before merging to `main`.
