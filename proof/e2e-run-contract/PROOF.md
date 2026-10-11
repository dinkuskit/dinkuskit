# E2E run contract source proof

Repository: dinkuskit/dinkuskit. Base: `771d91245918f321afbd55f495ec34741e6f09df`.
Reviewed input before this repair: `e101f6e0e196c0c21e0c8aaf41644a8aa363d099`.
Decision: `website-e2e-run-contract-049`, recorded through the pinned GrillTrack CLI.
Executable candidate identity: Current SHA-256 values in `verification.json`.

## Outcome

One strict manifest/result vocabulary in `tests/e2e/run-contract.mjs`, with 30
native behavioral tests in `tests/e2e/run-contract.test.mjs`. The manifest binds
run/environment/target provenance, required independent stage evidence, admission
and assistance requirements, resource/recipient/capability references, and deadlines.
Result reduction keeps journey, cleanup, and assistance separate.

Cycle 5 repairs:
1. Complete consistent failure and terminal metadata enforcement on snapshot restoration:
   `FakeLifecycle.restore` requires complete consistent failure and terminal metadata
   (`failure_at`, `failure_reason`, `expiry_at`, `terminal_at`, `history_expires_at`,
   `retry_suppression_required: true`) for `failed` runs, and terminal metadata with
   `retry_suppression_required: true` and allocated resource for `cleanup-pending` runs.
   Live states (`reserved`, `provisioning`, `active`, `evidence-sealed`) reject failure
   and terminal metadata and cleanup receipts that cannot yet have been observed. Valid restoration preserves the 1-hour failure window before
   cleanup and retains terminal history.
2. Deadline enforcement before interrupted allocation reconciliation:
   `FakeLifecycle.reconcileInterrupted` applies `checkDeadline(run_id)` before reading internal
   records. Interrupted allocations exceeding heartbeat or hard deadlines are marked failed
   (`heartbeat-missing` or `hard-deadline`) and their failed state is preserved while still
   recovering owned resource identity (`resource_ref`) for cleanup. Timely reconciliations
   and previously failed runs recover cleanly without resetting the first failure timestamp,
   reason, or expiry window.
3. Updated proof tracking: Current focused source hashes, 30 tests, exit 0 documented;
   full repository verification (`npm run verify`) passed on the current source;
   historical evidence preserved.

The in-memory lifecycle demonstrates ownership/cleanup intent before allocation,
exact reconciliation, bounded failure retention, safe cleanup receipts, and separate
inactive-history expiry. No runtime source files changed.

## Current Verification (Repair Cycle 5)

Node v22.23.2, matching the repository `.nvmrc`:

- `node --test tests/e2e/run-contract.test.mjs`: 30 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- `npm run verify`: exit 0; all 25 current commands completed, including
  `test:agent-routes`. Native test groups total 130 passing tests.
- The current 30-test suite run against the pre-repair source passes 28 and
  fails the two new regressions; the repaired source passes all 30.

Current focused source SHA-256 digests:
- `tests/e2e/run-contract.mjs`: `4fa1a8369168223e68e52cba2bd33514e7807762fe2274e0103ea285a51e22ff`
- `tests/e2e/run-contract.test.mjs`: `4adabe198925dbde375518cfa9c5e29eed8056d431c25d6cfed9f75c22734993`
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
- Timely deadline enforcement on interrupted allocation reconciliation.

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
