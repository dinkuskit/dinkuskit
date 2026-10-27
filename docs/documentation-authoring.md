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

1. Run `npm run docs:pull -- <article id>` (for example `store-owners/test-order`). It writes `docs/updates/<article id>.md` from the article's live Markdown export: the fields as frontmatter, the body as Markdown, and `base`, the hash of what was live. For a new article, write the file by hand with `base: new`, `section` and `order` (and `nav_label` if wanted). An existing article's sidebar name, section and order are changed in the admin; an update file for it that sets them is refused.
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

The workflow signs in with its own EmDash API token (`DOCS_PUBLISH_EMDASH_TOKEN` repository secret, scopes `content:read` and `content:write`; see `DEPLOY.md`, Agents). Until that is set it falls back to a Cloudflare Access service token (`DOCS_PUBLISH_ACCESS_CLIENT_ID` and `DOCS_PUBLISH_ACCESS_CLIENT_SECRET`), acting as an EmDash Editor. With neither it publishes nothing. `npm run test:docs-sync` (after `npm run build:docs-preview`) runs it against the docs preview with all articles published: an update, a failed publish and its recovery, a duplicate run, a stale surface, admin edits (including one landing mid-publish), a save whose Publish failed, a waiting draft an editor touched, plugin releases through the import (waiting for, and refusing to replace, a previous release that is not live yet), placement owned by the admin, a stale run, version labels and an unreachable site.

## Plugin reference articles from releases

Commerce, Payments and Ship keep their reference article beside their code, as `docs/website/reference/<plugin>.md`, and change it in the same PR as the behavior it describes (GrillTrack decision `website-docs-from-plugin-releases-086`). It is an update file without `base`; `version_scope` reads `Commerce {{version}}`, and `{{version}}` and `{{release_date}}` stand for the release that ships it. ClawSweeper records each plugin PR's docs as up to date, missing or not applicable; missing is a finding, not a block.

Only a stable release publishes. The plugin's release workflow presses **Docs from a plugin release** here (`.github/workflows/docs-plugin-release.yml`) with the plugin and tag. `scripts/docs-sync.mjs release <plugin> <tag>` clones the tag, fills in the release's version and GitHub release date, and writes `docs/updates/reference/<plugin>.md` with `base` taken from the live article (`releaseBase` in `src/docs/releases.ts`):

| Live article | `base` |
| --- | --- |
| Shows this repository's current update file | That file's hash: the release builds on it. |
| Still shows what that file was written against (its publish is waiting or stopped) | None yet. The release waits up to 15 minutes for that update to go live, and otherwise stops without writing anything. Press it again once Docs publish has published the previous update; if it stopped, its "Docs update stopped" issue says why. |
| Anything else (edited or unpublished in the admin) | The current file's hash, so Docs publish stops with an issue instead of overwriting the edit. |
| Live, but no update file here | Refused: run `npm run docs:pull` and merge that first. |

A release therefore only ever builds on text the site has shown. It never replaces an update that is still waiting, so a failed or late publish of the previous release cannot strand it, and Docs publish's rules above stay as they are. The workflow pushes the file to main without a second PR and always starts Docs publish, also when it stopped for a previous update that is not live yet, so rerunning it retries a publish that never started. Each plugin has its own queue (concurrency group), so releases of different plugins never drop each other. A plugin can write only its own articles, a beta tag is refused, an older release than the one published is refused, and the same release twice changes nothing. If a release cannot press the button, press it by hand from the Actions tab.

The twice-monthly Docs publish run also compares each live plugin article's version scope (from its Markdown export) with the plugin's latest stable GitHub release (`docs-sync.mjs versions --report`) and opens one issue, "Docs behind release: <article id>", per article that is behind. It closes itself once the live article catches up, so an import whose publish stopped keeps it open. An article that cannot be read keeps its issue as it is and fails the run. This check is a stopgap until a daily docs agent keeps every article current.

Articles that span plugins (start-here, the store-owner and developer guides, troubleshooting) stay here and change through `npm run docs:pull` and a PR as above.

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
