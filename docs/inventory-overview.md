# Website Inventory overview

The website consumes [Inventory's metadata contract](https://github.com/dinkuskit/inventory/blob/b9ae464692eb0cc5d113e9db9285429af73dc736/docs/implementation/account-overview.md)
for one organization. `/account/inventory` uses the persisted selected organization.
`/account/operator/inventory?organization_id=...` requires an independent operator
read grant for that exact caller and organization; it provides no directory.

The screens show allocated pool counts, retained site relationships, per-pool
site counts and `pending`, `ready` or `failed` provisioning. Verified origins and
retained/revoked access come from Website bindings for the server-loaded stable
organization authority subject. Unknown bindings remain unknown. Retained
Inventory relationships are not proof of current Website access. Products, SKUs,
stock quantities, contacts, location details and operation data are excluded.

Available empty metadata means the service observed zero. Unavailable means
counts and rows are unknown. Both service observation times are retained;
snapshots older than 15 minutes carry an explicit age warning. This is a UI age
threshold, not a health guarantee. Live pool health remains unavailable, and
provisioning readiness is not presented as a health check. Refresh is read-only.

## Authorization and source seam

Current D1 login status, organization admission and ID-to-authority-subject
mapping are checked before and after asynchronous service reads. Merchant reads
also require current membership and the persisted selection. A separate
purpose-specific read provider must authorize every exact caller/organization;
membership, Owner privileges, site-view permission or CMS administration alone
never grant this permission. Operator grants are separate from merchant grants.
The independent caller uses its personal stable canonical account ID, while the
signed organization subject selects the retained Inventory account.

`createSignedInventoryReader` is a source seam requiring an explicit fixed HTTPS
endpoint and signer. It signs the scalar `inventory-account-overview` audience,
sole `inventory:account-overview:read` scope, independent caller, server-loaded
organization ID and subject, and integer issuance/expiry with a 300-second
lifetime. Tokens stay server-side. The reader rejects redirects and bounds time
and bytes; its DTO boundary validates the merged nested response, count/row
relationships and observation dates, then projects only allowed metadata.
It does not reuse `inventory:admin` or persist public keys.

## Activation remains separate

Production installs no overview authorization provider, signer or service
endpoint. Merchant reads therefore show unavailable; operator reads deny access.
Existing signing-key bindings, CMS identities and any test KV bindings do not
activate overview access. The request-scoped injected runtime exists solely in
the controlled local test entry; the production entry never supplies it.

A hosted implementation needs a separately approved merchant read policy,
independent operator principals and exact-organization grants, current-state
provider, token issuer/JWKS trust, Workers-safe fixed service transport and
endpoint, plus hosted proof and deployment approval. No live grants, keys,
account actions, SMS, hosted Inventory reads or deployment were performed in
this source slice. Suspension, recovery, billing and deletion execution remain
outside it.
