# Website foundation proof

Authoritative claim map for the local EmDash website foundation at source head `dda0260636aa7723e28fefd10e1f3424ff24d1cf`. Original screenshots are available from existing public product history; copies and their storage metadata remain access controlled. This file records claims, hashes, provenance and limits.

Verified locally on 2026-09-29 with Node 22.23.2, EmDash 1.0.1, and Astro 7.3.2.

## Result

- `npm install --no-fund`: 689 packages added, audit reported 0 vulnerabilities. Known upstream auth-library deprecation warnings remain.
- `npm run verify`: passed repository audit, fresh local seed, Astro type check, production build and HTTP route smoke.
- Fresh seed: 88 migrations, one Pages collection, three fields and two published pages. A versioned `text_section` native block supplies page content.
- Astro check: nine files, zero errors, warnings or hints.
- Production route smoke at that head: home and getting-started returned 200, rendered seeded CMS titles and native block content, and emitted their `https://dinkuskit.com` canonical URLs. EmDash admin/setup was reachable on that unguarded local foundation capture; an unknown route returned 404. The smoke process stopped its own server.
- Browser: inspected the homepage, clicked Getting started and verified the resulting page, then loaded the EmDash setup screen. No account or credential was created. The separate browser-proof server was stopped afterward.

The build emitted the upstream bundle-size warning; this is not a performance qualification. SQLite emitted its Node experimental warning. Both were nonfatal and are retained in local logs.

## Historical media

Capture date: 2026-09-29
Public product repository: `dinkuskit/dinkuskit`
Public product PR: https://github.com/dinkuskit/dinkuskit/pull/1
Source head: `dda0260636aa7723e28fefd10e1f3424ff24d1cf`
Source base: `67db46b5ec2306af078feb07e1c17f7f1d37e10d`
Source paths at that head: `proof/website-foundation/{home,getting-started,emdash-setup}.jpg`

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `home.jpg` | 96196 | `3bcdbecd4b3ef6f34e6ade7db1132ec6993bacd7b13297737b0ef2f3c34f8d11` |
| `getting-started.jpg` | 97705 | `d38f96e23f016d559a4e748f6bd5798321d0cbacfcb3ccd06dc959cf8312c3dd` |
| `emdash-setup.jpg` | 52751 | `8a5ded907de2e0c15fed8c3aa744c7d878e1a87a5dae586f5c57ee672384dad8` |
| `manifest.json` | 2324 | `c4cab485eae18ca13766213e58f9bee35c325ee164f96eb79bbd0dbc58697524` |
| `PUBLISHED_MANIFEST.md` | 1798 | `aed3a0d8584a0b3aacb62b9f93b24ceaadddee7262c29745599cd197b1b434d1` |

The three JPEGs are publicly verifiable through the existing product-history links below. The two storage manifests remain access controlled and are listed by hash only. Private storage locations stay in ignored handoff.

`emdash-setup.jpg` is a historical unguarded local foundation capture from that source head. It does not describe current production behavior. Production builds now deny the `/_emdash` namespace before bootstrap; see [REPAIR.md](REPAIR.md).

## Visible evidence

The selected JPEGs are no longer stored in this public tree. Logical names, byte lengths, and SHA-256 values above remain the public provenance record.

Screenshots used the browser's existing desktop viewport. No mobile-device or responsive breakpoint proof is claimed. Styling remains provisional rather than a locked design.

## Redaction and selection

Parent inspection and the later media repair both found only public marketing pages plus an empty EmDash setup form with placeholder copy (`My Awesome Blog` / `Thoughts, tutorials, and more`). No credentials, cookies, tokens, tenant data, customer data, or filled account fields are present. Account and sign-in steps were not completed. Only these three selected JPGs plus the provenance manifests were retained as originals. Raw unselected captures were not published.

## Source and scope

`source-manifest.json` is a historical record of the verified implementation files by hash at the foundation head. It must not be rewritten to claim those old pixels prove later source. The foundation PR commit binds those files to the accompanying contracts and decision ledger. Generated databases, logs and local process receipts remain ignored.

This proves a local EmDash website foundation, not merchant authentication, email recovery, site grants, Registry delivery, Inventory/Stripe activation, subscriptions or deployment. The canonical domain is configured in source; DNS and the Cloudflare account were not changed. The rail review of source 0e50de63f899f8dbb29044201b1cc2d5215c6650 reported two accepted findings. Their repairs and new HTTP evidence are in REPAIR.md; a fresh formal review of repaired source belongs to the rail owner.

Media placement is maintenance of already-captured proof. It is not a new product decision and does not change the GrillTrack ledger.

The next functional slice is the supported-API authentication proof described in `docs/authentication-research.md`.

## Public historical captures

These originals already exist in this public product repository at the capture commit. Their sizes and SHA-256 values match the table in PROOF.md. These links expose no private storage coordinates and do not change asset visibility. They show the historical local foundation, including its former setup screen; current production protection is proved separately in REPAIR.md.

- [home.jpg](https://github.com/dinkuskit/dinkuskit/blob/dda0260636aa7723e28fefd10e1f3424ff24d1cf/proof/website-foundation/home.jpg)
- [getting-started.jpg](https://github.com/dinkuskit/dinkuskit/blob/dda0260636aa7723e28fefd10e1f3424ff24d1cf/proof/website-foundation/getting-started.jpg)
- [emdash-setup.jpg](https://github.com/dinkuskit/dinkuskit/blob/dda0260636aa7723e28fefd10e1f3424ff24d1cf/proof/website-foundation/emdash-setup.jpg)
