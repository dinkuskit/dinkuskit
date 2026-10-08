# Local CMS-operation fixture

Loopback-only Wrangler/workerd qualification for EmDash 1.2.0 Cloudflare D1/R2. Not a production config, hostname, or Access setup.

Use Node 22.23.2 from `.nvmrc`. The fixture runs as `npm run test:cms-operation` and is included in `npm run verify`. It spawns `process.execPath` and asserts that version.

Generated state stays in ignored `.grilltrack/work/cms-operation-20260930`. The fixture always rebuilds that work dist, uses official `{ item, _rev }` content envelopes plus `POST /_emdash/api/content/{collection}/{id}/publish`, reads public pages without editor cookies, repeats spoofed-mutation denial after restart, and verifies every recorded owned descendant is gone in `finally`. It never signals PIDs it did not record. Production `astro.config.mjs` and `src/emdash-namespace-guard.ts` stay deny-all.
