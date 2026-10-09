# Read-only operator directory

Decision: `website-operator-directory-026`. Base:
`1bab0fe54588585d56831245d086eb9996850155`.

## Scope and contract

The website reads existing people, organizations, membership records and the
current single-service site binding. Independent `operator:directory:read`
authorization is denied by default; the production entry provides no operator
runtime. CMS identity and merchant membership provide no operator authority.
The local fixture uses explicit synthetic grants; it creates no live principal.
No schema migration, live account operation, service activation or deployment
is part of this change.

Directory and detail relations use bounded pagination. Exact related grants
are rechecked before response, including the extra row used to detect a next
page. Store connection lookup requires the current organization, account
subject and service. A final binding read refuses reassignment during the
request. The caller's current identity and enabled state bracket asynchronous
authorization. A grant provider must return current authority when it resolves.

Website grant/connection timestamps are labeled as website records. Inventory
observations remain behind their existing exact-organization authorization.
Payments and Ship observations remain unavailable. Existing single-service
`SiteBinding` is preserved; shared identity with per-service grants is a
separate follow-up.

## Verification

Under Node 22.23.2:

- `npm run verify`: exit 0; 57 tests and 135 scripted PASS assertions. Account,
  connection, CMS isolation, persisted editing/restart and actual EmDash 1.0.1
  to 1.2 migration checks passed.
- Final `npm run typecheck && npm run build && npm run test:operator-directory`:
  exit 0; 8 operator tests passed after the final lookahead and display fixes.
- `git diff --check`: clean. Repository audit runs before each commit.
- Actual Chrome on the built workerd fixture: sign-in through the local mailbox,
  directory entry without merchant membership, search, page navigation,
  organization/store details and separate Inventory permission denial.
- Final mobile viewport measured 390 × 844 CSS pixels. Store document width
  measured 390; long heading wraps. Desktop uses two columns, mobile one.

Generated logs and synthetic screenshots are under ignored
`.grilltrack/work/operator-directory-20261008/`: `verify-complete.log`,
`final-targeted.log`, `directory-desktop-final.png`,
`directory-mobile-final.png`, `organization-mobile-final.png`,
`store-mobile-final.png`, and `inventory-purpose-denied.png`. The screenshots
were directly inspected; they are local synthetic proof, not live customers.
The final fixture was restarted from the final build before the final captures.

Earlier failures are retained in working logs: D1 type declaration mismatch
(fixed with the repository-compatible statement type) and a synthetic grant
provider returning stale allow after its own revocation (fixed to return current
authority). Neither is counted as a pass.

## Parent review of worker handoff

The parent rejected the initial worker handoff as incomplete and repaired:

- Unbounded/truncated related records: explicit bounded pagination.
- Missing member identity: render the membership's recorded user ID.
- Per-query checks that could miss later revocation: one complete response
  boundary rechecks all exact resources and the current caller.
- Site-only latest connection lookup: constrain organization, subject and
  service; fence binding changes during the read.
- Selected-organization middleware dependence: authenticated operator routes
  proceed independently, with authorization enforced by the reader.
- Missing/invalid input states: authorized 404, strict pagination and private
  error responses; database failure does not become an empty result.
- Mobile long-heading overflow and page-size display mismatch: responsive
  wrapping and matching selected page-size option.

These are required fixes, not deferred findings. Source review and external
review receipts bind to immutable commits in the PR and run proof.

## Limits

No real operator grant/provider, Inventory observation endpoint, Payments/Ship
observation contract, live provisioning or deployment was exercised. Local
fixtures prove the source behavior and visible UI only. Offset pagination is
not a stable database snapshot across concurrent changes. The requested
historical Inventory onboarding proof was absent from the assigned checkout;
this change relies on the current website contract and its regression tests,
not an unobserved cross-repository result. No Inventory source was changed.
