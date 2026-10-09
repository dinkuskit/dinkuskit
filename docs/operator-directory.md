# Read-only operator directory

`/account/operator` lists existing people and organizations with bounded literal
search and pagination. Person details show paginated organization memberships;
organization details show paginated member IDs, roles, permissions, status,
admission and linked stores. Store details show the existing service grant,
grant/revocation times and latest matching website connection timestamps.

The server-owned D1 provider grants only `operator:directory:read` across all
organizations and their directory records. It authorizes the exact caller and
resource on every check; the scope grants directory, person, organization and
store reads, without merchant membership or a selected organization. Each
related organization and store, including pagination lookahead, remains checked
before a complete response is returned. Test providers can restrict individual
resources; production grants cover the complete directory.

Neither CMS editor access, merchant ownership, email address nor membership
confers directory authority. The separate organization approval surface uses
current local CMS Admin authority only for pending admission decisions; see
[organization approvals](organization-approvals.md). Better Auth authenticates the person; the existing
DinkusKit-owned stable subject supplies the canonical identity. Caller enabled
state and identity bracket asynchronous authorization. Grants and store binding
ownership are rechecked after reads. Exceptions deny or return unavailable
without partial rows. Authorized missing resources return 404. GET routes are
private and no-store. The provider caches no decisions and uses ordinary D1
binding reads against the primary, not a read-replica session (see
[Cloudflare D1 guidance](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession)).

Migration `0005` creates an empty `dinkuskit_operator_grant` table. Missing,
invalid or revoked records deny access. No actual principal is named or seeded.
Initial activation is reserved for the sole operator explicitly approved by the
maintainer. Additional staff require individual explicit approval and records;
there is no automatic grant or role inheritance. Deployment and live binding
remain separate approval gates.

## Separately approved setup and revocation

An authorized maintainer first verifies the intended existing account's stable
subject through a trusted account record, independently of its mutable email.
Use `JSON.stringify(["https://dinkuskit.com/account", subject])` as `account_id`.
Record the authorizing actor, Unix timestamp in seconds, and approval reference.
These fields are minimal lifecycle provenance, not directory-access logging.
The actor/reference must be nonblank, trimmed strings of at most 200 characters
without control characters. Timestamps must be positive safe integers.

The following SQL illustrates synthetic local records only; this change does
not execute it against a live database or supply a grant-management UI/API:

```sql
INSERT INTO dinkuskit_operator_grant
  (account_id, scope, granted_by, granted_at, grant_reference)
VALUES ('["https://dinkuskit.com/account","synthetic-operator"]',
  'operator:directory:read', 'synthetic-maintainer', 1791500000,
  'synthetic-approval-001');

UPDATE dinkuskit_operator_grant
SET revoked_by = 'synthetic-maintainer', revoked_at = 1791500100,
    revoke_reference = 'synthetic-revocation-001'
WHERE account_id = '["https://dinkuskit.com/account","synthetic-operator"]'
  AND scope = 'operator:directory:read' AND revoked_at IS NULL;
```

Verify the exact affected record and retained provenance after either operation.
Any non-null revocation field denies access, including incomplete revocation.
Subsequent reads must deny without requiring logout; disabling the login also
denies. Retain revoked records and original grant provenance. Regrant lifecycle
is outside this slice; do not clear revocation or overwrite prior provenance.
This grant confers no Inventory observation, approvals, refunds, stock changes,
account management or other service mutation authority.

Pages default to 20 records and accept 1–50 records, with page 1–10000. Detail
pages use the same page for each related list, with a separate next/previous
control and heading for each. Oversized, malformed, duplicate or unknown query
parameters are rejected. Lists read one extra row for next-page detection;
missing/failed database results are never reported as empty. Offset pagination
is a current read, not a stable snapshot across concurrent record changes.

Website grants and connection records are not service observations. The
organization page links to the existing Inventory overview, which retains its
own exact-organization purpose authorization and observed/sample timestamps.
Payments and Ship observations remain unavailable. No installed plugin,
provisioning, health or disconnected state is inferred from a website grant.

`SiteBinding` remains one service per site. Shared site identity with independent
per-service grants and activation requires a separate scoped migration. No
account management, impersonation, recovery, suspension or connection mutation
is provided here. Live authorization and deployment require separate approval.

## Local proof

`npm run test:operator-directory` covers reader behavior and built routes.
After `npm run build`, run `node --experimental-strip-types scripts/operator-directory-proof.mjs` under Node 22 for a loopback-only synthetic
browser fixture. Sign in as the printed `.test` email and use the local mailbox
at `/__proof/browser`. The fixture is imported only by the test entry and is not
reachable from the production entry. It sends no email and grants no live access.
