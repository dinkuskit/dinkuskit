# Test-mode deploy and production store Connect

Base: main f97f4b3 plus PR 24's commit b12278b (deploy prep), carried here unchanged.
Decisions: website-test-mode-deploy-031 and website-production-store-connect-032.

## Why Connect never worked online

Production consent failed closed with `integration_unavailable` because no
production proof transport was wired. The existing `fetchStoreProofReceipt`
could not have been wired as-is: it fetched with `redirect: 'error'`, which
workerd refuses. Reproduced with Wrangler 4.144.0 local workerd
(compatibility date 2026-02-24), a minimal worker calling `fetch` with each mode:

```text
error: threw: Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code).
manual: (reached the network; the test host does not resolve)
```

## Change

- `fetchStoreProofReceipt` uses `redirect: 'manual'` and refuses any 3xx or
  opaque redirect as `proof_redirect_rejected` without following it. Origin,
  fixed path, single query, size, time and field-for-field checks are unchanged.
- `createMerchantRuntime` and `createMerchantApp` default to that fetch. Test
  entries still inject their labelled simulation transport first.
- `cloudflare/wrangler.jsonc` gains the `EMAIL` send_email binding and drops the
  placeholder `local-` D1 ID; DEPLOY.md covers creating the databases, Email
  Sending onboarding, the three secrets (new `scripts/generate-signing-key.mjs`
  pipes a signing key straight into `wrangler secret put`) and a click-through check.
- README explains the local `.dev.vars`, where local sign-in links land, and the
  local admin bypass.

## Tests

- New: production consent through the network transport grants on a matching
  receipt and grants nothing on a 404 or a redirect, each with exactly one
  request to the registered Payments proof URL.
- New: a 302 from the store is refused after one request.
- Changed: the production-worker test no longer expects `integration_unavailable`.
  It now proves the production entry with rogue simulation bindings has no
  simulated receipt route and mints nothing for an unapproved store, and that the
  same store approves and mints only in the simulation entry.

## Local verification (Node 22.23.2)

- `npm run verify`: every step passed through `test:smoke` (audit, setup, types,
  typecheck, account, build, inventory runner, merchant 19/19, shared store 16/16,
  foundation, inventory overview, operator directory, organization approvals, smoke).
  `test:dev-cms` then failed only because an earlier manual dev session in this
  checkout had initialised the local CMS; with fresh local state it passed, as did
  `test:public-release-reuse`, `test:access-gate`, `test:safe-http-url`,
  `test:cms-operation`, `test:emdash-upgrade` and `test:cloudflare-candidate`.
- `test:cms-operation-helpers` fails at its process-tree cleanup regression
  ("survivors remain alive") in this container, identically without this change.

## Limits

No deploy, Cloudflare resource, secret or Email Sending change was made. The live
proof is the first Connect from a real Registry store with the Payments plugin
after the owner deploys. Inventory still has no Registry publisher identity, so
only Payments can connect from a Registry install.
