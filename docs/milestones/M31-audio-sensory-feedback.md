# Milestone 31 — Audio & Sensory Feedback

## Goal

Add a restrained, coherent sound layer that reinforces the same interaction and committed game events already communicated visually. Audio must be optional, locally configurable, safe under browser autoplay restrictions, and completely non-authoritative: no game commit, bot step or UI transition may wait for sound playback. Preferences must persist independently from the match save.

## Context

M31 is the second checkpoint of the approved M30–M32 presentation batch and must be implemented after M30 on the same branch.

Before this milestone:

- M30 provides the final presentation-event/cue surface for committed human and public bot actions, motion cancellation and event emphasis;
- `GameTable` remains the presentation boundary around committed match state and bot playback;
- `App` already owns shell-level presentation preferences such as bot playback speed;
- the M22 match save under `gioco-burraco:active-match` stores only setup + authoritative `MatchState`;
- no audio runtime dependency or audio asset pipeline exists.

M31 should reuse M30's presentation events/cues instead of observing or reinterpreting `src/game` independently.

## In scope

- Short SFX for card selection, draw, discard-pile collection, play/extend, discard, invalid action, turn, pozzetto, Burraco and round/match completion.
- A small client-side audio service/controller with a test seam.
- Safe lazy activation on a trusted user gesture.
- Mute and volume controls.
- Separate, validated browser-local persistence for audio preferences.
- Reuse of M30 committed presentation events for action/event sounds.
- Sensible suppression/de-duplication for fast bot playback and `Completa subito`.
- Focused unit/component tests and architecture documentation.

## Out of scope

- Background music.
- Voice, speech synthesis, ambience loops or long samples.
- A general-purpose audio engine.
- Remote audio assets or network requests at runtime.
- Any game-rule, bot, scoring or save-schema change.
- App-wide settings layout/polish beyond the reusable audio control needed here; M32 owns the final settings surface.
- Audio as a requirement for understanding state or completing an action.

## Required behaviour

### 1. Audio architecture and authority

- Audio is triggered only from presentation/UI events: M30 committed action/event cues plus explicit UI-only events such as card selection or an invalid-action alert.
- Audio code must never invoke game commands, calculate legality, delay `setSession`, delay bot timers, block focus changes or alter match persistence.
- Prefer a small Web Audio API implementation or repository-owned local assets with no new runtime dependency. Do not fetch sounds from third-party URLs.
- The audio layer must have a deterministic/testable interface so component tests can assert requested sound events without requiring a real browser `AudioContext`.
- Failure to create/resume/play audio must be swallowed at the audio boundary and leave gameplay fully functional.

### 2. Browser activation

- Do not create/resume audible playback from page load, a bot timer or another synthetic callback before browser activation.
- The audio layer becomes eligible to play only after a trusted user interaction such as pointer/click/keyboard input.
- If a restored match begins with bot actions before the user has interacted with the page, those actions are silent. Do not queue them for later replay.
- Once activated, later human and bot presentation events may request SFX normally.
- Activating audio must not itself trigger an unrelated SFX.

### 3. Required sound vocabulary

Provide short, recognisably different cues for:

- **selection** — selecting/deselecting a hand card;
- **draw** — drawing from stock;
- **collect** — taking the full discard pile;
- **play** — creating a new meld;
- **extend** — extending an existing meld;
- **discard** — discarding to end the turn;
- **invalid** — a `GameRuleError` or M29 structural drop rejection;
- **turn** — change of player/turn, with the human-turn cue distinguishable or more prominent than an ordinary bot-to-bot transition;
- **pozzetto** — a team taking a pozzetto;
- **burraco** — a meld newly reaching/changing Burraco classification as established by M30;
- **round complete** — a smazzata completion;
- **match complete** — final match completion, distinct from the ordinary round-complete cue.

Sounds should be brief and consistent with a card-table UI. They do not need to imitate real-world samples exactly.

### 4. Event de-duplication and priority

One committed transition can carry several presentation facts. Avoid cacophony:

- play at most one primary action sound for the committed action;
- allow at most one stronger accent for Burraco, pozzetto, round completion or match completion;
- match completion takes precedence over round completion;
- a human-turn cue may play when control returns to the human, but do not stack a generic turn cue on top of a stronger completion/accent sound in the same instant;
- a selection sound is UI-only and independent of committed game state;
- repeated render passes of the same presentation event must not replay its sound.

The exact synthesis/sample design is implementation detail; event identity and one-shot semantics are not.

### 5. Fast playback and immediate completion

- Bot audio must never alter `BOT_PLAYBACK_DELAYS_MS`.
- In fast mode, action sounds may be shortened or selectively suppressed when consecutive bot events would overlap excessively, but the UI must remain deterministic and no sound request may delay automation.
- `Completa subito` must suppress intermediate queued/per-step bot SFX so it cannot produce a rapid backlog after the state has already advanced.
- After `Completa subito`, a relevant final accent (for example human turn, round completion or match completion) may play once for the final committed state.
- There must be no unbounded audio queue.

### 6. Preferences and local persistence

Add a separate audio-preference storage boundary, independent from the M22 match save.

Required preference model:

- `muted: boolean`;
- `volume: number` clamped/validated to `0..1`;
- a small explicit schema/version so invalid future or corrupt values can fall back safely.

Use a dedicated storage key, not `MATCH_SAVE_STORAGE_KEY`. Audio preferences must never be serialized inside `MatchState`, `MatchSetup` or the active-match envelope.

Behaviour:

- default to sound enabled with a moderate volume when no valid preference exists;
- mute applies immediately and prevents future playback requests from becoming audible;
- volume updates apply immediately;
- valid preferences survive refresh/new match;
- corrupt/unsupported preference data falls back to defaults without deleting or invalidating an active match;
- unavailable/throwing localStorage must not block the game. Preference persistence failure does not need the M22 match-save warning UI.

### 7. Controls

Create a reusable, accessible audio control suitable for M32 to place in the final app-wide settings surface.

At the M31 checkpoint it must provide at least:

- a labelled mute toggle;
- a labelled volume control;
- current state reflected semantically, not by icon/colour alone;
- keyboard operation with native controls;
- no dependence on hover.

The control may be provisionally placed in the game shell/header in M31, but structure it so M32 can reuse/relocate it without rewriting the audio system.

### 8. Accessibility and sensory independence

- Every state/action continues to be understandable without audio.
- Muting sound must not remove visual/text feedback.
- `prefers-reduced-motion` does not automatically mute audio; motion and sound preferences are independent.
- Do not add auto-playing music, looping ambience or long sounds that obscure assistive output.
- Audio controls must meet the same focus/keyboard standards as existing controls.

## Acceptance criteria

- [ ] AC1 — Selection, draw, collect, play, extend, discard, invalid action, turn, pozzetto, Burraco, round completion and match completion each map to a defined short SFX request.
- [ ] AC2 — Committed action sounds reuse M30 presentation events/cues and do not add a second game-legality or hidden-information observer.
- [ ] AC3 — Audio never delays or gates engine commits, bot playback, focus changes, round progression, persistence or `Completa subito`.
- [ ] AC4 — Before a trusted user gesture, restored/bot-driven activity remains silent and is not queued for later replay.
- [ ] AC5 — Re-rendering the same committed presentation event does not replay its sound.
- [ ] AC6 — Compound transitions use bounded de-duplication/priority and never create an unbounded queue or burst.
- [ ] AC7 — `Completa subito` suppresses intermediate bot SFX and may emit at most the relevant final accent/turn cue.
- [ ] AC8 — Mute and volume are accessible, apply immediately and persist locally under a dedicated validated preference key.
- [ ] AC9 — Invalid/corrupt/unavailable preference storage falls back safely without affecting the active-match save or gameplay.
- [ ] AC10 — No background music, remote runtime audio fetch or heavy audio dependency is introduced.
- [ ] AC11 — Hidden bot-hand/pozzetto information is never encoded in audio event labels, debug payloads or accessible UI.
- [ ] AC12 — The full game remains understandable and operable with audio muted or unavailable.

## Required tests

Add deterministic tests covering at least:

- audio preference default/load/save validation, clamping and corrupt/unavailable storage fallback;
- lazy activation and no retroactive replay before activation;
- one-shot event identity across rerenders;
- mapping of the required SFX vocabulary from M30/UI events;
- compound-event priority/de-duplication;
- mute and volume application;
- `Completa subito` suppression of intermediate bot sounds;
- audio-backend failure containment;
- regression protection that audio interactions do not trigger match-save writes or game commits.

Use an injectable/fake audio backend in Vitest rather than relying on jsdom to implement Web Audio.

If a focused browser test is needed to validate user-gesture activation with the production build, keep it narrow. M33 remains responsible for the full v1.1 browser/release matrix.

At the M31 internal batch checkpoint, run the directly relevant targeted tests only and record them in the final batch report.

## Documentation updates

- Update `docs/ARCHITECTURE.md` with the presentation-only audio boundary, activation policy, preference-storage separation and non-gating invariant.
- Do not modify `docs/RULES.md`.
- Do not change the M22 active-match save schema.
- Do not update the roadmap unless implementation evidence requires a material scope/order change.

## Verification

M31 is an internal checkpoint of the approved M30–M32 batch.

Run focused audio/preference/component tests after implementation. Defer canonical:

`npm run verify`

to the batch gate after M32, unless a concrete failure/risk justifies an earlier full run.

## Completion conditions

The milestone checkpoint is complete only when:

- all acceptance criteria are satisfied;
- targeted tests pass;
- audio preferences and activation are documented as presentation/shell concerns;
- the implementation is committed as the distinct M31 commit on the shared batch branch;
- M32 app-wide settings/help/result polish has not been implemented early beyond the minimal reusable control required here;
- material browser/audio fallbacks or risks are recorded for the final batch report.
