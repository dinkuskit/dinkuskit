# DinkusKit test-mode deployment

This is the test-mode deployment procedure for the existing Cloudflare candidate
worker. It turns on merchant sign-up and store Connect for Payments. It does not
enable coupons, billing, Inventory Registry connections, or live payments. Do
not deploy from a local Wrangler config or commit secret values.

The production candidate is configured for account
`cddb32366789cab1bdf4c25584dc1920`, the custom domain `dinkuskit.com`, and:

| Binding | Resource |
| --- | --- |
| `DB` | D1 `dinkuskit-website-candidate` (website CMS) |
| `MERCHANT_DB` | D1 `dinkuskit-merchant-production` (accounts, organizations, store grants) |
| `MEDIA` | R2 `dinkuskit-website-candidate-media` |
| `EMAIL` | Cloudflare Email Sending (sign-up, sign-in and recovery links) |

`MERCHANT_DB` is separate from the CMS database. Its migration source is
`migrations/merchant`.

## Owner-only setup

Run these from the repository root after `npx wrangler login` for the DinkusKit
Cloudflare account.

### 1. Databases and media bucket

```sh
npx wrangler d1 create dinkuskit-website-candidate
npx wrangler d1 create dinkuskit-merchant-production
npx wrangler r2 bucket create dinkuskit-website-candidate-media
```

Each `d1 create` prints a `database_id`. Add it to the matching entry in
`cloudflare/wrangler.jsonc` through a PR. Database IDs are not secrets. Skip any
resource that already exists.

### 2. Email sending

In the Cloudflare dashboard, onboard `dinkuskit.com` to Email Sending so the
worker can send from `accounts@dinkuskit.com`. Without it, sign-up answers
`email_unavailable` and nobody can create an account.

### 3. Secrets

Never put these values in `wrangler.jsonc`, `.env`, source, or this document.

```sh
npx wrangler secret put MERCHANT_AUTH_SECRET --config cloudflare/wrangler.jsonc
npx wrangler secret put MERCHANT_BASE_URL --config cloudflare/wrangler.jsonc
node scripts/generate-signing-key.mjs | \
  npx wrangler secret put MERCHANT_JWT_PRIVATE_JWK --config cloudflare/wrangler.jsonc
```

- `MERCHANT_AUTH_SECRET`: long, random, and unique to this worker
  (for example `openssl rand -hex 32`).
- `MERCHANT_BASE_URL`: `https://dinkuskit.com`.
- `MERCHANT_JWT_PRIVATE_JWK`: the key that signs service passes for Payments.
  The script prints a new key straight into Wrangler and never writes it to
  disk. Without it, Connect approves the store but the store's pass request
  answers `signing_key_unavailable`.

### 4. Merchant schema

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

The editor area (`/_emdash`) stays fully denied until the Cloudflare Access lane
below is configured. The operator pages (business approvals, people, stores and
services) live inside it, so they stay unreachable until then too; the first 50
organizations are still admitted automatically.

## Operator admin (Cloudflare Access)

The operator signs in to the dinkuskit.com EmDash admin through Cloudflare
Access (decision `website-operator-admin-emdash-access-035`). Owner-only, once:

1. In Cloudflare Zero Trust, add a self-hosted Access application for
   `dinkuskit.com/_emdash` with a policy that allows only the operator's email
   (one-time PIN login is enough). Note the team domain
   (`<team>.cloudflareaccess.com`) and the application's audience tag.
2. Set the runtime values (never in source):

   ```sh
   npx wrangler secret put CF_ACCESS_AUDIENCE --config cloudflare/wrangler.jsonc
   npx wrangler secret put EMDASH_OPERATOR_ALLOWLIST --config cloudflare/wrangler.jsonc
   ```

   `EMDASH_OPERATOR_ALLOWLIST` is the operator email, or several separated by
   commas. The admin opens only when the team domain, the audience and this list
   are all set, and only for a listed email that Access has verified.
3. Rebuild with the team domain and deploy:

   ```sh
   EMDASH_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com npm run build:cloudflare
   npx wrangler deploy --config cloudflare/wrangler.jsonc
   ```

4. Open `https://dinkuskit.com/_emdash/admin`. The first person Access lets in
   becomes the site's Admin; later people start as Editors and do not see the
   operator pages. The operator pages are under **Plugins**:
   `/_emdash/admin/plugins/dinkuskit-operator/approvals`, `/people` and
   `/stores`. The old `/account/organization-approvals` address redirects there.

## Post-deploy checks

```sh
curl --fail --silent --show-error https://dinkuskit.com/health
curl --fail --silent --show-error \
  https://dinkuskit.com/account/.well-known/jwks.json
curl --include --silent https://dinkuskit.com/_emdash
```

- `/health` must answer HTTP 200 with `{"status":"ok"}`.
- The JWKS must answer HTTP 200. It lists no keys until the first pass is issued.
- `/_emdash` must be denied (normally HTTP 404) and never show CMS setup or login.

Then click through once by hand:

1. Open `https://dinkuskit.com/account/signup`, sign up, and open the emailed link.
2. On a test store with the Payments plugin from the Registry, press Connect.
   The plugin sends you to
   `https://dinkuskit.com/account/connect?connection_id=<pending-connection-id>`.
   The `connection_id` comes from the plugin; never replace it with a fixed value.
3. Approve. You return to the store's Payments page, and
   `https://dinkuskit.com/account/sites` lists the store with its Payments grant.
4. Revoke it from the sites page and connect again to see both directions.

Payments uses these account-verification values:

```text
ACCOUNT_ISSUER=https://dinkuskit.com/account
ACCOUNT_AUDIENCE=dinkus-payments
ACCOUNT_JWKS_URL=https://dinkuskit.com/account/.well-known/jwks.json
```

The account code fails closed when `MERCHANT_AUTH_SECRET` or
`MERCHANT_BASE_URL` is missing or blank: account requests return
`503 {"error":"merchant_unavailable"}` rather than constructing Better Auth.
