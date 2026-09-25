# Burraco

A browser version of the Italian card game Burraco, written in TypeScript and React.

Current release: **v1.1.2**.

## What you play

One local match of four players in two teams: you and a bot partner against two bot
opponents. A match lasts 2, 3 or 4 smazzate (chosen when it starts, 4 by default); scores
are totalled across them and the match ends with a final result.

The whole game runs in the browser. There is no account, server or network play.

Production URL: <https://lorenzomasu.github.io/gioco-burraco/> (served by GitHub Pages
once Pages is enabled for the repository; see [`docs/RELEASE.md`](docs/RELEASE.md)).

## Save and resume

The one active match is saved automatically in the browser's local storage whenever its
committed state changes. Reloading or reopening the page in the same browser resumes it
directly; a completed match is not kept. The save never leaves the browser: clearing the
site data, or using another browser or device, starts from onboarding.

Since M37 (development baseline, not yet in a tagged release) the production build is an
installable web app. After one online visit has cached the app shell, it also opens
offline and resumes the saved match; there is no online account or sync.

## Local development

Prerequisites:

- Node.js `22.23.2` or newer (see [`.nvmrc`](.nvmrc)) and npm;
- for the browser tests, the Playwright Chromium runtime, installed once per machine:

```bash
npx playwright install chromium
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build the production bundle into `dist/`:

```bash
npm run build
```

Run the canonical verification gate (Vitest, production build, Playwright Chromium
end-to-end suite, `git diff --check`):

```bash
npm run verify
```

Smoke-test a deployed copy of the site in Chromium:

```bash
npm run smoke:deployed -- https://lorenzomasu.github.io/gioco-burraco/
```

## Documentation

- [`docs/RULES.md`](docs/RULES.md) — the implemented Burraco rules (authoritative).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical architecture and invariants.
- [`docs/RELEASE.md`](docs/RELEASE.md) — the production deployment and release procedure.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/WORKFLOW.md`](docs/WORKFLOW.md) — the
  product roadmap and the milestone development workflow.
