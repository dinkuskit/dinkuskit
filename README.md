# DinkusKit

The EmDash-powered website for DinkusKit's hosted commerce services, intended for **https://dinkuskit.com**.

Public pages are seeded CMS content on Cloudflare Workers and D1. Merchant signup, sign-in, recovery, and logout are real Better Auth routes. They use a separate merchant D1, cookie namespace, and `Astro.locals.merchant`. They do not sign anyone into the EmDash editor. Production Inventory Connect is unavailable. Local fixtures compare store-proof receipts.

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

`npm run setup` applies versioned merchant D1 migrations locally. CMS schema and `seed/seed.json` apply on first workerd request through EmDash public seed APIs.

The EmDash editor is at `/_emdash/admin`. That setup is for the person editing this website, not merchant registration.

## Verify

```sh
npm run verify
```

Verification runs the repository path/identity audit, local merchant migrations, Wrangler types, Astro type checking, public-auth feasibility, a Cloudflare production build, workerd merchant/connect tests against that built target, and an HTTP smoke test against local wrangler. The smoke test checks public CMS pages, native blocks, admin/setup, fail-closed merchant bindings, absent proof routes, and a missing route. It stops only its own server.

## Scope and architecture

- [Product charter](docs/CHARTER.md)
- [Authentication research](docs/authentication-research.md)
- [Merchant account-boundary proof](proof/merchant-auth-proof/README.md)
- [Better Auth route evidence](proof/better-auth/README.md)
- [Public source provenance](docs/provenance.md)
- [Verification evidence](proof/website-foundation/README.md)

The website adapter is `@astrojs/cloudflare` with `@emdash-cms/cloudflare` `d1({ binding: "DB", session: "disabled" })`, `r2({ binding: "MEDIA" })`, and `sandbox()`. `src/worker.ts` wraps the Astro handler, exports `PluginBridge`, and registers scheduled maintenance.

Production hosting, DNS, recovery email, service credentials and deployment remain unconfigured. The default styling is provisional; the visual design remains open in `design.md`.
