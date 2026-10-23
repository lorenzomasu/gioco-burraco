# Milestone 41 — iOS Native Runtime Plan and React Native Spike

Status: **proposed** (plan + spike specification). Written by the orchestrator, not by the implementer. Not to be implemented before the user confirms the open questions below.

## Goal

The user tried the M39 Capacitor spike on a physical iPhone 15 (iOS 27) and rejected Capacitor as the iPhone-first runtime (M39 decision gate, option 2: "prepare a React Native/native alternative spike"). This document:

1. compares React Native (Expo) and native Swift/SwiftUI for this repository and records the recommendation;
2. defines the phased plan;
3. specifies phase 1: an isolated Expo/React Native spike that plays a **real** round on the existing rules engine, to be judged on the same physical iPhone against M39.

## Open questions for the user (block implementation)

- **Q1 — What exactly was wrong with Capacitor?** The M39 thread records "il feel generale ora non mi dispiace" and then the rejection, without a concrete reason. The answer changes the plan: if the problem is WebView feel (scroll, touch latency, animation jank, "sembra un sito"), a native runtime fixes it; if it is the layout or visual design of the prototype surface, neither React Native nor Swift fixes it by itself and the design must change regardless of runtime.
- **Q2 — Does the web/PWA (GitHub Pages) stay a supported product?** The plan assumes yes: the rules engine stays shared, the web UI stays as is, and the iPhone app gets its own native UI.
- **Q3 — Distribution target:** personal install from Xcode/Personal Team only, or TestFlight/App Store (paid Apple Developer Program) later. Phase 1 needs only the former.

## Facts this plan relies on (checked 2026-10-23)

Repository:

- `src/game` (engine, bots, scoring, match lifecycle): ~2,340 production lines and ~6,050 test lines, pure TypeScript with no DOM, `window`, `crypto`, `Intl` or React imports.
- Pure-logic UI helpers reusable outside the DOM: `src/components/{handOrder,guidedCoaching,tableMotion,tableSound,tableFeedback,cardPresentation}.ts` (~660 lines) and `src/shell/*Preferences.ts`, `matchSetup.ts`, `matchPersistence.ts` (only the `window.localStorage` accessor is web-specific).
- Web UI: `src/components/*.tsx`, `App.tsx`, `styles.css` (~5,500 lines) and their RTL tests (~6,100 lines) plus 75 Playwright E2E: DOM-specific, not reusable by any native option.
- The Capacitor spike (`milestone-39-ios-architecture-spike`, `acb8e1b`) ran on prototype-only state, not on the engine.

Ecosystem (npm registry and GitHub, 2026-10-23):

- React Native latest `0.88.0` (2026-10-15). Expo SDK latest `58.0.17` (SDK 58.0.0 released 2026-09-29), bundling React Native `0.88.0`, React `19.3.0`, `react-native-reanimated` `4.7.1`; `react-native-gesture-handler` `3.4.0`, `@shopify/react-native-skia` `2.14.0`.
- SwiftUI/Swift: WWDC 2026 shipped the iOS 27 SDK with Xcode 27; secondary sources name Swift 6.4. Not verified against Apple primary pages (unreachable from the cloud container). The user's Mac reported Xcode 26.1.1 in October and still installed on the iOS 27 device.

## Comparison

| Criterion | React Native (Expo) | Swift / SwiftUI |
| --- | --- | --- |
| Rules engine reuse | `src/game` imported unchanged; one engine for web and iOS | Full port to Swift (~2,300 lines) **and** its ~6,000 lines of tests, or JS embedded via JavaScriptCore (untyped JSON bridge, two debugging worlds) |
| Rule divergence risk | None: same code, same ~990 Vitest tests keep guarding it | Two engines to keep identical for as long as the web exists; every rule fix done twice |
| UI rewrite | Full (web components are DOM) | Full |
| Feel | Native views, UI-thread animations (Reanimated), native gestures and haptics; very close to native for a custom-drawn card table | Best possible; system components, Liquid Glass and new iOS APIs on day one |
| Cloud workflow (Linux) | Engine tests, typecheck and UI unit tests run in the cloud; device build on the user's Mac or EAS Build | Pure Swift engine could be tested on Linux; SwiftUI build and preview only on the Mac |
| Maintenance, one developer | One language, one engine, two UIs; yearly Expo SDK upgrades | Two languages, two engines, two UIs; Xcode upgrades only |
| Lock-in / exit | Expo prebuild produces a normal Xcode project | None |

## Recommendation

**React Native with Expo**, conditional on Q1 confirming a runtime problem.

Reason: the expensive and risky asset in this repository is the rules engine and its tests (frozen rules baseline, M20), not the UI. React Native keeps that asset single and tested, while the UI has to be rewritten in either option. A card table is custom-drawn (cards, piles, melds, hand), so the feel gap between React Native with Reanimated/Gesture Handler and SwiftUI is small; the gap between WebView and either of them is the large one. Swift wins only if the web/PWA is abandoned (Q2 = no) and the user wants to own Swift code long term; even then the engine port is pure cost with no user-visible gain.

Main risks of the recommendation: Expo SDK upgrades yearly (mitigated by staying on the managed workflow and few native modules); Reanimated/worklet regressions between SDKs (Expo documented one for SDK 56); a device build and on-device test always need the user's Mac or EAS.

Not recommended: JavaScriptCore inside Swift (worst of both), Flutter (Dart port of the engine, same cost as Swift without the native gain), another Capacitor iteration unless Q1 shows a single fixable issue.

## Phased plan

- **Phase 0 — Decision (this document).** User answers Q1–Q3 and confirms React Native. No code.
- **Phase 1 — M41 React Native spike (spec below).** Isolated Expo app, real engine, one playable round vs bots, M39-equivalent feel checklist on the iPhone. Not merged before user acceptance, as for M39.
- **Phase 2 — Shared engine boundary.** Move nothing until phase 1 is accepted. Then, if Metro direct import from `src/game` proves fragile, extract it to a workspace package (`packages/engine`) with the same tests; otherwise keep the direct import. Persistence behind a storage interface (web `localStorage`, native key-value store).
- **Phase 3 — iPhone app to feature parity.** Separate milestones: table and hand manipulation, melds and extensions, pozzetto and round closure, bots with playback, match lifecycle and save/resume, settings/help/guided first match, audio and haptics. Each milestone keeps the engine untouched.
- **Phase 4 — Distribution.** TestFlight/App Store only if Q3 asks for it (Apple Developer Program, icons, privacy manifest, store listing).

The web/PWA stays released and unchanged throughout (Q2).

---

## Phase 1 specification — M41 React Native spike

### In scope

- New Expo app in `mobile/` (Expo SDK 58, React Native 0.88, TypeScript, managed workflow with `expo prebuild` only when a local Xcode build is needed; generated `mobile/ios/` is not committed).
- Import of the engine from `../src/game` without modifying `src/game` (Metro `watchFolders`/resolver config only). If the import is impossible without engine changes, stop and report.
- One playable round in portrait on iPhone: real deal, draw from stock or pick up the discard pile, play a new meld, extend a meld, discard, bot turns via the existing bot code at the default difficulty, round end with the existing scoring shown as plain numbers.
- Touch hand: horizontal scroll, tap to select, multi-select for melds; Reanimated 4 + Gesture Handler for card movement stock → hand and hand → discard (transform/opacity, about 300 ms).
- `expo-haptics` with the same mapping as M39 (light on select, medium on draw, success on discard).
- Safe areas via `react-native-safe-area-context`; portrait only; status bar handled.
- A minimal bottom sheet (rules help placeholder) to compare with the M39 sheet.
- Report `docs/milestones/reports/M41-implementation.md` with Mac/iPhone run steps and the device checklist.

### Out of scope

- Any change to `src/game`, `src/components`, `src/shell`, the web build, the PWA or GitHub Pages.
- Save/resume, settings, guided first match, audio, bot difficulty selection, match length, multi-round matches, pozzetto UI beyond what the engine requires to finish a round (if the round cannot end without it, a plain "Prendi pozzetto" button is enough).
- Wildcard repositioning gestures, drag-and-drop between melds, motion choreography beyond the two card flights.
- SwiftUI, Capacitor changes, TestFlight/App Store, EAS paid features.
- Extracting a shared package (phase 2).

### Required behaviour

- All legality comes from the engine: the spike never re-implements a rule check. Illegal actions surface the engine error as a short message.
- Deterministic seed option (e.g. a fixed seed constant in dev) so a round is reproducible for testing.
- Bot turns are applied step by step with a fixed delay; the human cannot act during bot turns.
- No network access at runtime.

### Acceptance criteria

- [ ] AC1 — `mobile/` is an Expo SDK 58 TypeScript app; `npx expo start` and an Xcode/dev-client build on the user's Mac are documented.
- [ ] AC2 — `src/game` is imported unchanged; `git diff main -- src/` is empty.
- [ ] AC3 — A full round against three bots can be completed on device using only engine-driven legality.
- [ ] AC4 — Hand scroll, selection, the two card flights and haptics work as described; animations run through Reanimated (UI thread), not JS-timer layout changes.
- [ ] AC5 — Root `npm run verify` stays green (web untouched); `mobile` has its own typecheck and unit tests for the engine adapter (action dispatch, bot stepping, error surfacing) runnable on Linux.
- [ ] AC6 — Report contains build evidence, what was not verifiable in the cloud, and the device checklist (same items as M39 plus "compared to Capacitor: better / same / worse").
- [ ] AC7 — Not merged to `main` before the user accepts React Native on the physical iPhone.

### Required tests

- Adapter unit tests (Jest via `jest-expo` or Vitest, implementer's choice, documented): human action dispatch through the engine, rejected illegal action keeps state unchanged, bot stepping reaches the human turn again, round end produces the engine score.
- No UI snapshot tests in the spike.

### Documentation updates

- `docs/ROADMAP.md`: record the M39 rejection and the M41 decision gate.
- No change to `docs/RULES.md` or `docs/ARCHITECTURE.md` until phase 1 is accepted.

### Verification and completion

`npm run verify` at root (web unchanged) plus `mobile` typecheck and unit tests in the cloud. Xcode build and device run are performed on the user's Mac (Remote Control, as for M39); the cloud cannot build iOS. Complete when AC1–AC6 hold; merge only after the user's device decision (accept / reject / one focused iteration).
