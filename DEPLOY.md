# DinkusKit test-mode deployment

This is the test-mode deployment procedure for the existing Cloudflare candidate
worker. It does not enable production Payments, coupons, billing, or service
activation. Do not deploy from a local Wrangler config or commit secret values.

The production candidate is configured for account
`cddb32366789cab1bdf4c25584dc1920`, the custom domain `dinkuskit.com`, and
the following D1 bindings:

| Binding | D1 database |
| --- | --- |
| `DB` | `dinkuskit-website-candidate` |
| `MERCHANT_DB` | `dinkuskit-merchant-production` |

`MERCHANT_DB` is separate from the CMS database. Its migration source is
`migrations/merchant`.

## Owner-only setup

From the repository root, authenticate Wrangler for the DinkusKit Cloudflare
account and set both values interactively. Never put either value in
`wrangler.jsonc`, `.env`, source, or this document:

```sh
npx wrangler secret put MERCHANT_AUTH_SECRET --config cloudflare/wrangler.jsonc
npx wrangler secret put MERCHANT_BASE_URL --config cloudflare/wrangler.jsonc
```

Enter `https://dinkuskit.com` for `MERCHANT_BASE_URL`. The auth secret must be
long, random, and unique to this worker.

Apply the merchant schema remotely before deploying:

```sh
npx wrangler d1 migrations apply dinkuskit-merchant-production --remote \
  --config cloudflare/wrangler.jsonc
```

## Deploy

Build the Cloudflare candidate and deploy it with its production config:

```sh
npm run build:cloudflare
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

This PR is test-mode configuration only. The agent did not set secrets, apply
remote migrations, deploy, create Cloudflare resources, or alter the coupon
service.

## Post-deploy checks

Run these against the custom domain:

```sh
curl --fail --silent --show-error https://dinkuskit.com/health
curl --fail --silent --show-error \
  https://dinkuskit.com/account/.well-known/jwks.json
curl --include --silent https://dinkuskit.com/_emdash
```

The health response must be HTTP 200 with `{"status":"ok"}`. The JWKS response
must be HTTP 200 after the merchant migration and required secrets are
installed. A connection initiated by the Payments EmDash plugin must send the
merchant to:

```text
https://dinkuskit.com/account/connect?connection_id=<pending-connection-id>
```

The `connection_id` is supplied by the plugin and must not be replaced with a
fixed value. The `/_emdash` check must be denied (normally HTTP 404); an
unauthenticated response must never expose CMS setup or login.

Payments should use these account-verification values:

```text
ACCOUNT_ISSUER=https://dinkuskit.com/account
ACCOUNT_AUDIENCE=dinkus-payments
ACCOUNT_JWKS_URL=https://dinkuskit.com/account/.well-known/jwks.json
```

The account code fails closed when `MERCHANT_AUTH_SECRET` or
`MERCHANT_BASE_URL` is missing or blank: account requests return
`503 {"error":"merchant_unavailable"}` rather than constructing Better Auth.
