# DinkusKit

The EmDash-powered public website and account experience for DinkusKit at **https://dinkuskit.com**. Read the [organization vision](https://github.com/dinkuskit/.github/blob/36aab690a7ef66dc119aab70e258ea979c54841a/VISION.md) for the broader direction and [planning boundaries](https://github.com/dinkuskit/.github/blob/36aab690a7ef66dc119aab70e258ea979c54841a/ROADMAP.md) for current scope.

Public pages are seeded CMS content on Cloudflare Workers and D1. Merchant signup, sign-in, recovery, and logout are real Better Auth routes. They use a separate merchant D1, cookie namespace, and `Astro.locals.merchant`. They do not sign anyone into the EmDash editor. Store Connect reads each store's registered proof route. The current Commerce-first path registers the store, then Payments and Ship connect with separate keys and explicit grants; Inventory's local contract does not establish a Registry publisher identity. See [shared store connections](docs/shared-store-connections.md) for current order, permissions, and proof limits. Independent peer connections are accepted direction, not an implemented replacement for this path. Inventory is coming soon and is not required for Commerce. `/start` is the setup checklist and `/getting-started` ("How it works") explains how DinkusKit fits together; it links the storefront playground and the template setup guide.

## Run locally

Use Node from `.nvmrc`, then:

```sh
npm ci
npm run setup
npm run dev
```

Account pages answer `{"error":"merchant_unavailable"}` until you create an ignored `.dev.vars` with a throwaway secret:

```sh
printf 'MERCHANT_AUTH_SECRET=%s\nMERCHANT_BASE_URL=http://127.0.0.1:4321\n' "$(openssl rand -hex 32)" > .dev.vars
```

Open the localhost URL printed by Astro. Public pages and `/account/signup`, `/account/sign-in`, `/account/recover`, and `/account` are in this site. No email is sent locally: the dev server log prints `send_email binding called` with the path of a text file under `.wrangler/tmp/email/` that holds the sign-up or sign-in link. To act as the website admin (for example to approve a second organization at `/account/organization-approvals`), open `/_emdash/api/setup/dev-bypass?redirect=/account/organization-approvals`.

### Local workerd

```sh
npm run start
```

This is local wrangler/workerd. It does not deploy or use `remote: true`. Production must set `MERCHANT_AUTH_SECRET` and `MERCHANT_BASE_URL`; missing values fail closed. Do not put secrets in `wrangler.jsonc`. Cloudflare Email Sending is a binding only. Do not run account/domain setup or live send commands from this slice.

`npm run setup` applies versioned merchant D1 migrations locally. CMS schema and `seed/seed.json` apply on first trusted local process through EmDash public seed APIs. The Cloudflare production entry denies those setup routes. Updating `seed/seed.json` configures fresh seed instances and does not overwrite initialized live CMS pages. In an active CMS deployment, an editor updates the existing Getting started section and both native links (`Try the demo` and `Template setup`) directly through the EmDash editor; no live reseed or database mutation is performed as part of this code change.

Local development (`npm run dev`, bound to 127.0.0.1) still serves the EmDash editor at `/_emdash/admin`. That initial setup is for the person editing this website on a trusted local process, not merchant registration.

By default, production builds deny the entire `/_emdash` namespace before EmDash bootstrap, including first-admin setup and CMS-hosted media under `/_emdash/api/media/file`. The disabled-by-default [DinkusGuide pilot](docs/dinkusguide-pilot.md) can opt into only the installed chat plugin's exact public config/ask operations; this does not unlock CMS/admin or other plugin routes. Public pages remain usable after a local fixture seed of the same persisted D1. Current marketing pages do not use CMS-hosted `/_emdash` media. Enabling a production CMS requires a separately configured protected operator access lane; Host, forwarded headers, Origin, cookies, query strings, and arbitrary environment/proof bindings do not unlock it.

## Agent account tests

Run `npm run agent:test` after installing dependencies to exercise signup, staff
permissions, revocation, and simulated store consent without email clicks. This
uses fixed synthetic identities and a disposable loopback runtime; no production
route is enabled. See [local agent testing](docs/agent-testing.md) for scope,
security boundaries, and the distinction from browser and real-mail tests.

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
- [Documentation drafts and local preview](docs/documentation-authoring.md)
- [Optional DinkusGuide pilot and controlled UI proof](docs/dinkusguide-pilot.md)
- [Hosted runtime candidate runbook](docs/hosted-runtime-candidate.md)
- [Authentication research](docs/authentication-research.md)
- [Merchant account-boundary proof](proof/merchant-auth-proof/README.md)
- [Better Auth route evidence](proof/better-auth/README.md)
- [Public source provenance](docs/provenance.md)
- [Verification evidence](proof/website-foundation/PROOF.md)
- Official EmDash: [installation](https://docs.emdashcms.com/getting-started/), [themes](https://docs.emdashcms.com/themes/overview/), [Cloudflare deploy](https://docs.emdashcms.com/deployment/cloudflare/)

The website adapter is `@astrojs/cloudflare` with `@emdash-cms/cloudflare` `d1({ binding: "DB", session: "disabled" })`, `r2({ binding: "MEDIA" })`, and `sandbox()`. `src/worker.ts` wraps the Astro handler, exports `PluginBridge`, and registers scheduled maintenance. The earlier foundation snapshot recorded a static introduction (version `1e0e915f-bf79-4ec7-8527-e87e7d46f8e2`, digest `e8b8f3cf01158a3f3c259fbfb1511e1f0f779829e97872e866f600ff646243f4`) and a prepared Access-gated CMS candidate. That snapshot is historical, not a current hosted-state check. [DEPLOY.md](DEPLOY.md) describes the later test-mode CMS/account deployment procedure; inspect dated deployment proof and the actual target before making availability claims. A configured source or a selected domain does not prove live service availability. Deployment, CMS publication, live payments and account changes keep their existing approval gates. The default styling is provisional; the visual design remains open in `design.md`.

EmDash 1.4.0 is the current pinned CMS core. Merchant identity remains the separate Better Auth implementation described in the authentication research; source integration alone does not establish production readiness or current hosted availability.
