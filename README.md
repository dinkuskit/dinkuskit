# DinkusKit

The EmDash-powered website for DinkusKit's hosted commerce services, intended for **https://dinkuskit.com**.

This repository is a local website foundation. It has seeded, CMS-owned public pages rendered with EmDash's native page blocks. Merchant accounts, service activation, subscriptions and the independent inventory portal are not implemented yet.

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

Verification runs the repository path/identity audit, local seed, Astro type checking, production build, an HTTP smoke test against a temporary local production server, and a local Astro-dev CMS reachability check. Production smoke checks both public pages, native block rendering, the canonical domain, a missing route, and that anonymous `/_emdash` admin/setup GET and setup POST routes are denied before any database mutation, including when localhost Host or forwarded headers are spoofed. The local-dev check loads the existing setup form without creating an account. Each test stops only its own server.

The smoke expectations refer to the original starter content. If you edit that content locally, use a fresh checkout for reproducible verification rather than deleting your database.

## Scope and architecture

- [Product charter](docs/CHARTER.md)
- [Authentication research and next proof](docs/authentication-research.md)
- [Public source provenance](docs/provenance.md)
- [Verification evidence](proof/website-foundation/PROOF.md)

The local runtime is Node SSR with SQLite. Production hosting, DNS, recovery email, service credentials and deployment remain unconfigured. Selecting the public domain does not enable any live service. The default styling is provisional; the visual design remains open in `design.md`.

EmDash 1.0.1 currently includes deprecated authentication dependencies. The maintenance concern and the limits of reusing native auth are documented in the authentication research; do not treat this scaffold as a production identity system.
