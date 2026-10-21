# Documentation authoring

The documentation at `/docs` is EmDash content. Articles live in the `docs` collection and are written, edited and published from the EmDash admin at `/_emdash` or through the EmDash API, with no pull request or deploy per article. This replaced the repository Markdown of the first slice (#52) under GrillTrack decision `website-docs-collection-075` (issue #54).

## The docs collection

`seed/seed.json` defines the collection, with drafts and revisions:

| Field | Admin label | Use |
| --- | --- | --- |
| `title` | Title | Article heading, page title, and the Markdown/llms.txt title. |
| `nav_label` | Sidebar name | Optional short name in the sidebar; the title is used when empty. |
| `summary` | Summary | Lead paragraph, meta description and search summary. |
| `audience` | Audience | Eyebrow above the title. |
| `product` | Product | Shown in the Markdown export and search data. |
| `version_scope` | Version scope | The releases or source revisions the article was checked against. (`version` is an EmDash system field.) |
| `section` | Section | One of the six sidebar groups. |
| `order` | Order | Reading order across all articles; sections appear in the order of their first article. |
| `body` | Body | Portable Text: headings, paragraphs, lists, quotes, links, tables and code blocks. |

EmDash's **Publish** button is the only publication switch, and the entry's last-saved time is the "Last updated" date. An unpublished entry is a draft.

URLs are `/docs/<folder>/<slug>`: the entry slug, under a folder for three sections (`store-owners` for Store owners, `developers` for Developers, `reference` for Product reference) and directly under `/docs/` for the others. The folders are set in `src/docs/site.ts`. Changing an entry's slug or section changes its URL.

Use root-relative `/docs/...` links between articles and absolute `https://` links elsewhere. A published article must not link to an unpublished one.

## Doc updates from merged PRs

A change that alters what an article says can travel as a pull request instead of an admin edit (GrillTrack decision `website-docs-sync-077`, issue #63, tracker #64). The admin stays the source: a merge publishes a reviewed update, and never overwrites edits made in the admin.

1. Run `npm run docs:pull -- <article id>` (for example `store-owners/test-order`). It writes `docs/updates/<article id>.md` from the article's live Markdown export: the fields as frontmatter, the body as Markdown, and `base`, the hash of what was live. For a new article, write the file by hand with `base: new`, `section` and `order`.
2. Edit the file and open a PR here. `version_scope` must name the releases an owner installs (`Commerce 0.3.0, Payments 0.2.9`, `Requires Commerce 0.4.0`) or say `Unreleased`; commit ids go under Sources in the body. `npm run test:docs` checks every update file.
3. A plugin PR whose behavior change affects an article carries a **Docs impact** line linking to that PR, or says "none, because …".
4. Merging runs the **Docs publish** workflow (`.github/workflows/docs-publish.yml`, one run at a time, always on the newest `main`). For each update file, `scripts/docs-sync.mjs publish` compares the live export with the file:

| Live article | What happens |
| --- | --- |
| Already has every field of the file | Nothing. |
| Still matches `base`, no unpublished admin edits | Saved with the `_rev` it was read with and published, then checked. An admin change after that read gets a 409 instead of being overwritten. |
| Still matches `base`, and the waiting draft has exactly this update in every field, sidebar name and order included (an earlier Publish failed) | That draft is published. A draft an editor changed in any field stops it like any other admin draft. |
| Changed on the site after the file was merged | Left alone: the site has newer text. |
| Changed before the merge, admin edits waiting, or a 409 | Stopped, nothing written, and one issue "Docs update stopped: <article id>" opened. It closes itself once the article is right. |

After publishing, the workflow checks that the article page, its Markdown, `/docs/search.json` and `/llms.txt` all carry the update's content (title, summary, version scope and text), and tries once more before opening an issue. Issues name the commit the run checked out and the EmDash revision involved. The same run on the 1st and 15th of each month catches a publish that failed or lagged. Run it by hand from the Actions tab (**Run workflow**) after fixing a stopped article.

The workflow signs in with a Cloudflare Access service token (`DOCS_PUBLISH_ACCESS_CLIENT_ID` and `DOCS_PUBLISH_ACCESS_CLIENT_SECRET` repository secrets; see `DEPLOY.md`) and acts as an EmDash Editor. Until both secrets are set it publishes nothing. `npm run test:docs-sync` (after `npm run build:docs-preview`) runs it against the docs preview with all articles published: an update, a failed publish and its recovery, a duplicate run, a stale surface, admin edits (including one landing mid-publish), a save whose Publish failed, a waiting draft an editor touched, a sidebar-only change, a stale run, version labels and an unreachable site.

## What reads the collection

`getPublicDocs()` in `src/docs/content.ts` returns published entries only. `getVisibleDocs()` adds drafts only in Astro's local development server; there is no request parameter or deployment setting that shows drafts in production. Every surface reads one of those two lists:

- the article page, sidebar, previous/next links, contents list and in-page search (`src/docs/components/`),
- `/docs/markdown/<id>.md` and the Copy as Markdown and View as Markdown buttons, which convert Portable Text to Markdown (`src/docs/portable-text.ts`),
- `/docs/search.json` and `/llms.txt`, which list published articles only, even in development.

Production answers 404 for an unpublished article's HTML and Markdown, and leaves it out of search and `llms.txt`.

## Keeping it portable

The docs code is self-contained in `src/docs/` so it can become a `dinkuskit/docs` plugin or starter later. `catalog.ts` (selection, sections, Markdown export, search records, llms.txt), `portable-text.ts`, `search.ts` and the components take a list of articles and a `DocsSite` value; `site.ts` is the one DinkusKit-specific file (origin, name, section folders). `content.ts` is the EmDash adapter. The page routes in `src/pages/docs/` and `src/pages/llms.txt.ts` wrap the components in the site's own layout.

## The thirteen starting articles

The articles from #52 were converted once from Markdown to Portable Text with `scripts/docs-import.mjs seed --from 1f6562b`, and are stored in `seed/seed.json` as unpublished drafts:

| Article ID | Section | Sidebar name |
| --- | --- | --- |
| `start-here` | Start here | Choose your path |
| `store-owners/setup` | Store owners | Set up a store |
| `store-owners/first-product` | Store owners | Add your first product |
| `store-owners/test-order` | Store owners | Verify a test order |
| `developers/integrate` | Developers | Build a site |
| `developers/add-on` | Developers | Extend DinkusKit |
| `developers/contribute` | Developers | Contribute |
| `reference/commerce` | Product reference | Commerce |
| `reference/payments` | Product reference | Payments |
| `reference/inventory` | Product reference | Inventory |
| `reference/ship` | Product reference | Ship |
| `troubleshooting` | Troubleshooting and upgrades | Troubleshooting and upgrades |
| `ai-assistants` | Using AI assistants | Read docs with your assistant |

A new database gets the collection and these drafts from setup's sample content. A database that already finished setup (such as dinkuskit.com's) gets them once with `npm run docs:import -- https://dinkuskit.com` (see `DEPLOY.md`). After that the CMS is the source: editing `seed/seed.json` does not change a site that already has the articles.

The source revisions the drafts were checked against, and the gaps they record, are listed in each article's Version scope and "Sources and verification limits" section and in `proof/documentation-drafts/`. Each article is published only after its journey is proven (#53).

## Local preview and checks

```sh
npm ci
npm run setup
npm run dev:docs
```

`npm run dev:docs` runs a documentation-only Node preview with its own SQLite EmDash database under `.grilltrack/work/docs-preview/`. Open `http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/docs` once to load the seed and sign in as a local admin; drafts then show with a "Draft for review." notice and noindex/no-store headers, and the admin at `/_emdash/admin` can publish them. `npm run dev` previews the full Cloudflare site the same way.

- `npm run test:docs`: selection, sections, URLs, Markdown, search, llms.txt, Portable Text conversion, and the seed's collection and thirteen drafts.
- `npm run test:docs-routes`: in the preview, loads the drafts, reloads them with the import script, publishes one through the EmDash API, then checks development and a production build of the same database: only the published article is served.
- `npm run test:smoke`: on the production workerd build, the seed creates the collection with thirteen unpublished entries and none is served.

`npm run verify` runs all three.
