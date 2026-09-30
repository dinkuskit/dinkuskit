# Better Auth account proof

Better Auth1.7.6 backs merchant signup, sign-in, recovery, logout and protected account routes in the Astro Cloudflare worker. CMS D1 `DB`, merchant D1 `MERCHANT_DB`, cookies and identities are separate. Issuer is `https://dinkuskit.com/account`; the merchant subject and canonical `JSON.stringify([issuer, sub])` account key are independent of email/provider identifiers.

## Parent verification

`npm run verify` independently passed on Node22.23.2 after the final source correction: repository audit, local-only versioned D1 setup, Wrangler types, typecheck0errors/0warnings/0hints, Cloudflare build,13merchant tests,8EmDash public-auth feasibility tests and7HTTP smoke checks. The implementation input hashes are in [implementation-manifest.json](implementation-manifest.json). The feasibility tests remain historical CMS-helper evidence; they are not the Better Auth browser proof.

Merchant workerd checks include persistence/restart, separate users, single-use/expired/concurrent magic links, current disabled state, foreign/missing Origin rejection, safe redirects, fresh/upgrade migrations, and authenticated CMS isolation. The CMS positive control registers and authenticates a software passkey through public EmDash setup/auth routes, reaches protected settings, and proves bidirectional isolation. No CMS auth rows are fabricated.

Connect fixtures cover two merchants/sites, pending-owner isolation, every receipt-field comparison, PKCE/replay, conflicting site/origin ownership, denial/approval consistency with no ghost grant, proof expiry, revocation/disable guards and unusable signing configuration without consumption. The actual production entry cannot mint from persisted fixture-approved rows even with rogue test bindings.

## Original service verifier compatibility

[Sanitized command receipt](service-compatibility.json): the actual local website Inventory token passes the original Inventory verifier, has300second lifetime, and is rejected by Payments for the wrong audience/scope. A clearly synthetic Payments JWT carrying the same merchant subject passes the original Payments verifier and yields the same canonical account key. Disabling the merchant blocks new issuance with `account_disabled`; the already-issued offline Inventory JWT remains valid until expiration. This is verifier compatibility, not hosted service provisioning or production Payments issuance.

## Visible browser evidence

Attended local browser proof used the built worker and a separate test entry with captured delivery. Signup, sign-in, recovery, logout and protected-page redirect passed. Captured mail completion invokes the actual Better Auth verification handler and forwards its cookies; raw links/tokens never enter the browser or proof. Final signup/account/consent pages were inspected after the copy correction. Simulated consent created a local grant and the browser revoke action showed revoked state.

The placeholder `.example` callback did not load; return-to-hosted-Inventory delivery is not claimed. Selected screenshots use only synthetic email/site fixtures. No tokens, keys, cookies or customer data are visible. Media publication references follow in the source-bound asset section.

## Finding disposition

Accepted and fixed: custom account CSRF, missing-binding Host/random-secret fallbacks, production configuration accepting simulation capture, second-merchant pending preview, unconditional grant insertion after denial, stale account/expiry/grant redemption checks, unusable signing key consumption, unsupported local migration CLI flag, weak CMS positive control and internal protocol notes in product pages. Corresponding built-route regressions and browser checks passed.

Rejected on final source: the initial signup-metadata concern; actual signup and recovery passed through Better Auth's verification handler. Literal loopback rejection is accepted only as a hostname-policy check, never proof of DNS-safe runtime fetch.

## Production and review gates

Production consent and issuance return `integration_unavailable` while Workers-safe HTTPS proof transport and live plugin integration remain unproved. Local receipt/JWT transport is injected simulation, not remote admin/site proof. Issued offline JWTs remain valid until expiration; revocation prevents new issuance, not instant offline invalidation. Live Cloudflare Email/domain onboarding, deployment, DNS/account changes and hosted service activation were not performed. Styling is provisional.

Deterministic CI and comprehensive Spark review must bind to the final PR base/head. Native ClawSweeper qualification remains a separately owned provisioning/cutover dependency. No merge or deployment authority is implied by local proof.
