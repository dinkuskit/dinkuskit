# EmDash 1.5.0 website upgrade proof (22 Nov 2026)

GrillTrack decision `website-emdash15-20261122`. Local only: Node 24.22.0,
`astro dev` on 127.0.0.1 with the repository's local database, no hosted
service, Access, or deployment involved.

1. `1-admin-on-emdash-1-5-0.png`: the CMS admin after the local dev sign-in.
   The footer reads `EmDash v1.5.0`, and the welcome message uses EmDash
   1.5's new dialog design.
2. `2-home-on-emdash-1-5-0.png`: the public home page on the same 1.5.0
   runtime.

Upgrade evidence comes from `npm run test:emdash-upgrade`, which starts the
pinned 1.0.1 baseline, seeds CMS and merchant state, then restarts the same
D1/R2 data on this build:

- PASS Actual 1.0.1 -> 1.5 upgrade applied only 090-097, preserving CMS
  state, media reference, original session and merchant authority rows
  without reseeding.
- PASS Upgraded 1.5 runtime restarted again with unchanged CMS/merchant state
  and migration ledger.

The other `npm run verify` steps also passed locally, except
`test:history-archive` and `test:cms-operation-helpers`, which fail in cloud
containers on `main` too and are left to CI.
