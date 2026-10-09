# Read-only operator directory

`/account/operator` lists existing people and organizations with bounded literal
search and pagination. Person details show paginated organization memberships;
organization details show paginated member IDs, roles, permissions, status,
admission and linked stores. Store details show the existing service grant,
grant/revocation times and latest matching website connection timestamps.

A separate `operator:directory:read` runtime authorizes the exact caller and
resource: directory, person, organization or store. A directory grant permits
the minimal directory listing; it does not confer detail access. Person details
also require each displayed organization's grant; organization details require
each displayed store's grant. Store details require the owning organization.
If a displayed relation is denied, the complete page is denied. The bounded lookahead used for next-page detection also requires authorization;
records beyond that lookahead are not read or returned.
Membership identities shown within an organization are that organization's
recorded user IDs; following a person link requires a separate person grant.

Production has no operator principal or grant provider and denies by default.
Neither CMS editor access, merchant ownership, selected organization nor
membership confers this permission. Existing Better Auth authenticates the
person; there is no additional account system. A signed-in operator may read
without a merchant membership. The source rechecks enabled caller identity
before and after asynchronous authorization, all grants after data reads, and
store binding ownership before returning the complete response. Exceptions
return unavailable or forbidden without partial rows. Authorized missing
resources return 404. GET routes are private and no-store.

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
