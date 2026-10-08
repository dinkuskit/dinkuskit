# DinkusKit

The EmDash-powered website for DinkusKit's hosted commerce services, intended for **https://dinkuskit.com**.

Public pages are seeded CMS content on Cloudflare Workers and D1. Merchant signup, sign-in, recovery, and logout are real Better Auth routes. They use a separate merchant D1, cookie namespace, and `Astro.locals.merchant`. They do not sign anyone into the EmDash editor. Production Inventory Connect is unavailable. Local fixtures compare store-proof receipts. Inventory is coming soon and is not required for Commerce. Commerce and the Template Store will be released together as a verified pair. Getting started provides 'Try the demo' (browse and cart with disabled checkout on a synthetic catalog) and 'Template setup' (development source pilot guide), while the released installable package pair remains pending.

## Run locally

Use Node from `.nvmrc`, then:

```sh
npm ci
npm run setup
npm run dev
```

Open the localhost URL printed by Astro. Public pages and `/account/signup`, `/account/sign-in`, `/account/recover`, and `/account` are in this site. Ordinary `npm run dev` and `npm run start` do not capture magic-link mail automatically. Only the isolated test worker entry captures links.

### Local workerd

```sh
npm run start
```

This is local wrangler/workerd. It does not deploy or use `remote: true`. Production must set `MERCHANT_AUTH_SECRET` and `MERCHANT_BASE_URL`; missing values fail closed. Do not put secrets in `wrangler.jsonc`. Cloudflare Email Sending is a binding only. Do not run account/domain setup or live send commands from this slice.

`npm run setup` applies versioned merchant D1 migrations locally. CMS schema and `seed/seed.json` apply on first trusted local process through EmDash public seed APIs. The Cloudflare production entry denies those setup routes. Updating `seed/seed.json` configures fresh seed instances and does not overwrite initialized live CMS pages. In an active CMS deployment, an editor updates the existing Getting started section and both native links (`Try the demo` and `Template setup`) directly through the EmDash editor; no live reseed or database mutation is performed as part of this code change.

Local development (`npm run dev`, bound to 127.0.0.1) still serves the EmDash editor at `/_emdash/admin`. That initial setup is for the person editing this website on a trusted local process, not merchant registration.

Every production build denies the entire `/_emdash` namespace before EmDash bootstrap, including first-admin setup and CMS-hosted media under `/_emdash/api/media/file`. Public pages remain usable after a local fixture seed of the same persisted D1. Current marketing pages do not use CMS-hosted `/_emdash` media. Enabling a production CMS requires a separately configured protected operator access lane; Host, forwarded headers, Origin, cookies, query strings, and environment/proof bindings do not unlock it.

## Verify

```sh
npm run verify
```

Verification runs the repository path/identity audit, local merchant migrations, Wrangler types, Astro type checking, public-auth feasibility, a Cloudflare production build, workerd merchant/connect tests against that built target, an HTTP smoke test against local wrangler, a local Astro-dev CMS reachability check, Access-gate unit tests, the safe http(s) link helper, the loopback Cloudflare D1/R2 qualification, and the hosted-candidate workerd denial. Production smoke proves anonymous `/_emdash` admin/setup GET and setup POST routes are denied on a fresh worker before any setup mutation, including Host/Origin/forwarded/cookie/query spoofing and encoded route variants. The same smoke then seeds the temporary D1 through a dedicated fixture entry, stops that fixture, and restarts the actual production entry to check public CMS pages, native blocks, official Getting Started docs anchors, the still-denied CMS namespace, fail-closed merchant bindings, absent proof routes, and a missing route. The local-dev check loads the existing setup form without creating an account. Each test stops only its own server and removes only its own temporary directories.

`test:cms-operation` is a local synthetic native-passkey storage fixture. `test:cloudflare-candidate` proves official Access JWT auth denial for missing, invalid, and unallowlisted identities on local workerd. Neither deploys, creates Cloudflare resources, or is hosted Access proof.

The smoke expectations refer to the original starter content. If you edit that content locally, use a fresh checkout for reproducible verification rather than deleting your database.

## Scope and architecture

- [Product charter](docs/CHARTER.md)
- [Getting started](docs/getting-started.md)
- [Hosted runtime candidate runbook](docs/hosted-runtime-candidate.md)
- [Authentication research](docs/authentication-research.md)
- [Merchant account-boundary proof](proof/merchant-auth-proof/README.md)
- [Better Auth route evidence](proof/better-auth/README.md)
- [Public source provenance](docs/provenance.md)
- [Verification evidence](proof/website-foundation/PROOF.md)
- Official EmDash: [installation](https://docs.emdashcms.com/getting-started/), [themes](https://docs.emdashcms.com/themes/overview/), [Cloudflare deploy](https://docs.emdashcms.com/deployment/cloudflare/)

The website adapter is `@astrojs/cloudflare` with `@emdash-cms/cloudflare` `d1({ binding: "DB", session: "disabled" })`, `r2({ binding: "MEDIA" })`, and `sandbox()`. `src/worker.ts` wraps the Astro handler, exports `PluginBridge`, and registers scheduled maintenance. A separate Access-gated CMS candidate (`astro.cloudflare.config.mjs`) is prepared for review and is not activated. The live public introduction remains the already-deployed static export (approved version `1e0e915f-bf79-4ec7-8527-e87e7d46f8e2`, digest `e8b8f3cf01158a3f3c259fbfb1511e1f0f779829e97872e866f600ff646243f4`). Production hosting cutover, DNS, Access, recovery email, service credentials and deployment remain unconfigured. Selecting the public domain does not enable any live service. The default styling is provisional; the visual design remains open in `design.md`.

EmDash 1.2.0 is the current pinned CMS core. Merchant identity remains the separate Better Auth implementation described in the authentication research; do not treat this scaffold as a production identity system.
