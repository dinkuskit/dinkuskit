# Isolated Ship issuer source proof

Base: `9446488e046413ecc69a71167d1f0ba63c78ec24` in `dinkuskit/dinkuskit`.
Decision: `ship-sandbox-issuer-v1`, recorded through the repository GrillTrack CLI.
Contract: [issuer authorization](../../docs/ship-sandbox-issuer.md).

## Verification

Node 22.23.1, locked dependencies installed with `npm ci`.

- `npm run setup` and `npm run build`: passed.
- `npm run typecheck`: zero errors/warnings, two existing deprecated clipboard hints.
- `node --experimental-strip-types --test tests/ship-sign-in.test.mjs tests/shared-store-isolation.test.mjs`: 33 tests passed.
- `node --experimental-strip-types --test --test-concurrency=1 --test-timeout=180000 tests/shared-store-routes.test.mjs tests/merchant-migrations.test.mjs`: six tests passed (five migration cases and one full HTTP route flow).
- `npm run audit:repo`: passed. `git diff --check`: passed.

The HTTP proof exercises compiled production routes in a local Worker with local
D1, synthetic mail/proof/payment-status transports. It establishes a legacy store,
key, grant and sign-in; restarts only the fixture with a sandbox registration;
proves the same key works for sandbox orders and production Ship is denied;
checks stale generation, legacy code/refresh denial, checkout tuple, refusal of a
live-settings save, fixed sandbox callback, sandbox labels JWT and refresh.
Unit proof verifies signature/audience separation, malformed registration,
wrong-site/scope/generation, grant/account/TEST checks, removed/changed recipient,
legacy-family isolation and concurrent single-use/refresh replay.

No visual change is claimed. No remote runtime, real site/key/grant, order,
payment, provider, DNS, deployment, email send or account mutation was performed.
This is not an installed Commerce Registry or live Ship integration proof. Those
owners must verify their frozen wire contract, immutable exact-order admission,
receiver TEST/no-email guards and event/ack fences. Existing historical paid proof
is not migrated or used as sandbox fulfillment proof. Already-issued tokens and
provider work require separately approved activation/quiescence.

Exact-source OpenClaw, native ClawSweeper and CI evidence remain pending at the
initial source commit; subsequent review receipts are bound to their actual SHAs.

Cross-repository tests can import `mintSandboxPass(generation?)` from
`tests/helpers/ship-issuer-fixture.mjs` under Node 22 with
`--experimental-strip-types`. It runs migrations in in-memory SQLite, creates
synthetic identities/settings and an ephemeral signing key, then calls the real
`issueStorePass`. It returns `{ token, publicJwk, siteId, generation }` in-process
only; never log or persist the token. Migrations resolve relative to the helper,
so the caller's working directory may be another checkout. `fixture`, `SITE` and
`OTHER_SITE` are also exported for controlled local tests. This issuer is a website
Worker rather than an EmDash Registry plugin; its compiled entry is
`dist/server/entry.mjs`, covered by the HTTP proof above.

## Native review repair cycle 1: populated schema-12 upgrade

Accepted the compatibility proof gap from native run `38612452365` on head
`32febf1759d55efa99c583556bdb1d16eb0028a5`. Its code/security finding lists were
empty, but existing schema-12 authorizations were not covered by the earlier
migration evidence. No findings were rejected; this repair changes tests/proof
only, with no issuer behavior or helper API change.

`node --experimental-strip-types --test --test-name-pattern='0013 preserves' --test-timeout=180000 tests/merchant-migrations.test.mjs` passed (one test).
The test applies only migrations 1–12 to local D1, seeds two pending codes and two
active refresh families before the new columns exist, and verifies the version-12
ledger and row counts. A request through the compiled Worker applies 0013. The
existing rows retain NULL recipient/generation/mode. Real token HTTP endpoints
redeem one pending code and refresh one family; JWT verification against the
public JWKS confirms production audience and no sandbox claims. After restart
with exact-site sandbox registration, the remaining pre-migration code and family
both return invalid_grant. The ledger stays at 13 and foreign_key_check is empty.
All credentials are generated synthetic fixtures; no token or private JWK is
printed. This closes the specific upgrade-evidence gap, pending fresh exact-head
reviews and CI. Cross-service proof must be requalified for the new test-only head.
