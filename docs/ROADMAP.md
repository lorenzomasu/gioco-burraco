# V1 Roadmap

## Purpose

This document records the agreed product roadmap from the completed gameplay core to the first production release.

It exists so milestone preparation does not depend on chat memory. Future milestone specifications must use this roadmap as the planning baseline together with the current repository state.

This roadmap is intentionally higher-level than a milestone specification:

- it fixes the intended sequence, objective, dependency and release role of upcoming milestones;
- it does not freeze distant implementation details;
- the dedicated `docs/milestones/MXX-....md` file remains the authoritative contract once a milestone is prepared;
- if repository evidence shows that the sequence or product scope should change, update this roadmap explicitly rather than silently drifting from it.

## Current baseline

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

This list prevents scope creep; it does not prohibit future milestones after v1.

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

Once a milestone specification is versioned, that specification is authoritative for implementation and review. This roadmap remains authoritative for the broader v1 sequence and product boundary.
