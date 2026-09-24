# Milestone Implementation Report

## Milestone

- Milestone: M20 — Rules baseline freeze
- Branch: `milestone-20-rules-baseline-freeze`
- Implementer: Claude Code

## Verification

- `npm run verify`: passed (vitest, `tsc -b && vite build`, `git diff --check`; exit code 0)
- Tests: 26 test files, 426 tests passed (unchanged from M19; no tests added or changed)
- Build: passed
- `git diff --check`: passed (also run separately; exit code 0)
- Working tree at completion: clean after the milestone commit

## Behaviour implemented

Documentation only. No file under `src/` changed and no gameplay, bot, scoring, match
or UI behaviour changed.

Files changed:

- `docs/RULES.md`
- `docs/milestones/reports/M20-implementation.md` (this report)

Changes to `docs/RULES.md`:

- New section `Baseline delle regole v1 — milestone 20`, right after the introduction.
  It states that the v1 gameplay baseline is the F.I.Bur. Code of Game, January 2026
  edition, and that the separately published `REGOLAMENTO` Ed. Settembre 2026 does not
  replace it. It lists the audited rule families by article (7–14, 17, 18, the
  four-smazzate VP table, 23). It records that the audit needed no gameplay code
  change and that `docs/RULES.md` remains the authoritative implemented behaviour.
  It also says that documented digital abstractions are unchanged, and that timeout
  (Art. 15), stallo (Art. 16), arbitrator procedure, exposed/penalized cards,
  physical-table sanctions and tournament administration stay outside v1.
- M13 `Fonte`: replaced the old note (Art. 16 "Chiusure", Art. 17 "Punteggi",
  FGB January 2018, unverified FIBUR April 2024) with Art. 17 "Chiusure" and Art. 18
  "Conteggio dei punti" from the 2026 Code, and a statement that the 2026 text was
  checked directly for M20.
- M13 modelling note about the pozzetto taken with the exhausting discard: the
  reference for "pozzetto preso e non giocato" changed from Art. 17 to Art. 18.
  The described behaviour is unchanged.
- M13 `Fuori ambito`: now reads timeout (Art. 15), stallo (Art. 16) and arbitral
  conclusion. Stallo was Art. 18 before.

The text check required by the spec found no remaining `art. 16 "Chiusure"`,
`"Punteggi"`, `FGB`, `2018`, `aprile 2024`, `Stallo (art. 18)` or M13 pozzetto
reference to Art. 17 in `docs/RULES.md`.

The four-smazzate Victory Points table, the digital abstractions (dealing, rotating
starter, pozzetto storage, no delivery/premature-view sanctions, no arbitrator, no
tournament timing, no card-exposure penalties) and `docs/ARCHITECTURE.md` were not
changed.

## Deviations from specification

None.

## Known risks and ambiguities

- The implementer could not independently re-read the official 2026 PDF. It was
  downloaded, but no PDF text-extraction tooling was available locally. The article
  numbers and titles (Art. 15 timeout, 16 stallo, 17 "Chiusure", 18 "Conteggio dei
  punti", 23 pozzetti) and the "no gameplay change" conclusion come from the pre-M20
  audit recorded in the milestone specification. The reviewer should check the Art. 18
  title and the article list in the new baseline section against the official PDF.
- The M13 source note now says the 2026 text "è stato verificato direttamente nella
  milestone 20", as AC/Required behaviour §2 asks. That check is the milestone's
  pre-implementation audit, not an extra check made by the implementer.

## Incidental changes

None.

## Notes for independent review

- Compare the article list in `Baseline delle regole v1 — milestone 20` with the
  official 2026 Code of Game index.
- Check that the new section does not claim full physical/tournament coverage (AC9)
  and that the M13 wording still describes the same behaviour (AC6, AC10).
- `git diff main -- src/ docs/ARCHITECTURE.md` should be empty (AC12, AC13).

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
