# Plan: plugin versioning and release process

Status: **plan only, nothing implemented yet**. Decided by Ryan (owner), 2026-10-13. Decisions are recorded and locked in GrillTrack:

| Decision | ID |
|---|---|
| Changesets plus CHANGELOG, EmDash-style | `release-changesets-061` |
| 0.x: fixes patch, everything else minor, declared per PR in a changeset | `release-semver-0x-062` |
| 1.0.0 after coupons, inventory, commerce, payments, ship (bundles optional) | `release-1-0-gate-063` |
| One release-PR merge does tag + GitHub Release + Registry publish | `release-publish-on-merge-064` |
| pkg.pr.new previews stay | `release-pr-previews-065` |
| ~~Betas under a separate beta plugin name on the demo store; passing e2e opens final release PR~~ (superseded by `release-beta-cut-071`) | `release-beta-flow-066` |
| ~~Betas cut on demand with a Cut beta button; a recorded journeys pass gates the final release PR; same release files in every plugin repo~~ (superseded by `release-branches-079`) | `release-beta-cut-071` |
| Cut beta when a batch is worth giving a store; no calendar; never for docs/tests/CI only or same code | `release-beta-cadence-078` |
| Betas and stable releases come from `release/X.Y.Z` branches; fixes are copies of reviewed main commits; main never waits | `release-branches-079` |
| Cut beta moves an unpromoted `release/X.Y.Z` forward to main (same version) or deletes it (new version) itself; nobody deletes release branches by hand | `release-branch-recut-20261030` |
| Tagging starts at v0.2.0; version from package.json | `release-baseline-067` |
| Separate Changesets release workflow with its own GitHub App | `release-bot-068` |
| No release-environment approver; Ryan's merge is the gate | `release-approver-069` |
| RELEASING.md pointer file per plugin repo | `release-releasing-md-070` |

 This doc covers what we will build in each DinkusKit plugin repo. No workflow files change in this PR.

## Current state

- No DinkusKit repo has git tags or GitHub Releases yet.
- On the EmDash Registry, `dinkus-commerce` and `dinkus-payments` are at **0.2.0**. Both were published by hand with `emdash-plugin publish` under the publisher `@smokyco.bsky.social`.
- `dinkuskit/commerce` `package.json` still says `0.0.0`, so the published version is not recorded in the repo. The bootstrap fixes this (see Baseline).
- Plugin repos already run per-PR CI and the ClawSweeper dispatch.

## Model: Changesets, the way EmDash does it

(`release-changesets-061`)

We copy the EmDash setup (`emdash-cms/emdash` at `06f911b`):

| EmDash file | What it shows | What we take |
|---|---|---|
| `.changeset/config.json` | `@changesets/changelog-github` changelog, `baseBranch: main`, `access: public`, a `fixed` group, an `ignore` list for demos and fixtures | Same changelog generator and base branch. Plugin repos are single-package, so we don't need `fixed` or `ignore`. |
| `.github/workflows/release.yml` | On push to `main`, `changesets/action/select-mode` chooses **version** or **publish**. The version job opens or updates a PR titled and committed as `ci: release` (using a GitHub App token). The publish job runs `changesets/action/publish`. `concurrency` is set with `cancel-in-progress: false` so a publish is never cut off halfway. Permissions are default-deny and scoped per job. | The same two-mode flow. Publishing goes to the EmDash Registry instead of npm. |
| `.github/scripts/check-no-major.mjs` | Fails CI if any package version would reach a major it shouldn't (EmDash burned `1.0.0`). | A "no 1.0.0 yet" guard (below). |
| `.github/workflows/preview-releases.yml` | Runs on `pull_request` and publishes each PR's build to `pkg.pr.new`. | Keep PR preview builds for per-PR checks. |

Contrast: RepoGlance uses tag-only versions. A hand-pushed tag triggers its `release.yml`, and there is no changeset file or release PR. We are deliberately **not** doing that here. DinkusKit never hand-pushes tags.

## Baseline

(`release-baseline-067`)

- Start at **`v0.2.0`**, matching the Registry. The bootstrap commit in each plugin repo bumps `package.json#version` to `0.2.0` (and the manifest, if it carries a version) and tags it `v0.2.0`. Every later release builds up from there.
- **Version source of truth: `package.json#version`.** `emdash-plugin publish` reads it there (plugin-cli `publish.ts`). The release PR bumps `package.json`; anything else that shows a version is derived from it or kept in sync by the same PR.

## Versioning rules (while on 0.x)

(`release-semver-0x-062`)

- **patch**: bug fixes only.
- **minor**: everything else, including a new route, a new setting, a schema change, or anything breaking.
- **major**: not allowed until 1.0.0 (see below). CI rejects any changeset that bumps major.
- Every PR that changes shipped behavior adds a `.changeset/*.md` file declaring its bump. Docs, tests and CI-only PRs use an empty changeset (`changeset --empty`). A CI check fails a PR that has no changeset.

### 1.0.0 gate

(`release-1-0-gate-063`)

1.0.0 waits until **coupons, inventory, commerce, payments and ship** are all in. Bundles are optional. Until then, a `check-no-major` style script fails the release workflow if any version would reach `>=1.0.0`. Removing that guard is the explicit 1.0 decision.

## Release flow

> **Current flow (2026-10-22, `release-beta-cadence-078` and `release-branches-079`).** This replaces the `release-beta-cut-071` steps in the next note. OpenClaw's release process is the model (docs.openclaw.ai/reference/RELEASING and `openclaw/openclaw` `.agents/skills/release-openclaw-maintainer`). Not built yet: until the release files change, the 071 buttons still work as described in each repo's RELEASING.md.
>
> **When to press Cut beta.** When a batch is worth giving a store: a finished feature, or a fix a store owner would notice. There is no calendar. Ordinary PRs merge to main and ship nothing on their own. Docs, tests and CI-only changes never get a beta, and a beta is never cut when nothing version-bumping has merged since the last release.
>
> 1. **Every change is a PR to main.** ClawSweeper reviews it as today. Main keeps taking merges while a beta is on test.
> 2. **Cut beta** creates `release/X.Y.Z` from main, tags `vX.Y.Z-beta.1` on it, publishes the `-beta` package from the branch, and presses the journeys.
> 
>    If an unpromoted `release/*` is already there (`release-branch-recut-20261030`, 2026-10-30), Cut beta deals with it through the release App, the way OpenClaw re-cuts one branch name: when main still makes the same version it moves that branch forward to main and tags the next `beta.N`; when main now makes a new version it deletes the older unpromoted branch (its tags stay) and cuts the new one. It stops with nothing pushed if that branch holds a commit that is neither on main nor an Add fix copy of one, or while a `ci: release` PR is open. Released branches are never touched, and nobody deletes a release branch by hand.
> 3. **A fix found on beta** merges to main through its normal PR. Then **Add fix to beta** copies that exact merged commit onto `release/X.Y.Z` and cuts the next `beta.N`. If the copy doesn't apply cleanly, it stops. Nothing reaches a release branch except copies of reviewed main commits and the release bot's version commit. No PR targets a release branch, so ClawSweeper needs no change.
> 4. **Promote** (journeys passed on that beta) works out the version and changelog on the branch and opens the one `ci: release vX.Y.Z` PR to main. That PR carries only the version, the changelog section, and the removal of the changesets the release used. ClawSweeper reviews it, and Ronald's merge is the stable publish yes. On merge, the workflow writes the same version files onto the branch, checks that the branch differs from the beta tag only in those files, tags `vX.Y.Z` on the branch, and publishes stable from it.
> 5. **A bug in a released version**: the fix merges to main, then gets copied onto `release/X.Y.(Z+1)`, made from the `vX.Y.Z` tag. That cuts `X.Y.(Z+1)-beta.1`, the journeys run, then Promote as above.
> 6. `release/*` branches take pushes only from the release GitHub App.
>
> Unchanged from 071: separate `-beta` Registry packages, one beta store running every plugin's newest beta, a recorded `@running` journeys pass naming the beta gates Promote, Cut beta and Promote are pressed on Ronald's word, and every plugin repo runs the same release files with a drift check.

> **Superseded by the note above (was current 2026-10-17, `release-beta-cut-071`).** The pre-mode beta steps below describe `release-beta-flow-066`, which `release-beta-cut-071` replaces. The current beta flow:
>
> 1. A manual **Cut beta** workflow, run by Ryan or an agent with his go, publishes `x.y.z-beta.N` from current `main` under the plugin's separate `-beta` Registry package. `x.y.z` is the version the pending changesets would release; `N` is one more than the highest beta tag or Registry beta version. No Changesets pre mode, no beta on ordinary merges, and no release PR or ClawSweeper round per beta.
> 2. One beta store runs every plugin's newest beta. With several betas waiting, finals release one at a time and the journeys rerun between them.
> 3. A manual **promote** step opens the final `ci: release` PR only for a beta whose Running journeys passed on the beta store (recorded proof naming that beta). The PR names that beta version and `main` commit; if `main` gains a new changeset after the pass, it waits for the next beta's pass.
> 4. The release PR gets a hand-started ClawSweeper review (`@clawsweeper review`), and Ryan's merge of the reviewed commit is the only stable publish.
> 5. Every plugin repo runs the same release files, copied from Commerce with only package names changed, plus a check that fails when a copy drifts. Journeys stay one cross-plugin suite in SaariusSkills.
>
> Commerce finishes 0.3.0 in pre mode first; Payments and Commerce move to this flow after go-live.

(`release-publish-on-merge-064`, `release-beta-flow-066`, `release-pr-previews-065`)

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

(`release-bot-068`, `release-approver-069`)

- The Registry publish credential lives in a GitHub **environment** named `release` in each plugin repo. Ryan creates it and adds the secret, with deployment limited to `main` and **no required reviewer**. Ryan's merge of the release PR is the only gate, as in EmDash. Only the publish job references that environment.
- The release bot is a deterministic Changesets GitHub Actions workflow running with **its own GitHub App**, separate from the smoky-agent builder bot. This copies EmDash, where the release workflow uses its own `APP_ID`/`APP_PRIVATE_KEY` and `emdashbot` does no releases. The app is scoped to contents and pull requests write.
- Workflows must never echo, log or print secrets. Agents never read or print secret values.

## Rollout order

1. **`dinkuskit/commerce` first.** Add the Changesets config, the changeset-required check, the no-1.0 guard and `release.yml`. Bootstrap `package.json` to `0.2.0` and tag `v0.2.0`. Add a short `RELEASING.md`. Cut `0.3.0-beta.1` as the end-to-end dry run.
2. `dinkuskit/payments` (also at 0.2.0 on the Registry).
3. Remaining plugin repos (coupons, inventory, ship, bundles) as they reach a first publish.
4. Optionally extract the workflow into a shared reusable workflow once two repos run it without changes.

## Per-repo docs

(`release-releasing-md-070`)

Each plugin repo gets a short `RELEASING.md` that summarizes the flow (add a changeset, merge the bot's release PR, betas on the demo store) and links to this plan as the source of truth.
