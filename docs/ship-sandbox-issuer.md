# Isolated Ship issuer contract

The optional server-owned `SHIP_SANDBOX_REGISTRATION` binding is JSON with exactly
`siteId` and `generation`, both matching `^[A-Za-z0-9_-]{1,128}$`. No binding means
existing production behavior. A present malformed binding makes merchant runtime
unavailable. Do not commit activation values or populate the binding as part of
source verification. Activation requires separate architecture and human approval.

For the registered site, the only Ship recipient is `ship-sandbox`, at exactly
`https://ship.sm0ky.dev`, callback `/auth/callback`, audience
`dinkus-ship-sandbox`, mode `test`. Neither the caller nor the registration can
choose URLs or audiences. Existing store identity, store key and Ship grant retain
shared consent. Production Ship passes are refused for the registered site.

Sandbox `/api/store-passes` requests contain exactly `site_id`, `scope`, `audience`
and `generation`; scope must be `ship:orders`. Generation must match registration.
Persisted Commerce settings must exist with `live = 0`. Legacy requests keep their
existing three fields. The sandbox JWT adds only `ship_recipient`,
`ship_generation`, `ship_mode` to the existing claims; it does not attest an order,
cohort, payment status or freshness. The receiver must enforce site, audience,
scope and generation, actual TEST status, and its separately approved exact-order
admission before effects. Commerce owns immutable order recipient pins and atomic
disable/completion fencing; no historical order migration is implied.

Generated sandbox checkout `ship` settings contain `origin`, `audience`,
`recipient`, `generation`, `mode`. Production settings retain their existing
shape. A registered sandbox site cannot save live checkout settings through the
account route. Other services and sites retain their authorization paths.

Codes and refresh families persist nullable recipient/generation/mode columns.
NULL means legacy, never sandbox. A family or code must match current registration
and TEST settings at redemption/refresh. Removing registration or changing its
generation invalidates sandbox families; registering a site refuses its legacy
families. PKCE, single-use codes, rotation/replay, current login, membership,
account and grant checks remain. Code callbacks are fixed at creation. In-flight
codes fail rather than gaining a new recipient on exchange. Generation values
must not be reused across activation epochs.

Already-issued JWTs are not instantly revoked by issuer configuration. Receivers
must enforce active generation and audience, and activation must quiesce old
sessions/tokens and outstanding operations. Default JWT TTL is five minutes;
expiry alone does not drain provider operations or renewable legacy sessions.
No shared key reset or blanket grant revocation is part of this change.

This source slice does not activate a site, send email, create orders, configure
provider accounts or deploy services. Local runtime tests use synthetic identities,
local D1 and mail capture. They do not prove deployed identity or downstream
no-email behavior. The isolated Ship receiver must suppress email independently
of binding availability. A fresh paid TEST order can be admitted only under a
later explicit execution/configuration approval; existing paid evidence stays
unchanged.
