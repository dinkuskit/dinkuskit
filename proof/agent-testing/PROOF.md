# Local agent testing proof

Base: `4c8fdcc30e141075ee39edb017f193622840ac8c`.
Decision: `website-agent-testing-032`.
Implementation: isolated test entry and HTTP runner, not production authentication.

## Scope

The run uses only fixed synthetic owner/staff identities and a reserved-domain
store. Email and store ownership transport are simulations. Normal built
Better Auth, account, membership, consent and Ship authorization handlers are
exercised. No hosted test, real delivery, browser visual coverage, purchase,
production account mutation or deployment is claimed.

## Verification

- Node 22.23.1, locked dependencies (`npm ci`).
- `npm run setup` and `npm run build`: passed.
- `npm run typecheck`: passed; 73 files, zero errors/warnings/hints.
- `npm run test:agent-routes`: passed; five tests, no failures/skips.
- `npm run agent:test`: passed, including its clean build and sanitized result.
- Initial full verification under Node 22.23.1 passed through the merchant,
  operator, smoke, and helper suites, then stopped on the existing CMS fixture
  requirement for exactly Node 22.23.2. A full rerun under the `.nvmrc` version
  passed end to end: `npm run verify` exited 0 under Node 22.23.2.

The focused tests cover fixed identity and origin restrictions; wrong/missing
run credentials; production endpoints absent even with rogue test bindings;
request/body/lifetime limits; real local sessions; separate actor jars;
Ship-only permission readback; administration denial; permission revocation;
member removal checked in both existing and fresh sessions; synthetic email
expiry and one-use mailbox completion (not raw token replay); synthetic store consent and code replay;
success and failure cleanup of the owned database.

## Review

Local inspection required and repaired explicit failure status on unsuccessful
mail completion, constant-time credential comparison, bounded response waits,
member-removal coverage in addition to permission revocation, and private
permissions on generated test configuration. Exact-source automated review is
requested after this candidate is frozen; the PR carries its current status.

Existing dependency audit notices from `npm ci` were not remediated in this
focused change. No dependency versions were changed.
