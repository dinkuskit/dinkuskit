# Shared store connections

An organization owns one canonical store identity across Inventory, Payments,
and future services. Each service requires its own explicit Owner consent.
Admission to an organization never connects a store or activates a service.
Connecting Inventory never authorizes Payments, and the reverse is also true.
Ship integration is outside this slice.

## Registered contract

| Service | Client | Callback path | Public proof path | JWT audience | Scope |
| --- | --- | --- | --- | --- | --- |
| `inventory` | `dinkus-inventory-emdash` | `/_emdash/admin/plugins/dinkus-inventory/inventory` | `/_emdash/api/plugins/dinkus-inventory/store-proof` | `inventory` | `inventory:admin` |
| `payments` | `dinkus-payments-emdash` | `/_emdash/admin/plugins/dinkus-payments/status` | `/_emdash/api/plugins/dinkus-payments/store-proof` | `dinkus-payments` | `payments:admin` |

The server selects these values from the registered client/service pair, never
from arbitrary client-supplied proof URLs, scopes, or audiences. Payments consent
includes status and processor setup; it is not read-only and does not grant
`payments:checkout`. The Payments proof endpoint is a consumer contract requiring
separate implementation. These website changes do not prove live transport.

## Shared identity resolution

All new start requests to `POST /api/store-connections` contain
`protocol_version: 2`, the registered `client_id` and `service`, `site_origin`,
the exact registered `callback_uri`, `code_challenge`, and
`code_challenge_method: "S256"`. They must omit `site_id`. Both Inventory and
Payments use this protocol; missing or older protocol versions are rejected
with `unsupported_protocol`. The server resolves a candidate canonical ID from
the origin, or generates a UUID if the origin is new. The response contains
`protocol_version: 2`, `site_id`, and the connection ID, challenge, verification
URI, expiry and polling interval.

This candidate is not authorization. The initiating plugin administrator must
freeze that entire connection in its private challenge state. Its public proof
receipt uses `version: 2` and echoes the exact returned ID, connection ID,
challenge, registered client/service, origin, callback, PKCE challenge, and
expiry. A current admitted organization Owner must separately consent. The
server compares the receipt from the registered same-origin proof route and
atomically checks canonical origin/ID/organization ownership before granting
only the selected service. Email and origin strings alone grant nothing.

Token exchange retains `client_id`, `connection_id`, and `code_verifier`; the
client must match the stored connection. Success retains `access_token`,
`token_type`, `expires_in`, and canonical `site_id`. The configured issuer is
`https://dinkuskit.com/account`; `sub` remains the organization's existing
authority subject. Payments sends the canonical ID as `X-Dinkus-Site`; Inventory uses
`X-Inventory-Site`. Each must exactly match the signed claim. Payments requires an existing canonical ID to match
`^[A-Za-z0-9_-]{1,200}$`; incompatible historical IDs fail closed, never remap.

Transactions expire after ten minutes. Tokens last five minutes. There is no
refresh token or automatic grant renewal; reconnect repeats explicit consent.
Revoked grants are not silently revived. A service grant check never uses a
different service's grant. Ownership transfer and cascading revocation are not
implemented by this contract.

## Fresh protocol and development reconnect

Existing Inventory connections are development/test connections. Preserving
version 1 protocol compatibility or migrating those grants is not required.
The clean schema separates `dinkuskit_store_identity` (unique ID/origin and
organization authority subject) from `dinkuskit_service_grant` (site/service,
revocation state and timestamps). A grant references the canonical identity;
it cannot carry a second, conflicting owner or origin. The additive migration
creates these tables without copying, deleting, or modifying old test bindings.
Old pending transactions cannot issue new-protocol tokens. Old tables are inert
historical development data, not alternate authorization sources.

Development users must update each plugin to protocol version 2, clear only its
own obsolete connection session through a separately authorized development
reset, and explicitly reconnect each service. No reset command is executed by
this website slice. A new shared connection does not silently adopt or rewrite
an old plugin UUID, inventory data, or processor connection. Any development
fixture/data reset must be scoped and approved separately. Inventory and
Payments consumer updates are required follow-up work; this is not an
end-to-end installed-plugin availability claim.

Either service may connect first. The second reuses the same established ID
only after ownership proof and independent consent. Concurrent new-store
attempts may produce different provisional candidates; only one canonical
identity can win. The other must restart and resolve the established identity.
Cross-organization attempts remain denied even with a valid origin receipt.
Production issuance remains unavailable until transport qualification is
separately completed.

## Consumer failure handling

Only `authorization_pending` continues polling, using the returned interval.
`already_redeemed` never permits reusing a consumed verifier to mint another
token. `expired_token` requires a fresh explicit connection. `unsupported_protocol`
requires a client update and a new flow; `site_id_not_allowed` means remove the
caller-supplied ID. `invalid_client`, `invalid_callback`, `invalid_pkce`,
`invalid_grant`, and `invalid_site_id` stop the current attempt. Do not switch
service, broaden scope, or guess another identity in response.

Consent failures include `ownership_conflict`, `origin_id_conflict`,
`grant_revoked`, `organization_forbidden`, `not_owner`, `not_pending`,
`approval_failed`, and `proof_mismatch_<field>`. A competing new-store attempt
that loses the origin/ID race must start again to resolve the established ID;
this is not ownership-transfer permission. A denied attempt exchanges as
`access_denied`. Disabled or unauthorized owners cannot exchange approved
transactions. `grant_revoked` blocks issuance for that service. The consent page
keeps failures on the website rather than trusting an arbitrary callback.

`integration_unavailable`, `signing_key_unavailable`, and `invalid_signing_key`
mean the service cannot currently issue credentials. No consumer may fall back
to manual tokens or another service's token. This list describes expected
classes; unknown errors also fail closed.

## Local integration proof

Run with the pinned Node version: `npm ci`, `npm run setup`, then `npm run build`.
`tests/helpers/merchant-harness.mjs` exports `startMerchantTestRuntime`, `signup`,
`request`, `accountForm`, and `stopRuntime` for isolated real local Worker routes
and normal merchant sessions. Its receipt sink is a labeled simulation, not an
installed plugin. `tests/shared-store-routes.test.mjs` exercises both grants,
separate consent, and service-specific revoke through those routes.

For an actual local plugin dispatcher, import `startInventoryMemoryController`
from `tests/helpers/inventory-memory-runner.mjs`. Its historical name is retained.
Pass distinct free `websitePort` and `storePort` values. It exposes
`safeURLs.website`, `expectedStoreOrigin`, `jwksURL`, public verification key,
`dispatch(Request)`, `restart()`, `stop()`, and `cleanup()`. `dispatch` admits
only POSTs to the canonical HTTPS website's two connection API paths, without
query/fragment, then forwards unchanged bytes to the isolated local Worker.
The proof transport admits only the configured exact loopback store origin and
the registered client/service proof path. Register the real plugin's dispatcher
on that port; do not substitute a success receipt for installed-plugin proof.
The browser mailbox at `/__proof/browser` completes synthetic email sign-in.
`safeURLs.callback` is the Inventory convenience value; Payments uses its
registered `status` callback. Always stop before cleaning up owned persistence.

Record immutable source hashes for this helper, `tests/fixtures/built-memory-test-entry.mjs`,
and the generated `dist/server/entry.mjs` in downstream proof. Generated bundles
must come from the handed-off source revision. This loopback harness does not
qualify production DNS/fetch safety, live accounts, or service activation.
