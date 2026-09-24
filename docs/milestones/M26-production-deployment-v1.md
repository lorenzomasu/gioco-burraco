# Milestone 26 — Production Deployment & v1.0

## Goal

Ship the verified client-side Burraco game as the first production release without adding product scope.

M26 must make the current M25 release candidate reproducibly publishable, deploy it automatically to GitHub Pages, verify the real deployed site with a browser smoke test, document the release path, and close the v1 line with version/tag `v1.0.0`.

No game rules, bot strategy, persistence semantics, match lifecycle, UX flow, or visual system are to be redesigned in this milestone.

## Context

The starting baseline is `main` at M25:

- M25 added the canonical release gate: Vitest + production build + Playwright Chromium E2E + `git diff --check` through `npm run verify`;
- `.github/workflows/ci.yml` runs the same canonical gate on pull requests and pushes to `main`;
- the application is a client-side React/Vite application with no backend and no client-side router;
- `vite.config.ts` currently has no explicit deployment base;
- `index.html` currently contains only the basic UTF-8/viewport metadata and title `Burraco`;
- there is currently no root product `README.md`;
- `package.json` is still version `0.1.0`;
- there is currently no production deployment workflow or deployed-site smoke gate;
- the repository is currently private.

The roadmap names GitHub Pages as the preferred v1 host. At preparation time GitHub documents Pages for private repositories as requiring an eligible paid GitHub plan (for example GitHub Pro/Team/Enterprise). This is a release precondition, not a reason to silently change repository visibility or substitute another host.

The exact release SHA must remain traceable through review, CI, deployment, smoke verification, and the final `v1.0.0` tag.

## In scope

- set the package/application release version to `1.0.0`;
- add final product metadata to `index.html`;
- add a repository-owned favicon with no external asset dependency;
- make the Vite production output work correctly from the GitHub Pages project-site path rather than assuming origin root;
- preserve the current local preview/E2E workflow;
- extend the existing GitHub Actions release path so that:
  - pull requests still run the canonical verification gate;
  - pushes to `main` run the canonical verification gate first;
  - only a successful `main` verification may publish the built `dist` artifact to GitHub Pages;
  - the deployed Pages URL is smoke-tested in a real Chromium browser;
- add a small automated deployed-site smoke command/script that can be run by CI against an explicit URL;
- add a product-facing root `README.md`;
- add a release checklist/document describing the exact v1 release gate;
- update architecture/workflow documentation only where deployment/release invariants are introduced;
- create/update the normal M26 implementation report;
- after implementation review/merge/deployment is green, create Git tag `v1.0.0` on the exact reviewed, verified, deployed SHA.

## Out of scope

- any new Burraco rule or gameplay behaviour;
- bot strategy changes;
- difficulty settings;
- online multiplayer, accounts, backend services, cloud save, leaderboards or analytics;
- routing;
- PWA/service-worker/offline-install support;
- audio/music;
- visual redesign or new branding system;
- custom domain configuration;
- SEO campaign work or social-preview asset production;
- telemetry, crash reporting or third-party monitoring;
- changing repository visibility merely to make Pages available;
- silently switching from GitHub Pages to another hosting provider;
- a GitHub Release object or changelog system beyond the required v1 release documentation unless the existing repository structure proves it necessary.

## Required behaviour

### 1. Version and product metadata

The release version is `1.0.0`.

At minimum:

- `package.json` reports `1.0.0`;
- `package-lock.json` remains consistent with the root package version;
- the document language remains Italian;
- the page title remains product-facing and names Burraco;
- `index.html` contains a concise product description;
- a favicon is referenced and resolves in both local preview and the deployed project-site path;
- any added metadata must use repository-owned values/assets only and must not introduce external runtime dependencies.

Do not invent a new brand name for the game.

### 2. Pages-compatible production output

The built application must work when hosted under the repository project path:

`https://lorenzomasu.github.io/gioco-burraco/`

Asset URLs must not assume that the app is hosted at `/`.

Prefer the smallest Vite configuration that makes the static build portable and keeps M25 local production-preview tests working. A relative Vite base is preferable if it satisfies the existing tests and Pages deployment cleanly.

Do not add a router or runtime path-detection layer merely for deployment.

### 3. Canonical verification remains authoritative

`npm run verify` remains the repository's canonical pre-deployment gate.

M26 must not weaken, bypass or duplicate the M25 verification semantics.

Pull-request CI must continue to run the full canonical gate and must not deploy.

### 4. Main-branch deployment is downstream of verification

The existing GitHub Actions path should remain as small as practical.

For a push to `main`:

1. run the existing canonical `npm run verify` job;
2. only if that job succeeds, expose the resulting verified `dist` as the GitHub Pages artifact;
3. deploy that artifact with the official GitHub Pages Actions flow;
4. expose the real deployed page URL to a downstream smoke job;
5. run the deployed smoke against that URL;
6. fail the workflow if deployment or smoke verification fails.

The deployment must therefore be impossible on a failing verify job.

Prefer extending the existing `.github/workflows/ci.yml` over introducing a second independent build/deploy pipeline, because the Pages artifact should come from the same production build that passed the canonical gate.

The Pages deployment job may use the normal GitHub `github-pages` environment and the minimum required `pages: write` / `id-token: write` permissions.

### 5. Deployed-site browser smoke

Add a small explicit deployed-site smoke entry point, for example an npm script backed by a Node/Playwright script.

It must:

- require the deployed URL explicitly from an argument or environment variable;
- fail clearly when no URL is provided;
- launch Chromium using the existing Playwright dependency;
- navigate to the exact supplied deployed URL, including the repository path;
- fail on navigation/load failure or uncaught page errors;
- verify that onboarding renders;
- start one real match through the public UI with a test player name;
- verify that the Burraco table and `Smazzata 1/4` render successfully;
- close the browser reliably on both success and failure;
- add no production-only test route, query flag, global hook or hidden application control.

This is intentionally a release smoke, not a duplicate of the full M25 browser suite.

The canonical local `npm run verify` does not need to call the deployed smoke because there is no deployed URL at that stage. The main deployment workflow calls it after Pages deployment.

### 6. Product README

Create a concise root `README.md` aimed at a user/developer landing on the repository.

It must include at least:

- what the project is;
- the v1 local match shape: one human, three bots, four smazzate;
- the production URL once Pages is configured;
- local prerequisites;
- install/run commands;
- canonical verification command;
- production build command;
- a short note on local save/resume;
- pointers to the rules/architecture/release documentation;
- current release version `v1.0.0`.

Do not turn the README into a complete duplication of internal architecture docs.

### 7. Release checklist

Add a release document, preferably `docs/RELEASE.md`, that records the v1 release procedure and invariants.

It must include:

- precondition: M25 green and M26 independently reviewed;
- precondition: GitHub Pages is available/configured for the repository;
- exact reviewed M26 HEAD;
- PR CI green on that exact HEAD;
- merge of that exact HEAD into `main`;
- successful `main` verify;
- successful Pages deployment from the verified artifact;
- successful deployed browser smoke;
- confirmation that the deployed URL serves the expected v1 app;
- only then creation of `v1.0.0` pointing to the exact same SHA;
- verification that the tag resolves to that SHA;
- rollback guidance limited to redeploying/reverting repository commits; no new rollback system is required.

If GitHub Pages is unavailable because the repository/account does not satisfy the plan/configuration requirement, release closure is blocked. Do not change repository visibility or choose another host without an explicit roadmap/product decision.

### 8. Documentation invariants

Update `docs/ARCHITECTURE.md` only to record stable release/deployment architecture, including:

- static Vite output;
- GitHub Pages project-site hosting;
- verified-artifact deployment;
- deployed browser smoke;
- no backend/runtime server dependency.

Update `docs/WORKFLOW.md` to document the M26/future release exception to the normal green path:

- normal milestones may close after reviewed PR CI and merge;
- a production release/tag additionally requires the post-merge `main` deployment and deployed smoke to be green for the exact release SHA before the version tag is created.

`docs/RULES.md` must remain unchanged unless implementation uncovers an actual documentation inconsistency unrelated to adding rules; any such incidental correction must be reported rather than silently bundled.

### 9. Tagging responsibility

The implementation agent must not create `v1.0.0` from the milestone branch and must not merge the branch.

The tag is a release-gate action performed only after:

- independent M26 review is green;
- the exact reviewed SHA is merged to `main`;
- the `main` verification/deployment/smoke workflow is green for that same SHA;
- the deployed application is confirmed reachable.

The tag must point directly to that exact release commit.

## Acceptance criteria

- [ ] AC1 — `package.json` and the root package metadata in `package-lock.json` report version `1.0.0`.
- [ ] AC2 — `index.html` contains final Burraco title/description metadata and references a repository-owned favicon that resolves locally and under the Pages project path.
- [ ] AC3 — the production build loads correctly from a non-root/project-site path, with no broken JS/CSS/favicon asset URLs.
- [ ] AC4 — `npm run verify` remains the canonical gate and passes unchanged in intent: Vitest, production build, M25 Playwright suite, and diff check.
- [ ] AC5 — pull-request CI verifies but never deploys.
- [ ] AC6 — on a push to `main`, Pages publication cannot occur unless the canonical verify job for that same SHA succeeded.
- [ ] AC7 — the Pages artifact is the `dist` produced by the successful canonical verification job for that same workflow/SHA; it is not rebuilt from a different ref before upload.
- [ ] AC8 — GitHub Pages deployment uses official Pages Actions and the minimum required deployment permissions/environment.
- [ ] AC9 — an automated real-Chromium deployed smoke navigates to the exact Pages URL, observes no uncaught page error, renders onboarding, starts one match, and observes the table plus `Smazzata 1/4`.
- [ ] AC10 — the deployed smoke fails clearly for a missing/unreachable/incorrect URL and does not introduce any test hook into the shipped application.
- [ ] AC11 — root `README.md` documents product purpose, v1 match shape, production URL, local setup, run/build/verify commands, persistence note, documentation pointers, and v1.0.0.
- [ ] AC12 — release documentation records the exact review → PR CI → merge → main verify → deploy → deployed smoke → tag sequence and the GitHub Pages availability precondition.
- [ ] AC13 — architecture/workflow docs accurately record the new deployment/release invariants; no gameplay documentation is changed without a separately reported reason.
- [ ] AC14 — no game engine, scoring, bot strategy, persistence schema, match lifecycle or user-facing game flow is changed merely for deployment.
- [ ] AC15 — the M26 implementation report records final `npm run verify` evidence, deployment-related assumptions, deviations, risks/ambiguities, and any repository-setting action still required.
- [ ] AC16 — after merge, the production release is not declared complete and `v1.0.0` is not created until the exact release SHA has a green main verification, successful Pages deployment and green deployed smoke.
- [ ] AC17 — final tag `v1.0.0`, when created by the release operator, resolves to the exact independently reviewed, CI-verified, deployed and smoke-tested release SHA.

## Required tests

During implementation:

- keep all existing M25 tests green;
- add focused automated coverage for any deployment-base helper/configuration logic if logic beyond a static config value is introduced;
- add the deployed browser-smoke command/script described above;
- make the smoke script locally testable against a supplied URL when useful, but do not make the normal local gate depend on external network availability;
- verify the built `dist/index.html` uses deploy-safe asset references;
- run targeted build/preview checks while iterating as useful;
- run the full final repository gate:

`npm run verify`

The implementation report must state the final test count/build/E2E outcome and any deployed-smoke verification that was possible before merge.

The actual production deployed smoke is a post-merge release gate and therefore cannot be claimed complete by the implementation agent while still on the milestone branch.

## Documentation updates

Required:

- create root `README.md`;
- create `docs/RELEASE.md`;
- update `docs/ARCHITECTURE.md` for stable deployment architecture;
- update `docs/WORKFLOW.md` for the production release/tag gate;
- create/update `docs/milestones/reports/M26-implementation.md`.

Normally unchanged:

- `docs/RULES.md`;
- `docs/ROADMAP.md` — M26 is implementing the already-agreed final v1 milestone, not changing its scope.

## Verification

Before implementation completion, run:

`npm run verify`

All existing and new local tests must pass.

The implementation agent must also review the complete milestone diff and confirm that no gameplay/product feature work entered M26.

## Completion conditions

### Implementation completion

The implementation agent may declare its branch ready for independent review only when:

- all branch-implementable acceptance criteria are satisfied;
- `npm run verify` passes;
- release/deployment files and docs are internally consistent;
- the implementation report is complete;
- the branch is committed and pushed;
- no merge or tag has been performed.

### Milestone/release completion

M26 and v1.0 are closed only after the independent release gate confirms:

1. M26 review has no unresolved blocker or important finding;
2. the reviewed branch HEAD is unchanged;
3. PR CI is green on that exact HEAD;
4. that exact commit is merged into `main`;
5. the `main` workflow verifies that exact SHA;
6. the verified `dist` artifact is deployed successfully to GitHub Pages;
7. the deployed Chromium smoke is green against the real Pages URL;
8. the deployed site is reachable as the expected v1 application;
9. Git tag `v1.0.0` is created on that exact SHA and verified.

Any GitHub Pages plan/configuration blocker prevents release closure and must be reported explicitly rather than bypassed.
