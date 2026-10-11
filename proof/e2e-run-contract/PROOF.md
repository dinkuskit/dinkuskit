# E2E run contract source proof

Repository: dinkuskit/dinkuskit. Base: `4c8fdcc30e141075ee39edb017f193622840ac8c`.
Decision: `website-e2e-run-contract-049`, recorded through the pinned GrillTrack CLI.
Executable candidate identity: SHA-256 values in `verification.json`. The final
commit contains those exact verified source bytes plus this curated proof and
CLI-maintained ledger history.

## Outcome

One strict manifest/result vocabulary in `tests/e2e/run-contract.mjs`, with 23
native behavioral tests. The manifest binds run/environment/target provenance,
required independent stage evidence, admission and assistance requirements,
resource/recipient/capability references and deadlines. Result reduction keeps
journey, cleanup and assistance separate. The in-memory lifecycle demonstrates
ownership/cleanup intent before allocation, exact reconciliation, bounded
failure retention, safe cleanup receipts and separate inactive-history expiry.
No runtime source files changed. PR36 local harness, PR37 account UI and PR33
deployment work remain independent. Package and ledger changes will need normal
composition when those branches land.

## Verification

Node v22.23.2, matching the repository `.nvmrc`:

- `npm ci`: exit 0.
- `npm run test:e2e-contract`: 23 passed, 0 failed.
- `npm run verify`: exit 0; repository audit, setup, generated types, typecheck,
  builds, account/merchant/shared-store/foundation/inventory/approval/operator
  tests, smoke, CMS, release reuse, access/URL/helper, upgrade and Cloudflare
  denial checks completed. Native test groups total 117 tests with no failures.
- `git diff --check`: exit 0.
- GrillTrack CLI `validate`: valid.

## Inspection and adjudication

ACP implementation was inspected independently by the source owner after
observed terminal writer cleanup. Accepted required fixes: manual admission and
assistance requirements; explicit provenance/stage-owner binding; cleanup
receipt verification rather than status/boolean trust; correctly directed
issued-authority expiry; fixed first-failure/heartbeat clocks; failure cleanup
at expiry; interrupted reconciliation preserving failure; exact resource
ownership; budget/active admission gates; strict restart shape and chronology.
Those findings were repaired within two bounded passes and exercised by the
focused tests. No findings were rejected as false positives. Independent
repository review is pending and owns any later repair admission.

## Limits and next gate

This verifies deterministic source policy over fake resources. Receipt refs
and hashes are declarations, not authenticated provider receipts. Snapshot
validation does not authenticate storage. The history fixture retains an
ownership tombstone; it does not implement provider data deletion. No hosted A
or deployed B journey, remote cleanup scheduler, browser/mail execution,
Registry installation, Stripe operation or real revocation was run. Future
adapters must qualify those behaviors under their own live gates.

Delivery stops at a draft PR and source proof for independent review. No merge,
deployment, publication, live account mutation or external mail is included.
