# Historical run-contract repair (cycle 3)

This records the repair delivered in `1470df4d0d9414610fe899ad6f8c28b6e1aaf7f6`.
See `PROOF.md` and `verification.json` for current-source verification.

Reviewed input: `5d7c9691bc0bff3ba6d013f0c5d57d88391e97a5`, against
`771d91245918f321afbd55f495ec34741e6f09df`.

Three accepted review findings are repaired:

- Cleanup receipts require `cleanup-pending` or `failed`. Observations made
  before allocation or while the journey is active cannot clear cleanup.
- Failed journeys require the existing sanitized failure descriptor.
- Every nonlocal provenance class rejects the `deployment-local` sentinel,
  including deployed-B public releases.

Regression coverage rejects the invalid inputs and preserves valid local and
public-release targets, unknown journey outcomes, immediate success cleanup,
failure retention, and new admission only after cleanup resolves. Existing
cleanup tests now record service-safety observations after cleanup begins.

The repaired suite passes all 26 tests under Node 22.23.2. Running that suite
against the reviewed pre-repair module yields 22 passes and four failures,
covering the three defects and the affected cleanup-order assertion.

The complete `npm run verify` suite also exits successfully under Node 22.23.2.

These checks remain source-only fake-resource proof. They do not establish
hosted journeys, real resource cleanup, mail delivery, or production readiness.
