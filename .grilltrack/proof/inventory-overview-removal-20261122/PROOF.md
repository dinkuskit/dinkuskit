# Inventory overview removal: route proof (22 Nov 2026)

Decision: `website-inventory-overview-removal-20261122`. Both runs use the
built site through `tests/helpers/merchant-harness.mjs`, a real local Worker
on Wrangler's workerd with the production build in `dist/server`. Node 24.22.3.

## Retired and retained routes

`route-smoke.mjs` in this folder signs up a new owner (who gets a business),
then requests each route with that session and no redirect following. Run from
the repository root after `npm run setup && npm run build`:
`node --experimental-strip-types .grilltrack/proof/inventory-overview-removal-20261122/route-smoke.mjs`.

Base, main `d936a83` (EmDash 1.5):

```
403  GET /account/inventory
403  GET /account/operator/inventory?organization_id=<org>
200  GET /account
200  GET /account/sites
303  GET /account/connect
200  GET /account/.well-known/jwks.json
```

Head, `ac6e89d`:

```
404  GET /account/inventory
404  GET /account/operator/inventory?organization_id=<org>
200  GET /account
200  GET /account/sites
303  GET /account/connect
200  GET /account/.well-known/jwks.json
```

The two retired pages change from refusing this owner (403) to not existing
(404). The account page, the stores page, the Connect page (303 without a
pending connection) and the public signing keys answer the same as before.

## The new regression test, base fails and head passes

`tests/account-pages.test.mjs`, test "the retired Inventory overview pages are
gone for a signed-in owner".

- On base `d936a83` with only that test file copied in: fails,
  `AssertionError: /account/inventory no longer exists`, actual 403, expected 404.
- On head `ac6e89d`: passes, along with the other two tests in the file
  (3 of 3).

The Connect flow itself stays covered by `test:shared-store` (51 tests) and
`test:inventory-runner` (9 tests), both passing on head.
