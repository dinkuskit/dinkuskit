# Plan: plugin versioning and release process

Status: **plan only, nothing implemented yet**. Decisions were locked by Ryan on 2026-10-13. This doc covers what we will build in each DinkusKit plugin repo. No workflow files change in this PR.

## Current state

- No DinkusKit repo has git tags or GitHub Releases yet.
- On the EmDash Registry, `dinkus-commerce` and `dinkus-payments` are at **0.2.0**. Both were published by hand with `emdash-plugin publish` under the publisher `@smokyco.bsky.social`.
- `dinkuskit/commerce` `package.json` still says `0.0.0`, so the published version is not recorded in the repo. The bootstrap fixes this (see Baseline).
- Plugin repos already run per-PR CI and the ClawSweeper dispatch.

## Model: Changesets, the way EmDash does it

We copy the EmDash setup (`emdash-cms/emdash` at `06f911b`):

| EmDash file | What it shows | What we take |
|---|---|---|
| `.changeset/config.json` | `@changesets/changelog-github` changelog, `baseBranch: main`, `access: public`, a `fixed` group, an `ignore` list for demos and fixtures | Same changelog generator and base branch. Plugin repos are single-package, so we don't need `fixed` or `ignore`. |
| `.github/workflows/release.yml` | On push to `main`, `changesets/action/select-mode` chooses **version** or **publish**. The version job opens or updates a PR titled and committed as `ci: release` (using a GitHub App token). The publish job runs `changesets/action/publish`. `concurrency` is set with `cancel-in-progress: false` so a publish is never cut off halfway. Permissions are default-deny and scoped per job. | The same two-mode flow. Publishing goes to the EmDash Registry instead of npm. |
| `.github/scripts/check-no-major.mjs` | Fails CI if any package version would reach a major it shouldn't (EmDash burned `1.0.0`). | A "no 1.0.0 yet" guard (below). |
| `.github/workflows/preview-releases.yml` | Runs on `pull_request` and publishes each PR's build to `pkg.pr.new`. | Keep PR preview builds for per-PR checks. |

Contrast: RepoGlance uses tag-only versions. A hand-pushed tag triggers its `release.yml`, and there is no changeset file or release PR. We are deliberately **not** doing that here. DinkusKit never hand-pushes tags.

## Baseline

- Start at **`v0.2.0`**, matching the Registry. The bootstrap commit in each plugin repo bumps `package.json#version` to `0.2.0` (and the manifest, if it carries a version) and tags it `v0.2.0`. Every later release builds up from there.
- **Version source of truth: `package.json#version`.** `emdash-plugin publish` reads it there (plugin-cli `publish.ts`). The release PR bumps `package.json`; anything else that shows a version is derived from it or kept in sync by the same PR.

## Versioning rules (while on 0.x)

- **patch**: bug fixes only.
- **minor**: everything else, including a new route, a new setting, a schema change, or anything breaking.
- **major**: not allowed until 1.0.0 (see below). CI rejects any changeset that bumps major.
- Every PR that changes shipped behavior adds a `.changeset/*.md` file declaring its bump. Docs, tests and CI-only PRs use an empty changeset (`changeset --empty`). A CI check fails a PR that has no changeset.

### 1.0.0 gate

1.0.0 waits until **coupons, inventory, commerce, payments and ship** are all in. Bundles are optional. Until then, a `check-no-major` style script fails the release workflow if any version would reach `>=1.0.0`. Removing that guard is the explicit 1.0 decision.

## Release flow

```
PR merged with changeset ──► release bot opens "ci: release" PR (pre mode → x.y.z-beta.N)
        │
        ▼  Ryan merges beta release PR (via ClawSweeper gate)
beta publish: tag + GitHub prerelease + Registry publish of x.y.z-beta.N
              under the separate beta plugin name (e.g. dinkus-commerce-beta)
        │
        ▼  e2e suite on the demo store (only install of the beta plugin)
   pass ──► automatically: bot exits pre mode, opens final "ci: release" PR (x.y.z)
   fail ──► fix PR (+changeset) ──► beta.N+1, repeat
        │
        ▼  Ryan merges final release PR (via ClawSweeper gate) = publish yes
tag + GitHub Release (notes from CHANGELOG.md) + `emdash-plugin publish`, in one job
```

1. **Release PR is bot-owned.** The Changesets action, running as a GitHub App, opens or updates the `ci: release` PR. That PR bumps `package.json` and the plugin manifest version and writes `CHANGELOG.md`.
2. **Merging is the yes.** Ryan's merge of the release PR is the only publish trigger. The publish job on that `main` push does three things together:
   - creates the git tag;
   - creates the GitHub Release, with the notes taken from that version's `CHANGELOG.md` section;
   - runs `emdash-plugin publish` to the EmDash Registry as `@smokyco.bsky.social`.
   If any step fails, the job fails loudly and is re-run with `workflow_dispatch` in publish-only mode (as EmDash does). No one hand-pushes a tag.
3. **Betas first, under a separate plugin name.** The bot enters Changesets pre mode (`changeset pre enter beta`), so the first release PR produces `x.y.z-beta.N`. Merging it publishes a GitHub prerelease and a Registry publish under a **separate beta plugin name** (for example `dinkus-commerce-beta`), installed only on the demo store. Why a separate name: the EmDash Registry accepts `-beta.N` versions but has no prerelease filter, so a newer beta would become `latest_version` for everyone; and Registry versions can only be tombstoned or yanked, never truly deleted (`apps/aggregator/src/records-consumer.ts`, emdash `06f911b`). Keeping betas off the real plugin name means production installs never see them.
4. **Beta → final is automatic.** The e2e suite runs against beta.N on the demo store. A passing run triggers the bot to run `changeset pre exit` and open the final release PR, with no manual step. A failed beta gets a fix PR and becomes beta.N+1. The final release still publishes only when Ryan merges that PR.
5. **ClawSweeper gate.** Release PRs go through ClawSweeper's maintainer merge gate like any other PR. Only the exact reviewed head SHA may merge. If the bot pushes to the release PR after review, it needs a fresh review.
6. **PR previews.** pkg.pr.new-style preview builds stay on for every PR. They are for checks only and never count as a release.

## Tag format

- Changesets' default tag is `package@version` (for example `@dinkuskit/commerce@0.3.0`) in multi-package repos, and `vX.Y.Z` in single-package repos.
- **Recommendation: `vX.Y.Z`** (`v0.3.0`, `v0.3.0-beta.1`). Each plugin lives in its own single-package repo, so the repo name already identifies the package. Changesets uses this format automatically for a single package. If a repo ever holds more than one package, switch that repo to `package@version`.

## Credentials

- The Registry publish credential lives in a GitHub **environment** named `release` in each plugin repo. Ryan creates it and adds the secret, with deployment limited to `main` and **no required reviewer**. Ryan's merge of the release PR is the only gate, as in EmDash. Only the publish job references that environment.
- The release bot is a deterministic Changesets GitHub Actions workflow running with **its own GitHub App**, separate from the smoky-agent builder bot. This copies EmDash, where the release workflow uses its own `APP_ID`/`APP_PRIVATE_KEY` and `emdashbot` does no releases. The app is scoped to contents and pull requests write.
- Workflows must never echo, log or print secrets. Agents never read or print secret values.

## Rollout order

1. **`dinkuskit/commerce` first.** Add the Changesets config, the changeset-required check, the no-1.0 guard and `release.yml`. Bootstrap `package.json` to `0.2.0` and tag `v0.2.0`. Add a short `RELEASING.md`. Cut `0.3.0-beta.1` as the end-to-end dry run.
2. `dinkuskit/payments` (also at 0.2.0 on the Registry).
3. Remaining plugin repos (coupons, inventory, ship, bundles) as they reach a first publish.
4. Optionally extract the workflow into a shared reusable workflow once two repos run it without changes.

## Per-repo docs

Each plugin repo gets a short `RELEASING.md` that summarizes the flow (add a changeset, merge the bot's release PR, betas on the demo store) and links to this plan as the source of truth.
