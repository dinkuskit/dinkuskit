# Hosted EmDash Cloudflare candidate runbook

Reviewable candidate only. This document does not authorize Access activation, Cloudflare resource creation, user provisioning, or cutover.

The live public site stays the already-deployed static introduction. There is no assumed staging Worker, D1, R2, Access application, or custom-domain binding ready for this candidate.

## What is prepared

- Separate `astro.cloudflare.config.mjs` using pinned `@astrojs/cloudflare` 14.3.3 and `@emdash-cms/cloudflare` 1.0.1 `d1` / `r2`.
- Official worker entry `@emdash-cms/cloudflare/worker` in `cloudflare/worker.ts`.
- Official Access exclusive auth via `access({ teamDomain, audienceEnvVar: "CF_ACCESS_AUDIENCE", defaultRole: 40 })`. Installed EmDash `Role.EDITOR` is 40.
- Outer fail-closed gate on the complete `/_emdash` namespace, including setup and login, using public `@emdash-cms/cloudflare/auth` `authenticate`. The gate canonicalizes pathnames the same way Astro routing decodes them (`validateAndDecodePathname` / iterative `decodeURI`), so percent-encoded unreserved namespace characters, case escapes, encoded slashes, and malformed encodings relevant to `/_emdash` are denied. Missing team/audience/allowlist, missing JWT, invalid JWT, or an identity not on the runtime allowlist returns 404 before EmDash runtime. Public routes are not rewritten.
- Generic `cloudflare/wrangler.jsonc` example with `workers_dev: false` and `preview_urls: false`. Production IDs stay ignored.
- Root `astro.config.mjs` remains the Node exporter used by the live static package.

## Values that must stay out of public source

Set these only in ignored operator input (Wrangler secrets, `cloudflare/.dev.vars`, or a local wrangler overlay). Do not add a committed `.env` file:

- `EMDASH_ACCESS_TEAM_DOMAIN` — build input for the official `access()` factory; may also be a Worker var.
- `CF_ACCESS_AUDIENCE` — runtime Access audience.
- `EMDASH_OPERATOR_ALLOWLIST` — runtime comma-separated operator emails.

Do not commit team domains, audiences, account IDs, host bindings, or real mailbox addresses.

## Human bootstrap order

Keep the static public site live until the protected candidate has content and operator init. Do not put first Google login before a protected staging Worker exists.

1. Create the per-site Cloudflare Access application against the intended hostname only. Do not enable `workers.dev` or preview URLs. A shared reusable Access policy may include both designated identities.
2. Provision and build the protected staging Worker with D1 and R2 behind that Access application. Do not cut over the public hostname yet.
3. Keep the runtime `EMDASH_OPERATOR_ALLOWLIST` **owner-only** for first init. The Access policy may already name both designated identities; the runtime allowlist is what initially blocks the second editor and any agent so they cannot race `createFirstAdmin`.
4. The owner completes the first Google Workspace login and EmDash setup (site title/seed) on that protected staging Worker. Confirm setup is closed (`needsSetup: false` / setup POSTs blocked).
5. Only after setup is closed, add the designated second editor to `EMDASH_OPERATOR_ALLOWLIST`. Their installed EmDash role is Editor **40**.
6. Cut over the public hostname last, only after the protected staging Worker, content, and operator init exist.

No step above is performed by this candidate preparation. Actual hostnames, account IDs, and mailbox addresses stay outside public source.

## Local qualification (not hosted proof)

Use Node 22.23.2 from `.nvmrc`. CI installs that version with `actions/setup-node`. The fixture scripts spawn `process.execPath` and assert `process.version === 'v22.23.2'`.

```sh
npm run verify
```

`npm run verify` includes `test:access-gate`, `test:cms-operation`, and `test:cloudflare-candidate`. Gate unit tests call official `authenticate` for missing/anonymous/spoofed JWT — including the demonstrated percent-encoded namespace paths — and use a controlled verifier, labeled as such, for allowlist decisions. The candidate script builds the Worker and proves anonymous, spoofed, and encoded `/_emdash` denial on local workerd. That is not Cloudflare Access production proof. Native passkey registration in `test:cms-operation` is a local synthetic storage fixture only.
