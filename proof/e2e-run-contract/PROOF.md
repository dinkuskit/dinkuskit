# E2E run contract source proof

Repository: dinkuskit/dinkuskit. Base: `771d91245918f321afbd55f495ec34741e6f09df`.
Reviewed input before this repair: `1470df4d0d9414610fe899ad6f8c28b6e1aaf7f6`.
Decision: `website-e2e-run-contract-049`, recorded through the pinned GrillTrack CLI.
Executable candidate identity: Current SHA-256 values in `verification.json`.

## Outcome

One strict manifest/result vocabulary in `tests/e2e/run-contract.mjs`, with 28
native behavioral tests in `tests/e2e/run-contract.test.mjs`. The manifest binds
run/environment/target provenance, required independent stage evidence, admission
and assistance requirements, resource/recipient/capability references, and deadlines.
Result reduction keeps journey, cleanup, and assistance separate.

Cycle 4 repairs:
1. Nonlocal loopback origin rejection: `hosted-a` / `test-build` and `deployed-b` /
   `public-release` cannot use loopback origins (canonical `localhost`, IPv4 loopback
   `127.0.0.0/8`, IPv6 loopback `[::1]`, and mapped IPv4 loopbacks); valid local fixtures (`127.0.0.1`, `localhost`,
   `[::1]`) and synthetic HTTPS hosted `.invalid` origins are preserved.
2. Failed result attribution binding: `owning_stage_repo` binds strictly to declared
   manifest stage ownership (`manifest.oracles`), and `last_accepted_receipt_ref` binds
   to actual accepted stage evidence; arbitrary owners and nonexistent receipt references
   are rejected. Explicit `null` last receipt reference is preserved for failures occurring
   before any successful stage.
3. Updated proof tracking: Current focused source hashes, 28 tests, exit 0 documented;
   historical 23-test verification preserved as historical; full repository verification
   passes on the current source.

The in-memory lifecycle demonstrates ownership/cleanup intent before allocation,
exact reconciliation, bounded failure retention, safe cleanup receipts, and separate
inactive-history expiry. No runtime source files changed.

## Current Verification (Repair Cycle 4)

Node v22.23.2, matching the repository `.nvmrc`:

- `node --test tests/e2e/run-contract.test.mjs`: 28 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `npm run verify`: exit 0; all current commands completed, including
  `test:agent-routes`. Native test groups total 128 passing tests.
- `./scripts/grilltrack --project . validate`: valid.
- The current 28-test suite run against the pre-repair source passes 26 and
  fails the two new regressions; the repaired source passes all 28.

Current focused source SHA-256 digests:
- `tests/e2e/run-contract.mjs`: `35b33dbc93b36c662c99730b09eddba82883b542cb51f566fb92ae9927ea75d7`
- `tests/e2e/run-contract.test.mjs`: `eb657ee07404ab07f60184d4c0724d035abb9ad74c00632f2f57ac83ae4a5d4a`
- `docs/e2e-run-contract.md`: `0f25ae8c9dd739a1cac9483d655ad1015f14b405a90a5f83fb2b15cd76cf1b1e`
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
- Explicit provenance/stage-owner binding;
- Cleanup receipt verification rather than status/boolean trust;
- Correctly directed issued-authority expiry;
- Fixed first-failure/heartbeat clocks;
- Failure cleanup at expiry;
- Interrupted reconciliation preserving failure;
- Exact resource ownership;
- Budget/active admission gates;
- Strict restart shape and chronology;
- Cleanup receipts refused in reserved and active states (cycle 3);
- Required failure descriptor on failed journey (cycle 3);
- Rejection of deployment-local for nonlocal provenance (cycle 3);
- Nonlocal loopback origin rejection and local IPv6 fixture preservation (cycle 4);
- Failed result attribution binding owning stage repo to manifest and last receipt to accepted evidence (cycle 4).

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
