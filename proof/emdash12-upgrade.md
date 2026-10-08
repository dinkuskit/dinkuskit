# EmDash 1.2 website upgrade qualification

Decision: `website-emdash12-025`. Public baseline: `4629df637b2eb58393f60b74eef2b9c2b1badba5` (EmDash 1.0.1). PR14 merged as `eb5016be2192b9c3a4de3d3e7ade1d1234ecc3de`; the two baseline trees are identical.

## Result, 2026-10-08

`npm run verify` passed on Node 22.23.2: 49 tests across the account, Inventory runner, merchant, account foundation and Inventory overview suites, plus type/build, production route smoke, native CMS operation, actual version upgrade, and separate Access candidate denial checks. `git diff --check` passed. Direct EmDash core, auth and Cloudflare packages are exactly 1.2.0.

`npm run test:emdash-upgrade` builds the pinned public 1.0.1 source with its original dependency lock and creates synthetic state once. It then starts the 1.2 worker against the same local D1/R2 persistence. Only `090_redirect_enable_loop_guard` and `091_redirect_artifacts` are added. Checked content/media references, settings, plugin records, merchant personal subject, organization, membership, selection, site grant and site binding persist without reseeding. The original CMS session still reads content, and a second 1.2 restart leaves the checked state and migration ledger unchanged.

The editor public-home response is private/no-store; a following anonymous read has no editor toolbar. The same Inventory URL passes alpha/beta/alpha organization switching without anonymous or unrelated-caller leakage. Production namespace, missing integration and proof-route denial checks remain enforced.

The anonymous upgraded synthetic home was inspected in native Chrome: the CMS edit and media-reference marker are visible, no editor toolbar appears, and the 2796 CSS-pixel viewport has no horizontal overflow. This is desktop local fixture evidence; it makes no mobile or hosted claim. Generated screenshot, migration receipts, complete command log and owned-process cleanup are retained under ignored `.grilltrack/work/emdash12-20261008/`.

## Compatibility and limits

The selected `@codemirror/language` 6.12.4 override is preserved. Prior qualification reproduced a missing-streamparser import failure in 6.13.0 and an isolated import success in 6.13.1; that isolated success did not qualify the full website stack. The selected override passes the current full stack without vendor changes.

The updater dry run finds no remaining direct package bump. EmDash source references: [1.2 release](https://github.com/emdash-cms/emdash/releases/tag/emdash%401.2.0), [core migration guidance](https://docs.emdashcms.com/deployment/core-migrations/).

Fixtures prove local behavior only. Hosted database status, restorable database/media recovery, matching deployment artifact and authorized forward migration remain separate rollout gates. This change does not deploy or activate live services, providers, accounts or grants. Automated review is evidence; Bobby retains merge authority.
