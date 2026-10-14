# Isolated Ship issuer source proof

Base: `9446488e046413ecc69a71167d1f0ba63c78ec24` in `dinkuskit/dinkuskit`.
Decision: `ship-sandbox-issuer-v1`, recorded through the repository GrillTrack CLI.
Contract: [issuer authorization](../../docs/ship-sandbox-issuer.md).

## Verification

Node 22.23.1, locked dependencies installed with `npm ci`.

- `npm run setup` and `npm run build`: passed.
- `npm run typecheck`: zero errors/warnings, two existing deprecated clipboard hints.
- `node --experimental-strip-types --test tests/ship-sign-in.test.mjs tests/shared-store-isolation.test.mjs`: 32 tests passed.
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
