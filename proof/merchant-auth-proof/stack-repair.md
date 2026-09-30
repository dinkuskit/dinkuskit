# Parent-stack reconciliation

Bounded correctness and public-safety repair of the in-progress no-commit merge of settled `codex/auth-proof-assets` (`8ea9cb58ce14`, PR1 settled `ad2c5e23d261`) into this Cloudflare merchant-auth branch (`04f6ebb2a0b3`). Existing product locks are unchanged. GrillTrack ledger and events were left byte-identical and only CLI-validated.

This note describes the resolved Cloudflare worker tree. Historical foundation and Node-adapter repair records were not rewritten to claim they prove this worker. Formal review remains with the rail owner and was not dispatched.

## Inherited parent guard, adapted to this worker

- Supported `middleware.outer` is `./src/emdash-namespace-guard.ts` on the existing Cloudflare `d1` / `r2` / `sandbox` EmDash integration
- Production deny is unconditional except compile-time `import.meta.env.DEV` and a fixture-only request-scoped CMS ALS
- Production never initializes or enters that CMS store
- `package.json` keeps existing Cloudflare `test:account` / `test:merchant` / types / workerd start scripts and inherits `test:dev-cms`

`proof/website-foundation/repair-source-manifest.json` and `REPAIR.md` remain the parent's foundation input record. Historical foundation screenshots at public product commit `dda0260636aa` do not prove this merged source. Current worker repair evidence is in `proof/better-auth/REPAIR.md`.

## Existing auth source

Merchant account, migration, origin, mail/receipt wrapper, and copy remain from this branch. No public login route was added. CMS editor identity stays separate from Better Auth merchants.

## Verification

Node 22.23.2. Command:

```sh
npm run verify
```

`verify` is `audit:repo`, `setup`, `types:wrangler`, `typecheck`, `test:account`, `build`, `test:merchant`, `test:smoke`, and `test:dev-cms`. Current repair counts are 17 merchant, 8 smoke, 8 account, plus the local-dev CMS check. The first parent verify passed production and merchant checks, then failed only on the Astro 7.3.2 CLI local-dev lifecycle (agent-env background daemon; launcher exited). The launcher now uses the public `import { dev } from 'astro'` API and `server.stop()`. Local API checks passed twice; parent full verify rerun is pending. Each test process stops only its own server and removes only its own temporary directories.

## Limits

- Local fixtures only. No production merchants, live email, Registry installation, hosted JWKS, or native EmDash browser sessions.
- Historical parent screenshots and the PR1 repair manifest do not prove this merged tree.
- Prior final Spark email-API raw finding remains independently rejected.
- This repair did not commit, push, complete the merge, dispatch review, deploy, or mutate accounts, credentials, or assets.
