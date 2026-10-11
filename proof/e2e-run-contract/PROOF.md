# E2E run contract source proof

Repository: dinkuskit/dinkuskit. Base: `771d91245918f321afbd55f495ec34741e6f09df`.
Reviewed input before this repair: `7356a84012ce0c69f62fc6909d8b0ddb6e2dc527`.
Decision: `website-e2e-run-contract-049`, recorded through the pinned GrillTrack CLI.
Executable candidate identity: Current SHA-256 values in `verification.json`.

## Outcome

One strict manifest/result vocabulary in `tests/e2e/run-contract.mjs`, with 36
native behavioral tests in `tests/e2e/run-contract.test.mjs`. The manifest binds
run/environment/target provenance, required independent stage evidence, admission
and assistance requirements, resource/recipient/capability references, and deadlines.
Result reduction keeps journey, cleanup, and assistance separate.

Cycle 8 repairs:
1. Journey and cleanup evidence correlation validation against manifest in `assessRun`:
   `assessRun` validates all journey and cleanup evidence correlation against manifest
   before reducing required stages. Checks `run_id`, `environment`, and all target dimensions
   (`target_ref`, `site_ref`, `release_ref`, `deployment_ref`, `provenance_class`, `source_ref`,
   `account_ref`, `site_origin`). If valid required evidence is accompanied by foreign-run,
   foreign-environment, or foreign-target extra receipts in `journey.evidence` or `cleanup.evidence`,
   `assessRun` collects `evidence-correlation-mismatch` failures and blocks assessment (`status: 'blocked'`).
   Valid same-target supplementary evidence (e.g. screenshot) and independent cross-product
   stage ownership are preserved.
2. Unspecified / wildcard address form rejection for nonlocal target and receipt origins:
   `origin` rejects unspecified / wildcard address forms (`0.0.0.0`, `[::]`, IPv4-mapped `[::ffff:0:0]`,
   `[::ffff:0.0.0.0]`, etc.) for nonlocal targets and receipts, accounting for URL canonicalization
   and IPv4-mapped unspecified representation. Valid canonical hosted HTTPS (`https://a.example.invalid/`)
   and existing local loopback behavior (`localOrigin`) are preserved, without expanding into unrelated
   private-address/SSRF policy.
3. Rejection of uncontracted OpenClaw finding:
   Globally unique receipt_ref/hash requirement was rejected; contract requires independent
   manifest service/owner/provider/state assertions, not globally unique artifact references.
4. Updated proof tracking:
   Documented actual 36 native tests in `docs/e2e-run-contract.md` and current proof artifacts;
   updated current source SHA-256 digests; captured parent pre-repair failure tap/exit artifacts (33 pass, 3 fail)
   and post-repair passing tap/exit artifacts (36 pass, 0 fail). Historical evidence and limits preserved.

The in-memory lifecycle demonstrates ownership/cleanup intent before allocation,
exact reconciliation, bounded failure retention, safe cleanup receipts, and separate
inactive-history expiry. No runtime source files changed.

## Current Verification (Repair Cycle 8)

Node v22.23.2, matching the repository `.nvmrc`:

- `node --test tests/e2e/run-contract.test.mjs`: 36 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- The final 36-test suite run against the pre-repair source passes33 and fails3:
  the two new regressions plus the updated mixed-target cleanup assertion
  (now blocked instead of incomplete). The repaired source passes all36.
- `npm run verify`: exit0. All25 command stages completed, including136 native
  tests, builds/type checks, route/CMS, upgrade and Cloudflare denial checks.

Current focused source SHA-256 digests:
- `tests/e2e/run-contract.mjs`: `07cde8eef2507e7c14fdf1e42ea2302b7720df27a2e1a36c8212be33944e7dcb`
- `tests/e2e/run-contract.test.mjs`: `5c7de83c6a60dab78705ccfb5eca13b6ef6e4b2451e276a1f658bb664f7c6896`
- `docs/e2e-run-contract.md`: `d16c51c3af636f3a9aabd0ca8e89e7ac4ad89337e6fb75f7ca78e22aa0fdb389`
- `package.json`: `7edc505656659e256235c5740d150584b6482212cbe57669b673385ec1fc436b`

## Historical Verification (Cycle 7 Snapshot)

In cycle 7 (`7356a84012ce0c69f62fc6909d8b0ddb6e2dc527`), 34 native tests passed:
- `node --test tests/e2e/run-contract.test.mjs`: 34 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- `npm run verify`: exit 1 at `test:emdash-upgrade` because the fixture build
  could not fetch an external Google font (`CannotFetchFontFile`). All preceding
  commands passed, including 134 native tests. The final Cloudflare candidate
  check was not reached locally. CI38182169287 passed full verification on
  that exact cycle7 head; local full-suite success was not claimed.
- The 34-test suite run against the pre-repair source passed 32 and
  failed the two cycle 7 regressions; the repaired source passed all 34.

Historical Cycle 7 source SHA-256 digests:
- `tests/e2e/run-contract.mjs`: `7d6d2c2b89fd641c6268187a823ad113109087d8b42fa89fcdb98d106036c040`
- `tests/e2e/run-contract.test.mjs`: `993c27c7a731b88dea929b18fb16f322fa089284801a15aca195e3509a20ca19`
- `docs/e2e-run-contract.md`: `99083654d380829cbc74ed6387b95567360b683a2df3d87496f76001a10c8898`
- `package.json`: `7edc505656659e256235c5740d150584b6482212cbe57669b673385ec1fc436b`

## Historical Verification (Cycle 6 Snapshot)

In cycle 6 (`69384a095af1a9d3166e7da2b2024264ad2242b6`), 32 native tests passed:
- `node --test tests/e2e/run-contract.test.mjs`: 32 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- `npm run verify`: exit 1 at the final `test:cloudflare-candidate` build because
  `fonts.gstatic.com` font downloads failed (`CannotFetchFontFile`). All preceding
  commands passed, including 132 native tests with zero failures. Two isolated
  final-check retries hit the same download failure. A direct Node fetch returned
  HTTP 200, but the build still could not finish its font downloads. CI attempt2 passed on that exact cycle6 head (run38180462397);
  local full-suite success was not claimed.

Historical Cycle 6 source SHA-256 digests:
- `tests/e2e/run-contract.mjs`: `fb5ce409ef4b5e7ca97eede745d1907041653ddfc8907dc4d562424a7dbed9ba`
- `tests/e2e/run-contract.test.mjs`: `2468e8dd84519cff69dc6ec3e482363aaf9af5a2e428e5ceb855e6040c962398`
- `docs/e2e-run-contract.md`: `271a014ff0a9ebcbcd68c7768790d641f4aa7824e243634a71237a1173614e05`
- `package.json`: `7edc505656659e256235c5740d150584b6482212cbe57669b673385ec1fc436b`

## Historical Verification (Pre-integration Snapshot)

The pre-integration implementation based on `4c8fdcc30e141075ee39edb017f193622840ac8c` passed:
- `npm ci`: exit 0.
- `npm run test:e2e-contract`: 23 passed, 0 failed.
- `npm run verify`: exit 0; repository audit, setup, generated types, typecheck,
  builds, account/merchant/shared-store/foundation/inventory/approval/operator
  tests, smoke, CMS, release reuse, access/URL/helper, upgrade and Cloudflare
  denial checks completed. Native test groups total 117 tests with no failures.
- `git diff --check`: exit 0.
- GrillTrack CLI `validate`: valid.

Historical source SHA-256 digests at that baseline are preserved in `verification.json`.

## Inspection and adjudication

ACP implementation was inspected independently by the source owner after
observed terminal writer cleanup. Accepted required fixes across repair cycles:
- Manual admission and assistance requirements;
- Provenance/target origin allowlists and loopback prohibitions;
- Exact stage evidence attribution and failed descriptor validation;
- Strict state consistency on snapshot restoration for failed and cleanup-pending runs;
- Timely deadline enforcement on interrupted allocation reconciliation;
- Known-owner resource/selector consistency and removed-resource exclusion on snapshot restoration;
- Audit history retention for unresolved and unexpired removed runs while preserving expired tombstones;
- Deployment provenance invariant enforcement on standalone receipts and validateResult evidence;
- Event chronological ordering, time bounds against snapshot/run creation, and run association on FakeLifecycle.restore while preserving foreign refusal;
- Journey and cleanup evidence correlation validation against manifest before reducing required stages, blocking foreign-run/target receipts;
- Unspecified/wildcard address form rejection for nonlocal target and receipt origins while preserving canonical hosted HTTPS and local loopback.

## Limits and next gate

This verifies deterministic source policy over fake resources. Receipt refs
and hashes are declarations, not authenticated provider receipts. Snapshot
validation does not authenticate storage. The history fixture retains an
ownership tombstone; it does not implement provider data deletion. No hosted A
or deployed B journey, remote cleanup scheduler, browser/mail execution,
Registry installation, Stripe operation or real revocation was run. Future
adapters must qualify those behaviors under their own live gates.

Hosted execution, deployment, live account changes, and external mail require
separate authorization and proof.
