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

The Worker sets the `global_fetch_strictly_public` compatibility flag. Set up
Commerce reads each store's Payments account from `payments.dinkuskit.com`,
which is on the same zone; without the flag that call would skip the Payments
Worker and go to the zone's origin.

## Owner-only setup

Run these from the repository root after `npx wrangler login` for the DinkusKit
Cloudflare account.

### 1. Databases and media bucket

```sh
npx wrangler d1 create dinkuskit-website-candidate
npx wrangler d1 create dinkuskit-merchant-production
npx wrangler r2 bucket create dinkuskit-website-candidate-media
```

Each `d1 create` prints a `database_id`. Keep it out of the repository: Wrangler
finds each database by its `database_name` in `cloudflare/wrangler.jsonc`, and
`npm run test:cloudflare-candidate` refuses a real ID there. Skip any resource
that already exists.

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

On a new website database (`DB`), set up the operator admin (Cloudflare Access,
below) before the first deploy. The homepage and Getting started page are
loaded through the EmDash setup screen, which only opens behind Access; until
then `/` says "Content is not available yet". See
[Load the site's pages](#load-the-sites-pages-new-website-database-only).

Build the Cloudflare candidate and deploy the Wrangler config that the build
writes:

```sh
npm run build:cloudflare
npx wrangler deploy --config .grilltrack/work/cloudflare-candidate-20260930/dist/server/wrangler.json
```

That path is the build output (`outDir` in `astro.cloudflare.config.mjs`).
Do not deploy with `--config cloudflare/wrangler.jsonc`: that file is the
build's input, and Wrangler cannot bundle the site from it. Do not drop
`--config` either: a bare `npx wrangler deploy` follows whichever build ran
last, which can be the local `npm run build`.

The built config keeps the bindings above and adds a `SESSION` KV binding with
no ID. Wrangler creates that namespace on the Worker's first deploy and keeps the
existing one after that. It finds both D1 databases by name the same way.

Once Access is set up, always build with `EMDASH_ACCESS_TEAM_DOMAIN` (step 3
below); a build without it closes `/_emdash` again. The editor area (`/_emdash`)
stays fully denied until the Cloudflare Access lane below is configured. The operator pages (business approvals, people, stores and
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

   Optional, for an automation agent: create a Cloudflare Access service token,
   add a Service Auth policy for it to the same Access application, and list its
   common name (`<client_id>.access`; the client ID, never the secret) in a
   separate secret:

   ```sh
   npx wrangler secret put EMDASH_OPERATOR_SERVICE_TOKENS --config cloudflare/wrangler.jsonc
   ```

   Several are separated by commas. A service token is admitted only when its
   Access JWT verifies (signature, audience and issuer against the team's keys)
   and its common name is listed; it then acts as an EmDash **Editor** named
   `service+<client_id>@tokens.invalid`, created on first use. Unset means no
   service token gets in. Add tokens only after the operator has become the
   first Admin: EmDash makes whoever arrives first on an empty site the Admin.
   The gate also enforces this: until the CMS `DB` has an enabled Admin
   (role 50), every service token gets the same 404.

   The **Docs publish** workflow (`docs/documentation-authoring.md`) uses its
   own service token this way: list its common name in
   `EMDASH_OPERATOR_SERVICE_TOKENS` (keeping any already there), add it to the
   application's Service Auth policy, and save the client ID and secret as the
   repository secrets `DOCS_PUBLISH_ACCESS_CLIENT_ID` and
   `DOCS_PUBLISH_ACCESS_CLIENT_SECRET`. A secret change is not a code deploy;
   `EMDASH_OPERATOR_ALLOWLIST` is a separate secret and stays as it is. Once
   `/_emdash/api` has the Access Bypass (Agents, below), Docs publish needs
   its EmDash token instead.
3. Rebuild with the team domain and deploy:

   ```sh
   EMDASH_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com npm run build:cloudflare
   npx wrangler deploy --config .grilltrack/work/cloudflare-candidate-20260930/dist/server/wrangler.json
   ```

4. Open `https://dinkuskit.com/_emdash/admin`. The first person Access lets in
   becomes the site's Admin; later people start as Editors and do not see the
   operator pages. The operator pages are under **Plugins**:
   `/_emdash/admin/plugins/dinkuskit-operator/approvals`, `/people` and
   `/stores`. The old `/account/organization-approvals` address redirects there.

## Agents (EmDash API tokens)

Agents use EmDash's own API tokens, the way upstream EmDash expects (decision
`website-agent-api-tokens-20261027`). People keep signing in through Access.

1. The Admin opens **Settings > API Tokens**
   (`https://dinkuskit.com/_emdash/admin/settings/api-tokens`) and makes one
   token per agent, named after the agent, with only the scopes it needs. To
   read and publish pages and menus through the MCP: `content:read`,
   `content:write` (it covers menus) and `mcp:tools`. Read only:
   `content:read` and `mcp:tools`.
   The token acts as the Admin who made it, limited to those scopes. EmDash
   shows it once; it goes straight into the agent's secret store (never a chat
   or a file). Revoke it on the same page.
2. The agent sends `Authorization: Bearer ec_pat_...`, and no cookie, to the
   EmDash API. The MCP server is `https://dinkuskit.com/_emdash/api/mcp`.
3. In Cloudflare Zero Trust, the Access application for `dinkuskit.com/_emdash`
   needs a **Bypass** for `dinkuskit.com/_emdash/api` so the request reaches the
   Worker. The Worker's gate stays the lock: it lets an `ec_pat_` or `ec_oat_`
   token through only on `mcp`, `content`, `schema`, `menus`, `taxonomies`, `media` (not `media/file`), `sections`, `widget-areas` and `revisions` under `/_emdash/api/`, where EmDash checks the
   token and its scope on every request, only when the request has no cookie
   (so a saved CMS session never rides on a token), and never before the site
   has an Admin. Everything else under `/_emdash`, including the admin
   screens, sign-in, setup, users, token management, settings, plugins and
   EmDash's public routes such as snapshot and search, still needs Access and
   the operator allowlist.

   With the Bypass, Access no longer signs in service tokens on
   `/_emdash/api`, so do it in this order: make a `Docs publish` token
   (`content:read`, `content:write`) and save it as the repository secret
   `DOCS_PUBLISH_EMDASH_TOKEN`, keeping `DOCS_PUBLISH_ACCESS_CLIENT_ID` and
   `DOCS_PUBLISH_ACCESS_CLIENT_SECRET` (the workflow sends both, so it works
   before and after the Bypass). Run **Docs publish** by hand and check it
   passes, add the Bypass, then run it once more. Any other automation that
   used a service token on `/_emdash/api` gets its own EmDash token the same
   way.

`npm run test:cloudflare-candidate` proves this on the live build: a scoped
token reads the API and lists the MCP tools, also beside Access headers; a
write outside its scopes gets 403, an unknown or revoked token 401; snapshot,
search, a token sent with a cookie and the closed paths get 404.

## Ask DinkusGuide chat bubble (optional)

The "Ask DinkusGuide" bubble (decision `dinkusguide-pilot-098`,
[docs/dinkusguide-pilot.md](docs/dinkusguide-pilot.md)) answers visitors'
questions from public DinkusKit and EmDash docs. It is off until a build turns
it on. Going live takes four pieces, in this order:

1. **The Guide service.** On the machine that runs the Guide model, follow
   [dinkus-guide `docs/ask-service.md`](https://github.com/dinkuskit/dinkus-guide/blob/main/docs/ask-service.md):
   `corpus sync`, `corpus verify`, then `node bin/dinkus-guide-serve` with
   `DINKUS_GUIDE_SERVICE_TOKEN` set (32 or more characters, kept in the
   password manager). It listens on `127.0.0.1:8789` only, so give it one HTTPS
   hostname (for example a Cloudflare Tunnel) that forwards only `POST /ask`.
   The bubble answers only while that machine and its model are up; otherwise
   visitors get a polite "unavailable".
2. **The plugin.** Put that hostname as the only `allowedHosts` entry in
   `packages/dinkusguide-chat/emdash-plugin.jsonc` and check
   `npm run build:dinkusguide-plugin` passes. The production build does not
   run sandboxed plugins yet: `astro.cloudflare.config.mjs` has no
   `sandboxRunner` and `cloudflare/wrangler.jsonc` has no `LOADER` Worker
   Loader binding. A reviewed change has to add both and load the plugin, the
   way the template store loads Registry plugins, before the bubble can work.
   After that deploy, the Admin opens the plugin's settings and enters the
   endpoint (`https://<guide host>/ask`) and the service token, then ticks
   **Enable public Ask DinkusGuide**. EmDash stores the token encrypted; it
   never goes in a build, a file or a URL.
3. **The build switch.** Every deploy from then on builds with the two pilot
   values next to the team domain:

   ```sh
   EMDASH_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com \
   DINKUS_GUIDE_PILOT=true DINKUS_GUIDE_PLUGIN_ID=<installed plugin id> \
   npm run build:cloudflare
   npx wrangler deploy --config .grilltrack/work/cloudflare-candidate-20260930/dist/server/wrangler.json
   ```

   They are build settings, not Worker variables, so `--keep-vars` does not
   keep them. A build without them removes the bubble and closes its two
   routes again. That is also the off switch.
4. **The edge.** Nothing to change. The `dinkuskit.com/_emdash/api` Bypass
   (Agents, above) already lets the requests reach the Worker, and the
   Worker's gate admits only `GET /_emdash/api/plugins/<id>/config` and
   `POST /_emdash/api/plugins/<id>/ask` for the built plugin ID. Every other
   plugin route stays closed.

Checks after a deploy with the bubble on:

```sh
curl --silent --show-error https://dinkuskit.com/_emdash/api/plugins/<id>/config
curl --silent --output /dev/null --write-out '%{http_code}\n' https://dinkuskit.com/_emdash/api/plugins/<id>/other
```

The first answers HTTP 200 with the public settings; the second answers 404.
Then open `/` and `/docs`: an "Ask DinkusGuide" button sits bottom right, and a
test question comes back with source links. `/account` has no button.

## Load the site's pages (new website database only)

The homepage and Getting started page are content in the website database
(`DB`), not files in the build. On a new database the Worker creates the empty
`pages` collection on its first request but not the pages, so `/` answers HTTP
503 with "Content is not available yet". Load them once, right after the first
deploy with Access:

1. The owner opens `https://dinkuskit.com/_emdash/admin` and signs in through
   Access with an allow-listed email. Whoever finishes this step becomes the
   site's Admin, so an agent does not do it.
2. EmDash shows its setup screen. Enter the site title `DinkusKit`, choose
   **Sample content** under "How do you want to start?", and finish. Here
   "Sample content" is this repository's `seed/seed.json`: the homepage, the
   How it works page (`/getting-started`) and the documentation articles as unpublished drafts.
3. Check that `https://dinkuskit.com/` shows "Run your store yourself, or with
   the agent you choose." and `https://dinkuskit.com/getting-started` shows "How
   DinkusKit fits together."

Setup runs once. Later deploys keep the pages, and later edits to
`seed/seed.json` do not change a database that already has them; edit the pages
in the EmDash admin instead. Nothing needs to move from the earlier static site:
it was a frozen copy of the same two pages from the same seed.

## Load the docs collection (existing website database, once)

Documentation articles are entries in the `docs` collection (see
`docs/documentation-authoring.md`). Setup applies the seed only to a new
database, so a site that finished setup before the collection existed (such as
dinkuskit.com) gets the collection and the unpublished starting articles once
from the import script, after a deploy that includes the docs code:

```sh
export CF_ACCESS_TOKEN="$(cloudflared access login https://dinkuskit.com/_emdash/admin >/dev/null && cloudflared access token -app=https://dinkuskit.com/_emdash/admin)"
npm run docs:import -- https://dinkuskit.com
unset CF_ACCESS_TOKEN
```

The owner signs in to Access (the token acts as their EmDash Admin, which
creating a collection needs). The script creates only what is missing and never
overwrites: a rerun prints "Kept existing" for every article. Nothing is
published; `https://dinkuskit.com/docs/search.json` stays `[]` until an editor
presses **Publish** on an article in `/_emdash/admin`, which shows it at its
`/docs/...` address with no deploy. **Unpublish** hides it again.

## Load the Start page (existing website database, once)

`/start` (where the playground's "Start your real store" buttons land) is the
`pages` entry `start`, drawn with three block types of its own: Account
buttons, Checklist heading and Checklist step. A database that finished setup
before the page existed gets them once, right after the deploy that carries
the `/start` code:

```sh
export CF_ACCESS_TOKEN="$(cloudflared access login https://dinkuskit.com/_emdash/admin >/dev/null && cloudflared access token -app=https://dinkuskit.com/_emdash/admin)"
npm run pages:import -- --url https://dinkuskit.com --page start --publish
unset CF_ACCESS_TOKEN
```

The owner signs in to Access: adding block types is an Admin action, and
service tokens stay Editors. The script adds only what is missing and never
overwrites; `--publish` publishes the page only when this run added it, so a
rerun prints "Kept existing" and leaves edited wording alone. Leave
`--publish` off to review the draft in `/_emdash/admin` first. Until the page
is published, `/start` answers HTTP 503 "Content is not available yet". After
that its words, steps and their order are edited in the admin like any page.

## Post-deploy checks

```sh
curl --fail --silent --show-error https://dinkuskit.com/health
curl --fail --silent --show-error https://dinkuskit.com/ | grep -c 'Run your store yourself, or with the agent you choose'
curl --fail --silent --show-error \
  https://dinkuskit.com/account/.well-known/jwks.json
curl --include --silent https://dinkuskit.com/_emdash
```

- `/health` must answer HTTP 200 with `{"status":"ok"}`.
- `/` must answer HTTP 200 and the count must be at least 1. HTTP 503 with
  "Content is not available yet" means the site's pages were never loaded (see
  above).
- The JWKS must answer HTTP 200. It lists no keys until the first pass is issued.
- `/_emdash` must be denied and never show CMS setup or login: HTTP 404 from the
  site, or a redirect to the Access sign-in page once Access is set up.

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
