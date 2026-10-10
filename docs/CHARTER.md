# DinkusKit website charter

## Accepted direction

DinkusKit's website is an EmDash-powered public home and account experience for its hosted commerce services. Use upstream native EmDash blocks; do not depend on the archived `dinkuskit/blocks` repository, which is reference only.

The canonical public address is `https://dinkuskit.com`. Local development uses localhost. Production routing and deployment are separate from this scaffold.

The first audience already has an EmDash site. The intended journey is Registry plugin installation, Connect, DinkusKit sign-in, explicit site authorization, service activation, then return to EmDash. Merchants do not configure hosting infrastructure or enter service API keys.

The public site explains the products, getting started, documentation, support and trial availability truthfully. The account area handles local signup, sign-in, recovery and logout. Shared Inventory and Payments Connect uses `/api/store-connections`, `/account/connect`, and `/api/store-connections/token` with S256 PKCE, explicit per-service consent, and compared store-proof receipts. Each organization-owned store has one canonical identity, with separate service grants. See `docs/shared-store-connections.md` for protocol version 2 and the required development-client upgrade/reconnect. Production consent fetches the registered proof route from the store and refuses redirects; a first connection from a real Registry store is still the live proof. Local protocol tests may inject a labeled simulation transport. Hostname prechecks are not a DNS or IP firewall. Inventory is coming soon and is not a prerequisite for Commerce. Initial hosted Inventory access is planned as a trial without payment details; no duration, quota, price or permanently-free promise has been selected. Commerce and the Template Store will be released together as a verified pair. A public browse-and-cart storefront demo (with disabled checkout and synthetic catalog) and a development-source template setup guide are published on Getting started, while the released installable package pair remains pending.

Daily product, stock and order management remains in the merchant's EmDash site for the initial experience. Inventory owns stock truth, Commerce owns prices and orders, and Payments owns processor integration.

## Identity boundary

An organization owns its sites and Inventory pools. A Better Auth login may belong to several organizations and switches its current organization explicitly. Each organization has exactly one Owner. The Owner can explicitly delegate Administrator employee-management authority with selected website permissions; Administrators can manage ordinary members only within that ceiling and organization. New employees have no permissions. Current broad Inventory access remains Owner-only until Inventory defines narrower staff authorization. CMS editors and platform operators remain separate identities and capabilities. The local foundation implements this model; deployment and live service activation require their own approval and proof. See [`merchant-account-model.md`](merchant-account-model.md) and [`product-roadmap.md`](product-roadmap.md).

New signup collects both email and phone, one service-contact choice, separate unchecked optional promotional email/SMS choices, and a separate agreement checkbox on one compact page. Either verified contact is sufficient; verification never implies promotional consent or verifies the other contact. The current implemented path uses Better Auth email links and a browser-bound, expiring, one-use intake snapshot. Phone verification/delivery remains unavailable pending qualification of the selected dedicated-phone route. That unavailable optional route does not block complete verified-email signup. Login through the raw auth API alone confers no organization or service authority.

The first 50 qualifying people’s first organizations receive one-time automatic admission. Later organizations created by the same person wait for operator approval. Employee memberships consume no slots. Lifetime allocation and activation share one transaction, are idempotent, and are never recycled by closure, suspension, or ownership changes. Admission does not provision Inventory or establish hosted availability. The organization approval console uses current local EmDash CMS Admin authority, with admission-only decisions and separately tracked selected-contact notifications. See `docs/organization-approvals.md`. Live CMS activation and principal setup remain separately gated. A separately authorized stable-subject D1 grant can provide read-only directory access across organizations; migrations seed no authority. See `docs/operator-directory.md`.

Closing an organization is separate from disabling or deleting a login. Ownership transfer, closure execution, and personal deletion are unavailable until their authoritative contracts exist. Login disabling is blocked while owned organizations remain; it never cascades to an employer organization or Inventory pool. Existing synthetic legacy account subjects and public signing history are preserved by the account-foundation migration. Store connections are development/test data: the shared connection protocol uses clean identity and service-grant tables without migrating old grants. Old rows are retained but confer no new-protocol authority. No real-customer migration interface or automatic reset is assumed.

See `docs/authentication-research.md` for the evidence and limits. Authentication implementation must not fork EmDash, import internal handlers, or share merchant and CMS identity through community emdash-better-auth. Public Better Auth integration keeps editor identity separate.

The production issuer is the configured `https://dinkuskit.com/account` value, not the request Host. Canonical account keys are `JSON.stringify([issuer, subject])` using a DinkusKit-owned subject that survives email or provider-id changes. Disabled accounts are refused from current persistent D1 state, not from a cookie cache. Already-issued service JWTs remain valid until `exp`.

## Current scaffold slice

Deliver an independently versioned, runnable EmDash website foundation, public homepage/getting-started content, native-block readiness, local merchant account routes, and durable product decisions. Hosted trial activation and Stripe connection are still not implemented and must not be presented as working.

Keep styling minimal and accessible. Bobby approved the current colors and simple layout for the public introduction. See design.md and docs/public-launch.md for the accepted release scope. Do not add duplicate inventory, test tenants presented as live customers, analytics, live email sending, payments or remote infrastructure. The public site and merchant routes run on the Cloudflare Workers adapter with separate CMS D1 and merchant D1. Cloudflare Email Sending is a delivery boundary only; missing delivery is unavailable, not a sent claim. Local proof uses an isolated test-entry sink.

## Future possibilities

- Subscription management if paid service becomes appropriate.
- A standalone Inventory portal for people managing multiple stores.
- New-store creation/setup.

These shape the need for stable identity and multiple site connections; they do not expand the scaffold into billing or portal implementation.
