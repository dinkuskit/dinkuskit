# Website foundation proof

Verified locally on 2026-09-29 with Node 22.23.2, EmDash 1.0.1, and Astro 7.3.2.

## Result

- `npm install --no-fund`: 689 packages added, audit reported 0 vulnerabilities. Known upstream auth-library deprecation warnings remain.
- `npm run verify`: passed repository audit, fresh local seed, Astro type check, production build and HTTP route smoke.
- Fresh seed: 88 migrations, one Pages collection, three fields and two published pages. A versioned `text_section` native block supplies page content.
- Astro check: nine files, zero errors, warnings or hints.
- Production route smoke: home and getting-started returned 200, rendered seeded CMS titles and native block content, and emitted their `https://dinkuskit.com` canonical URLs. EmDash admin/setup was reachable; an unknown route returned 404. The smoke process stopped its own server.
- Browser: inspected the homepage, clicked Getting started and verified the resulting page, then loaded the EmDash setup screen. No account or credential was created. The separate browser-proof server was stopped afterward.

The build emitted the upstream bundle-size warning; this is not a performance qualification. SQLite emitted its Node experimental warning. Both were nonfatal and are retained in local logs.

## Visible evidence

- [Homepage](home.jpg)
- [Getting started](getting-started.jpg)
- [EmDash setup](emdash-setup.jpg)

Screenshots use the browser's existing desktop viewport. No mobile-device or responsive breakpoint proof is claimed. Styling remains provisional rather than a locked design.

## Source and scope

`source-manifest.json` records the verified implementation files by hash. The PR commit binds these files to the accompanying contracts and decision ledger. Generated databases, logs and local process receipts remain ignored.

This proves a local EmDash website foundation, not merchant authentication, email recovery, site grants, Registry delivery, Inventory/Stripe activation, subscriptions or deployment. The canonical domain is configured in source; DNS and the Cloudflare account were not changed. Formal external review remains pending, as the owner explicitly requested publication without waiting on review rails.

The next functional slice is the supported-API authentication proof described in `docs/authentication-research.md`.
