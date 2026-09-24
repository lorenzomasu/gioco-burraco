# Milestone Implementation Report

## Milestone

- Milestone: M26 — Production Deployment & v1.0
- Branch: `milestone-26-production-deployment-v1`
- Implementer: Claude Code
- Specification HEAD at start: `49254e4` (`docs: specify production deployment and v1 release milestone (M26)`)

## Verification

- `npm run verify`: passed, exit code 0. It was run after the implementation and again as
  the final run after this report was written, before the commit. The canonical command
  is unchanged: `npm test && npm run test:e2e && git diff --check`.
- Vitest: 562 tests passed across 30 files (unchanged from M25; no unit code changed).
- Playwright: 16 tests passed in 6 spec files, Chromium only, against `vite preview` of
  the production `dist`.
  - The 9 M25 tests are unchanged and green.
  - Added: `e2e/deployment.spec.ts` with 7 tests (see below).
- Build: passed (`tsc -b && vite build`). `dist/index.html` references
  `./favicon.svg`, `./assets/index-*.js` and `./assets/index-*.css` only.
- `git diff --check`: passed as part of `npm run verify`.
- Mutation check: a build with `--base=/` makes both the relative-reference test and the
  project-path load test fail.
- Deployed smoke before merge: only local evidence is possible.
  - `npm run smoke:deployed -- http://127.0.0.1:4190/gioco-burraco/` against
    `vite preview --base /gioco-burraco/` (a real HTTP server at the project subpath)
    passed; the `DEPLOYED_URL` environment form also passed.
  - The real GitHub Pages smoke is a post-merge release gate and has **not** run.
- Working tree at completion: clean after the milestone commit.

## Behaviour implemented

### Version and metadata (AC1, AC2)

- `package.json` and the root entries of `package-lock.json` report `1.0.0`
  (`npm version 1.0.0 --no-git-tag-version`; no tag was created).
- `index.html` keeps `lang="it"` and the title `Burraco`. It adds an Italian
  `meta name="description"` and `link rel="icon"` to the new repository-owned
  `public/favicon.svg`: an inline SVG in the app's existing palette, with no external
  resource.

### Pages-compatible build (AC3)

- `vite.config.ts` sets `base: './'`. Every emitted URL is relative, so the same `dist`
  works at the local preview root and under `/gioco-burraco/`. No router, runtime path
  detection or environment-dependent base was added.

### CI release path (AC4–AC8)

`.github/workflows/ci.yml` is extended in place; it is still the only pipeline.

- `verify` is unchanged for pull requests.
  - On a push to `main`, after `npm run verify` succeeds, one extra step uploads that
    same `dist` with `actions/upload-pages-artifact@v4`.
  - The step has the default success condition, so it cannot run after a failed verify.
- `deploy` (`needs: verify`, push to `main` only) runs `actions/deploy-pages@v4`.
  - It uses the `github-pages` environment and only `pages: write` and `id-token: write`.
  - It exports `page_url`.
- `deployed-smoke` (`needs: deploy`) installs dependencies and Playwright Chromium, then
  runs `npm run smoke:deployed` with `DEPLOYED_URL` set to the deployed `page_url`.
- The workflow default is now `permissions: contents: read`.

### Deployed-site smoke (AC9, AC10)

`scripts/deployed-smoke.mjs` is exposed as `npm run smoke:deployed -- <url>`, or with
`DEPLOYED_URL`.

- It fails clearly for a missing, malformed or non-http(s) URL.
- It launches Chromium through the existing `@playwright/test` dependency and navigates
  to the exact URL supplied.
- It fails on:
  - a navigation error or a non-OK document response;
  - a favicon that does not return 200 when resolved from the page;
  - an uncaught page error (reported even when it caused a later step timeout);
  - onboarding not rendering;
  - the match not reaching `Tavolo di Burraco` and `Smazzata 1/4` after starting it with
    name `Smoke`.
- The browser closes in `finally`.
- It uses only roles and labels of the public UI. No test hook was added to the app.

### Tests: `e2e/deployment.spec.ts`

The spec runs offline, inside the normal gate:

1. The built `dist/index.html` has only `./`-relative `src`/`href` references, including
   the favicon, JS and CSS.
2. The build loads from a Pages-shaped URL `http://pages.invalid/gioco-burraco/`.
   - It is served from `dist` by Playwright request routing.
   - It renders onboarding, the favicon resolves and a match reaches `Smazzata 1/4`.
   - It makes no request outside the project path.
3. Local preview metadata: the title, `lang="it"` and the description are present, and
   `favicon.svg` is served as `image/svg+xml`.
4. The smoke command without a URL exits 1 with the message "no deployed URL supplied".
5. The smoke command with a malformed URL exits 1 with the message "not a valid URL".
6. The smoke command with an unreachable URL (`http://127.0.0.1:1/...`) exits 1.
7. The smoke command against the served production build exits 0 with `PASSED`.

### Documentation (AC11–AC13)

- `README.md` is new. It covers:
  - the product and the v1 match shape;
  - the production URL;
  - prerequisites and the install, dev, build, verify and smoke commands;
  - save and resume;
  - documentation pointers;
  - the release version `v1.0.0`.
- `docs/RELEASE.md` is new. It covers:
  - the deployment path;
  - the GitHub Pages precondition;
  - the exact review → PR CI → merge → main verify → deploy → deployed smoke → tag
    checklist;
  - the commands that verify the tag;
  - rollback by reverting, or by re-running a previous good `main` run.
- `docs/ARCHITECTURE.md` adds a "Production build and deployment" section and a note
  about `scripts/` in the repository structure.
- `docs/WORKFLOW.md` adds a "Production release gate" section: the release/tag exception
  and the `main` cancellation behaviour.
- `docs/RULES.md` and `docs/ROADMAP.md` are unchanged.

### Scope (AC14)

No file under `src/` changed. Gameplay, rules, bots, scoring, persistence and lifecycle
are untouched.

## Deviations from specification

None.

## Known risks and ambiguities

- **GitHub Pages is not configured yet — release blocker.** At implementation time the
  repository is private and `GET /repos/lorenzomasu/gioco-burraco/pages` returns 404.
  Before or at merge, the repository owner must:
  - make sure the account plan allows Pages for a private repository;
  - set **Settings → Pages → Source = GitHub Actions**;
  - keep the `github-pages` environment allowing `main`.

  Until then, the first `main` push after merge has a green `verify` and a failing
  `deploy`, and the release cannot close (spec §7). Visibility was not changed and no
  other host was used.
- **`main` concurrency changed on purpose.** It used to be `cancel-in-progress: true`
  for every run. It is now true only for pull requests, following GitHub's guidance not
  to interrupt a Pages deployment. A newer `main` push waits and supersedes any queued
  run. PR behaviour is unchanged.
- **Action major versions.** The workflow uses `actions/upload-pages-artifact@v4` and
  `actions/deploy-pages@v4`, the current official majors I know of.
  - They cannot run before merge because deployment is `main`-only.
  - The reviewer should confirm them against the GitHub Marketplace.
  - v4 of `upload-pages-artifact` skips dotfiles; `dist` has none.
- **CDN propagation.** `deploy-pages` waits for the deployment to succeed, and the smoke
  makes one attempt with no retry loop. A rare CDN delay would fail the smoke; re-running
  the job is the remedy. No retry was added, so a real failure is never masked.
- **Smoke dependencies.** The smoke job needs `npm ci` and the Playwright browser install
  for the script. It checks out the same SHA, but it builds nothing and deploys nothing.
- The favicon design is new but minimal: two cards in the existing UI colours. It is
  not a branding system.

## Incidental changes

- Workflow-level `permissions: contents: read` was added so the Pages permissions stay
  confined to the `deploy` job.

## Notes for independent review

- `.github/workflows/ci.yml`:
  - the `if:` guards on the upload step and on the `deploy` job;
  - `needs:` chaining;
  - the permissions scope;
  - the concurrency expression.
- `e2e/deployment.spec.ts` test 2: the routing handler returns 404 outside
  `/gioco-burraco/`, which is what makes a root-absolute asset fail.
- `scripts/deployed-smoke.mjs`: error paths and `finally` cleanup.
- After merge, follow `docs/RELEASE.md`. Do not create `v1.0.0` until the `main` run for
  the exact merged SHA has green `verify`, `deploy` and `deployed-smoke` jobs.

This report is advisory review context. It does not override the milestone specification, `docs/RULES.md`, `docs/ARCHITECTURE.md`, tests, or the implementation itself.
