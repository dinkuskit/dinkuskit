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
| `payments` | `dinkus-payments-emdash` | `/_emdash/admin/plugins/r_3brsc2on3bu673rn/status` | `/_emdash/api/plugins/r_3brsc2on3bu673rn/store-proof` | `dinkus-payments` | `payments:admin` |
| `payments` (beta) | `dinkus-payments-emdash` | `/_emdash/admin/plugins/r_sffx6l4z6mpqliki/status` | `/_emdash/api/plugins/r_sffx6l4z6mpqliki/store-proof` | `dinkus-payments` | `payments:admin` |

The server selects these values from the registered client/service pair, never
from arbitrary client-supplied proof URLs, scopes, or audiences. Payments consent
includes status and processor setup; it is not read-only and does not grant
`payments:checkout`. The Payments proof endpoint is a consumer contract requiring
separate implementation. These website changes do not prove live transport.

Payments paths use the EmDash Registry installed ID `r_3brsc2on3bu673rn`, derived
by pinned EmDash 1.2.0 from publisher `did:plc:ekk4pjmkh3k3ql2kfoex3qt4` and slug
`dinkus-payments`. The Payments manifest's publisher identity is the registration
input; the package slug alone is not the installed route ID. The previous slug
callback/proof paths are rejected. Another publisher's derived ID, an arbitrary
`r_*` string or a caller-provided path cannot select a different registration.
An exact registered path still does not attest installation by itself: origin
proof, transaction comparison and current Owner consent remain required.

The Payments beta package (slug `dinkus-payments-beta`, same publisher) installs
as `r_sffx6l4z6mpqliki` and is the second registered Payments installation. Both
use the same client, audience and scope, and a store holds one Payments grant
whichever installation connected it. The callback a connection starts with picks
its installation, the server stores it, and consent reads the store check only at
that installation's proof path; nothing at consent can name another path.

Inventory's listed slug paths currently describe a config-managed local sandbox
installation only. Its manifest has a placeholder publisher; no approved Registry
publisher identity is established by this contract. Do not substitute the Payments
publisher or claim Inventory Registry installation from the local fixture. A
separately evidenced publisher assignment and exact-path registration are required
before Inventory Registry integration can be qualified. Production issuance works
for Payments through the production proof fetch (see "Production proof fetch").

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
Revoked grants are not silently revived. After the owner revokes a service on
the sites page, a new explicit Connect consent for that store and service
grants it again. An operator cut-off on the admin's Stores and services page
revokes the same grant and marks it `revoked_by = 'operator'`: Connect then
refuses that store and service with `grant_revoked`, even for a fresh consent,
until an operator presses Restore, after which the owner connects again. A
revoke or cut-off also denies that store and service's approved connections
that were not yet exchanged for a token, so reconnecting never revives them. A service grant check never uses a
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

## Store keys and passes for Commerce

Commerce cannot press Connect (it has no room for that code), so it reaches the
hosted services with a store key instead. On `/account/sites` the owner of a
store's business sees **Set up Commerce** for each store that already has a
DinkusKit store ID from Connect, and can:

- turn Coupons and Ship on or off for that store. Turning one on is the owner's
  consent and creates or revives that service's grant. Turning it off is an
  owner revoke. Payments is on while its own Connect grant is active, and is
  turned off with Revoke on the same page. An operator cut-off refuses
  turning a service on again until an operator presses Restore. Coupons shows
  as coming soon and cannot be turned on yet (`COMING_SOON_SERVICES`), because
  Commerce's v1 Registry build refuses every coupon code to stay under the
  Registry size limit. The route still answers `coupons:checkout` for a store
  that has Coupons on, so turning it back on later is only a page change;
- create or replace the store key. The key is `dk_store_` followed by 32
  random bytes in base64url. It is shown once and only its SHA-256 hash is
  kept. Replace key overwrites it, so the old key stops working at once.

Commerce trades the key for a pass whenever it needs one:

```
POST /api/store-passes
Authorization: Bearer <store key>
{"site_id": "<store ID>", "scope": "payments:checkout", "audience": "dinkus-payments"}
```

The allowed pairs are `payments:checkout` with `dinkus-payments`,
`coupons:checkout` with `dinkus-coupons`, and `ship:orders` and `ship:admin` with
`dinkus-ship`. `ship:admin` is for the Ship plugin in the store admin, which
trades the same key; it is on and off with the store's Ship switch, like
`ship:orders`, and Ship answers its admin routes only for that scope.
The answer is `{"access_token", "token_type": "Bearer", "expires_in": 300}`: an
ES256 pass from the same issuer and keys as Connect passes, with `sub` the
business's subject, `site_id`, `site_origin` (the store's web address exactly as
Connect checked and stored it), `scope`, `iat` and `exp`. Payments builds each
store's own checkout return pages, `/checkout/success` and `/cart`, from
`site_origin` and refuses to start a checkout without it, so DinkusKit.com must be
deployed with this claim before Payments. `iat` is dated two
seconds back so a verifier never sees it in the future; the pass lasts 300
seconds from it. Commerce may reuse one pass until it expires. The route never
redirects. Every trade checks, in this order:

| Status | Error | Meaning |
| --- | --- | --- |
| 401 | `invalid_store_key` | missing, malformed, unknown or replaced key |
| 400 | `invalid_request` | body is not exactly `site_id`, `scope`, `audience`, or the pair is not allowed |
| 429 | `rate_limited` | more than 1,200 trades for this key in the current minute |
| 403 | `site_mismatch` | the key belongs to another store |
| 403 | `store_suspended` | the business is suspended, waiting for approval, or its owner is suspended |
| 403 | `service_cut_off` | an operator cut that service off |
| 403 | `service_not_enabled` | the service is not on for this store |
| 503 | `signing_unavailable` | passes cannot be signed right now |

A store that has no store ID cannot get a key: the store ID still comes only
from pressing Connect in the Payments or Inventory plugin.

### Checkout settings to paste

Commerce also needs its `installedCheckout` setting: one JSON text in
Commerce's `dinkuskit.commerce.registry-checkout/v1` shape, which refuses any
missing, extra or malformed key. Under **Set up Commerce** the owner picks a
shipping charge (free, or a flat amount in dollars) and Test or Live, then
presses **Show checkout settings**. The page then:

1. saves the choices in `dinkuskit_commerce_settings` (one row per store). The
   shipping `revision` starts at 1 and goes up only when the charge changes,
   and `configurationId` stays `shipping-<store ID>`;
2. asks Payments for the store's account with `GET
   https://payments.dinkuskit.com/v1/status`, sending a `payments:admin` pass it
   signs for that store and `X-Dinkus-Site: <store ID>`, never following a
   redirect, waiting at most 5 seconds and reading at most 16 KB. `bindingRef`,
   `connectionEvidence.provider` and, for Stripe, `connectionEvidence.accountRef`
   come from that answer. It is only asked while the store's Payments grant is
   active;
3. shows the JSON with keys in this order: `schema`, `enabled`,
   `commerceOrigin` (the store's origin from Connect), `siteId`, `issuer`,
   `paymentsOrigin`, `audience` (`dinkus-payments`), `bindingRef`,
   `providerId` (`stripe` or `authorize_net`), `stripeAccountId` (Stripe only),
   `mode`, `pricingSchema`, `shipping`, then `coupons` and `ship`, each only
   while that service is on.

`mode` is `test` unless the owner picks Live, and a store takes real money only
when Payments says live too. Turning Coupons or Ship on or off after settings
were shown leads back to the page with a note to show and paste them again,
because Commerce only calls the services its settings name. The page names the
problem instead of showing settings when Payments is not connected, has not
finished setting up the account, or cannot be reached.

The answer is read as Payments' hosted status: `state`, `mode`, `bindingRef`
once a connection has started, and `connectionEvidence` (`provider`, `mode`,
`result`, and `accountRef` for Stripe) once an account exists. `disconnected`,
`connecting` and `recovery_required` give no settings; `setup_required`,
`checking` and `action_required` give settings with a note that Payments still
needs attention; `ready` gives settings with no note.

Payments is on the same Cloudflare zone as this site. Without
`global_fetch_strictly_public`, a Worker's fetch to its own zone goes straight
to the origin and skips any Worker on a route there, so the deployed site sets
that flag in `cloudflare/wrangler.jsonc`. Its call to `payments.dinkuskit.com`
then enters Cloudflare the same way a store's call does, whether Payments runs
on a route or a Custom Domain. The tests use a stand-in for Payments' status,
so the first live proof is showing checkout settings for a connected store
after deploy.

## Sign in with DinkusKit.com for Ship

Ship's label page on `https://ship.dinkuskit.com` asks DinkusKit.com who the person
in the browser is. The contract is Ship's (`ship-owner-signin-001` in
dinkuskit/ship); this site's side is:

- `GET /account/ship-sign-in?site_id=…&state=…&code_challenge=…&code_challenge_method=S256`,
  exactly those four parameters. Someone not signed in signs in first and comes
  back to the same request. A signed-in person may print labels for the store when
  they are an active member of the business that owns it: the owner, an
  Administrator, or an employee the owner ticked **Print shipping labels in Ship**
  for (`ship:labels` on the account page). The answer is always a 303 to the one
  fixed address `https://ship.dinkuskit.com/auth/callback` (`SHIP_SIGN_IN_CALLBACK`)
  with `code` and `state`, or with `error` and `state`:
  - `access_denied`: not an active member, suspended, or no label permission;
  - `store_unavailable`: the business is not active and approved, or the operator
    cut Ship off (the same rule as `/api/store-passes`);
  - `ship_not_enabled`: the owner has Ship off;
  - `invalid_request`: any other parameter is wrong.

  A request with no usable `state` gets a page here instead. The code works once,
  for 60 seconds, and is bound to the store, the person, their DinkusKit.com
  sign-in and the PKCE challenge. Only its SHA-256 is kept.
- `POST /api/ship-sign-in/token`, server to server, never redirects. The body is
  either `{code, code_verifier}` or `{grant_type: "refresh_token", refresh_token}`.
  A `200` is `{access_token, token_type: "Bearer", expires_in: 300, refresh_token}`.
  The pass is signed like store passes, with `aud` `dinkus-ship`, `scope`
  `ship:labels` (never minted by `/api/store-passes`), `site_id`, `sub` (the
  business), `uid` and `email`.

  Each refresh returns a new refresh token, and the one before stops working.
  Presenting it again ends that Ship sign-in, because it means someone holds a copy.
  Every refresh checks everything again. It is refused with `400 invalid_grant`
  once the person signed out of DinkusKit.com, or their DinkusKit.com sign-in
  expired, or their email changed, or anything the first check covers changed. A
  refresh counts as using DinkusKit.com, so it extends that sign-in the way a visit
  would (Better Auth's rule: once a day, to a week from now). Someone who only uses
  Ship stays signed in until they sign out. A missing signing key answers `503`.

Migration 0012 adds `dinkuskit_ship_sign_in_code` and `dinkuskit_ship_sign_in`.
Ship's sender name and reply-to address are not part of this sign-in: Commerce
sends the store's EmDash Site title with each order, and Ship has its own reply-to
setting.

## Production proof fetch

The deployed site reads the store's registered proof route itself with
`fetchStoreProofReceipt`. Only `https:` public origins are fetched, with a fixed
path and a single `connection_id` query. Workers reject `redirect: "error"`, so
the fetch uses `redirect: "manual"` and refuses any 3xx or opaque redirect
instead of following it. Size and time limits and field-for-field receipt
comparison are unchanged. Workers cannot reach private networks, and the
hostname prechecks remain a convenience rather than a firewall. The first
connection from a real Registry store with the Payments plugin is the live proof.

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
