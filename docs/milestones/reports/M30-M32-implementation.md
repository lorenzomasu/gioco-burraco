# Delivery Batch Implementation Report

## Batch

- Milestones: M30–M32
- Branch: `batch-m30-m32-presentation-polish`
- Implementer: Claude Code
- Final HEAD: the commit adding this report (implementation HEAD `671577e`)

## Milestone checkpoints

| Milestone | Commit | Targeted checks | Deviations / risks |
| --- | --- | --- | --- |
| M30 | `49e8bed` | `vitest run src/components` 194/194 (new `tableMotion.test.ts`, `GameTableMotion.test.tsx`, M30 block in `GameTableHand.test.tsx`); Playwright `motion.spec.ts` (3, also `--repeat-each=3`) + `hand-manipulation`, `hidden-information` | Received-card geometry tolerance 12 px in E2E (M24 rise cue measured mid-animation) |
| M31 | `bf610ee` | Full `vitest run` 688/688 incl. `audioPreferences.test.ts`, `soundEffects.test.ts`, `tableSound.test.ts`, `GameTableSound.test.tsx`, `AppAudio.test.tsx`; `tsc -b` | Audio controls provisionally in the game header (moved to Settings in M32) |
| M32 | `671577e` | `vitest run` 702/702 incl. `AppShell.test.tsx`, `GameTableMatchContext.test.tsx` and migrated confirm/speed tests; full Playwright suite 39/39 incl. new `app-shell.spec.ts` | Intentional replacement of the native-confirm and "restore shows no status" invariants (documented) |

## Final verification

- `npm run verify`: passed (exit 0, run twice on implementation HEAD `671577e`)
- Tests: Vitest 43 files / 702 tests passed
- Build/E2E: `tsc -b && vite build` passed; Playwright Chromium 39/39 passed
- `git diff --check`: passed
- Working tree at completion: clean

Environment note: the container ships Chromium build 1194 while the pinned
`@playwright/test` 1.63 expects headless-shell build 1243. The verification ran the
unchanged repository command after pointing the expected browser path to the
preinstalled 1194 headless shell (a container-only symlink; no repository change).
CI installs its own matching browser.

## Behaviour implemented

- M30: presentation-only card flights (`MotionLayer`, `tableMotion.ts`) derived from the
  committed `TableFeedback` cue, which now also carries a session sequence, the public
  moved-card count and the melds whose `classifyBurraco` result is new/changed. Human
  source geometry is measured only after a successful command. Bot flights use only the
  acting seat and public destinations; proxies are neutral/face-down with a public count.
  Replace-not-queue, cancellation on fresh session/«Completa subito»/completed view/unmount,
  bot flight ≤ 80% of the playback delay, reduced-motion skip, WAAPI failure fallback.
  Burraco badge/meld accent added.
- M31: local Web Audio synthesis (no assets, no dependency) behind a `SoundController`
  with a test backend seam; trusted-gesture activation, no replay; one primary + one
  accent per committed cue (match > round > Burraco > pozzetto, else turn/human turn;
  fast mode drops bot-to-bot turn cues); «Completa subito» emits one final accent only.
  Preferences under `gioco-burraco:audio-preferences` (versioned, validated, clamped).
- M32: shared `Dialog`, `SettingsDialog` (bot speed + sound) and `HelpDialog` reachable
  from onboarding and all match views; in-app `alertdialog` abandonment confirmation
  (bot scheduling paused while open, Escape cancels, leave-once guard); dismissible resume
  status; compact settled header score oriented to «La tua squadra»; reorganised
  between-round and final views (human win/loss/tie from `getFinalMatchOutcome`, team
  composition, MP/VP); onboarding Help/Settings entries and local-save note; responsive
  header rules for ≤ 440 px.

## Deviations, risks and ambiguities

- M32 intentionally changes two documented invariants: the native `window.confirm` is
  replaced by the in-app confirmation, and a restored match now shows a `role="status"`
  resume notice (the M22-era test expecting no status after restore was updated). Both are
  recorded in `docs/ARCHITECTURE.md`.
- Settings/Help do not pause bot playback (only the abandonment confirmation does); bots
  may keep committing behind an open Settings/Help dialog, which never replaces the dialog.
- A standalone `GameTable` (no shell, used by component tests) still renders its own
  bot-speed control; in the app the only speed/sound surface is Settings.
- Human flight source for a multi-card meld is the union rectangle of the moved hand
  cards, flown as one counted stack proxy (spec permits a bounded proxy).
- Sound design (tone recipes, levels) is a subjective implementation choice; it was not
  audibly reviewed in this environment.
- The between-round/final summary lists the human's team first; with the fixed seating the
  human is always Team 1, so canonical order is unchanged in practice.

## Incidental changes

- `e2e/lifecycle.spec.ts`, `e2e/persistence.spec.ts`, `e2e/hand-manipulation.spec.ts`,
  `e2e/discard-pile.spec.ts` and several component suites were migrated from the native
  dialog / header speed radios to the new in-app confirmation and Settings (shared
  helpers in `src/tests/shellDialogs.ts` and `e2e/fixtures.ts`).
- Invalid-action feedback in `GameTable` goes through one `rejectAction` helper (same
  alert, plus the M31 UI sound).

## Review focus

- `GameTable` session/effect interplay: `completedImmediately`, the one-shot sound effect
  keyed on the session object, the motion layer keyed on the cue object, and the bot
  timer effect now gated by `confirmingLeave`.
- Hidden information across motion markup (`data-motion-*`, proxy content) and sound cue
  names; `tableMotion.test.ts`/`GameTableMotion.test.tsx` assert no hidden identities.
- `Dialog` focus management and `inert` backgrounds (App `.app-content`, table
  `.game-shell`), including focus return and the leave-once guard.
- Audio activation policy in `App` (trusted-gesture filter, no pre-activation queue) and
  the separation of `audioPreferences` from the M22 save.
- Responsive header at 320–440 px with the added score summary and shell entries.
