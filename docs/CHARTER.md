# DinkusKit website charter

## Accepted direction

DinkusKit's website is an EmDash-powered public home and account experience for its hosted commerce services. Use upstream native EmDash blocks; do not add a dependency on the retiring DinkusKit blocks package.

The canonical public address is `https://dinkuskit.com`. Local development uses localhost. Production routing and deployment are separate from this scaffold.

The first audience already has an EmDash site. The intended journey is Registry plugin installation, Connect, DinkusKit sign-in, explicit site authorization, service activation, then return to EmDash. Merchants do not configure hosting infrastructure or enter service API keys.

The public site explains the products, getting started, documentation, support and trial availability truthfully. The account area handles local signup, sign-in, recovery and logout. Inventory Connect uses `/api/store-connections`, `/account/connect`, and `/api/store-connections/token` with S256 PKCE, explicit consent, and compared store-proof receipts. Production grants and issuance fail closed with `integration_unavailable` until Workers-safe fetch and an actual plugin dispatcher are proved. Local protocol tests may inject a labeled simulation transport. Hostname prechecks are not a DNS or IP firewall. Inventory is coming soon and is not a prerequisite for Commerce. Initial hosted Inventory access is planned as a trial without payment details; no duration, quota, price or permanently-free promise has been selected. Commerce and the Template Store will be released together as a verified pair. A public browse-and-cart storefront demo (with disabled checkout and synthetic catalog) and a development-source template setup guide are published on Getting started, while the released installable package pair remains pending.

Daily product, stock and order management remains in the merchant's EmDash site for the initial experience. Inventory owns stock truth, Commerce owns prices and orders, and Payments owns processor integration.

## Identity boundary

One merchant identity can connect multiple stores. Each site requires explicit verified authorization. DinkusKit owns stable account identity, site grants and service-specific access. EmDash 1.0.1 native CMS signup still uses operator-allowed email domains. A custom public `AuthAdapter` can implement general `SUBSCRIBER` signup through `getAllowedDomain`. Exported helpers still couple to native CMS URLs that `SignupConfig` cannot change, and native tokens are opaque CMS credentials rather than service JWTs. Native browser and provider integration remain unproven.

The hosted services expect a stable issuer/subject pair, an authorized site claim, a service audience and service-specific scopes. Keep merchant permissions distinct from permission to edit this website. Better Auth is the accepted merchant identity implementation. General email merchants do not need a per-domain operator allowlist. EmDash editor cookies, tables and locals stay separate from merchant D1, cookies and locals.

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
