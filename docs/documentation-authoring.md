# Documentation contribution

This is the first layout and article-draft slice requested on 2026-10-19. It implements the supplied thirteen-article map in the existing Astro/EmDash website. It is not a publication or runtime product-readiness claim.

## Source ownership and preview

`src/content/docs/**/*.md` owns article text. `src/content.config.ts` validates small metadata; `src/docs/catalog.ts` owns the explicit page allowlist, order, and groups. There is one source per article. Existing marketing pages retain their EmDash content and rendering. No CMS seed, merchant authority, editor access, service setting, deployment configuration, or historical export allowlist is changed.

Use the repository's Node version and normal setup:

```sh
npm ci
npm run setup
npm run dev
```

Open `http://127.0.0.1:4321/docs`. Astro development mode previews the drafts with a visible notice, noindex headers, and local full-text search. The mobile drawer uses a native dialog, closes with Escape or its Close button, returns focus to the trigger, and returns navigation to the sidebar when the viewport widens. Without JavaScript, the navigation remains usable in document flow.

`npm run dev:docs` provides a documentation-only Node preview using the same routes, content, and Site layout. It needs no CMS, merchant account, or Cloudflare bindings. This fixture does not verify those production surfaces. Some agent environments make Astro background its dev server automatically; the route test controls a foreground child and stops only that process.

There is no production draft-preview switch or request parameter. The same build-time collection feeds all routes, but `getPublicDocs()` always excludes drafts and unselected IDs. All thirteen articles currently remain drafts. Therefore a normal production build serves 404 for their HTML/Markdown routes and `/llms.txt`, and returns `[]` from `/docs/search.json`. The global Docs link appears only when visible articles exist.

## Article map

| Article ID | Canonical source |
| --- | --- |
| `start-here` | `src/content/docs/start-here.md` |
| `store-owners/setup` | `src/content/docs/store-owners/setup.md` |
| `store-owners/first-product` | `src/content/docs/store-owners/first-product.md` |
| `store-owners/test-order` | `src/content/docs/store-owners/test-order.md` |
| `developers/integrate` | `src/content/docs/developers/integrate.md` |
| `developers/add-on` | `src/content/docs/developers/add-on.md` |
| `developers/contribute` | `src/content/docs/developers/contribute.md` |
| `reference/commerce` | `src/content/docs/reference/commerce.md` |
| `reference/payments` | `src/content/docs/reference/payments.md` |
| `reference/inventory` | `src/content/docs/reference/inventory.md` |
| `reference/ship` | `src/content/docs/reference/ship.md` |
| `troubleshooting` | `src/content/docs/troubleshooting.md` |
| `ai-assistants` | `src/content/docs/ai-assistants.md` |

Use root-relative `/docs/...` links and absolute public-source links. Source-relative assets and imports are not part of this initial corpus. Keep reference facts canonical and link from task articles. Frontmatter `draft` defaults to true; setting it false is an explicit editorial publication decision after evidence review. Published pages must not link to draft articles. Metadata and substantive Markdown are retained in native output; there is no separate handwritten agent corpus.

## Reconciled source baseline

| Repository | Inspected revision | Material limit |
| --- | --- | --- |
| Website | `cf9375959f194ad7435bcf7374efdf63cd668188` | Astro 7.3.2, EmDash 1.2.0; current deployment not inspected live. |
| Commerce | `e8eca12488f992acbaef712d71c9ac1d45b35e78` | Source and v0.3.0 tag agree; Registry artifact not installed. README has older release prose. |
| Payments | `b92ec308eda74c2dfff8c2deca574bf2e17ff654` | Package 0.2.9; v0.2.9 tag is `9a1509400f0578ae5d27d0df0e4959b49eac9884`. |
| Inventory | `2b51314c715071bed05a3b6332739ad39eeb8acb` | Private 0.0.0 packages, current manifest targets EmDash 1.2.0; README is stale. |
| Ship | `42afe339e483bb366839822291ce4168c1045d61` | Hosted sandbox service differs from private root plugin; no live postage claim. |
| Template Store | `75f49ff6ded989726a76676eb27d8ae9b64ab980` | Supporting source only; current Commerce pin differs from older pairing docs. |

Important gaps are recorded in the drafts: provider-confirmed checkout and Commerce Orders handoff are separate; `recorded` is insufficient without Orders visibility. Inventory is not universally required. A native helper/export does not establish an independently installable add-on SDK. The add-on draft's host structured-data example remains unqualified as a Registry extension.

## Verification and next slice

Run `npm run test:docs`, `npm run test:docs-routes`, `npm run typecheck`, `npm run build`, and the affected route/browser checks. `test:docs-routes` builds the documentation-only fixture and verifies both development and production mode; it does not substitute for Cloudflare smoke. The initial route checks intentionally expect thirteen draft articles and an empty public corpus; revise those expectations with an approved publication change. `npm run verify` remains the repository's full CI gate. Curated results belong in `proof/documentation-drafts/PROOF.md`; generated logs/screenshots stay ignored.

Before publication, qualify exact installable artifacts, reproduce the existing-site product and TEST-order journey, execute developer examples, select a supported independent add-on surface, and replace source-derived troubleshooting with observed recovery steps. Then implement and client-test the read-only docs MCP against the same `getPublicDocs()` corpus. MCP is intentionally not claimed complete by this slice.

The historical static exporter still enumerates only the original public pages and cannot publish these routes. `DEPLOY.md` describes a separate Worker candidate. Determine the active release path from authorized deployment evidence before integrating publication; source instructions alone do not prove production routing. Do not enable optional Cloudflare conversion or alter content-signal policy as part of this contribution.

Rollback before publication is a source revert of this contribution. A deployed-docs rollback must be prepared against the actual selected build and hosting mechanism. No deployment is included here.
