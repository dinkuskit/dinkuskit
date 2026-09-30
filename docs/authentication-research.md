# Authentication feasibility and next proof

Inspected EmDash and its auth package at 1.0.1, commit `0e8977c221dd8e5111511eb226faa3d164c829ef`. Public-API feasibility now has a reproducible local check in `tests/emdash-public-auth-feasibility.test.mjs`. Those checks still do not prove hosted identity, native browser integration, or production reliability.

## Native CMS configured behavior

- EmDash has passkeys, provider sign-in, magic-link recovery, sessions and a subscriber role distinct from editors. Public auth helpers exist.
- Native CMS signup still consults allowed-domain rows. A native-style adapter that only returns configured domains will not email an unconfigured merchant domain.
- That allowlist is CMS configured behavior. It is not proof that exported public APIs cannot support general signup.

## Exported-library extension

- `AuthAdapter` and `getAllowedDomain` are public. A narrow custom adapter can implement general email signup as `Role.SUBSCRIBER` without inserting domain rows or importing internals.
- Exported `requestSignup`, `completeSignup`, `sendMagicLink`, and `verifyMagicLink` succeed through that adapter for two synthetic merchants. Email callbacks consume the generated link in memory.
- Public `SignupConfig` / `MagicLinkConfig` accept `baseUrl`, `siteName`, and `email`. They cannot configure the native CMS paths those helpers embed: `/admin/signup` and `/_emdash/api/auth/magic-link/verify`. The helpers are exported, not internal; the URL coupling is still native CMS shaped.
- Completing signup through the adapter creates an adapter user with `SUBSCRIBER`. That user is not a website editor. This proof stores those users in the test adapter, not the website CMS table.
- Native tokens remain opaque CMS/MCP credentials (`ec_pat_`, `ec_oat_`, `ec_ort_`). `validateScopes` rejects `inventory:admin`, `payments:admin`, and `payments:checkout`. There is no public JWT issuer for `iss` / `sub` / `site_id` / `aud` / `scope`.
- Auth dependencies including arctic and several oslo packages are deprecated. Upstream migration remains an open maintenance concern, not evidence of an exploitable vulnerability.
- Internal EmDash route handlers are not used.

Sources: [authentication guide](https://github.com/emdash-cms/emdash/blob/0e8977c221dd8e5111511eb226faa3d164c829ef/docs/src/content/docs/guides/authentication.mdx), [signup](https://github.com/emdash-cms/emdash/blob/0e8977c221dd8e5111511eb226faa3d164c829ef/packages/auth/src/signup.ts), [native scopes/tokens](https://github.com/emdash-cms/emdash/blob/0e8977c221dd8e5111511eb226faa3d164c829ef/packages/auth/src/tokens.ts), [dependency maintenance issue](https://github.com/emdash-cms/emdash/issues/3550).

## Bounded proof outcome

This slice does **not** add a public login route or grow a homemade authentication platform. Synthetic HTTP cookies, sessions, and site-control live in `tests/helpers` as a local test fixture. They are not native EmDash browser integration.

DinkusKit still owns the stable account boundary:

- Canonical account ID: `JSON.stringify([issuer, subject])`
- Site control must be proven before an explicit grant
- One merchant may authorize multiple sites; another merchant cannot prove, grant, or mint tokens for those sites
- Short-lived ES256 service JWTs carry `iss`, `sub`, `iat`, `exp`, `site_id`, `aud`, and `scope`
- Inventory compatibility uses `X-Inventory-Site`; Payments compatibility uses `X-Dinkus-Site`
- Disabled accounts refuse session access, new issuance, renewal, sign-in, and recovery. Exported helpers may still return a disabled user; the boundary rejects it.
- Revoke clears the grant, proven control, and outstanding challenge for that site. A prior challenge cannot resurrect access.
- Already-issued tokens remain valid until `exp` because the published service verifiers do not consult a revocation list. That is an honest outstanding-token limit, not a silent denylist. Expiry is proven by waiting until after `exp`.

The proof-labeled JWT bridge in `src/account/` exists only for those compatibility checks. It is not a product identity framework.

Native browser sign-in, hosted provider integration, and a production issuer remain unresolved. Only this bounded local proof is verified. The site-control fixture uses synthetic secret-holder challenges; real EmDash plugin/site-origin attestation is not implemented. Session storage, email delivery, email-input policy, origin/CSRF protection, and persistence still require a maintained runtime integration.

## Recommended next provider proof

Broader native CMS integration was not established. The next maintained provider proof should be [Better Auth](https://better-auth.com/docs/integrations/astro), including [magic-link](https://better-auth.com/docs/plugins/magic-link). This slice does not select or implement Better Auth.

Do not wait on an EmDash feature request to release the website. Do not fork EmDash or import internal handlers. Do not treat this local proof, a stub, or a fixture as live authentication.

Subscriptions, pricing, standalone stock screens and new-store hosting remain outside this proof.
