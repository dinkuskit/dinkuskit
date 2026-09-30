# Parent-stack reconciliation

Bounded correctness and public-safety repair of the in-progress no-commit merge of settled website-foundation PR1 (`ad2c5e23d261b3ec22e79829ba868885a60f5599`) into this merchant-auth PR3 branch (`347514c8c7757ce744b5f5e406b7fd00c014cc5c`). Existing product locks are unchanged. GrillTrack ledger and events were left byte-identical and only CLI-validated.

This note describes the resolved source tree. Fresh rail review req112318 was clean on the prior PR3 tuple; it does not qualify the repaired tuple.

## Inherited parent guard

The inherited parent production `/_emdash` namespace gate is kept:

- Supported `middleware.outer` remains `./src/emdash-namespace-guard.ts`
- `src/emdash-namespace-guard.ts` is unchanged
- `package.json` keeps existing `test:account` and the PR3 account steps inside `verify`, and inherits parent `test:dev-cms`

`proof/website-foundation/repair-source-manifest.json` and `REPAIR.md` remain the parent's PR1 input record. They were not rewritten with PR3 files or claims. Historical foundation screenshots at public product commit `dda0260636aa7723e28fefd10e1f3424ff24d1cf` do not prove this merged source.

## Existing auth source

`src/account/`, `tests/`, and `scripts/merchant-auth-proof.mjs` are unchanged from PR3 HEAD. No public login route was added.

## Verification

Node 22.23.2. Commands:

```sh
npm ci
npm run verify
```

`verify` is `audit:repo`, `setup`, `typecheck`, `test:account`, `build`, `test:smoke`, and `test:dev-cms`. Each test process stopped only its own server.

Local results on this resolved tree:

- `npm ci`: 690 packages added, 0 vulnerabilities. Known upstream auth-library deprecation warnings remain.
- `audit:repo`: passed path/manifest checks.
- `setup`: 88 migrations, one collection, three fields, two pages.
- `typecheck`: 14 files, 0 errors, 0 warnings, 0 hints.
- `test:account`: 9 tests passed, 0 failed. Sanitized fixture harness outcomes only; no credentials, cookies, raw tokens, or signing secrets retained here.
- `build`: completed. Existing EmDash admin bundle-size warning retained.
- `test:smoke`: public `/` and `/getting-started` 200 with seeded native-block content; production `/_emdash` admin, setup, setup POST, spoofed localhost Host/headers, and CMS media denied 404; unknown route 404.
- `test:dev-cms`: Astro dev on 127.0.0.1 still serves the local setup form; no account created.

## Limits

- Local fixtures only. No production merchants, live email, Registry installation, hosted JWKS, or native EmDash browser sessions.
- Historical parent screenshots and the PR1 repair manifest do not prove this merged tree.
- req112318 does not cover this tuple.
- This repair did not commit, push, complete the merge, dispatch review, deploy, or mutate accounts, credentials, or assets.

Independent author verification reran the full command on the resolved tree and confirmed that the auth source, tests and GrillTrack files remain unchanged. Publication and final tuple are recorded by the PR commit and author handoff; formal qualification remains with the rail owner.
