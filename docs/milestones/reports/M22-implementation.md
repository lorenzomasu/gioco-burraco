# Milestone Implementation Report

## Milestone

- Milestone: M22 — Local Save & Resume
- Branch: `milestone-22-local-save-resume`
- Implementer: Claude Code
- Specification HEAD at start: `5b31b34` (`docs: specify local save and resume milestone (M22)`)

## Verification

- `npm run verify`: passed (final run after the report was written, before commit; exit code 0)
- Tests: 518 passed across 28 test files (baseline before M22: 440 in 27 files; +63 persistence-module tests, +15 application tests; no existing test deleted or weakened). The initial implementation had 494; the review fix added 24 persistence tests.
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
- **Runtime validation.** Validation uses explicit guards with no new dependency. Where it goes beyond shape, it reuses the engine's own deterministic primitives rather than a second rules implementation. A save is accepted only if all of the following hold:
  - it is version 1;
  - the setup name is trimmed and non-empty;
  - the match `status` is `in-progress`, and `currentRoundNumber` is 1–4;
  - the four seats are fixed and in order (`player-1`…`player-4`), with teams `team-1` = `player-1` + `player-3` and `team-2` = `player-2` + `player-4`;
  - the player, team, pile, pozzetti, turn/acquisition and round/ending shapes are valid;
  - **complete card universe:** hands, meld placements, stock, discard pile and pozzetti together hold all 108 canonical cards, each exactly once and with its real `deckNumber`/`rank`/`suit`;
  - **meld consistency:** every stored meld is exactly equal to `validateMeld` of its own cards, compared without regard to key order;
  - **history:** there is exactly one result per finished round (`1..n` in order);
  - **score consistency:** every team score has finite numeric fields, and `total = meldCardPoints + burracoBonus + closingBonus − handPenalty − pozzettoPenalty`; for a completed current round, the last result's ending matches and its score equals `calculateRoundScore` of that round;
  - **acquisition:** during an action phase, `acquisition.cardIds` are distinct canonical card IDs, each still in the current player's hand or already played into their own team's melds;
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
- `src/shell/matchPersistence.test.ts`, new `match save semantic invariants` suite (24 tests, added by the review fix):
  - **card universe:** real saves hold all 108 cards; a card missing from the stock, a hand or the discard pile is rejected, and so is an emptied pozzetto; moving a card between zones is accepted;
  - **melds:**
    - a synthetic valid meld and a history-aware replacement produced by `validateMeldExtension` are accepted;
    - rejected: a natural card stored as a wildcard, a joker stored as natural, a pinella stored as natural in a group, a wrong `representedRank`, an `activeWildcard` that differs from its placement (null, other rank, other card), reordered placements, and a changed ace position or suit;
  - **scores:** rejected: a total that breaks the formula, a formula-consistent score that is not the completed round's actual score, and a formula break in an earlier round after advancing;
  - **acquisitions:**
    - accepted: the drawn card still in the hand, or already melded;
    - rejected: a non-card ID, a non-string ID, a duplicate ID, a card still in the stock, and a card held by another player;
  - `loadMatchSave` discards and removes a save corrupted in each category.
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

## Review fix (important finding: validator accepted impossible states)

The independent review found that the validator checked shape and card uniqueness but still accepted some impossible or internally inconsistent saves (AC11). The fix changes only `src/shell/matchPersistence.ts`, its tests, the fixtures that relied on a partial deck, and the documentation:

1. **Complete card universe.** `CardLedger` now also requires the complete canonical deck (`isComplete`), so a save missing any card is rejected.
2. **Meld consistency.**
   - A stored meld must equal `validateMeld` of its canonical cards. Both `playMeld` and `extendMeld` store exactly that result, including after a history-aware wildcard replacement, because `validateMeldExtension` only decides whether an extension is allowed and then returns the stateless validation. So the check adds no restriction on real engine states, and a test shows a replacement produced by `validateMeldExtension` is accepted.
   - This rejects ordinary cards stored as wildcards, jokers or pinelle stored as natural cards, inconsistent `representedRank`, an `activeWildcard` that differs from its placement, reordered placements, and altered ace position or suit.
   - The earlier primitive-only role and shape checks were replaced by this check.
3. **Score consistency.** Every stored team total must follow the formula. For a completed current round, the stored result must equal `calculateRoundScore` of that round. Earlier rounds are checked against the formula only, because their `GameState` is no longer available.
4. **Acquisition IDs.** Acquisition IDs must be distinct canonical card IDs, each in the current player's hand or their team's melds. There is no requirement that the card still be in the hand.

**Fixtures:**
- The persistence between-round fixture and the application between-round and terminal tests now use full-deck states: the stock cut to three cards moves into the pozzetti instead of leaving the table.
- The existing M21 four-smazzate test still uses its original short fixture, now behind the default `keepFullDeck: false`.
- The bot-resume fixture now puts every leftover card at the bottom of the stock, below the cards the test draws.

## Deviations from specification

None.

## Known risks and ambiguities

- **No replay or reachability proof.** Validation checks invariants that can be verified within the saved state, and nothing more. The following are not proven:
  - that the state is reachable from a real deal;
  - that an earlier round's formula-consistent score equals what that round actually produced (its `GameState` is not saved);
  - that turn order or `hasTakenPozzetto` are consistent with the card placement.

  A hand-crafted save that satisfies every invariant would still be accepted. Accidental corruption and incompatible data are rejected.
- **Meld comparison is strict.** Stored melds must match `validateMeld` exactly, and no extra keys are allowed. If a future milestone changes the output of meld validation or the stored meld shape, existing saves would be discarded unless the schema version is bumped. This is the intended failure mode.
- **Validation cost.** Every stored meld is re-validated on load. This is negligible for one save at application start.
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
- In the bot-resume test, a local `resumableChainState` fixture removes from the pozzetti the cards that `chainState` puts in hands and the stock, and puts every leftover card at the bottom of the stock. The shared `chainState` fixture is physically inconsistent (a card can appear twice, and the deck is partial), and the resume validator correctly rejects it. The shared fixture was not changed.
- `shortNamedFactories` in `src/App.test.tsx` gained a `keepFullDeck` option, used by the M22 between-round and terminal tests. The default keeps the M21 behaviour unchanged.

## Notes for independent review

- `src/shell/matchPersistence.ts`, specifically `isActiveMatchState`, `isGameState` and `CardLedger`: the history-count rule and the check that a completed round 4 is stale.
- Review fix: `isMeld` (exact equality with `validateMeld`), `CardLedger.isComplete`, `isTeamRoundScore` / `matchesCompletedRoundScore`, and `hasConsistentAcquisition`. Also check the claim that every engine-stored meld equals `validateMeld` of its cards: see `playMeld.ts`, `extendMeld.ts` and `validateMeldExtension.ts`.
- `GameTable`: the `onMatchChange` effect keyed on `session.match`. Check that `completeBotsNow` writes once, with the final state, and that the effect writes nothing when only the timeline changes.
- `App`: the lazy initializer never calls `startMatch` for a restored save. `persistMatch` clears the save on completion, and `onLeaveMatch` clears it only after confirmation.
- `App.test.tsx`, test "resumes a pending bot turn…": the comparison against `playNextBotChainStep` on the saved state.
- No M23+ scope was added. There is no redesign, no E2E tooling, no backend, no multiple slots and no persisted speed preference.
