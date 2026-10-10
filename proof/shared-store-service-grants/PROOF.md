# Shared store identity and service grants proof

Source base: d148a87211abcee6ac72614465a5bb0273e79be8.
Source digest: sha256:fddf9c85df3aa1a5542e6cca18d0c26639b526b2b3bee542f2b02f2739f93835.
Digest covers sorted changed src/, tests/, migrations/ and package.json paths, each UTF-8 path plus NUL, file bytes plus NUL.

## Result
Mandatory v2 Inventory and Payments connections resolve one server-owned store identity, with separate explicit service approval, signing audience, scope, redemption and revocation. Existing development v1 rows remain untouched and inert; clients must upgrade and reconnect. Contract: docs/shared-store-connections.md.

## Verification
Node 22.23.2. Full npm run verify passed (82 tests plus repository audit, setup, generated types, Astro typecheck/build, route/CMS and deployment-denial checks).
After final source adjustments, npm run typecheck, npm run build, npm run test:shared-store (13), npm run test:operator-directory (12), and npm run test:merchant (19) all passed.
Independent regression tests cover both connection orders, separate grants, audience/scope fences, owner loss, mismatched client/proof, stale/denied/claimed proof races, revocation during token preparation, origin collisions, unsupported v1, and untouched legacy rows.

Local browser proof used normal synthetic merchant signup and session, Inventory consent, Payments consent and connected-sites views. Both services appeared separately with independent revoke controls and the same server-returned identity. Payments consent names status and processor setup access and excludes checkout. Synthetic callback host was intentionally not served; persisted approvals were verified through the local connected-sites page. This is website/local-fixture proof, not installed consumer or live hosted-service proof.

## Working artifacts
Ignored .grilltrack/work/shared-store-service-grants/ contains verify-1.log, final-validation.log, independent-final.log, source-manifest.json, inventory-consent.png, payments-consent.png and connected-services.png. Generated logs, synthetic session details and browser images are not committed.

## Limits
No deployment, live grants, consumer plugin changes, data reset or merge. Hosted-service availability gates remain closed. External comprehensive OpenClaw and native ClawSweeper review follow on the immutable PR revision; their terminal receipts are separate from this local proof.
