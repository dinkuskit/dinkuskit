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

This historical EmDash feasibility record left native browser sign-in, hosted provider integration, and a production issuer unresolved on that earlier path. Only that bounded local proof was verified. The site-control fixture used synthetic secret-holder challenges; real EmDash plugin/site-origin attestation was not implemented. Session storage, email delivery, email-input policy, origin/CSRF protection, and persistence still required a maintained runtime integration.

## Accepted Better Auth merchant routes

Better Auth is the selected merchant identity library. Product signup, sign-in, recovery, logout, and a protected account page now live in the EmDash Astro website. Persistent accounts and sessions use Better Auth 1.7.6 public APIs on a dedicated merchant D1, with cookie prefix `dk-merchant` and `Astro.locals.merchant`. EmDash editor identity is untouched. Magic-link tokens are stored hashed. Local proof email is an in-process sink; Cloudflare Email Sending is the production delivery boundary and is not invoked here.

The production issuer is `https://dinkuskit.com/account`. Inventory Connect receipts are compared field-for-field when a proof transport is injected. A posted site id or origin is not proof. The original development protocol used a plugin-owned identifier. Current [shared connections](shared-store-connections.md) resolve a server-owned canonical ID and require origin proof plus separate organization Owner consent for each service; they do not rely on a native EmDash installation ID. Local protocol tests may inject a labeled simulation transport. Production consent fetches the registered proof route with `redirect: "manual"` (Workers reject `redirect: "error"`) and refuses any redirect. A first connection from a real Registry store is still the live proof. `fetchStoreProofReceipt` hostname prechecks are not a DNS or IP firewall.

The public CMS and merchant routes share the Cloudflare Workers entry `src/worker.ts`. CMS uses D1 `DB` and R2 `MEDIA`. Merchant accounts use separate D1 `MERCHANT_DB`. EmDash applies schema on first request and can apply the public seed through `emdash/seed`. Merchant tests and smoke use local wrangler/workerd against the built worker, not a copied Node helper router.

Do not wait on an EmDash feature request to release the website. Do not fork EmDash or import internal handlers. Do not treat a stub or fixture as live hosted authentication.

Subscriptions, pricing, standalone stock screens and new-store hosting remain outside this slice.
