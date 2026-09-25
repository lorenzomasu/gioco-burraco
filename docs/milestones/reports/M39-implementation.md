# Milestone Implementation Report

## Milestone

- Milestone: M39 — iOS Architecture Spike (experimental, reversible)
- Branch: `milestone-39-ios-architecture-spike`
- Implementer: Claude Code
- Base: specification commits `0f724c5` + `f4dbaee` on top of `main` `b2022bf` (v1.2.0).
  Final HEAD: the implementation commit carrying this report.
- Merge status: **not to be merged** before the physical-iPhone product decision (see below).

## Verification

Run in the Linux cloud container (no macOS, no Xcode).

| Check | Command | Result |
| --- | --- | --- |
| Canonical gate | `npm run verify` | passed (exit 0): Vitest 56 files / 991 tests (973 + 18 new); Playwright Chromium 75/75 (69 + 6 new); production build included |
| Spike build | `npm run build:ios-spike` | passed: `dist-ios-spike/index.html` + 1 CSS + 2 JS chunks, no `sw.js`, no manifest |
| Capacitor iOS sync | `npm run ios:sync` (`build:ios-spike` + `cap sync ios`) | passed (exit 0): web assets copied to `ios/App/App/public`, `Package.swift` written, plugins found: `@capacitor/haptics@8.0.2`, `@capacitor/status-bar@8.0.3` |
| Whitespace | `git diff --check` (also on the staged tree) | passed |
| Xcode non-signing build | `xcodebuild … CODE_SIGNING_ALLOWED=NO` | **not executable in this environment** (Linux, no Xcode). Not a code failure; to be run on the Mac (command below). |

The iOS project uses **Swift Package Manager** (Capacitor 8 default): no CocoaPods is needed.

Cloud-only, uncommitted adaptation: Playwright 1.63 expects headless shell 1243 while the
container ships 1194, so a symlinked `chromium_headless_shell-1243` was created outside the
repository. No repository file works around it.

## Behaviour implemented

- **Isolation.** `src/iosSpike/buildMode.ts` selects the build target: only the explicit Vite
  mode `ios-spike` builds the spike (root `ios-spike/`, own `index.html`, output
  `dist-ios-spike/`, no PWA plugin). Every other mode, including the default production build
  deployed to GitHub Pages, keeps the released entry, `dist/` and PWA worker unchanged.
  `vite.config.ts` only became a function of `mode`; the PWA options are byte-for-byte the same.
- **Capacitor shell.** `capacitor.config.json` (`com.lorenzomasu.burraco.spike`, "Burraco Spike")
  loads the bundled `dist-ios-spike` — no `server.url`, no remote or dev server. iOS options:
  `contentInset: never` (full-bleed, insets handled in CSS), `scrollEnabled: false` (no page
  rubber-band), dark background; Status Bar plugin configured to light text over the web view.
  `ios/` is the generated Xcode project; the only hand edit is portrait-only on iPhone in
  `Info.plist`.
- **Spike surface** (`src/iosSpike/IosSpikeApp.tsx`, `iosSpike.css`): compact top bar (round,
  Noi/Loro score, 44 px menu button), partner and two opponent seats with card counts, stock and
  discard pile, one own-team meld, a horizontally scrolling touch hand (64×92 px cards, 46 px
  exposed each), a bottom action bar (Pesca / Scarta, 50 px high) and a bottom sheet
  (Impostazioni / Storico / Aiuto segmented control, backdrop tap, Chiudi, swipe-down on the
  handle). Tapping the stock draws; tapping the highlighted discard pile discards.
- **Motion** (`motion.ts`): FLIP with the Web Animations API, transform/opacity only, 320 ms —
  stock → hand on draw, hand → discard pile on discard; lifted selection, sheet slide and
  press-scale via CSS transitions. Honours `prefers-reduced-motion`.
- **Haptics** (`haptics.ts`): `@capacitor/haptics` — light impact on selection and sheet/tab,
  medium impact on draw, success notification on discard. Silent no-op outside a native shell;
  a missing, throwing or rejecting bridge never reaches the interaction.
- **Safe areas / app chrome**: `viewport-fit=cover`; top bar, action bar and sheet padded by
  `env(safe-area-inset-*)`; no text selection, touch callouts, tap highlight, page overscroll
  or pinch zoom; hover styles only under `(hover: hover) and (pointer: fine)`.
- **No second rules engine** (`prototypeState.ts`): deterministic fixture (108 distinct physical
  cards from `createBurracoDeck`) and a presentation reducer that only moves cards between
  regions. No legality, turns, bots, scoring or save; labelled prototype-only in code and UI.

Scripts added: `dev:ios-spike`, `build:ios-spike`, `ios:sync`, `ios:open`.

## Tests added

- `src/iosSpike/buildMode.test.ts` — production/other modes stay `web`; spike only in its mode
  and own out dir; Capacitor `webDir` is the spike bundle with no `server`/remote URL.
- `src/iosSpike/prototypeState.test.ts` — deterministic fixture, card conservation, toggle,
  draw, discard-exactly-one, reset.
- `src/iosSpike/haptics.test.ts` — cue mapping, browser silence, throwing/rejecting bridge.
- `src/iosSpike/IosSpikeApp.test.tsx` — representative surface, select/draw/discard with cues,
  pile taps, sheet open/dismiss/tabs, reset, real bridge absent, spike entrypoint renders the
  spike and registers no worker.
- `e2e/ios-spike.spec.ts` — production `dist` contains no spike; spike built via its mode into a
  temp dir and driven with touch at 390×844: select/draw/discard/sheet, recorded FLIP flights
  with a real source→destination translation, ≥44 px targets, horizontally scrolling hand,
  non-scrolling document, controls clear of simulated 47/34 px insets.

## Setup on Mac and iPhone

Prerequisites: macOS with a current Xcode (Capacitor 8 requirements:
<https://capacitorjs.com/docs/getting-started/environment-setup>), Node as in `package.json`,
an Apple ID added in Xcode → Settings → Accounts (a free personal team is enough for a
development install), iPhone with a cable, network on first open (SPM fetches
`capacitor-swift-pm`).

1. `git fetch && git checkout milestone-39-ios-architecture-spike && npm ci`
2. Browser preview (optional): `npm run dev:ios-spike` and open the URL at an iPhone size
   (no haptics in the browser).
3. Build and sync the native shell: `npm run ios:sync`
4. Open Xcode: `npm run ios:open` (or open `ios/App/App.xcodeproj`).
5. Optional non-signing compile check:
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`
6. Target **App** → Signing & Capabilities: tick *Automatically manage signing*, choose your
   Team. If the bundle id `com.lorenzomasu.burraco.spike` is rejected, change it to a unique
   value (e.g. append your initials) — this is a local-only change, do not commit it.
7. On the iPhone enable Settings → Privacy & Security → Developer Mode (iOS 16+), connect it,
   select it as run destination, press Run (⌘R).
8. With a free team the first launch may require Settings → General → VPN & Device
   Management → trust the developer certificate.
9. After any web change repeat step 3 and Run again. Live reload is intentionally not
   configured: the installed app always runs the bundled assets.

## Physical-device evaluation checklist

Technical pass/fail (objective):

- [ ] App installs and launches full-screen, no white flash, no browser UI.
- [ ] Nothing primary sits under the notch/Dynamic Island or home indicator.
- [ ] Selecting a card gives a light tap; draw a firmer tap; discard a distinct "success" pattern.
- [ ] Draw and discard cards visibly fly between stock/hand/pile.
- [ ] Sheet opens, dismisses by backdrop, Chiudi and swipe-down on the handle.
- [ ] No text selection, magnifier, callout menu, double-tap zoom or page rubber-band.

Subjective product judgement (score 1–5 and note):

- [ ] Hand scrolling and selection responsiveness
- [ ] Tap-target comfort (cards, piles, action buttons)
- [ ] Animation smoothness (60 Hz, no jank)
- [ ] Sheet/panel feel compared with native iOS sheets
- [ ] Haptic quality and timing
- [ ] Safe-area / full-screen feel
- [ ] Anything that visibly or behaviourally feels browser-like
- [ ] **Would I accept this runtime for the full iPhone-first redesign?** — Accept / Reject /
      Needs one focused iteration (name the concrete issue)

## Deviations from specification

None.

## Known risks and ambiguities

- Xcode compile, signing and on-device behaviour (haptics, status bar style, safe areas,
  WKWebView scroll feel) are **unverified here**: only a Mac/iPhone can confirm them.
- Safe areas are browser-tested only by overriding the spike's inset tokens; real `env()`
  values exist only on the device.
- The swipe-down dismiss is a minimal pointer implementation (threshold 80 px, no velocity);
  it is representative, not native `UISheetPresentationController`.
- `ios/` is generated by Capacitor CLI 8.5.2 (SPM). `ios/App/App/public`, the copied
  `capacitor.config.json` and `config.xml` are git-ignored and regenerated by `ios:sync`.
- `npm audit`: the pre-existing moderate Vitest advisory (`@vitest/mocker`) is unchanged; the
  dev-only `@capacitor/cli` adds a moderate `uuid` advisory through `xcode` (GHSA-w5hq-g745-h8pq,
  buffer bounds check when a caller passes `buf`). It is build tooling, not shipped in any
  bundle; npm's suggested fix is a CLI downgrade, so it was left as is for the spike.

## Incidental changes

- `.gitignore`: `dist-ios-spike/`.
- `vite.config.ts`: PWA options moved unchanged into a `pwaPlugin()` factory so the config can
  omit it in spike mode.

## Notes for independent review

- Confirm the production build is unchanged: `resolveBuildTarget` default branch, the
  `target.kind === 'web'` guard in `vite.config.ts`, and the `e2e/ios-spike.spec.ts`
  production-dist test.
- `capacitor.config.json` must never gain `server.url` for the device path.
- `prototypeState.ts` must stay presentation-only; it is not a rules model.
- `docs/ARCHITECTURE.md` and `docs/RULES.md` intentionally unchanged; `docs/ROADMAP.md`
  already records the M39 decision gate (specification commit `f4dbaee`).
- Per the specification the normal automatic green-path merge is suspended: merge only after
  the user explicitly accepts Capacitor on a physical iPhone.
