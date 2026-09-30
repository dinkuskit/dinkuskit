# Better Auth account proof

Better Auth1.7.6 backs merchant signup, sign-in, recovery, logout and protected account routes in the Astro Cloudflare worker. CMS D1 `DB`, merchant D1 `MERCHANT_DB`, cookies and identities are separate. Issuer is `https://dinkuskit.com/account`; the merchant subject and canonical `JSON.stringify([issuer, sub])` account key are independent of email/provider identifiers.

## Parent verification

`npm run verify` independently passed on Node22.23.2 after the final source correction and a fresh `npm ci`: repository audit, local-only versioned D1 setup, Wrangler types, typecheck0errors/0warnings/0hints, Cloudflare build,16merchant tests,8EmDash public-auth feasibility tests and7HTTP smoke checks. The implementation input hashes are in [implementation-manifest.json](implementation-manifest.json). The feasibility tests remain historical CMS-helper evidence; they are not the Better Auth browser proof.

Merchant workerd checks include persistence/restart, separate users, single-use/expired/concurrent magic links, current disabled state, foreign/missing Origin rejection, safe redirects, fresh/upgrade migrations, and authenticated CMS isolation. The CMS positive control registers and authenticates a software passkey through public EmDash setup/auth routes, reaches protected settings, and proves bidirectional isolation. No CMS auth rows are fabricated.

Connect fixtures cover two merchants/sites, pending-owner isolation, every receipt-field comparison, PKCE/replay, conflicting site/origin ownership, denial/approval consistency with no ghost grant, proof expiry, revocation/disable guards and unusable signing configuration without consumption. The actual production entry cannot mint from persisted fixture-approved rows even with rogue test bindings.

## Original service verifier compatibility

[Sanitized command receipt](service-compatibility.json): the actual local website Inventory token passes the original Inventory verifier, has300second lifetime, and is rejected by Payments for the wrong audience/scope. A clearly synthetic Payments JWT carrying the same merchant subject passes the original Payments verifier and yields the same canonical account key. Disabling the merchant blocks new issuance with `account_disabled`; the already-issued offline Inventory JWT remains valid until expiration. This is verifier compatibility, not hosted service provisioning or production Payments issuance.

## Visible browser evidence

Attended local browser proof used the built worker and a separate test entry with captured delivery. Signup, sign-in, recovery, logout and protected-page redirect passed. Captured mail completion invokes the actual Better Auth verification handler and forwards its cookies; raw links/tokens never enter the browser or proof. Final signup/account/consent pages were inspected after the copy correction. Simulated consent created a local grant and the browser revoke action showed revoked state.

The placeholder `.example` callback did not load; return-to-hosted-Inventory delivery is not claimed. Selected screenshots use only synthetic email/site fixtures. No tokens, keys, cookies or customer data are visible. The selected release assets and their source binding are recorded below.

## Source-bound browser assets

[PR4](https://github.com/dinkuskit/dinkuskit/pull/4) targets base `347514c8c7757ce744b5f5e406b7fd00c014cc5c`. Browser captures bind to implementation head `089240aee0af0244ce231861a3eeb600bd7f1807`. Subsequent source corrections close the dependency lock and migration ledger, and normalize configured account origins; every page, layout and style still matches the capture source. Migration regressions and the full built-worker suite were rerun after the corrections. The updated [implementation manifest](implementation-manifest.json) binds the final tested source and dependency closure.

Shelf: `dinkuskit/dinkus-pr-assets`; [release dinkuskit-pr-4-089240aee0af](https://github.com/dinkuskit/dinkus-pr-assets/releases/tag/dinkuskit-pr-4-089240aee0af), ID `399745640`, published `2026-09-30T05:33:40Z`. The shelf is private and requires authenticated GitHub access. Unique release with no replacement; GitHub reports `immutable: false`, so server-enforced locking is not claimed. No repository setting was changed.

| Asset | Bytes | SHA-256 | Asset ID |
| --- | ---: | --- | ---: |
| [account.jpg](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-4-089240aee0af/account.jpg) | 57900 | `82942bb6146f596f83f2bd0206e9ce52d749db4860bea3cafaf4594d9a309bec` | `600124404` |
| [consent-simulation.jpg](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-4-089240aee0af/consent-simulation.jpg) | 58090 | `1b8702dd5f1a85e2e37d663eca09d7d482074a949a49a5f19360986c31f80d32` | `600124405` |
| [manifest.json](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-4-089240aee0af/manifest.json) | 2097 | `81dc1f8ed28ae874d358849ca7a64dfdd814005a1acb1e9c82fd5f4bb4191220` | `600124402` |
| [PUBLISHED_MANIFEST.md](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-4-089240aee0af/PUBLISHED_MANIFEST.md) | 1823 | `8032964bdb8b1c2f3e9e4f49cad62ccfd2dc3a67baaec5d55370c7993e2d0cec` | `600124406` |
| [signup.jpg](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-pr-4-089240aee0af/signup.jpg) | 53221 | `8fd4b03003fc48979da70f912117ab0693e043fd2eb8589879f248d847b02681` | `600124401` |

Downloaded assets and manifests matched their original local bytes, sizes, SHA-256 hashes and GitHub digests. The three unedited JPGs use the existing 2560x1440 desktop viewport. Parent visual inspection found only synthetic email/site fixtures; no raw verification links, tokens, keys, cookies, credentials or customer data. Unselected captures were not uploaded.

Account and signup show the actual local built-worker pages. Consent is explicitly injected simulation; it does not prove remote EmDash administration, hosted callback delivery or live service activation. No mobile or final visual design claim.

## Reproducible dependency closure

CI initially failed before tests because the lock omitted Wrangler’s optional `@cloudflare/workers-types` peer. The repair pins `5.20260926.1`, matching Wrangler4.144.0’s peer floor and the locked workerd date. The regenerated lock retains existing package versions, aligns root specifiers with their existing exact pins, and updates npm dependency metadata. Fresh `npm ci` and the full verification command pass independently after the repair.

## Finding disposition

Accepted and fixed: custom account CSRF, missing-binding Host/random-secret fallbacks, production configuration accepting simulation capture, second-merchant pending preview, unconditional grant insertion after denial, stale account/expiry/grant redemption checks, unusable signing key consumption, unsupported local migration CLI flag, missing clean-install Cloudflare peer-lock closure, fresh CLI migration-ledger initialization, configured base-URL origin normalization, weak CMS positive control and internal protocol notes in product pages. Corresponding built-route regressions and browser checks passed.

Rejected on final source: the initial signup-metadata concern; actual signup and recovery passed through Better Auth's verification handler. Literal loopback rejection is accepted only as a hostname-policy check, never proof of DNS-safe runtime fetch.

## Comprehensive review correction

The first exact-source comprehensive review found a real fresh CLI migration failure: all three SQL files applied successfully, but the internal ledger was empty. The next account request treated the schema as version0 and failed recreating `user`. Parent independently reproduced two HTTP500 responses after a successful CLI apply. The runtime-only fresh path already recorded version3; that part of the reviewer description was overstated, while its documented CLI setup failure was accepted and fixed.

Migration0003 now records versions1/2/3; runtime reconciles known already-applied schemas and records contiguous history. SQL comments are removed before statement splitting. The three built-worker regressions cover CLI-all-three, runtime-fresh and upgrade-from0002, each with repeat requests and worker restart. Before correction:1pass/2fail; after correction:3pass/0fail. Parent independently reran the full suite and the originally failing CLI probe; both account requests now return200.

The second comprehensive exact-source review found a valid root base-URL configuration edge case: `https://dinkuskit.com/` was retained verbatim and rejected the browser Origin `https://dinkuskit.com`. Parent reproduced `403 invalid_origin` on the actual production entry. Binding parsing now stores canonical `URL.origin` for root HTTP(S) URLs. The new built-worker regression failed before correction and passes afterward: valid Origin303, foreign/missing403, unsupported path/scheme/credentials/query/hash configuration503, and captured signup/verification succeeds with the trailing-slash configuration. Parent independently reran the full suite and identical production-entry probe, which now returns303.

## Production and review gates

Production consent and issuance return `integration_unavailable` while Workers-safe HTTPS proof transport and live plugin integration remain unproved. Local receipt/JWT transport is injected simulation, not remote admin/site proof. Issued offline JWTs remain valid until expiration; revocation prevents new issuance, not instant offline invalidation. Live Cloudflare Email/domain onboarding, deployment, DNS/account changes and hosted service activation were not performed. Styling is provisional.

Deterministic CI and comprehensive Spark review must bind to the final PR base/head. Native ClawSweeper qualification remains a separately owned provisioning/cutover dependency. No merge or deployment authority is implied by local proof.
