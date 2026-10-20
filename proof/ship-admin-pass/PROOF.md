# Ship plugin store pass source proof

Base: `1f6562b6fe9098805e9240a15391a25a81bb2bb4` in `dinkuskit/dinkuskit`.
Decision: `website-ship-admin-pass-076`, recorded through the repository GrillTrack CLI.
Contract: [shared store connections](../../docs/shared-store-connections.md).

## Change

`STORE_PASS_SERVICES` gains `{ service: 'ship', scope: 'ship:admin', audience: 'dinkus-ship' }`.
`issueStorePass` already finds a service by scope and audience and checks that service's
grant, so the new pass is signed under the store's existing Ship grant with the same
issuer, `sub`, `site_id`, `site_origin`, 300-second life and refusals as `ship:orders`.
A site registered for the isolated Ship sandbox is refused a `ship:admin` pass on both
audiences, as it is refused a production `ship:orders` pass. `ship:labels` is still
never a store pass.

## Verification

Locked dependencies already installed in a fresh cloud container, Node 22.22.0.

- `npm run typecheck`: zero errors and warnings, two existing hints.
- `npm run build`: passed.
- `npm run test:shared-store`: 36 of 36 passed. With `src/account/config.ts` reverted
  to the base, `store passes: one key, a 5-minute pass for each service that is on,
  nothing for the rest` fails, so the test covers the change.
- `npm run audit:repo`, `test:docs`, `test:account`, `test:merchant`, `test:smoke` and
  `test:operator-admin`: passed.

Replacing the store key stops `ship:admin` passes on the old key (`invalid_store_key`),
an operator cut-off of Ship stops them (`service_cut_off`), and turning Ship off stops
them (`service_not_enabled`). Passes already issued stay valid until their `exp`, at
most 300 seconds, as for every store pass.

## Issuer to Ship

`mintShipAdminPasses()` in `tests/helpers/ship-issuer-fixture.mjs` calls the real
`issueStorePass` on the in-memory fixture with an ephemeral key. It returns a
`ship:admin` and a `ship:orders` pass for one store, a `ship:admin` pass for another
business's store, and a `ship:admin` pass issued ten minutes ago, so already expired.
`tests/ship-sign-in.test.mjs` checks their claims.

`ship-admin-chain.spec.ts` sends those passes to Ship's own Worker from
dinkuskit/ship#44 at `3a5fdd7a2209bfbc5ee1b854db4a2631325a0b21`. It runs in Ship's
vitest Workers pool, with this fixture's public key served as the issuer's JWKS and
Pitney Bowes's sandbox stood in for, as in Ship's `admin.spec.ts`. From a checkout of
that commit, after `npm ci` in `service/`:

```
cp proof/ship-admin-pass/ship-admin-chain.spec.ts <ship>/service/spec/chain.spec.ts
node --experimental-strip-types proof/ship-admin-pass/mint-ship-passes.mjs <ship>/service/spec/chain-passes.json
(cd <ship>/service && npx vitest run spec/chain.spec.ts)
rm <ship>/service/spec/chain-passes.json
```

The test passed (1 of 1). Commerce's `ship:orders` pass from the issuer sends a TEST
order. Then, before any Pitney Bowes shipment:

- the `ship:orders` pass is refused on the admin list and on buying a label (403);
- the other store's `ship:admin` pass sees no orders, and gets 404 for this store's
  order and for buying its label;
- the expired `ship:admin` pass is refused on the list and on buying (401);
- the `ship:admin` pass is refused on Commerce's `/v1/labels` (403).

No shipment had been bought at that point. The store's own `ship:admin` pass then lists
the order, prices it and buys one sandbox label, and exactly one shipment is recorded.

These runs use synthetic fixtures, an ephemeral key and a stand-in for Pitney Bowes.
No deployment, remote runtime, real store, grant, live Ship call or account change was
performed. The first Shipping page click from a store running the Ship plugin, after
Ship and DinkusKit.com are both deployed, is the live proof.
