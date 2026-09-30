# DinkusKit website charter

## Accepted direction

DinkusKit's website is an EmDash-powered public home and account experience for its hosted commerce services. Use upstream native EmDash blocks; do not add a dependency on the retiring DinkusKit blocks package.

The canonical public address is `https://dinkuskit.com`. Local development uses localhost. Production routing and deployment are separate from this scaffold.

The first audience already has an EmDash site. The intended journey is Registry plugin installation, Connect, DinkusKit sign-in, explicit site authorization, service activation, then return to EmDash. Merchants do not configure hosting infrastructure or enter service API keys.

The public site explains the products, getting started, documentation, support and trial availability truthfully. The account area will handle sign-in/recovery, connected sites and service setup/resumption. Inventory is coming soon and is not a prerequisite for Commerce. Initial hosted Inventory access is planned as a trial without payment details; no duration, quota, price or permanently-free promise has been selected. Commerce and the Template Store will be released together as a verified pair; demo and setup destinations stay unpublished until that pair exists.

Daily product, stock and order management remains in the merchant's EmDash site for the initial experience. Inventory owns stock truth, Commerce owns prices and orders, and Payments owns processor integration.

## Identity boundary

One merchant identity can connect multiple stores. Each site requires explicit verified authorization. DinkusKit owns stable account identity, site grants and service-specific access. EmDash's sign-in capabilities are a candidate for a bounded proof, not a production authentication commitment.

The existing service prototypes expect a stable issuer/subject pair, an authorized site claim, a service audience and service-specific scopes. Native EmDash OAuth does not directly satisfy that contract. Keep merchant permissions distinct from permission to edit this website.

See `docs/authentication-research.md` for the evidence and bounded proof. Authentication implementation must not fork EmDash or depend on internal handlers without a new decision.

## Current scaffold slice

Deliver an independently versioned, runnable EmDash website foundation, a small public homepage/getting-started skeleton, native-block readiness, local verification, and durable product decisions. The skeleton may explain that hosted access is being prepared; it must not present a working login, trial activation or Stripe connection that does not exist.

Keep styling minimal and accessible. Bobby approved the current colors and simple layout for the public introduction. See design.md and docs/public-launch.md for the accepted release scope. Do not add a fake account database, duplicate inventory, test tenants presented as live customers, analytics, email sending, payments or remote infrastructure.

## Future possibilities

- Subscription management if paid service becomes appropriate.
- A standalone Inventory portal for people managing multiple stores.
- New-store creation/setup.

These shape the need for stable identity and multiple site connections; they do not expand the scaffold into billing or portal implementation.
