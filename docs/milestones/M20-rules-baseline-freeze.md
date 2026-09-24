# Milestone 20 — Rules baseline freeze

## Goal

Freeze the Burraco rules baseline for v1 against the current official F.I.Bur. Code of Game and remove stale source references without changing gameplay behaviour.

M20 is a documentation and release-baseline milestone. The audit performed before this specification found no gameplay discrepancy in the already-implemented rule families that requires a code change. The only confirmed inconsistency is stale article numbering/source wording in the M13 draw-pile-exhaustion documentation.

## Context

The implemented gameplay through M19 already covers:

- digital round setup and four-player/two-team composition;
- draw / collect / action / discard turn flow;
- sequences, combinations, jokers and pinelle;
- history-aware wildcard replacement in existing sequences;
- Burraco classification;
- pozzetto acquisition;
- final closure and draw-pile exhaustion;
- round scoring;
- four-round cumulative scoring, Match Points and Victory Points;
- deterministic bot play and React-owned playback.

`docs/RULES.md` already declares the normative gameplay baseline as **Codice di Gara FIBUR — Edizione Gennaio 2026**.

The current official F.I.Bur. document index continues to publish:

- `CODICE DI GARA ed. GENNAIO 2026`;
- separately, `REGOLAMENTO - Ed. Settembre 2026`.

The September document is not a replacement gameplay code for the implemented Burraco rules. The v1 gameplay baseline remains the 2026 Code of Game.

Official source index:

`https://www.fibur.it/documenti.aspx`

The currently linked Code of Game PDF is:

`https://www.burraconetwork.com/file/fibur/upload_documenti/Pl9NMTNIW1VvP10EYDhzfF9kSVII.pdf`

The relevant 2026 article numbering is:

- Art. 7 — procedure and gameplay order;
- Art. 8 — draw from stock;
- Art. 9 — collect discard pile;
- Art. 10 — jokers and pinelle;
- Art. 11 — sequences;
- Art. 12 — combinations;
- Art. 13 — Burraco;
- Art. 14 — wildcard discard;
- Art. 15 — timeout;
- Art. 16 — stallo;
- Art. 17 — closures;
- Art. 18 — scoring;
- the four-smazzate Victory Points table immediately after Art. 18;
- Art. 23 — pozzetti.

The pre-M20 audit compared those rule families with the current engine, meld, scoring and match implementation. No code change is required by that comparison.

A confirmed documentation defect remains in the M13 source note: it still cites the older numbering `Art. 16 "Chiusure"` and `Art. 17 "Punteggi"`, refers to an older FGB edition, says a 2024 FIBUR edition was not directly verified, cites the pozzetto scoring rule as Art. 17, and lists stallo as Art. 18. Those references are obsolete relative to the repository's declared 2026 baseline.

## In scope

- Freeze the v1 gameplay source baseline to the current official F.I.Bur. Code of Game edition 2026.
- Correct stale article numbers and obsolete source wording in the M13 section of `docs/RULES.md`.
- Make the v1 baseline explicit without claiming that every physical-table or tournament procedure in the Code of Game is implemented.
- Record that the already-implemented rule families were audited against the current baseline and require no gameplay change.
- Keep existing digital abstractions explicit, especially where physical-table procedure is intentionally not simulated.
- Keep timeout, stallo, arbitrator procedure, exposed/penalized-card procedure and tournament administration outside the current digital v1 gameplay scope.
- Preserve all existing engine, bot, match, scoring and UI behaviour.
- Run the repository verification gate even though the expected implementation is documentation-only.
- Produce the required M20 implementation report.

## Out of scope

- Any gameplay-rule change.
- Any engine, meld, scoring, match, bot or React behaviour change.
- Implementing automatic stallo detection.
- Implementing tournament timeout.
- Modelling an arbitrator.
- Modelling exposed cards, penalized cards, frozen melds, illegal physical dealing, irregular deck restoration or other physical-table sanctions.
- Changing the existing digital dealing abstraction.
- Changing pozzetto visibility timing or delivery mechanics.
- Changing four-round match length.
- Changing the Victory Points table.
- Changing bot strategy, difficulty or safety limits.
- Handling `BotAutomationError` in the UI; that belongs to later release hardening.
- Persistence, onboarding, redesign, animation, sound, E2E tooling or deployment.
- Refactoring unrelated code.
- Creating an M20.1 unless independent review discovers a genuine gameplay discrepancy.

## Required behaviour

### 1. Keep the official v1 gameplay baseline explicit

`docs/RULES.md` must continue to state that the normative gameplay baseline is the F.I.Bur. Code of Game edition January 2026.

Do not replace this with the separately published September 2026 `REGOLAMENTO`.

Do not imply that every rule or tournament procedure in the Code of Game is implemented. The document must continue distinguishing:

- official rules applied by the digital game;
- digital modelling choices / abstractions;
- intentionally unimplemented physical-table or tournament procedure.

### 2. Correct the M13 source references

In the M13 draw-pile-exhaustion section, replace the stale source note with the current 2026 references:

- closure by stock exhaustion: Art. 17, `Chiusure`;
- negative scoring and pozzetto scoring: Art. 18, `Conteggio dei punti`.

Remove the obsolete statements that:

- identify closure as Art. 16;
- identify scoring as Art. 17;
- rely on an FGB January 2018 source;
- say that a FIBUR April 2024 edition was not directly verified.

The source note should now make clear that the current official F.I.Bur. 2026 Code of Game was directly checked for M20.

### 3. Correct the pozzetto scoring reference

The existing M13 modelling note about a pozzetto taken with the exhausting discard and then scored negatively must reference the current Art. 18, not Art. 17.

The implemented behaviour does not change:

- the ordinary discard side effects occur first;
- a pozzetto taken with that discard remains unplayed;
- its cards contribute negatively through the existing hand representation;
- no closure bonus is awarded for stock exhaustion.

### 4. Correct timeout and stallo numbering

The M13 out-of-scope note must use the current 2026 numbering:

- timeout — Art. 15;
- stallo — Art. 16.

Do not implement either mechanism.

### 5. Record the v1 audit conclusion without inventing new rules

Add a concise release-baseline note to `docs/RULES.md` stating that M20 rechecked the implemented v1-relevant rule families against the current F.I.Bur. 2026 Code of Game.

The note may identify the audited families by article/rule area, but it must not duplicate the complete Code of Game.

The audit conclusion is:

- no gameplay code change is required by M20;
- the current implementation remains the authoritative implemented behaviour described by `docs/RULES.md`;
- physical-table and tournament-only procedures remain outside the digital v1 scope unless a future milestone explicitly adds them.

### 6. Preserve documented digital abstractions

M20 must not silently turn documented product abstractions into claims of literal physical-table simulation.

In particular, preserve the current documented abstractions around:

- deterministic digital dealing;
- rotating digital starting player;
- pozzetto assignment and immediate digital storage;
- lack of physical delivery / premature-view sanctions;
- no arbitrator;
- no tournament timing;
- no physical-card-exposure penalties.

If wording is tightened for source accuracy, the implemented behaviour must remain unchanged.

### 7. Preserve the four-round VP baseline

The existing four-smazzate Victory Points table and `calculateFourRoundOutcome` behaviour remain unchanged.

The official 2026 four-smazzate bands currently match the repository:

- 0–100 → 10–10;
- 105–300 → 11–9;
- 305–500 → 12–8;
- 505–700 → 13–7;
- 705–900 → 14–6;
- 905–1100 → 15–5;
- 1105–1300 → 16–4;
- 1305–1500 → 17–3;
- 1505–1700 → 18–2;
- 1705–2000 → 19–1;
- over 2000 → 20–0.

Do not change code or tests around these bands in M20.

### 8. No production-code changes

The expected M20 implementation touches documentation only:

- `docs/RULES.md`;
- `docs/milestones/reports/M20-implementation.md`.

Do not modify files under `src/` unless independent review first identifies a concrete contradiction between the M20 specification and the existing implementation.

Do not add speculative tests merely to create code churn. Existing tests are the executable regression gate for this documentation-only milestone.

### 9. Keep architecture unchanged

M20 changes no architectural boundary.

Do not modify `docs/ARCHITECTURE.md` unless a strictly factual source-reference correction is necessary. No such architecture change is currently expected.

### 10. Version the implementation evidence

Create/update:

`docs/milestones/reports/M20-implementation.md`

using the repository report template.

The report must state:

- the milestone branch;
- files changed;
- that no gameplay/production code changed;
- the exact documentation corrections made;
- `npm run verify` result;
- test count and build result;
- any deviation, remaining ambiguity or incidental change.

## Acceptance criteria

- [ ] AC1 — `docs/RULES.md` still identifies the official F.I.Bur. Code of Game January 2026 as the v1 gameplay baseline.
- [ ] AC2 — The separate September 2026 `REGOLAMENTO` is not presented as a replacement gameplay code.
- [ ] AC3 — M13 cites Art. 17 for stock-exhaustion closure.
- [ ] AC4 — M13 cites Art. 18 for scoring.
- [ ] AC5 — The obsolete FGB 2018 / unverified FIBUR 2024 source wording is removed from M13.
- [ ] AC6 — The M13 pozzetto-taken-but-unplayed scoring note cites Art. 18.
- [ ] AC7 — Timeout is identified as Art. 15 and remains out of scope.
- [ ] AC8 — Stallo is identified as Art. 16 and remains out of scope.
- [ ] AC9 — A concise M20 v1 rules-audit/freeze note is present and does not claim full physical/tournament-rule implementation.
- [ ] AC10 — Existing digital abstractions remain documented and unchanged.
- [ ] AC11 — The four-round Victory Points bands remain unchanged.
- [ ] AC12 — No file under `src/` is changed.
- [ ] AC13 — `docs/ARCHITECTURE.md` has no behaviour/invariant change.
- [ ] AC14 — No new gameplay rule, bot behaviour, persistence feature, UI feature or release feature is introduced.
- [ ] AC15 — `docs/milestones/reports/M20-implementation.md` records the actual implementation and verification evidence.
- [ ] AC16 — `npm run verify` passes.
- [ ] AC17 — The implementation branch contains only M20 scope.

## Required tests

M20 is intentionally documentation-only.

Do not add new automated tests unless implementation unexpectedly changes production code, which would itself require review before proceeding.

Run the complete existing verification suite:

`npm run verify`

This is required to prove that the documentation-only milestone leaves the executable baseline untouched.

During implementation, perform a focused textual regression check on `docs/RULES.md` so the stale M13 references do not remain elsewhere in that section:

- no `Art. 16 "Chiusure"`;
- no `Art. 17 "Punteggi"`;
- no M13 pozzetto-scoring reference to Art. 17;
- no M13 statement that stallo is Art. 18;
- no M13 fallback source claim based on FGB 2018 / unverified FIBUR 2024.

## Documentation updates

### `docs/RULES.md`

Required.

Apply only the source-baseline and audit-freeze changes described above.

Do not rewrite unrelated rule sections.

### `docs/ARCHITECTURE.md`

No change expected.

### Other docs

Do not add a second competing rules document. The authoritative implemented-behaviour document remains `docs/RULES.md`.

The milestone specification itself records the detailed M20 contract; the implementation report records completion evidence.

## Verification

Before completion, run:

`npm run verify`

All existing tests and the production build must pass.

Also run:

`git diff --check`

(`npm run verify` already includes it, but report the result explicitly as required by the implementation-report template.)

## Completion conditions

M20 is complete only when:

- all acceptance criteria are satisfied;
- the stale M13 source/article references are corrected;
- the current F.I.Bur. 2026 gameplay baseline is explicit;
- the v1 rules audit is documented without overstating physical/tournament coverage;
- no production code or gameplay behaviour changes;
- no future milestone scope is pulled into M20;
- `npm run verify` passes;
- the M20 implementation report is versioned on the milestone branch;
- any remaining ambiguity or deviation is explicitly reported.

If implementation or independent review finds a real gameplay contradiction with the current 2026 Code of Game, do not silently fix it inside this milestone. Report it as a blocker and prepare a narrowly scoped M20.1 specification before changing gameplay.
