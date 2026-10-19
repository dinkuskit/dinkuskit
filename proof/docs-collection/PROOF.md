# Docs in an EmDash collection (#54)

GrillTrack decision `website-docs-collection-075`, approved by Ronald on 19 Oct 2026. Base: main `1f6562b` (PR #52 merged). Nothing is deployed, imported into dinkuskit.com or published by this change.

## What changed

- `seed/seed.json` defines the `docs` collection (drafts, revisions; fields title, nav_label, summary, audience, product, version_scope, section, order, body as Portable Text) and holds the thirteen #52 articles as unpublished drafts, converted once with `scripts/docs-import.mjs seed --from 1f6562b`. The conversion is lossless for these articles: each converts back to the exact Markdown body from #52.
- `src/content/docs/` and `src/content.config.ts` are removed. Every docs surface reads `getPublicDocs()` (published only) or `getVisibleDocs()` (adds drafts only in local development) from `src/docs/content.ts`.
- `scripts/docs-import.mjs push` (`npm run docs:import -- <origin>`) loads the collection, its fields and the drafts into a site that already finished setup, through the EmDash API, creating only what is missing. `DEPLOY.md` has the one-time step for dinkuskit.com.

## Checks run

Cloud container, Linux x64, official Node 22.23.2, dependencies from `npm ci` on the unchanged lockfile.

| Check | Result |
| --- | --- |
| `npm run test:docs` | 6/6 passed: published-only selection and local draft preview, section order and URL folders, Markdown/search/llms.txt from one list, Portable Text marks/links/tables/code/anchors, the seed's collection and its 13 drafts (stable Markdown, every `/docs/` link resolves). |
| `npm run test:docs-routes` | Passed. On the docs preview (EmDash on SQLite): the seed loads 13 drafts, each previewed in development with the draft notice and noindex/no-store, none in search or llms.txt; deleting the collection and running the import script recreated the collection, fields and 13 drafts, and a rerun kept all 13; publishing `store-owners/test-order` through `POST /_emdash/api/content/docs/{id}/publish` made it public in development with no rebuild. A production build on the same database served only that article (HTML, Markdown, search, llms.txt, `/docs` redirect); the other 12 and unknown IDs were 404, `?preview=1` did nothing, dev setup answered 403. |
| `npm run test:smoke` | Passed on the production workerd build: the seed created `ec_docs` in D1 with 13 `draft` rows, and production served none of them (HTML, Markdown, search, llms.txt, preview query). |
| `npm run typecheck` | 0 errors, 0 warnings, the 2 existing clipboard hints. |
| `npm run audit:repo`, `git diff --check`, GrillTrack validate | Passed. |
| `npm run verify` | Every step passed except `test:cms-operation-helpers`, which fails the same way on main in cloud containers (`Owned process tree regression-parent-exit-first failed to stop cleanly`). In the first full run `test:inventory-overview` hit a workerd port collision (`bind(): Address already in use`) and timed out; it and every later step were rerun one by one and passed. The full `npm run verify` on Ronald's Mac remains the merge gate. |

## Not checked here

- No browser in this environment: the page markup was checked over HTTP (headings with anchors, sidebar, actions row, embedded search data), not visually or with a keyboard. The layout CSS and client script are unchanged apart from the move to `src/docs/`.
- No live step: the import into dinkuskit.com and an editor pressing Publish in the live admin wait for a deploy and Ronald's Access sign-in.
