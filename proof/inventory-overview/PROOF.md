# Inventory metadata overview proof

Implementation identity: `sha256:c05de27ef1b847bb84f256e13f02bc7cff1c9a7ac8583251f4d7d1cb013bc530`. [source-manifest.json](source-manifest.json) binds source, tests and documentation to Website baseline `1edbf2e3863e5b9925bedafc560e365ab338bd83`. Inventory's consumed contract/verifier is the public merged `b9ae464692eb0cc5d113e9db9285429af73dc736` revision. Ledger/proof metadata is outside the implementation digest.

## Behavior and authorization

Merchant overview uses persisted server selection; cross-organization query selectors are rejected. Operator overview takes one exact organization and requires independent purpose-specific caller authorization without a directory. Current personal login, organization admission/subject mapping, merchant membership/selection and purpose grant are rechecked around asynchronous reads. Membership, Owner status, CMS administration and site-view rights do not confer overview permission.

The source reader issues server-only claims with scalar `inventory-account-overview` audience, sole `inventory:account-overview:read` scope, independent personal caller and server-loaded organization ID/subject; its explicit signer/HTTPS endpoint are not installed in production. Redirects, oversized reads, wrong organization, malformed relationships and inappropriate statuses fail closed. A nested DTO projection excludes product, SKU, stock, contact and service-private fields.

The screens distinguish allocated pools and retained sites, provisioning, verified Website origin and retained/revoked/unknown Website access. Empty observed metadata renders zeros; unavailable metadata renders unknown counts without rows. Observation and sample timestamps are retained; older-than-15-minute snapshots carry a UI age warning. Provisioning does not claim live health. No data-changing action is present.

## Verification

Exact Node 22.23.2 `npm run verify` exited 0: 8 account, 9 Inventory runner, 18 merchant, 6 account-foundation and 6 overview tests (47 total), repository/setup audit, typecheck, build, route smoke, development CMS, public-release reuse, CMS operation helper, Access guard, safe HTTP, persistence/restart and candidate denial checks. Typecheck reports 0 errors, 0 warnings and one pre-existing unused-import hint. All implementation/test bytes remain identical to that successful run; only explanatory documentation changed afterward.

Overview tests use actual built Worker routes and local D1. They verify separate operator authority, current selected organization, no inherited membership/CMS/Owner grant, method/selector denials, available/empty/stale/unavailable/invalid results, retained/revoked/unknown binding joins, private-field omission and authorization revocation during delayed reads. Production entry ignores rogue fixture bindings and remains merchant-unavailable/operator-denied. A real ES256 signature is cryptographically checked in the controlled transport; a separate source qualification ran those Website claims against the exact merged Inventory verifier successfully. No key or token is preserved in this proof.

## Browser evidence

Unedited native Chrome captures were personally inspected on the actual built local Worker with synthetic signup, grants and signed transport. Desktop CSS viewport measured 2796x1453. Final mobile viewport and document both measured 390 pixels wide (390x844 CSS viewport), with no horizontal overflow. Available merchant/operator, empty and unavailable views were captured. The stale warning and successful read-only refresh were visibly inspected; the transient loading indicator was not captured and is not asserted as browser proof. An initial 585px capture remains preserved outside the selected set.

Selected images contain only synthetic identities/relationships/example origins and page content; no credentials, raw login links, tokens, cookies, keys, customer data or browser account information. No redaction/editing was necessary. Binaries belong in the designated access-controlled PR-asset shelf, outside the product source Git tree; publication locators/receipts remain in the ignored handoff.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `overview-chrome-desktop.png` | 143940 | `8bb2576ad8db62ebe95f846426991393c4fb7e26697efb0faab26ff9bfb775da` |
| `overview-chrome-mobile-390.png` | 83565 | `d22281dcc4b26caef93202ad0dab55ad4d02b2bb53fcc5dbee9062f8e33a83b9` |
| `operator-chrome-mobile-390.png` | 83061 | `acf3c94f47ef8dbe59bde72648e301be359b5ac1c0da7012c2a7afaef48d8939` |
| `operator-empty-chrome-mobile-390.png` | 47866 | `760b4f22e7d561bfeb0033beeddbbffdea2b62a29c977b2fd1dfba17a1f48239` |
| `operator-unavailable-chrome-mobile-390.png` | 45122 | `aaedbefcc4ac17fcddeb580bcb4b964c32a463b0bf4a76905c971472fc4bf1b3` |

## Review disposition and limits

The bounded ACP draft was rejected as qualification because it assumed a flattened DTO, omitted current-state route fencing and only decoded test JWTs. Parent-owner corrections use the actual merged nested DTO, independent purpose runtime, real built-route/local-D1 race proof and cryptographically verified claims. No required local finding remains. Remote current-commit CI, comprehensive OpenClaw and actual native ClawSweeper must be assessed separately before a human merge decision.

Production has no overview authorizer, signer or endpoint: merchant unavailable and operator denied are intentional. This proof does not establish hosted authentication/Inventory availability, live grants, deployment, phone OTP, SMS delivery, registry installation, stock operations, billing, suspension/recovery/deletion or Payments activation. No production account, key, permission, database or service was mutated. Source review and publication do not authorize merge or deployment.
