# EmDash 1.6.0 website upgrade proof (25 Nov 2026)

GrillTrack decision `website-emdash16-20261125`. Local only: Node 24.22.0,
`astro dev` on 127.0.0.1 with the repository's local database, no hosted
service, Access, or deployment involved.

1. `1-admin-on-emdash-1-6-0.png`: the CMS admin after the local dev sign-in.
   The footer reads `EmDash v1.6.0`.
2. `2-home-on-emdash-1-6-0.png`: the public home page on the same 1.6.0
   runtime.

Upgrade evidence comes from `npm run test:emdash-upgrade`. Each run starts the
pinned baseline source, writes CMS and merchant state, then starts this build
on the same D1/R2 data and restarts it once more:

- From 1.5.0 (the last `main` before this PR, what the live site runs), see
  `upgrade-from-1-5-0.md`: PASS Actual 1.5.0 -> 1.6 upgrade applied only 098,
  preserving CMS state, media reference, original session and merchant
  authority rows without reseeding.
- From 1.0.1, as before: PASS Actual 1.0.1 -> 1.6 upgrade applied only
  090-098, with the same preservation.
- Both: PASS Upgraded 1.6 runtime restarted again with unchanged
  CMS/merchant state and migration ledger.

Also passed locally: `npm run setup`, `audit:repo`, `typecheck` (0 errors),
`build` and `test:cloudflare-candidate`. The full `npm run verify` runs in CI.

After the deploy, on the owner's go, EmDash 1.6 asks each site to run
`emdash media repair-usage --all` once so "Used in" counts media linked by
file URL. That is a write to the live database and is not part of this PR.
