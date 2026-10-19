# Ship plugin store pass source proof

Base: `1f6562b6fe9098805e9240a15391a25a81bb2bb4` in `dinkuskit/dinkuskit`.
Decision: `website-ship-admin-pass-075`, proposed through the repository GrillTrack CLI.
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
- `npm run test:shared-store`: 35 of 35 passed. With `src/account/config.ts` reverted
  to the base, `store passes: one key, a 5-minute pass for each service that is on,
  nothing for the rest` fails, so the test covers the change.
- `npm run audit:repo`, `test:docs`, `test:account`, `test:merchant`, `test:smoke` and
  `test:operator-admin`: passed.

The tests use the local D1 fixture and stubbed keys. No deployment, remote runtime, real
store, grant, Ship call or account change was performed. The first Shipping page click
from a store running the Ship plugin, after Ship and DinkusKit.com are both deployed, is
the live proof.
