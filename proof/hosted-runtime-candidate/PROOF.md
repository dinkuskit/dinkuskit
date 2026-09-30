# Hosted Cloudflare candidate — curated proof

Date: 2026-09-30  
Node: 22.23.2 (`.nvmrc`; CI `actions/setup-node`; fixture scripts use `process.execPath` and assert `v22.23.2`)  
Packages: EmDash 1.0.1, `@astrojs/cloudflare` 14.3.3, `@emdash-cms/cloudflare` 1.0.1, wrangler 4.144.0, Astro 7.3.2

## What was prepared

- Separate Cloudflare Astro config and official `@emdash-cms/cloudflare/worker` entry.
- Official Access exclusive mode (`access()` + `audienceEnvVar: CF_ACCESS_AUDIENCE`).
- Outer `/_emdash` gate calls public `@emdash-cms/cloudflare/auth` `authenticate`, then a runtime operator allowlist. Missing config, missing JWT, invalid JWT, and unknown identity deny with 404 before EmDash runtime, including setup and login.
- The gate now canonicalizes the raw request pathname the same way installed Astro routing does (`validateAndDecodePathname` / iterative `decodeURI` in `core/routing/match-request.js`). Percent-encoded unreserved namespace characters, case escapes, encoded slashes, and malformed encodings relevant to `/_emdash` fail closed. Public routes are not rewritten into a different UX.
- Installed EmDash `Role.EDITOR` is 40.
- Generic wrangler example disables `workers_dev` and `preview_urls`. Production IDs are not in source.
- Root Node exporter and deny-all production guard are unchanged.

## Demonstrated encoded bypass (parent actual-workerd proof)

Parent receipt `.grilltrack/work/cloudflare-candidate-20260930/parent-encoded-route-proof.json` (2026-09-30T18:35:01Z) showed the pre-repair gate checking the raw URL pathname while Astro routing decoded it:

| Path | Status | Result |
| --- | --- | --- |
| `/_emdash/admin/setup` | 404 | plain deny |
| `/%5femdash/admin/setup` | 200 | setup UI |
| `/_%65mdash/admin/setup` | 200 | setup UI |
| `/_emdash%2fadmin/setup` | 404 | HTML, not the gate deny |
| `/%5femdash/api/setup/status` | 200 | JSON `needsSetup` |

That is a complete-namespace miss: encoded unreserved `_` / `e` reached EmDash setup before Access. This repair closes those paths on the candidate Worker. It is not a hosted Access claim.

## Commands

```sh
npm run verify
```

`npm run verify` runs, in order: `audit:repo`, `setup`, `typecheck`, `build`, `test:smoke`, `test:dev-cms`, `test:public-release-reuse`, `test:cms-operation-helpers`, `test:access-gate`, `test:safe-http-url`, `test:cms-operation`, `test:cloudflare-candidate`.

Sanitized receipts stay in ignored `.grilltrack/work/cloudflare-candidate-20260930/PROOF.json` and `.grilltrack/work/cms-operation-20260930/PROOF.json`. Those working files may contain local absolute paths; curated public proof does not.

Local results this session, Node 22.23.2 via `process.execPath` (`mise` 22.23.2):

- `npm run verify` passed in about 152s, including `test:access-gate`, `test:cms-operation`, and `test:cloudflare-candidate`.
- `test:access-gate` now fails closed on the demonstrated encoded setup/status paths, case escapes, encoded slashes, and namespace-relevant malformed encodings. Official `@emdash-cms/cloudflare/auth` `authenticate` is used for missing/anonymous/spoofed JWT. Controlled verifier cases remain labeled and are not hosted identity proof.
- `test:cms-operation` passed cookie-free public reads, post-restart spoofed-mutation denial, synthetic passkey storage, and recorded-descendant cleanup (`leftoverAlive: []`).
- `test:cloudflare-candidate` passed anonymous/spoofed `/_emdash` 404s and the previously bypassing encoded paths on local workerd. Encoded public `/%67etting-started` was not the `/_emdash` text/plain deny. Local public `/` returned 200 on the candidate worker; that is not a live-site or Access claim.
- Candidate owned trees this run: `astro-build` pid 19934 (exit 0); `candidate-worker` pid 26717 and recorded descendants 26795, 27173, 27210, 27296, 28064 stopped in `finally` (`leftoverAlive: []`, port released). CMS fixture owned `astro-build`, `worker-1`, and `worker-2` also stopped with `leftoverAlive: []`. No other processes were signaled.

## Limits

- Local workerd/D1/R2 and official-authenticate unit tests only. No Cloudflare account, Access application, user, or hostname was created or changed in this repair.
- Native passkey registration in `test:cms-operation` is a local synthetic storage fixture. It is not hosted Access proof.
- The Access candidate uses official JWT `authenticate` only. Missing, invalid, unallowlisted, encoded, and malformed-namespace identities/paths are denied. There is no hosted Access positive claim.
- Controlled verifier cases are labeled and are not hosted identity proof.
- The live public site remains the deployed static introduction `1e0e915f-bf79-4ec7-8527-e87e7d46f8e2` / digest `e8b8f3cf01158a3f3c259fbfb1511e1f0f779829e97872e866f600ff646243f4`. This work does not deploy or cut over.
- Fixture team/audience/allowlist strings are synthetic (`example.invalid`, `fixture-audience-not-production`, `owner@fixture.invalid`).
- Proof omits cookies, JWTs, raw auth responses, keys, `.env` values, and private machine paths.
