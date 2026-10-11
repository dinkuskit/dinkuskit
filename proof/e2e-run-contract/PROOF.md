# E2E run contract source proof

Repository: dinkuskit/dinkuskit. Base: `771d91245918f321afbd55f495ec34741e6f09df`.
Reviewed input before this repair: `3fb3ab02e631aab7ac173e0655ea1aceb2b7fd41`.
Decision: `website-e2e-run-contract-049`, recorded through the pinned GrillTrack CLI.
Executable candidate identity: Current SHA-256 values in `verification.json`.

## Outcome

One strict manifest/result vocabulary in `tests/e2e/run-contract.mjs`, with 32
native behavioral tests in `tests/e2e/run-contract.test.mjs`. The manifest binds
run/environment/target provenance, required independent stage evidence, admission
and assistance requirements, resource/recipient/capability references, and deadlines.
Result reduction keeps journey, cleanup, and assistance separate.

Cycle 6 repairs:
1. Known-owner resource/selector consistency and removed-resource exclusion on snapshot restoration:
   `FakeLifecycle.restore` validates that every resource in `snapshot.resources` matching
   a known run in `snapshot.records` is consistent with that run (`account_ref`, `ownership_ref`),
   is contained within that run's admitted `resource_refs` selector, and that the run is not in
   state `removed`. This prevents a removed run from leaving owned resources while `canAdmit()`
   evaluates to true. Documented deliberately foreign fake resource injection for refusal tests
   is preserved without blanket rejecting foreign fixtures.
2. Audit history retention enforcement on snapshot restoration:
   `FakeLifecycle.restore` requires retained history (`history_retained: true`) for unresolved runs
   (`failed`, `cleanup-pending`, live states) and unexpired removed runs before `history_expires_at`,
   preventing audit history from being dropped prematurely. Legitimate expired removed tombstones
   (`state === 'removed'` at or after `history_expires_at` with `history_retained: false`) are preserved
   and restore cleanly.
3. Updated proof tracking: Current focused source hashes, 32 tests, exit 0 documented;
   parent full verification reached the final check but was blocked by external font downloads;
   historical evidence and limits preserved.

The in-memory lifecycle demonstrates ownership/cleanup intent before allocation,
exact reconciliation, bounded failure retention, safe cleanup receipts, and separate
inactive-history expiry. No runtime source files changed.

## Current Verification (Repair Cycle 6)

Node v22.23.2, matching the repository `.nvmrc`:

- `node --test tests/e2e/run-contract.test.mjs`: 32 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- `npm run verify`: exit 1 at the final `test:cloudflare-candidate` build because
  `fonts.gstatic.com` font downloads failed (`CannotFetchFontFile`). All preceding
  commands passed, including 132 native tests with zero failures. Two isolated
  final-check retries hit the same download failure. A direct Node fetch returned
  HTTP 200, but the build still could not finish its font downloads. Current-head
  CI full verification is required before merge; local full-suite success is not claimed.
- The current 32-test suite run against the pre-repair source passes 30 and
  fails the two new regressions; the repaired source passes all 32.

Current focused source SHA-256 digests:
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
- Audit history retention for unresolved and unexpired removed runs while preserving expired tombstones.

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
