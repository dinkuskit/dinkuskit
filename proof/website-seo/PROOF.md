# dinkuskit.com Core SEO & Sitemap

Source: branch `agy/seo-core-pages-20261031` from `main` `1d0e03384d282405c5f7bf294e725ced8be5eeee`.

## What visitors and search engines get

- **Populated XML Sitemap (`/sitemap.xml`)**: `src/pages/sitemap.xml.ts` overrides EmDash's empty default `<sitemapindex>` and serves a `<urlset>` containing the core public pages (`/`, `/getting-started`, `/start`, `/terms`) and all published documentation articles from `getPublicDocs()` with `<lastmod>` dates. Unpublished drafts, `/404`, `/_emdash/*`, and `/account/*` are excluded.
- **Crawler directives (`/robots.txt` and `noindex`)**: `src/pages/robots.txt.ts` allows public crawling, disallows `/_emdash/` and `/api/`, and points to `https://dinkuskit.com/sitemap.xml`. `/404`, unpublished docs drafts, and `/account/*` pages emit `<meta name="robots" content="noindex, nofollow" />` (and `X-Robots-Tag: noindex, nofollow` on `/account/*` responses) while keeping `/account/*` crawlable so search engines can read the `noindex` directive.
- **Canonical redirects and HSTS**: `src/middleware.ts` and `src/seo.ts` redirect `GET` and `HEAD` requests on `http://dinkuskit.com/*` and `http(s)://www.dinkuskit.com/*` with `308` to `https://dinkuskit.com/*`, add `Strict-Transport-Security: max-age=31536000` on `https://dinkuskit.com` responses, and register `www.dinkuskit.com` as a custom domain route in `cloudflare/wrangler.jsonc`. Local loopback dev/test servers (`127.0.0.1` / `localhost`) are unaffected.
- **Search titles, descriptions, social cards, and structured data**:
  - `src/layouts/Site.astro` and `src/seo.ts` normalize `<meta name="description">` within 160 characters on every page, with curated core-page descriptions for `/`, `/getting-started`, `/start`, and `/terms` covering open-source headless/composable commerce on EmDash CMS and Astro, Stripe checkout (Payments), and USPS shipping labels (Ship).
  - Every page includes OpenGraph and Twitter `summary_large_image` metadata backed by `public/social-card.png` (1200×630) and `public/social-card.svg`.
  - Indexable pages include `<script type="application/ld+json">` structured data (`Organization`, `WebSite`, and `SoftwareApplication` on `/`; `WebPage` on `/getting-started`, `/start`, and `/terms`; `TechArticle` on published `/docs/[...slug]` pages).

## Checks (Node 24.22.0)

| Command | Result |
| --- | --- |
| `npm run typecheck` | 0 errors, 0 warnings |
| `npm run test:docs` | 41 unit tests pass, including `tests/seo.test.mjs` (canonical redirects, `<=160`-char meta descriptions, titles, `noindex` paths, JSON-LD serialization, `/sitemap.xml`, `/robots.txt`, and social card assets) |
| `npm run test:docs-routes` | dev and production docs preview servers pass; published docs stay indexable (`x-robots-tag: null`, no `noindex` meta tag) and drafts stay `404` in production |
| `npm run test:smoke` | production workerd serves `/`, `/getting-started`, `/sitemap.xml`, and `/robots.txt` with `og:image`, JSON-LD structured data, and draft exclusion |
| `npm run test:cloudflare-candidate` | official Cloudflare candidate build and `/_emdash` denial checks pass |
| `npm run test:pages-import`, `npm run test:docs-sync`, `npm run test:foundation`, `npm run test:workers-builds`, `npm run test:access-gate`, `npm run test:safe-http-url`, `npm run test:history-archive`, `npm run audit:repo` | pass |

## Limits and human gates

- Local verification only: `deploy/dinkuskit-com` was not pushed and live production was not modified (`WAITING_FOR_HUMAN`).
- Google Search Console (`dinkuskit.com` Domain property) DNS `TXT` verification and `www.dinkuskit.com` custom domain routing take effect upon owner-approved DNS record addition and production deploy.
