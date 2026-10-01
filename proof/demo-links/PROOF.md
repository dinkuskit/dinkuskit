# Demo and Template Setup Links Proof

Date: 2026-10-01
Decision ID: `website-template-demo-011`
Node Version: `v22.23.2`
Working Tree: `codex/website-demo-links-20261001` at base `cd1f75b9684bcbf43b9c5facdcf296f906f8cb47`

## Scope and Intent

This slice fulfills the locked GrillTrack decision `website-template-demo-011`:
1. Publish real, verified links to the interactive storefront demo and Template Store development setup guide on Getting started (`/getting-started`).
2. Implement via existing upstream EmDash native `text_section` block fields (`link_href`, `link_label`, `second_link_href`, `second_link_label`) in `seed/seed.json` without modifying CSS/design, creating hardcoded CTA components, or mutating live databases.
3. Use exact labels:
   - Primary: `Try the demo` -> `https://demo.dinkuskit.com/` (HTTP 200, synthetic catalog, browse and cart testing, checkout disabled, no real purchasing)
   - Secondary: `Template setup` -> `https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md` (development source pilot guidance; no released installer or package artifact exists)
4. State explicit limitations truthfully: do not promise released v1 packages or live purchasing.
5. Provide clear operator guidance regarding content persistence: updating `seed/seed.json` applies to fresh initializations only and does not overwrite existing pages on live initialized CMS databases. Editors update live content through the EmDash CMS editor.

## Changed Files

- `seed/seed.json`: Added `link_href`, `link_label`, `second_link_href`, `second_link_label`, and updated body copy on `getting-started-2`.
- `docs/getting-started.md`: Updated Section 3 and added operator note on content persistence.
- `README.md`: Updated demo availability statement and added operator guidance regarding seed vs live CMS.
- `docs/CHARTER.md`: Narrowly updated line 11 to reflect published browse/cart demo and template setup guide while v1 package release remains pending.
- `scripts/smoke.mjs`: Updated assertion from checking obsolete pending text to verifying `https://demo.dinkuskit.com/`, `Try the demo`, `https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md`, and `Template setup`.
- `scripts/test-safe-http-url.mjs`: Added assertions verifying the render-time sanitizer accepts both target URLs.

## Checks and Exact Outputs

1. `npm run audit:repo` -> 0 (clean repository paths and manifests)
2. `npm run setup` -> 0 (applied local D1 migrations and prepared local environment)
3. `npm run types:wrangler` -> 0 (Cloudflare types generated)
4. `npm run typecheck` -> 0 (Astro diagnostics: 0 errors, 0 warnings, 0 hints across 50 files)
5. `npm run test:safe-http-url` -> 0 (All unit assertions passed)
6. `npm run test:cms-operation-helpers` -> 0 (CMS operation helper and process management checks passed)
7. `npm run build` -> 0 (Production Cloudflare build completed cleanly)
8. `npm run test:smoke` -> 0 (Workerd production smoke test passed all checks, including seeded CMS content, denied /_emdash namespace, and public route assertions)

Detailed command outputs and logs are recorded in `.grilltrack/work/demo-links-20261001/`.