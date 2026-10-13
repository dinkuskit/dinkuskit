# Plan: plugin versioning and release process

Status: **plan only, nothing implemented yet**. Decisions were locked by Ryan on 2026-10-13. This doc covers what we will build in each DinkusKit plugin repo. No workflow files change in this PR.

## Current state

- No DinkusKit repo has git tags or GitHub Releases yet.
- On the EmDash Registry, `dinkus-commerce` and `dinkus-payments` are at **0.2.0**. Both were published by hand with `emdash-plugin publish` under the publisher `@smokyco.bsky.social`.
- `dinkuskit/commerce` `package.json` still says `0.0.0`, so the published version is not recorded in the repo (see Open questions).
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
        │
        ▼  Ryan's full e2e suite on the demo store against beta.N
   pass ──► bot exits pre mode, opens final "ci: release" PR (x.y.z)
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
3. **Betas first.** The bot enters Changesets pre mode (`changeset pre enter beta`), so the first release PR produces `x.y.z-beta.N`. Merging it publishes exactly like a real release, but as a GitHub prerelease and a Registry prerelease. Ryan's full e2e suite then runs against beta.N on the demo store. Only after a pass does the bot run `changeset pre exit` and open the final release PR. A failed beta gets a fix PR and becomes beta.N+1.
4. **ClawSweeper gate.** Release PRs go through ClawSweeper's maintainer merge gate like any other PR. Only the exact reviewed head SHA may merge. If the bot pushes to the release PR after review, it needs a fresh review.
5. **PR previews.** pkg.pr.new-style preview builds stay on for every PR. They are for checks only and never count as a release.

## Tag format

- Changesets' default tag is `package@version` (for example `@dinkuskit/commerce@0.3.0`) in multi-package repos, and `vX.Y.Z` in single-package repos.
- **Recommendation: `vX.Y.Z`** (`v0.3.0`, `v0.3.0-beta.1`). Each plugin lives in its own single-package repo, so the repo name already identifies the package. Changesets uses this format automatically for a single package. If a repo ever holds more than one package, switch that repo to `package@version`.

## Credentials

- The Registry publish credential lives in a GitHub **environment** named `release` in each plugin repo. Ryan creates it and adds the secret, with required reviewer and branch protection limited to `main`. Only the publish job references that environment.
- The release bot uses a GitHub App token, as EmDash does with `APP_ID` and `APP_PRIVATE_KEY`, scoped to contents and pull requests write.
- Workflows must never echo, log or print secrets. Agents never read or print secret values.

## Rollout order

1. **`dinkuskit/commerce` first.** Add the Changesets config, the changeset-required check, the no-1.0 guard and `release.yml`. Record the baseline at `0.2.0` to match the Registry. Cut `0.3.0-beta.1` as the end-to-end dry run.
2. `dinkuskit/payments` (also at 0.2.0 on the Registry).
3. Remaining plugin repos (coupons, inventory, ship, bundles) as they reach a first publish.
4. Optionally extract the workflow into a shared reusable workflow once two repos run it without changes.

## Open questions for Ryan

1. **Baseline version.** Do we set `package.json` and the manifest to `0.2.0` in a bootstrap commit and tag it `v0.2.0` retroactively, or start tagging at the next release?
2. **Version source of truth.** `emdash-plugin publish` reads the version from where (`package.json` vs `emdash-plugin.jsonc`)? The release PR needs to keep both in sync.
3. **Registry prereleases.** Does the EmDash Registry accept `-beta.N` versions and keep them out of the default install? If not, where do betas publish (only a GitHub prerelease plus a pkg.pr.new build)?
4. **Triggering e2e.** Should the beta → final step be automated (e2e result posts a status, then the bot opens the final PR), or manual (Ryan says go)?
5. **Bot identity.** Do we add a new GitHub App for the release bot, or reuse an existing DinkusKit or ClawSweeper app?
6. **Environment approval.** Is Ryan a required reviewer on the `release` environment (a second click), or is the merge the only yes, as decided? This plan assumes the merge alone, with the environment limited to `main`.
7. **Plan home.** This doc lives in `dinkuskit/dinkuskit` next to the other plans. Should each plugin repo also get a short `RELEASING.md` that points here?
