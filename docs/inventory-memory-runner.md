# Inventory test controller/runner

This is a website-owned, test-only controller for the approved Inventory
step4 contract. Default mode starts only the built website worker on
`127.0.0.1:47632` and consumes the externally installed dispatcher at
`http://127.0.0.1:47631`; it never owns or stops that dispatcher. The
separate `createInventoryReceiptFixture()` fixture is explicitly for unit
tests and may own a non-default port.

Run it with:

```sh
npm run setup
npm run build
npm run test:inventory-runner
```

`startInventoryMemoryController()` is exported from
`tests/helpers/inventory-memory-runner.mjs`. The returned controller exposes
safe URLs, the public ES256 JWK, the exact local fixture origin, a reusable
canonical website `dispatch` interface, child restart, and idempotent owned
stop. The transient Better Auth secret and private JWK remain in the parent
process and are supplied through Wrangler's in-memory test-only `vars`
option. They are never written to config, environment files, logs, proof, or
test output.

The child is a Wrangler local workerd runtime. A surviving controller retains
its secret, unique signing `kid`, and D1 persistence across website worker
restart. Mailbox URLs are held in a volatile process-memory map; merchant D1
and public JWKS persistence use the unique ignored runtime directory.

The supported local runtime is Node 22.23.2 with npm 10.9.8. From a clean
checkout, install dependencies with `npm ci`, then run `npm run setup`,
`npm run build`, and `npm run test:inventory-runner`. `npm run verify` runs
the focused inventory runner immediately after the build.

Tests use a separately owned synthetic HTTP dispatcher fixture. The loopback
transport is simulation/test evidence: the built worker performs the same
bounded network GET shape as the production proof transport, while receipt
registration and failure modes exist only in that external fixture. The
request-scoped test entry admits only the literal
`http://127.0.0.1:<configured-port>` origin. Production parsing still rejects
loopback/private origins. The controller `dispatch` maps only POST requests
to `https://dinkuskit.com/api/store-connections` and
`/api/store-connections/token` onto the owned website port, preserving method,
headers and body bytes with manual redirects.

The automated test posts explicit consent through the real network bridge.
The interactive `npm run inventory:runner -- --serve` command leaves the
consent page available for a human to inspect and click; it does not
auto-approve. The automated suite uses a synthetic receipt fixture; an
installed variant and human-click qualification belong to the consuming site,
and this runner makes no pool claim or invents a `pool_id`.

The current raw TAP receipt is retained under the ignored GrillTrack work
area. With the supported runtime and installed compatible prerequisites, the
focused tests prove Better Auth signup, consent, exact receipt comparison,
canonical JWT/JWKS, public-key and merchant-session persistence after child
restart, production fail-closed behavior, and finite bridge rejection.
This is runner qualification only; it does not claim a specific Inventory
installation or human-visible consent in a hosted site. Better Auth's normal
D1 framework session persistence remains in scope. The controller keeps the
private JWK and auth secret in memory variables and outputs only safe URLs and
public metadata. The dispatch test proves that the supported request body is
accepted; it does not prove preservation of arbitrary headers. Expiry timing,
live installation, pool membership, callback dispatch and hosted JWKS
availability remain outside this slice.
