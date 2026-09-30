# Better Auth Cloudflare stack repair

Bounded source-linked repair of the in-progress no-commit merge of settled `codex/auth-proof-assets` (`8ea9cb58ce143eecaf7df0bd2d03ade1e9037f90`, PR1 settled `ad2c5e23d261b3ec22e79829ba868885a60f5599`) into this Cloudflare merchant-auth branch (`04f6ebb2a0b32140b633134591ddc1e261ac104e`). Existing product locks are unchanged. GrillTrack ledger and events were left byte-identical and only CLI-validated.

This note is new function evidence for the actual Cloudflare worker. It does not rewrite historical capture manifests or claim that old pixels prove the repaired middleware.

Historical browser captures remain bound to `089240aee0af0244ce231861a3eeb600bd7f1807` and public PR https://github.com/dinkuskit/dinkuskit/pull/4 / historical capture base `347514c8c7757ce744b5f5e406b7fd00c014cc5c`. That PR4 base is capture provenance, not the current merge or repair target. Those JPGs stay access-controlled. Foundation JPGs already in public product history keep their inherited links in `proof/website-foundation/`.

## P1 production namespace gate

EmDash 1.0.1 supported `middleware.outer` registers before runtime, setup, and auth. `src/emdash-namespace-guard.ts` denies the exact `/_emdash` namespace in every Cloudflare production build, including GET and POST setup/admin, Host/Origin/forwarded/cookie/query spoofing, encoded route variants, rogue proof bindings, and CMS media.

Trusted unlocks:

- compile-time `import.meta.env.DEV` for localhost `astro dev`
- a request-scoped CMS proof ALS (`Symbol.for('dinkuskit.cms.proof.als')`) created and entered only by a separate fixture entry

The production entry never initializes or enters that store. No HTTP route, header, cookie, env binding, or production mode flag activates it. CMS proof is independent of merchant identity ALS. The dedicated smoke seed entry does not export proof HTTP routes. Protected production operator CMS activation remains a separate deferred lane.

Merchant tests continue to use `tests/fixtures/built-test-entry.mjs` for request-scoped mail/receipt transports only. CMS positive control in `tests/cms-merchant-isolation.test.mjs` uses `tests/fixtures/built-cms-test-entry.mjs`: actual public setup plus a software passkey reaches private settings 200, with bidirectional merchant/editor isolation and no fabricated CMS auth rows.

## P2 public proof sanitization

Tracked [PROOF.md](PROOF.md) keeps logical asset names, byte lengths, SHA-256, capture source `089240aee0af0244ce231861a3eeb600bd7f1807`, public PR/source base, dates, and synthetic/captured-mail/consent limits. Private repository coordinates, release URLs, and IDs were removed. No private asset was made public.

## Smoke fidelity

Current Cloudflare smoke can no longer seed through production `POST /_emdash/api/setup`. It starts the actual production entry on a fresh temporary D1, proves the namespace is denied before any setup mutation, stops that worker, seeds the same persist through the dedicated fixture entry (no CMS editor), stops the fixture, and restarts the actual production entry. Public `/` and `/getting-started` then return 200 with native content while CMS remains denied.

## Verification

Node 22.23.2. Current repair counts are 17 merchant tests, 8 HTTP smoke checks, 8 account tests, and the local Astro-dev CMS check.

The first parent `npm run verify` on this resolved tree passed audit, setup, types, typecheck, account, build, `test:merchant` 17/0, and `test:smoke` 8 PASS. Final `scripts/dev-cms.mjs` failed: pinned Astro 7.3.2 CLI auto-detected the parent agent environment and launched a background daemon; the launcher exited and the readiness loop saw that exit. That is a local-dev lifecycle failure only, not an all-suite production/merchant failure. Evidence: ignored `.grilltrack/work/website-review-repair-20260930/parent-verify.log` and `parent-failure-and-cleanup.json`. Parent confirmed the exact owned daemon (PID 18769, port 53949) from startup stdout and `astro dev status`, then sent TERM.

The launcher now uses the supported public API `import { dev } from 'astro'`, `await dev({ server: { host: '127.0.0.1', port } })`, an HTTP setup positive check, and `await server.stop()` in `finally`. That path starts the direct runtime and does not enter the CLI agent/background path. Local API checks passed twice in this agent environment and rebound the exact bound port after stop. The final independent full npm run verify passed after the correction.

- `audit:repo`: 116 files
- `setup`: local merchant migrations applied; no remote
- `typecheck`: 47 files, 0 errors / 0 warnings / 0 hints
- `test:account`: 8 passed, 0 failed
- `build`: Cloudflare worker
- `test:merchant`: 17 passed, 0 failed, including CMS isolation positive control and production deny of rogue CMS bindings/flags
- `test:smoke`: fresh production deny before mutation; fixture seed without editor; production `/` and `/getting-started` 200 with native content; CMS still denied; merchant 503; no proof routes
- `test:dev-cms`: public Astro `dev` API on 127.0.0.1 served the local setup form; no account created; `server.stop()` closed the exact listener

Each process stopped only its own worker or direct dev server and removed only its own temporary directories.

## Limits

- This repair did not commit, push, complete the merge, dispatch review, deploy, or mutate live accounts, credentials, or assets.
- GrillTrack ledger and events were left byte-identical.
- Old screenshots are not re-captured against the repaired source.
- Prior final Spark email-API raw finding remains independently rejected, not clean; no new formal qualification is claimed.
- Formal review-rail owner is separate and was not dispatched.

## Final independent verification

After the lifecycle correction, the author reran the complete npm run verify command successfully: 8 auth tests, 17 merchant tests, 8 production smoke checks, zero Astro diagnostics, and local development setup. The direct API stop completed and its exact listener port was free. The earlier failure and exact daemon cleanup receipts remain in ignored author proof; the old launcher-only cleanup claim is superseded. Production namespace protection, merchant pages, migrations and email delivery source are unchanged by that lifecycle correction.
