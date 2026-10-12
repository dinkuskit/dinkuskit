# E2E run contract source proof — PR39 integration

Base/main: `ed60ae7fb4ae657ddf2a0b30dddb7d1593575f1e`. Integration input: `eba27738da45a8a38bd3f67b50c166b7b55781ff`.
The run-contract module, tests and guide are unchanged from merged PR38.
Only package wiring gains the offline mailbox suite. Current source SHA-256
values are recorded in `verification.json`; the prior PR38 record below is historical.

Parent Node v22.23.2 verification: 51 focused tests passed (38 run-contract +
13 mailbox). Full `npm run verify` attempt 2 passed all 26 command stages and
151 native tests, including upgrade and Cloudflare denial checks. Attempt 1
stopped at the unchanged upgrade fixture with synthetic passkey/verify 401;
the single bounded rerun passed on identical source. Both outcomes are retained
in verification metadata. CLI validation, repository audit and diff checks pass.
Decision `website-e2e-run-contract-049` is reverified through the pinned CLI
after this integrated verification. Fresh exact-source reviews remain pending.
The source-only limits below continue to apply.

# Historical PR38 cycle9 source proof

Repository: dinkuskit/dinkuskit. Base: `771d91245918f321afbd55f495ec34741e6f09df`.
Reviewed input before this repair: `2afd397321254a4a3683edec9858b4501455d8b8`.
Decision: `website-e2e-run-contract-049`, recorded through the pinned GrillTrack CLI.
Executable candidate identity: Current SHA-256 values in `verification.json`.

## Outcome

One strict manifest/result vocabulary in `tests/e2e/run-contract.mjs`, with 38
native behavioral tests in `tests/e2e/run-contract.test.mjs`. The manifest binds
run/environment/target provenance, required independent stage evidence, admission
and assistance requirements, resource/recipient/capability references, and deadlines.
Result reduction keeps journey, cleanup, and assistance separate.

Cycle 9 repairs:
1. `assessRun` status precedence fix:
   Any `evidence-correlation-mismatch` from `journey.evidence` or `cleanup.evidence`
   forces overall `status: 'blocked'`, even when `result.journey.status` is `'failed'`
   or `'unknown'`. Preserves separate journey outcome (`assessed.journey`), legitimate
   failure descriptors (`assessed.failure`, `assessed.last_accepted_receipt`), and
   cleanup semantics.
2. Regression coverage across journey outcomes, evidence arrays, and controls:
   Added coverage for all three journey outcomes (`passed`, `failed`, `unknown`) across
   both evidence arrays (`journey.evidence`, `cleanup.evidence`) with correlation mismatch
   receipts, verifying each forces overall `status: 'blocked'`, while preserving separate
   journey outcome, legitimate failure descriptors, and cleanup semantics. Added valid
   failed and unknown controls verifying `status: 'failed'` and `status: 'unknown'`.
3. Isolated hosted `deployment_ref` mismatch coverage:
   Tested `deployment_ref` mismatch in isolation under `hosted-a` environment where
   environment, provenance_class (`test-build`), and site_origin match the target
   manifest, verifying correlation mismatch on `deployment_ref` specifically without
   masking across target dimensions.
4. Structural 1:1 environment/provenance invariant preserved:
   No invented provenance-only policy; structural 1:1 mapping between environment
   and provenance class is preserved.
5. Honest proof tracking:
   Documented actual 38 native tests in `docs/e2e-run-contract.md`; updated current focused
   source SHA-256 digests and focused test check results in `proof/e2e-run-contract/PROOF.md`
   and `verification.json`. Parent full verification passed on these source hashes,
   including 138 native tests and all 25 command stages. Preserved historical
   Cycle 8, Cycle 7, Cycle 6, and pre-integration snapshots, and Limits section.

The in-memory lifecycle demonstrates ownership/cleanup intent before allocation,
exact reconciliation, bounded failure retention, safe cleanup receipts, and separate
inactive-history expiry. No runtime source files changed.

## Historical Verification (Repair Cycle 9)

Node v22.23.2, matching the repository `.nvmrc`:

- `node --test tests/e2e/run-contract.test.mjs`: 38 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- The final 38-test suite run against the pre-repair source passes 37 and fails 1
  (the reproduced `assessRun` status precedence defect where correlation mismatch
  failed to force status blocked on failed/unknown journey outcomes). The repaired source
  passes all 38.
- `npm run verify`: exit 0. All 25 command stages completed, including 138 native
  tests, builds/type checks, route/CMS, upgrade and Cloudflare denial checks.
- Decision `website-e2e-run-contract-049` reverified through the pinned CLI against
  this current proof after the parent full verification passed.

Historical cycle9 focused source SHA-256 digests:
- `tests/e2e/run-contract.mjs`: `681fce36c64b56479fd6bf1e6a6d11fbcbd003e8354a317d6741991ef85f4a09`
- `tests/e2e/run-contract.test.mjs`: `e7b1a2d6a0e3a84889996e2b845bf8ba58389d03e22c0506d3f8bcc1ecf09ea6`
- `docs/e2e-run-contract.md`: `ce1ad79af32a3d62d0a99ec4c582a06cefcbd3159a0fc6440e9bd8c6f3a16303`
- `package.json`: `7edc505656659e256235c5740d150584b6482212cbe57669b673385ec1fc436b`

## Historical Verification (Cycle 8 Snapshot)

In cycle 8 (`2afd397321254a4a3683edec9858b4501455d8b8`), 36 native tests passed:
- `node --test tests/e2e/run-contract.test.mjs`: 36 passed, 0 failed, exit code 0.
- `git diff --check`: exit 0.
- `node scripts/audit-repo.mjs`: exit 0.
- `./scripts/grilltrack --project . validate`: valid.
- `npm run verify`: exit 0. All 25 command stages completed, including 136 native
  tests, builds/type checks, route/CMS, upgrade and Cloudflare denial checks.
- The 36-test suite run against the pre-repair source passed 33 and failed 3.
  The repaired source passed all 36.

Historical Cycle 8 source SHA-256 digests:
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
  check was not reached locally. CI 38182169287 passed full verification on
  that exact cycle 7 head; local full-suite success was not claimed.
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
  HTTP 200, but the build still could not finish its font downloads. CI attempt 2 passed on that exact cycle 6 head (run 38180462397);
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
- Unspecified/wildcard address form rejection for nonlocal target and receipt origins while preserving canonical hosted HTTPS and local loopback;
- Status precedence enforcement in `assessRun` forcing overall status blocked on evidence correlation mismatch across all journey outcomes while preserving separate journey, failure descriptor, and cleanup semantics;
- Isolated hosted `deployment_ref` correlation mismatch verification.

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
