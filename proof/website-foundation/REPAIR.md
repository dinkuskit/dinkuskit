# Website foundation repair proof

Bounded source-linked repair of two accepted rail findings against the website foundation. This is a correctness repair under the existing confirmed website-platform, scaffold, and domain locks. It is not a new product decision.

Working tree at repair start: `0e50de63f899f8dbb29044201b1cc2d5215c6650`
PR1 base: `67db46b5ec2306af078feb07e1c17f7f1d37e10d`
Historical capture source head: `dda0260636aa7723e28fefd10e1f3424ff24d1cf`
Public product PR: https://github.com/dinkuskit/dinkuskit/pull/1
Date: 2026-09-30

## Findings

- P1: anonymous callers could reach EmDash first-admin bootstrap on a production Node build of a fresh seeded database.
- P2: tracked public proof named a private asset repository, release identifiers, download URLs, and asset IDs.

## What this proof is

New HTTP evidence against the repaired source, plus sanitized historical provenance. The JPEGs in [PROOF.md](PROOF.md) remain historical captures of the unguarded foundation head. They do not prove the repaired production gate.

`source-manifest.json` is unchanged and remains a historical file-hash record for that earlier head.

## P1 production namespace gate

EmDash 1.0.1 supported `middleware.outer` registers before runtime, setup, and auth. `src/emdash-namespace-guard.ts` denies the exact `/_emdash` namespace in every production build. The only trusted unlock is compile-time `import.meta.env.DEV`. Local CMS use is the existing `npm run dev` process bound to 127.0.0.1.

The default also blocks CMS-hosted media under `/_emdash/api/media/file`. Current marketing pages do not use those images, so no public-media exception was added. Production CMS enabling needs a separately configured protected operator access lane.

### Failing before

Against the unguarded built Node adapter at `0e50de63f899f8dbb29044201b1cc2d5215c6650`:

- `GET /_emdash/admin` → 302 to `/_emdash/admin/setup`
- `GET /_emdash/admin/setup` → 200 HTML setup page
- `POST /_emdash/api/setup/admin` → 200
- `POST /_emdash/api/setup/admin/verify` → 400 (handler reached; invalid state)
- Spoofed `Host: localhost` plus forwarded headers still served setup
- Public `/` and `/getting-started` returned 200; unknown route returned 404
- The repaired smoke assertion failed: `GET admin: fail-closed status` (`302 !== 404`)

### Passing after

Required `npm run verify` passed after the source repair. The same built-adapter probe then returned 404 text/plain for admin, setup, both setup POSTs, spoofed localhost Host/headers, and `/_emdash` media. Database bytes were unchanged. The production smoke uses the actual built Node adapter and asserts:

- anonymous `GET /_emdash/admin` and `GET /_emdash/admin/setup` return 404 before bootstrap
- anonymous `POST /_emdash/api/setup/admin` and `POST /_emdash/api/setup/admin/verify` return 404
- runtime database bytes are unchanged across those probes
- spoofed localhost Host and forwarded headers do not bypass
- public pages and an unknown route still behave as before
- CMS media under `/_emdash` is denied by the same default

The local-dev CMS check now uses the supported public Astro API `import { dev } from 'astro'` on 127.0.0.1, loads the setup form without creating an account, and awaits `server.stop()`. The first parent verify after the later Cloudflare merge passed production/merchant checks and failed only the previous CLI launcher lifecycle; that is not a production-gate failure. Local API proof passed twice; parent full verify rerun is pending.

## P2 public proof sanitization

Tracked [PROOF.md](PROOF.md) and [README.md](README.md) keep logical asset names, byte lengths, SHA-256, capture source commit and base, the public product PR, the capture date, and historical limits. Private repository coordinates, download URLs, release identifiers, asset IDs, and node IDs were removed. Original bytes stay where they already were; this repair does not republish them.

## Limits

- This repair did not commit, push, merge, deploy, create live accounts, or publish assets.
- GrillTrack ledger and events were left byte-identical.
- Old screenshots are not re-captured against the repaired source.
- Original foundation JPEGs are verifiable from their existing public product-history commit; no private asset is republished.
- Production operator CMS access is not implemented here.

## Independent author checks

The author reran npm run verify and checked the actual built Node adapter with encoded namespace names, duplicate leading slash, setup/status and setup POST paths. All CMS probes returned404; /getting-started returned200. The test stopped its own server. [repair-source-manifest.json](repair-source-manifest.json) hashes the tested source, scripts, seed and dependency closure. The original foundation manifest remains historical.

## Development test lifecycle correction

Independent repetition exposed the pinned Astro CLI auto-background behavior in agent environments. Earlier serverStopped receipts tracked launcher exit and did not establish detached-server cleanup. The author matched and stopped only the exact task-created daemon using its captured startup receipt. The test now uses the supported public Astro dev() API, awaits server.stop(), and verifies that its exact listener port can be rebound. This correction changes test lifecycle only; production protection and page source remain unchanged.
