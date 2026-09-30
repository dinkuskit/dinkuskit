# Hosted Cloudflare candidate (not activated)

Generic Wrangler example for the reviewable EmDash Cloudflare worker. Production account, D1, R2, Access team, audience, host, and operator values stay in ignored local files or operator secrets.

Use Node 22.23.2 from `.nvmrc`. The denial fixture runs as `npm run test:cloudflare-candidate` and is included in `npm run verify`. It spawns `process.execPath` and asserts that version.

This does not deploy, create Cloudflare resources, activate Access, or cut over the live static site.
