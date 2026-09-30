# Website foundation proof

Authoritative claim map for the local EmDash website foundation at source head `dda0260636aa7723e28fefd10e1f3424ff24d1cf`. Selected screenshots live as immutable release assets on the approved private shelf `dinkuskit/dinkus-pr-assets`. This file, not the shelf, is the product-repo authority for claims, limits, hashes, and gates.

Verified locally on 2026-09-29 with Node 22.23.2, EmDash 1.0.1, and Astro 7.3.2.

## Result

- `npm install --no-fund`: 689 packages added, audit reported 0 vulnerabilities. Known upstream auth-library deprecation warnings remain.
- `npm run verify`: passed repository audit, fresh local seed, Astro type check, production build and HTTP route smoke.
- Fresh seed: 88 migrations, one Pages collection, three fields and two published pages. A versioned `text_section` native block supplies page content.
- Astro check: nine files, zero errors, warnings or hints.
- Production route smoke: home and getting-started returned 200, rendered seeded CMS titles and native block content, and emitted their `https://dinkuskit.com` canonical URLs. EmDash admin/setup was reachable; an unknown route returned 404. The smoke process stopped its own server.
- Browser: inspected the homepage, clicked Getting started and verified the resulting page, then loaded the EmDash setup screen. No account or credential was created. The separate browser-proof server was stopped afterward.

The build emitted the upstream bundle-size warning; this is not a performance qualification. SQLite emitted its Node experimental warning. Both were nonfatal and are retained in local logs.

## Immutable media

Shelf: `dinkuskit/dinkus-pr-assets`
Release tag: `dinkuskit-pr-1-dda0260636aa`
Release ID: `399695376` (`RE_kwDOUHjBW84X0t4Q`)
Release URL: https://github.com/dinkuskit/dinkus-pr-assets/releases/tag/dinkuskit-pr-1-dda0260636aa
Published: 2026-09-30T03:28:43Z
Immutability is the shelf's no-replacement policy for this uniquely named release; GitHub reports `immutable: false`, so server-enforced release locking is not claimed. No repository setting was changed.

Visibility: the shelf repository is private. Authenticated GitHub access is required to download these assets. Repository visibility was not changed.

Capture date: 2026-09-29
Source: `dinkuskit/dinkuskit`
PR: https://github.com/dinkuskit/dinkuskit/pull/1
Source head: `dda0260636aa7723e28fefd10e1f3424ff24d1cf`
Source base: `67db46b5ec2306af078feb07e1c17f7f1d37e10d`
Source paths at that head: `proof/website-foundation/{home,getting-started,emdash-setup}.jpg`

| Asset | Bytes | SHA-256 | Asset ID | Immutable URL |
| --- | ---: | --- | ---: | --- |
| `home.jpg` | 96196 | `3bcdbecd4b3ef6f34e6ade7db1132ec6993bacd7b13297737b0ef2f3c34f8d11` | `599932903` | https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/home.jpg |
| `getting-started.jpg` | 97705 | `d38f96e23f016d559a4e748f6bd5798321d0cbacfcb3ccd06dc959cf8312c3dd` | `599932904` | https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/getting-started.jpg |
| `emdash-setup.jpg` | 52751 | `8a5ded907de2e0c15fed8c3aa744c7d878e1a87a5dae586f5c57ee672384dad8` | `599932896` | https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/emdash-setup.jpg |
| `manifest.json` | 2324 | `c4cab485eae18ca13766213e58f9bee35c325ee164f96eb79bbd0dbc58697524` | `599932899` | https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/manifest.json |
| `PUBLISHED_MANIFEST.md` | 1798 | `aed3a0d8584a0b3aacb62b9f93b24ceaadddee7262c29745599cd197b1b434d1` | `599932900` | https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/PUBLISHED_MANIFEST.md |

Remote downloaded copies were hash-checked against the preserved local files before the tracked JPGs were removed from this repository. GitHub release digests matched the same SHA-256 values.

## Visible evidence

- [Homepage](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/home.jpg)
- [Getting started](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/getting-started.jpg)
- [EmDash setup](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-1-dda0260636aa/emdash-setup.jpg)

Screenshots use the browser's existing desktop viewport. No mobile-device or responsive breakpoint proof is claimed. Styling remains provisional rather than a locked design.

## Redaction and selection

Parent inspection and this repair both found only public marketing pages plus an empty EmDash setup form with placeholder copy (`My Awesome Blog` / `Thoughts, tutorials, and more`). No credentials, cookies, tokens, tenant data, customer data, or filled account fields are present. Account and sign-in steps were not completed. Only these three selected JPGs plus the provenance manifests were published. Raw unselected captures were not uploaded.

## Source and scope

`source-manifest.json` records the verified implementation files by hash. The PR commit binds these files to the accompanying contracts and decision ledger. Generated databases, logs and local process receipts remain ignored.

This proves a local EmDash website foundation, not merchant authentication, email recovery, site grants, Registry delivery, Inventory/Stripe activation, subscriptions or deployment. The canonical domain is configured in source; DNS and the Cloudflare account were not changed. Formal external review remains pending, as the owner explicitly requested publication without waiting on review rails.

Media placement is maintenance of already-captured proof. It is not a new product decision and does not change the GrillTrack ledger.

The next functional slice is the supported-API authentication proof described in `docs/authentication-research.md`.
