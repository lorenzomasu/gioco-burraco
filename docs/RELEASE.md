# Release

This document records the production release procedure and its invariants. It was
introduced by M26 for `v1.0.0` and applies unchanged to every later production release.

## Release versions

| Release | Previous product milestone | Release milestone | Tag / `package.json` version |
| --- | --- | --- | --- |
| v1.0 | M25 | M26 | `v1.0.0` / `1.0.0` |
| v1.1 (current) | M32 | M33 | `v1.1.0` / `1.1.0` |

In the checklist below, `<version>` is the release version without the `v` prefix (for
v1.1: `1.1.0`, tag `v1.1.0`) and `<sha>` is the exact reviewed release-milestone HEAD.

## Deployment path

The application is a static Vite build hosted by GitHub Pages as a project site:

`https://lorenzomasu.github.io/gioco-burraco/`

`.github/workflows/ci.yml` is the only build and deployment pipeline:

1. `verify` — on every pull request to `main` and every push to `main`, runs the
   canonical `npm run verify` (Vitest, production build, Playwright Chromium E2E,
   `git diff --check`). Pull-request runs stop here and never deploy.
2. On a push to `main` only, and only after `npm run verify` succeeded in that job, the
   same job uploads the `dist` it just built and verified as the Pages artifact. The
   artifact is never rebuilt from another ref.
3. `deploy` — needs `verify`; deploys that artifact with the official
   `actions/deploy-pages` flow, in the `github-pages` environment, with only
   `pages: write` and `id-token: write`. It exposes the deployed page URL.
4. `deployed-smoke` — needs `deploy`; runs `npm run smoke:deployed` in real Chromium
   against that exact URL. It fails on a missing or unreachable URL, a non-OK document,
   an unresolved favicon, an uncaught page error, onboarding not rendering, or a match
   that does not reach the table and `Smazzata 1/4`.

A failing job fails the workflow, and a failed `verify` makes deployment impossible.
Running `main` workflows are not cancelled mid-deployment; a newer push waits for them.

## Precondition: GitHub Pages availability

GitHub Pages must be available and configured for the repository before a release can
close:

- the repository/account must be eligible for Pages (for a private repository this
  requires an eligible paid GitHub plan);
- repository **Settings → Pages → Build and deployment → Source** must be
  **GitHub Actions**;
- the `github-pages` environment must allow deployments from `main`.

If Pages is unavailable, the `deploy` job fails and the release is blocked. Do not change
repository visibility or switch to another host without an explicit roadmap/product
decision.

## Release checklist

A production release and its version tag are closed only when every step holds for one
and the same commit SHA:

1. [ ] The previous product milestone (for v1.1: M32) is green on `main` and the release
   milestone (for v1.1: M33) has an independent review with no unresolved blocker or
   important finding.
2. [ ] GitHub Pages is available and configured as described above.
3. [ ] The exact reviewed release-milestone HEAD is recorded: `<sha>`; it is unchanged
   after the review.
4. [ ] Pull-request CI is green on exactly that HEAD.
5. [ ] Exactly that HEAD is merged into `main`, preferably by fast-forward, and `main`
   points to `<sha>`.
6. [ ] The `main` push workflow for `<sha>` has a green `verify` job.
7. [ ] The `deploy` job of that same run deployed the verified artifact successfully.
8. [ ] The `deployed-smoke` job of that same run is green against the real Pages URL.
9. [ ] The deployed URL is confirmed reachable and serves the expected release (for
   v1.1: onboarding of the Burraco game at `https://lorenzomasu.github.io/gioco-burraco/`).
10. [ ] Only then is the annotated or lightweight tag `v<version>` created on that exact
    commit (for v1.1: `v1.1.0`):

    ```bash
    git tag v1.1.0 <sha>
    ```

    ```bash
    git push origin v1.1.0
    ```

11. [ ] The tag resolves to the release SHA locally and on the remote:

    ```bash
    git rev-parse 'v1.1.0^{commit}'
    ```

    ```bash
    git ls-remote --tags origin v1.1.0
    ```

The version in `package.json` (and the root package metadata in `package-lock.json`) must
equal the tag version without the `v` prefix; for v1.1 it is `1.1.0`.

A merge alone does not close a release: the post-merge `main` verification, deployment
and deployed smoke must all be green for the release SHA before the tag is created. The
implementation agent never creates the tag and never merges.

## Rollback

No separate rollback system exists. To restore a previous production state:

- revert the offending commit(s) on `main` through the normal reviewed pull-request path;
  the resulting `main` push re-verifies, redeploys and re-smokes; or
- as an interim measure, re-run all jobs of the `main` workflow run of a previous good
  commit; it re-verifies that commit, redeploys its verified build and re-smokes it.
  The next push to `main` deploys `main` again.

Existing release tags, including `v1.0.0`, are immutable: they are never moved, deleted
or rewritten.
