# Product Roadmap

## Purpose

This document records the agreed product roadmap from the completed gameplay core through the released v1.0/v1.1 cycles and the next planned release cycle.

It exists so milestone preparation does not depend on chat memory. Future milestone specifications must use this roadmap as the planning baseline together with the current repository state.

This roadmap is intentionally higher-level than a milestone specification:

- it fixes the intended sequence, objective, dependency and release role of upcoming milestones;
- it does not freeze distant implementation details;
- the dedicated `docs/milestones/MXX-....md` file remains the authoritative contract once a milestone is prepared;
- if repository evidence shows that the sequence or product scope should change, update this roadmap explicitly rather than silently drifting from it.

## Current baseline

The v1.0 cycle M20–M26 is complete. The exact `v1.0.0` tag is at `98b86e708ffd38fccb1e032447ba923de26975a7`.

The v1.1 cycle M27–M33 is also complete. The exact `v1.1.0` tag and release SHA are `2cbf5327abe0c435009d0431756eba90eb853324`; the post-merge `main` workflow passed canonical verification, GitHub Pages deployment, and the deployed Chromium smoke on that SHA.

M20–M33 below remain the historical released plan. M34–M38 define the next planned cycle.


### Gameplay core complete through M20

M1–M19 established the playable Burraco core and local four-round match lifecycle, including:

- physical-card identity and deterministic deck/state behaviour;
- draw, discard-pile collection, meld play and meld extension;
- sequences, combinations, jokers and pinelle;
- history-aware wildcard replacement in existing sequences;
- pozzetto acquisition;
- round closure and draw-pile exhaustion;
- round scoring and Burraco classification;
- four-round cumulative scoring, Match Points and Victory Points;
- deterministic strategic bots;
- public bot-action timeline;
- stepwise bot playback, speed control and immediate completion;
- rotating round starter.

M20 froze the v1 gameplay rules baseline against the F.I.Bur. Code of Game — January 2026 and confirmed that no gameplay-code correction was required by that audit.

The project therefore moves from **gameplay-core development** to **product and release development** after M20.

## Roadmap principles

1. Do not add gameplay rules merely because another milestone is available.
2. Do not expand bot strategy unless a concrete product or correctness need is identified.
3. Preserve the existing engine/React boundary: game legality remains outside presentation code.
4. Prefer release-critical product work over speculative features.
5. Persistence, UX hardening, release robustness and deployment are part of the path to v1.
6. Corrective milestones such as `M21.1` are allowed when review finds a focused issue that should be fixed before continuing.
7. A future milestone may refine its internal design during preparation, but material changes to objective, order or v1 scope require an explicit update to this roadmap.
8. The roadmap is a sequence and dependency plan, not a calendar guarantee.

## V1 sequence

`M20 ✅ Rules baseline freeze`
→ `M21 Game Shell & Match Onboarding`
→ `M22 Local Save & Resume`
→ `M23 UX, Mobile & Accessibility Hardening`
→ `M24 Game Feel & Visual Polish`
→ `M25 E2E & Release Hardening`
→ `M26 Production Deployment & v1.0`

M21, M22, M23, M25 and M26 are release-critical.

M24 is planned for v1 because the current product is functionally playable but still visually closer to a tested vertical slice than a finished game. It may be reduced in scope only through an explicit roadmap decision; it must not absorb unrelated feature work.

---

# M20 — Rules baseline freeze

**Status:** complete.

**Role in v1:** close the gameplay-core phase and freeze the normative rules baseline.

Completed outcome:

- F.I.Bur. Code of Game — January 2026 established as the v1 gameplay baseline;
- stale M13 source/article references corrected;
- implemented rule families audited;
- no gameplay-code change required;
- physical-table and tournament-only procedures remain outside v1 unless explicitly added later.

M20 is the baseline from which all remaining v1 milestones start.

---

# M21 — Game Shell & Match Onboarding

## Objective

Turn the current direct-to-table vertical slice into a coherent application entry flow that a first-time user can understand and start without knowing the repository or internal game model.

## Planned scope

At milestone preparation, refine the exact UI structure while preserving these product outcomes:

- an initial application/start screen rather than dropping directly into an unexplained active table;
- a clear `Nuova partita` path;
- player-facing explanation of the local configuration: one human, three bots, four smazzate;
- human player naming instead of relying permanently on the current placeholder;
- clear transition from shell/onboarding into the existing match;
- confirmation before intentionally destroying an active match;
- a clear post-match path to start another match;
- no game-rule logic moved into React.

## Dependencies

- M20 rules baseline.

## Definition of Done at roadmap level

A first-time user can open the application, understand the basic match configuration, intentionally start a match, play through the existing game table, and intentionally start over without relying on developer knowledge.

## Explicitly not the goal

- accounts;
- cloud profiles;
- difficulty selection;
- extensive settings;
- persistence;
- visual redesign;
- new gameplay rules.

---

# M22 — Local Save & Resume

## Objective

Make a four-round local match resilient to refresh, tab closure and ordinary browser interruption.

## Planned scope

- versioned local persistence;
- restore/resume of an in-progress or between-round match;
- validation of persisted data before restore;
- safe fallback for corrupt or incompatible saves;
- clear integration with `Nuova partita`;
- persistence of domain/session state that is necessary to resume;
- deliberate exclusion of transient presentation machinery such as timers or callbacks.

The milestone specification must inspect the actual M21 application/session shape before freezing the serialization boundary.

## Dependencies

- M21 product shell and session ownership.

## Definition of Done at roadmap level

A user can leave or refresh the application and later resume the same valid local match without reconstructing transient UI machinery as domain state.

## Explicitly not the goal

- accounts;
- backend;
- cloud sync;
- cross-device saves;
- history/replay archive.

---

# M23 — UX, Mobile & Accessibility Hardening

## Objective

Turn the existing functional responsive UI into a robust interaction surface across supported screen sizes and input/accessibility modes.

## Planned scope

Audit and harden at least:

- narrow mobile layouts, including approximately 320–390 px widths;
- tablet and desktop layouts;
- hand and meld overflow;
- card readability;
- bot timeline;
- score/result presentation;
- header and bot-playback controls;
- touch target sizing;
- keyboard focus and interaction;
- selected/disabled states;
- meaningful accessible naming and live status/error announcements where appropriate;
- contrast and reduced-motion behaviour;
- concise contextual help for the digital game flow.

The milestone is UX hardening, not a visual rebrand.

## Dependencies

- M21 shell.
- M22 persistence should be complete first so resume/error states can be included in the UX audit.

## Definition of Done at roadmap level

Core match actions and lifecycle states remain understandable and operable on the supported mobile/desktop layouts, with obvious interaction states and no major accessibility blocker in the intended local-play experience.

---

# M24 — Game Feel & Visual Polish

## Objective

Make the stable product feel like a deliberate videogame rather than only a functional rules/UI implementation.

## Planned scope

Use lightweight presentation techniques unless repository evidence justifies otherwise:

- subtle card/action transitions;
- clearer draw/discard/meld feedback;
- turn-change emphasis;
- pozzetto-acquisition feedback;
- clearer visual treatment of meld/Burraco state;
- improved round-end and match-end presentation;
- coherent micro-interactions.

## Dependencies

- M23 UX/layout hardening.

## Definition of Done at roadmap level

The main game lifecycle has consistent visual feedback and presentation hierarchy without changing engine semantics or introducing a heavy animation architecture.

## Explicitly not the goal

- new gameplay;
- audio system;
- music;
- particle-heavy effects;
- cosmetic inventory;
- skins;
- large animation frameworks without demonstrated need.

---

# M25 — E2E & Release Hardening

## Objective

Create the release-candidate quality gate around the now-complete v1 product.

## Planned scope

The milestone specification must inspect the current stack before choosing exact tooling, but the intended release outcomes are:

- browser-level E2E coverage, with Playwright as the current preferred direction unless repository evidence argues otherwise;
- start-match smoke path;
- human → bot → human interaction path;
- round transition;
- deterministic four-round lifecycle path;
- match completion;
- save → reload → resume;
- mobile viewport coverage;
- reset/new-match behaviour while bot playback work is pending;
- continued hidden-information protection;
- production-build execution;
- graceful user-facing handling of unexpected bot automation/runtime failure rather than an unhandled application crash.

The known M17–M19 `BotAutomationError` presentation risk is intentionally deferred here unless an earlier milestone makes it release-blocking.

## Dependencies

- M21–M24.

## Definition of Done at roadmap level

The release candidate is protected by both the existing unit/integration suite and browser-level critical-path tests, and known release-blocking failure modes have user-safe behaviour.

---

# M26 — Production Deployment & v1.0

## Objective

Ship the verified client-side game as v1.0 without adding new product scope.

## Planned scope

- final product metadata/title/favicon;
- product-facing README/release documentation;
- production build configuration;
- automated deployment;
- deployed smoke verification;
- release checklist;
- version/tag `v1.0.0`.

GitHub Pages is the current preferred deployment direction because the application is client-side and the repository already uses GitHub Actions. The M26 specification must still verify the final application/build constraints before committing to the deployment implementation.

## Dependencies

- M25 release candidate green.

## Definition of Done at roadmap level

The exact reviewed release candidate is reproducibly built, deployed, smoke-tested and tagged as v1.0.0.

---

# Explicitly post-v1 unless roadmap is changed

The following are not part of the current v1 critical path:

- online multiplayer;
- backend accounts;
- matchmaking;
- cloud save;
- leaderboards;
- tournaments and standings;
- configurable match length;
- bot difficulty levels;
- bot personalities;
- major lookahead / probability / Monte Carlo / ML bot work;
- full replay system;
- general undo;
- profile statistics;
- cosmetic/skin systems;
- music or a full audio system;
- social features.

This list prevented v1 scope creep; it does not prohibit future milestones after v1. The v1.1 cycle below explicitly brings short sound effects into scope at M31. Music and a full audio system remain outside v1.1.

## Roadmap governance

When preparing `M21`–`M26`:

1. inspect current `main`;
2. read this roadmap;
3. inspect `docs/RULES.md`, `docs/ARCHITECTURE.md`, relevant implementation/tests and prior reports;
4. treat the roadmap objective and dependencies as the planning baseline;
5. refine the milestone into a concrete specification using `docs/milestones/TEMPLATE.md`;
6. do not mechanically implement every idea listed here if repository evidence shows a smaller solution achieves the same required outcome;
7. do not silently move future-scope work into the current milestone;
8. update this roadmap explicitly if the intended sequence, release-critical scope or v1 boundary changes.

Once a milestone specification is versioned, that specification is authoritative for implementation and review. This roadmap remains authoritative for the broader sequence and product boundary.


---

# V1.1 — Tabletop UX and game feel

## Product outcome and boundary

The rules-correct and deployed v1.0 game is playable, but its screen still reads as a control dashboard: large header and status blocks, separate meld panels and activity history, click-to-select followed by action buttons, and only the top discard shown. V1.1 aims to make play feel like a coherent, understandable card-game app across desktop, touch and keyboard.

Keep the four-round local match, deterministic engine, bot legality, hidden-information boundary, save format and deployment model. UI collects intent and renders committed state; the engine remains the sole authority for legal moves. Make each milestone visibly useful, but keep rule changes, multiplayer, accounts and speculative bot features out of this cycle. The sequence defines dependencies, not a date guarantee. MXX.1 is for review-discovered corrections, not planned micro-features.

## V1.1 sequence

`M27 ✅ UI Architecture & Visual Direction` → `M28 ✅ Tabletop & Discard Pile UX` → `M29 ✅ Hand Management & Direct Manipulation` → `M30 ✅ Motion & Bot Choreography` → `M31 ✅ Audio & Sensory Feedback` → `M32 ✅ App-wide UX Polish` → `M33 ✅ V1.1 Hardening & Release`.

**Release status:** complete as `v1.1.0` on `2cbf5327abe0c435009d0431756eba90eb853324`.

M27–M32 are product milestones; M33 is the release gate. Do not start motion or audio by decorating an interaction model still due to change. Complete M27–M29 first; M30–M32 depend on the stable table and interaction structure.

### M27 — UI Architecture & Visual Direction

**Outcome:** Implement a new responsive composition with the table dominating the active game, the human hand at the bottom, a teammate to one side, and opponents above/on the other side. Keep stock, discard, pozzetti, melds, turn context and actions clear. Reduce the visual weight of global controls, status copy and bot history; make history available in a compact disclosure while preserving its accessible live log. This is real UI implementation, not a document or mockup milestone.

**Dependency:** deployed v1.0 baseline. Preserve all current actions, save/resume, bot playback, completed-round screens and accessibility contracts. The complete face-up discard spread and reorganization of its detailed card layout belong to M28; direct manipulation belongs to M29. The M27 specification defines measurable layout and behaviour.

### M28 — Tabletop & Discard Pile UX

**Outcome:** Render every card in the face-up discard pile in chronological order within the live table, from oldest to newest, with each identity readable and the newest clearly distinguished. On desktop use an overlapping spread; on narrow screens allow local horizontal scrolling without hiding older cards behind a mandatory popup. Preserve the whole-pile collection action and empty-pile state. Place stock, available pozzetti and team melds as table elements, preserving correct public/hidden information and accessible card descriptions.

**Dependency:** M27 table composition. The view must remain usable for large piles, mobile/touch and keyboard and must not alter game rules.

### M29 — Hand Management & Direct Manipulation

**Outcome:** Allow manual hand reorder with a clear optional auto-sort control, drag/touch intent for discarding, opening a meld and extending a specific existing meld, and immediate explanation for rejected drops. Preserve click/tap multi-selection and accessible keyboard/button paths for every action. Specify multi-card movement carefully before implementation; never let drag state decide legality or enter the saved domain state.

**Dependency:** M28 stable table and drop destinations. Use existing engine commands for commits and rule errors.

### M30 — Motion & Bot Choreography

**Outcome:** Show intelligible source-to-destination card movement for human draw, whole-pile collection, discard, new meld and meld extension, and for public bot actions without revealing hidden cards. Give pozzetto and Burraco events suitable emphasis. Keep animation presentation-only, interruptible on new match/round or unmount and compatible with reduced motion. Prefer CSS, WAAPI or light FLIP techniques unless a concrete need justifies a dependency.

**Dependency:** M29 interaction paths and stable geometry.

### M31 — Audio & Sensory Feedback

**Outcome:** Add short, coherent sound effects for selection, drawing, collecting discards, playing/extending/discarding, invalid action, turn, pozzetto, Burraco and round/match completion. Provide mute and volume controls, locally persisted preferences, and safe browser audio activation. Playback must never gate game commits, block automation or expose hidden bot information.

**Dependency:** M30 motion and event presentation. No background music in v1.1.

### M32 — App-wide UX Polish

**Outcome:** Bring onboarding/new match, resume, settings, contextual help, scores, between-round progression and final result to the table's product standard. Resolve the remaining usability, responsive and accessibility rough edges at approximately 320–390 px, tablet and desktop. Work from observed flows; do not duplicate game logic or add unrelated product features.

**Dependency:** M27–M31.

### M33 — V1.1 Hardening & Release

**Outcome:** Update browser-level critical paths for the new controls and fallbacks, the full discard display, long/empty piles, save/resume, interrupted animation, audio off, reduced motion, keyboard/touch, mobile layouts and a complete match. Complete independent review, canonical verification, deployment and deployed smoke on the exact release SHA; tag that SHA v1.1.0 following docs/RELEASE.md. M33 has no new creative feature scope.

**Dependency:** M27–M32 complete and integrated. A release requires the post-merge deployment gate, not merely a green PR.

## V1.1 governance

Prepare each milestone from current main and this roadmap, inspect only directly relevant code and tests, and version a concrete specification using docs/milestones/TEMPLATE.md. The specification remains the contract for that milestone even when several sequential milestones are delivered on one approved batch branch.

Delivery grouping follows docs/WORKFLOW.md and is risk-proportional rather than automatically one PR per milestone. After M28, the default plan is M29 standalone, M30–M32 as one presentation-focused batch if M29 lands cleanly, and M33 standalone for hardening/release. This grouping may be changed explicitly when repository evidence shows a safer or faster boundary.

Update this roadmap explicitly for any material change to product objectives, order, dependencies or the v1.1 boundary. Batching milestones for implementation/review does not by itself change their product scope or dependency order.

---

# V1.1.1 — Table flow & mobile polish corrective release

## Why this patch exists

Post-v1.1 playtesting found four connected usability problems in the active table:

- the teammate is visually seated beside the human instead of opposite, so the clockwise turn flow is harder to follow;
- public team melds use internal scrolling, making the board state harder to read at a glance;
- normal bot playback advances too quickly to follow comfortably;
- the active table still carries too much dashboard-like chrome and does not yet feel sufficiently direct or polished on mobile.

These are presentation/interaction corrections to the released v1.1 product. They do not change Burraco legality, scoring, team membership, hidden information or the deterministic engine.

## Corrective milestone

`M33.1 Table Flow & Mobile Polish` → release `v1.1.1`.

### M33.1 — Table Flow & Mobile Polish

**Outcome:** make the live table easier to understand without scrolling or mentally reconstructing turn order. The human remains at the bottom; their teammate is opposite at the top; the next/previous opponents occupy the left/right seats so the visual order follows the existing clockwise player order. Public melds remain simultaneously visible through adaptive density rather than ordinary internal scrolling or page-scrolling through one team's meld set, bot playback becomes followable at normal speed, and the active-match chrome is reduced/refined without weakening accessibility or existing actions.

**Dependency:** released `v1.1.0` baseline.

**Release role:** standalone corrective delivery and patch release. After independent review and exact-SHA PR/CI merge, the post-merge production workflow and deployed smoke must be green before tagging that exact SHA as `v1.1.1`.

**Boundary:** no game-rule, scoring, bot-strategy, persistence-schema, match-length, difficulty or PWA work belongs here.

After `v1.1.1`, continue with the v1.2 sequence below.

# V1.2 — Single-player depth & installable app

## Product outcome and boundary

V1.1 established the table interaction model, full discard visibility, direct manipulation, motion, sound, responsive polish and release hardening. The v1.1.1 corrective patch then fixes post-release table-flow, meld-density and bot-pacing issues before new product scope begins. V1.2 should add meaningful replayability and make the browser client behave more like an installable app without opening the much larger online/backend scope.

Keep the rules baseline, deterministic engine, physical-card identity, hidden-information guarantees, one-human/three-bot team structure and static-client deployment model. New setup options must be explicit product choices rather than silent rule changes. Online multiplayer, accounts, cloud sync, leaderboards and a full replay system remain outside this cycle.

The release sequence is:

`M34 Configurable Match Length`
→ `M35 Bot Difficulty Levels`
→ `M36 Guided First Match`
→ `M37 Installable PWA & Offline Resume`
→ `M38 V1.2 Hardening & Release`.

M34, M35 and M37 cross boundaries that justify standalone review gates. M36 is presentation-focused but remains a separate delivery unit by default because M37 is deployment/offline work and should not be batched with it. Reassess only if preparation evidence shows a clearly safer grouping.

### M34 — Configurable Match Length

**Outcome:** let the player choose a supported match-length preset during onboarding instead of hard-coding every match to four smazzate, while preserving the current four-smazzate experience as the default.

The milestone specification must resolve the exact supported presets from the current rules/product model rather than invent arbitrary values. Generalize match lifecycle, completion/progress presentation and tests only as far as required by those presets. Persist the chosen configuration safely and define backward compatibility for existing v1.1 local saves.

**Dependency:** released v1.1.1 corrective baseline.

**Risk boundary:** match lifecycle and persistence. Deliver standalone.

### M35 — Bot Difficulty Levels

**Outcome:** add a player-facing bot-difficulty choice that changes strategy quality without changing legality, turn structure, hidden information or deterministic testability.

The current v1.1 bot strategy is the behavioural baseline and must not silently regress. The milestone specification decides the smallest useful set of difficulty profiles after inspecting the existing candidate/strategy architecture; avoid expensive search/Monte Carlo/ML work unless evidence shows it is necessary.

The selected difficulty belongs to match setup and must resume consistently from a save.

**Dependency:** M34 setup/persistence shape.

**Risk boundary:** bot strategy, hidden information and deterministic behaviour. Deliver standalone.

### M36 — Guided First Match

**Outcome:** make the first complete match understandable without requiring the player to read the full help dialog first.

Add optional, dismissible contextual coaching around the existing phases and controls: what the player can do now, why common actions are unavailable, and the important digital flow around draw/collect, melds, discard, pozzetto and closing. Guidance must derive from already-authoritative state/control availability and must never become a second rules engine.

Keep normal repeat play compact. Any “guidance seen/disabled” preference is presentation data, separate from the authoritative match save.

**Dependency:** M34–M35 final onboarding/setup and active-table behaviour.

### M37 — Installable PWA & Offline Resume

**Outcome:** make the production client installable on supported desktop/mobile browsers and usable after connectivity is lost once the required application assets have been successfully cached.

Add only the PWA/offline infrastructure required for the static client: manifest/app metadata, installable assets, service-worker/cache strategy, safe update behaviour and production/E2E coverage. A previously valid local match should still resume offline because the authoritative save remains browser-local.

Do not introduce a backend, account, cloud sync or network-dependent game state. Development/test environments must avoid stale-cache surprises.

**Dependency:** product flows stable through M36.

**Risk boundary:** build/deployment/cache behaviour. Deliver standalone.

### M38 — V1.2 Hardening & Release

**Outcome:** turn M34–M37 into one verified release candidate and publish `v1.2.0` from an exact reviewed SHA.

Update browser-level critical paths for each supported match-length preset, save compatibility, bot difficulty, guided-first-match opt-out/re-entry behaviour, installability/offline resume and service-worker update/failure behaviour. Run the normal independent review and exact-SHA PR/CI gate, then require the post-merge production workflow and deployed smoke before tagging `v1.2.0`.

M38 has no new creative feature scope.

**Dependency:** M34–M37 complete and integrated.

## V1.2 delivery plan

Default delivery units:

- M34 standalone;
- M35 standalone;
- M36 standalone;
- M37 standalone;
- M38 standalone release gate.

This deliberately uses more isolated gates than the v1.1 presentation batch: M34 touches lifecycle/persistence, M35 touches bots/hidden information, M37 touches deployment/offline caching, and M38 is the release gate. Do not batch merely to reduce ceremony when the resulting diff would cross those boundaries.

The user-facing operating loop remains: one prepare request → implementation in one primary-agent thread → one review request → automatic PR/CI/merge on green. Review-driven fixes stay in the same implementation thread.

## Beyond v1.2 — candidates, not committed roadmap

Do not assign milestone numbers yet. Reassess after v1.2 playtesting.

Candidates include:

- local completed-match history and lightweight statistics;
- deeper/highest-difficulty bot strategy if real playtesting shows the need;
- optional visual themes/card-art refinement;
- configurable rematch/setup shortcuts;
- replay/history features only if their value justifies the additional state model;
- online multiplayer, accounts, matchmaking and cloud sync as a separate major architecture/program rather than incremental v1.x scope.

These are not approved scope until this roadmap is explicitly updated.

