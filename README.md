# DinkusKit

The EmDash-powered website for DinkusKit's hosted commerce services, intended for **https://dinkuskit.com**.

This repository is a local website foundation. It has seeded, CMS-owned public pages rendered with EmDash's native page blocks. Merchant accounts, service activation, subscriptions and the independent inventory portal are not implemented yet. Inventory is coming soon and is not required for Commerce. Commerce and the Template Store will be released together as a verified pair; this site does not yet publish Try-the-demo or template setup destinations.

## Run locally

Use Node from `.nvmrc`, then:

```sh
npm ci
npm run setup
npm run dev
```

Open the localhost URL printed by Astro. `npm run setup` initializes the local SQLite database and adds the public starter content. Repeating it skips existing content; it does not reset edits. Content and uploads remain under ignored `.local/`; Astro and EmDash generated state is ignored too.

Local development (`npm run dev`, bound to 127.0.0.1) still serves the EmDash editor at `/_emdash/admin`. That initial setup is for the person editing this website on a trusted local process, not merchant registration. This scaffold does not create a user, collect credentials, or enable DinkusKit customer sign-in.

Every production build denies the entire `/_emdash` namespace before EmDash bootstrap, including first-admin setup and CMS-hosted media under `/_emdash/api/media/file`. Public pages remain usable after CLI seeding. Current marketing pages do not use CMS-hosted `/_emdash` media. Enabling a production CMS requires a separately configured protected operator access lane; Host, forwarded headers, Origin, cookies, query strings, and environment/proof bindings do not unlock it.

## Verify

```sh
npm run verify
```

Verification runs the repository path/identity audit, local seed, Astro type checking, production Node build, an HTTP smoke test against a temporary local production server, a local Astro-dev CMS reachability check, Access-gate unit tests, the safe http(s) link helper, the loopback Cloudflare D1/R2 qualification, and the hosted-candidate workerd denial. Production smoke checks both public pages, native block rendering, official Getting Started docs anchors, the canonical domain, a missing route, and that anonymous `/_emdash` admin/setup GET and setup POST routes are denied before any database mutation, including when localhost Host or forwarded headers are spoofed. The local-dev check loads the existing setup form without creating an account. Each test stops only its own server.

`test:cms-operation` is a local synthetic native-passkey storage fixture. `test:cloudflare-candidate` proves official Access JWT auth denial for missing, invalid, and unallowlisted identities on local workerd. Neither deploys, creates Cloudflare resources, or is hosted Access proof.

The smoke expectations refer to the original starter content. If you edit that content locally, use a fresh checkout for reproducible verification rather than deleting your database.

## Scope and architecture

- [Product charter](docs/CHARTER.md)
- [Getting started](docs/getting-started.md)
- [Hosted runtime candidate runbook](docs/hosted-runtime-candidate.md)
- [Authentication research and next proof](docs/authentication-research.md)
- [Public source provenance](docs/provenance.md)
- [Verification evidence](proof/website-foundation/PROOF.md)
- Official EmDash: [installation](https://docs.emdashcms.com/getting-started/), [themes](https://docs.emdashcms.com/themes/overview/), [Cloudflare deploy](https://docs.emdashcms.com/deployment/cloudflare/)

The local runtime is Node SSR with SQLite. A separate Cloudflare Workers candidate (`astro.cloudflare.config.mjs`) is prepared for review and is not activated. The live public introduction remains the already-deployed static export (approved version `1e0e915f-bf79-4ec7-8527-e87e7d46f8e2`, digest `e8b8f3cf01158a3f3c259fbfb1511e1f0f779829e97872e866f600ff646243f4`). Production hosting cutover, DNS, Access, recovery email, service credentials and deployment remain unconfigured. Selecting the public domain does not enable any live service. The default styling is provisional; the visual design remains open in `design.md`.

EmDash 1.0.1 currently includes deprecated authentication dependencies. The maintenance concern and the limits of reusing native auth are documented in the authentication research; do not treat this scaffold as a production identity system.
