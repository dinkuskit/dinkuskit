# Explicit read-only operator authorization

Decision: `website-operator-authorization-027`.
Base: `a8a6529784875fbca084a1340affcdcdfc16ccd9`.

## Scope

A dedicated D1 grant keyed by canonical issuer and stable account subject
supplies only `operator:directory:read` across organizations. Migration `0005`
seeds no grant. CMS identity, mutable email, merchant membership and selected
organization confer no authority. Actor/time/approval-reference fields retain
minimal grant/revoke provenance; no management UI/API or access surveillance
was introduced. Setup and revocation instructions use synthetic identities.
No actual principal binding or live account permission was written.

Existing caller, relation, resource and binding checks remain around reads.
Missing, invalid and revoked grants deny; disabled or changed callers deny.
Directory authority does not authorize Inventory observations or other service
operations. Responses remain private and no-store.

## Independent verification

Parent verification under Node 22.23.2:

- `npm run verify`: exit 0, 60 Node tests and 135 scripted PASS assertions.
  Includes typecheck/build, merchant migrations and restart preservation,
  account/CMS isolation, Inventory and operator tests, CMS persistence and
  EmDash upgrade, and production/candidate namespace denial.
- Operator suite: 11 tests passed. Actual production entry proves a granted
  operator without memberships reads two organizations and person details;
  ordinary merchant and CMS-header requests deny; persisted revoke,
  malformed provenance and disabled caller deny on subsequent requests.
  Proof control routes are absent from the production entry.
- Persisted-provider tests preserve mid-read revoke, disable and subject-change
  denial, missing-schema denial, exact scope/caller identity and independence
  from changed email. Earlier pagination, lookahead, binding and service
  isolation tests remain passing.
- Additional authenticated CMS editor test: exit 0. A real CMS session reaches
  protected CMS settings but is redirected to account sign-in on operator read.
- `git diff --check` and repository audit passed before commit.

Generated logs are under ignored `.grilltrack/work/operator-authorization/`:
`parent-verify.log`, `cms-operator-isolation-final.log`, and `browser-fixture.log`.
The earlier CMS assertion failure is retained in `cms-operator-isolation.log`:
it expected a sign-in URL without the legitimate safe callback, then was fixed.
ACP used Luna Medium, and parent edits began only after terminal cleanup.
Parent review and dispositions are in `REVIEW.md`.

## Browser proof

Independent source-blind Chrome proof uses the actual built workerd application,
local synthetic sign-in mailbox and persisted D1 provider. It observes no
operator memberships, directory access, Redwood Works and Lakeside Lab details,
Inventory denial, revocation followed by denied refresh, restoration for an
independent case, disabled login followed by sign-in, and ordinary merchant
denial on both directory and direct foreign organization detail. Screenshots and the
validator report are retained under ignored `browser-proof/` in the working
proof directory; no auth URLs, cookies or real customer data are published.

The missing-runtime loopback probe returns HTTP 503 with `private, no-store`;
raw safe headers/body are `missing-runtime.headers` and `missing-runtime.json`.
The browser client blocked both loopback hostnames with `ERR_BLOCKED_BY_CLIENT`
before rendering this missing-runtime fixture. Its browser clause is explicitly
blocked; direct workerd HTTP evidence proves denial. The real CMS-session case
is covered by the authenticated workerd test, outside the browser run.

## Limits and delivery gate

All behavior uses synthetic local fixtures. This is source support, not a live
operator grant, hosted activation, service provisioning or deployment claim.
Regrant lifecycle, broader roles, approvals, refunds and mutation consoles are
outside scope. Revoked records must be retained; this slice provides no regrant
operation. Offset pagination retains the prior concurrent-update limitation.

CI, comprehensive OpenClaw P3 and native ClawSweeper terminal evidence must cover
the final immutable PR tuple. Their final receipts are recorded in the PR/run
closeout rather than inferred from dispatch or queue acknowledgments. Merge and
live activation remain maintainer decisions.
