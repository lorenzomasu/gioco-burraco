# Milestone Implementation Report

## Milestone

- Milestone: M22 — Local Save & Resume
- Branch: `milestone-22-local-save-resume`
- Implementer: Claude Code
- Specification HEAD at start: `5b31b34` (`docs: specify local save and resume milestone (M22)`)

## Verification

- `npm run verify`: passed (final run after the report was written, before commit; exit code 0)
- Tests: 494 passed across 28 test files (baseline before M22: 440 in 27 files; +39 persistence-module tests, +15 application tests; no existing test deleted or weakened)
- Build: passed (`tsc -b && vite build`)
- `git diff --check`: passed (as part of `npm run verify`, and `git diff --cached --check` on the staged milestone diff including the new files)
- Working tree at completion: clean after the milestone commit

## Persistence schema implemented

- Storage: `window.localStorage`, resolved defensively by `getBrowserStorage()`.
- Key: `MATCH_SAVE_STORAGE_KEY = 'gioco-burraco:active-match'`.
- Version: `MATCH_SAVE_SCHEMA_VERSION = 1`. Any other value, including the string `'1'`, is rejected.
- Envelope (JSON, key order `version`, `setup`, `match`):

  ```json
  {
    "version": 1,
    "setup": { "humanPlayerName": "<trimmed, non-empty>" },
    "match": "<MatchState as-is: status, currentRoundNumber, currentRound (GameState), roundResults>"
  }
  ```

- Not stored: the round factory or random source, bot events, bot chain progress, timers, selection, rule errors, callbacks, playback speed, and any derived value (cumulative totals, Match Points, Victory Points, Burraco classification).

## Behaviour implemented

- **Persistence module.** `src/shell/matchPersistence.ts` provides these functions:
  - `serializeMatchSave`, `parseMatchSave` and `isMatchSaveEnvelope`, which do pure serialization and validation;
  - `loadMatchSave`, `saveMatch` and `clearMatchSave`, which do the storage work. Each takes an injectable `Storage | null` and never throws.

  `loadMatchSave` returns one of four states: `none`, `restored`, `discarded` (the save was invalid and removal was attempted) or `unavailable` (storage could not be read).
- **Runtime validation.** Validation uses explicit guards with no new dependency. A save is accepted only if all of the following hold:
  - it is version 1;
  - the setup name is trimmed and non-empty;
  - the match `status` is `in-progress`, and `currentRoundNumber` is 1–4;
  - the four seats are fixed and in order (`player-1`…`player-4`), with teams `team-1` = `player-1` + `player-3` and `team-2` = `player-2` + `player-4`;
  - the player, team, meld, pile, pozzetti, turn/acquisition and round/ending shapes are valid;
  - every card has a canonical physical identity, its `deckNumber`/`rank`/`suit` match that identity, and no identity appears twice;
  - the settled history has exactly one result per finished round (`1..n` in order), and each score has finite numeric fields;
  - the last result's ending matches a completed current round;
  - the saved `player-1` name equals the setup name.

  A completed match is stale, and so is a completed round 4 whose match is still marked in progress. Both are rejected.
- **GameTable seam.** `GameTable` gained an optional `onMatchChange(match)` prop. It is called from an effect keyed on `session.match`, so it fires only after a new `MatchState` has committed. That covers the initial match, human actions, each bot step, settlement and the next round. Selection, rule errors, speed changes and timeline-only updates never trigger it, and neither does a scheduled bot timer that has not fired. The callback is read through a ref, so a new callback identity does not cause a write.
- **Shell wiring (`App`).**
  - On first construction, `App` loads the save. A valid save mounts `GameTable` directly with `initialMatch` set to the saved `MatchState`, so `startMatch` is never called. The round factory is recreated from the saved setup through the same `createRoundFactory(setup)` / `createSetupRoundFactory` path that onboarding uses.
  - `onMatchChange` writes the envelope while the match is active and clears the save once it is `completed`.
  - A confirmed leave, through `Nuova partita` or `Gioca ancora`, clears the save before returning to onboarding. A cancelled confirmation never reaches that path.
- **Failure handling and notices.** An invalid or unsupported save, or unreadable storage, leads to onboarding with a small `role="status"` notice. A failed write keeps the match playable and shows a small fixed notice. A failed removal is silent and does not crash the app.
- **Resume behaviour.** The restored table starts with fresh transient state: an empty timeline, reset chain-progress counters, no selection or error, and the shell's default speed. If a bot owns the turn, the normal stepwise playback schedules a new step from the committed state.
- **Documentation.** `docs/ARCHITECTURE.md` gained a "Local save and resume" section, and its `src/shell` description was updated. `docs/RULES.md` and `docs/ROADMAP.md` are unchanged.

### Tests added or changed

- New `src/shell/matchPersistence.test.ts` (39 tests). It uses real seeded rounds, advanced with the deterministic bot until melds exist and a turn is mid-action, plus a between-round settled match. It covers:
  - the exact envelope keys and version;
  - lossless round-trip of every physical card in order (all 108), melds, acquisition state and settled history;
  - malformed JSON and non-object roots;
  - unsupported versions and a missing version;
  - invalid setups;
  - a name mismatch;
  - 18 structural corruptions: seats, teams, cards, duplicate identity, melds, pozzetti, turn, and results out of place;
  - 4 history inconsistencies;
  - completed and terminal matches treated as stale;
  - cleanup attempted, including when removal throws;
  - contained read, write and remove failures;
  - `null` storage;
  - clear touching only its own key;
  - no mutation of deep-frozen inputs.
- `src/App.test.tsx`: new `App local save and resume` suite (15 tests). It covers:
  - no save → onboarding, and nothing is written;
  - starting a match writes the exact envelope with no transient keys;
  - a human draw is saved, while selection, a speed change and a rule error write nothing;
  - a remount restores the exact save with no round created, the name visible and a fresh timeline;
  - **bot resume:**
    - an unfired timer does not save;
    - a committed bot draw is saved;
    - after a remount the timeline is empty and one fresh timer exists;
    - the next step matches `playNextBotChainStep` from the saved state and does not repeat the draw;
  - **between-round resume:**
    - the same cumulative summary is shown and nothing is re-settled;
    - the next round is not started automatically, even after timers run;
    - `Inizia smazzata 2` creates round 2 with starter `player-2` and the saved name;
  - cancel keeps the save, and confirm clears it, so a reload opens onboarding;
  - completing a four-round match clears the save, the final result stays visible and a reload opens onboarding;
  - invalid JSON, an unsupported version, a name mismatch or an invalid structure → notice, save removed, and a new match can start;
  - unreadable storage and removal failure;
  - write and remove failures keep the match playable and let the user leave;
  - an inaccessible `window.localStorage` getter.
- `src/tests/setup.ts`: each test now gets a fresh in-memory `Storage` (`src/tests/memoryStorage.ts`) installed as `window.localStorage`. Existing tests are otherwise unchanged.

## Deviations from specification

None.

## Known risks and ambiguities

- **Structural, not rule-level, validation.** Stored melds are checked structurally (shape, roles, canonical cards, active wildcard belongs to the meld) but are not re-validated with `validateMeld`. The engine rules are not replayed, so a hand-edited save with a well-formed but illegal meld would be accepted. Accidental corruption and incompatible data are rejected.
- **Card totals not enforced.** Validation requires each physical card to be canonical and unique, but not that all 108 are present. Existing test fixtures use partial decks, and an exact total is not required to render or continue. Real saves always hold 108, which the round-trip test checks.
- **Fixed seat layout required.** The validator requires the engine's fixed seat order and team pairing. If a later milestone changes seating, it must bump the schema version.
- **Removal failure after leaving or completion.** If `removeItem` throws, the old save stays. For a confirmed leave, it would be restored on the next load. For a completed match, the last active pre-completion state would be restored. Storage that refuses removal generally refuses writes too, so nothing better can be done at this boundary. This does not crash the app.
- **StrictMode in development.** React's development StrictMode calls the `useState` initializer twice. That means the load, and any discard, can run twice, and the factory for a restored setup is built twice. React keeps the first result, so the notice and behaviour are correct. This does not happen in production builds.
- **Unavailable-storage notice on every load.** When storage cannot be read (for example when it is blocked), the onboarding notice appears on each load. M23 owns the final presentation.
- **jsdom storage timers.** jsdom's own `localStorage` schedules storage-event timers, which broke the existing `vi.getTimerCount()` assertions. The test setup therefore installs a deterministic in-memory `Storage`. Production behaviour is unaffected.
- **No real-browser check.** The notice styling was not checked in a real browser. Behaviour is covered by jsdom tests only.

## Incidental changes

- `StartScreen` gained an optional `notice` prop, rendered as a `role="status"` paragraph.
- `src/styles.css` gained minimal `.storage-notice` styles: inline on onboarding, fixed at the bottom during a match.
- `src/tests/setup.ts` and the new `src/tests/memoryStorage.ts` provide per-test isolated storage.
- In the bot-resume test, a local `resumableChainState` fixture removes from the pozzetti the cards that `chainState` puts in hands and the stock. The shared `chainState` fixture is physically inconsistent (a card can appear twice), and the resume validator correctly rejects it. The shared fixture was not changed.

## Notes for independent review

- `src/shell/matchPersistence.ts`, specifically `isActiveMatchState`, `isGameState` and `CardLedger`: the history-count rule and the check that a completed round 4 is stale.
- `GameTable`: the `onMatchChange` effect keyed on `session.match`. Check that `completeBotsNow` writes once, with the final state, and that the effect writes nothing when only the timeline changes.
- `App`: the lazy initializer never calls `startMatch` for a restored save. `persistMatch` clears the save on completion, and `onLeaveMatch` clears it only after confirmation.
- `App.test.tsx`, test "resumes a pending bot turn…": the comparison against `playNextBotChainStep` on the saved state.
- No M23+ scope was added. There is no redesign, no E2E tooling, no backend, no multiple slots and no persisted speed preference.
