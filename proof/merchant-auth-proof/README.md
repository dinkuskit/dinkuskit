# Merchant authentication proof

Local proof on Node 22.23.2 against EmDash 1.0.1 public auth exports and a DinkusKit-owned account boundary. No public login route was added. Browser recovery and native provider integration were not claimed.

The initial review findings are recorded in `parent-review.md`. The final source review is recorded separately after the implementation commit.

## Result

- Native CMS configured signup still requires operator-allowed domains. That is not the whole public API. A custom `AuthAdapter` implementing public `getAllowedDomain` allows general email signup as `SUBSCRIBER` without inserting domain rows or importing internals.
- Exported `requestSignup`, `completeSignup`, `sendMagicLink`, and `verifyMagicLink` created and recovered two synthetic merchants through that adapter. Email callbacks consumed the generated link in memory.
- Public `SignupConfig` cannot change the native CMS paths those helpers embed (`/admin/signup`, `/_emdash/api/auth/magic-link/verify`). The helpers are exported; the URL coupling is native CMS shaped.
- A local test HTTP session fixture in `tests/helpers` required site control before grants, authorized two sites for the first merchant, and refused both sites to the second merchant. That fixture is not native EmDash browser integration.
- Issued ES256 JWTs carried `iss`, `sub`, `iat`, `exp`, `site_id`, `aud`, and `scope`. Canonical account IDs were `JSON.stringify([issuer, subject])`. Inventory compatibility used `X-Inventory-Site`; Payments compatibility used `X-Dinkus-Site`. Wrong audience, site, scope, and issuer were rejected. A one-second token verified before `exp` and failed after `exp`.
- Successful sign-in and recovery worked through the exported magic-link helpers. Disable blocked session access, new issuance, renewal, sign-in, and recovery. Outstanding tokens still verified until expiry. Revoke refused an outstanding challenge.
- Adapter users stayed out of the website CMS table. Proof artifacts do not retain credentials, cookies, raw tokens, or signing secrets.

## Commands

```sh
# Node 22.23.2 on PATH
npm run test:account
npm run verify
```

`npm run test:account` runs the public-API feasibility tests, the HTTP fixture proof, and a sanitized harness receipt under ignored `.grilltrack/work/merchant-auth-proof/`. `npm run verify` also repeats the website foundation audit, seed, typecheck, build, and public-route smoke. The smoke process stops only its own server. The account harness binds `127.0.0.1` and stops itself.

## Limits

- This is not live authentication, Registry installation, hosted JWKS, production email, or native EmDash browser integration.
- `website-account-003` records only this bounded proof as verified. Native browser and provider integration remain unresolved.
- The HTTP/session/site-control runtime is a test fixture. The JWT bridge in `src/account/` is proof-labeled only.
- Production identity should be proven next with Better Auth. Primary docs: [Astro integration](https://better-auth.com/docs/integrations/astro) and [magic-link](https://better-auth.com/docs/plugins/magic-link). Better Auth was not selected or implemented here.
- Browser proof was skipped because the new account routes exist only in the test HTTP harness; the Astro website has no merchant login route. Native Astro sessions and browser recovery remain unverified.
- Site control uses synthetic secret-holder challenges. Real EmDash Connect/plugin/site-origin attestation, persistent account/grant stores, email-input policy, and origin/CSRF protection are not implemented.
- Subscriptions, pricing, portal screens, and final visual design are out of scope.

## Sources

Implementation: `src/account/identity.ts`, `src/account/issuer.ts`, `src/account/verifiers.ts`, `tests/helpers/`, `tests/emdash-public-auth-feasibility.test.mjs`, `tests/merchant-auth-http.test.mjs`, `scripts/merchant-auth-proof.mjs`.
Contracts: `docs/authentication-research.md`, `docs/CHARTER.md`.
Review: `proof/merchant-auth-proof/parent-review.md`.

## Independent verification

The owning Codex session reran `npm run verify`: 9 account tests passed, Astro typecheck reported 0 errors/warnings/hints, build completed, and all public route smoke checks passed. The build retains the existing EmDash admin bundle size warning.

An additional in-process probe imported the exact read-only Inventory verifier at `57aa9521fdfbddcbde0bf79a70708fdd8e771582` and Payments verifier at `63d6f80e172f822bdf09ca0dc7cef9e0b420d073`. It accepted the proof issuer’s Inventory admin, Payments admin, and Payments checkout tokens with identical canonical account identity; rejected wrong issuer, audience, site header, and scope; and confirmed that existing JWTs still verify after issuer-side revoke/disable. No original service source was modified or copied. This check used local JWKS injection and made no network request. Its source/output live only in the ignored working proof directory.
