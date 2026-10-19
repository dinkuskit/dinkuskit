# Documentation layout and article drafts

## Scope and source

Prepared on 2026-10-19 from website commit `cf9375959f194ad7435bcf7374efdf63cd668188`, on isolated branch `docs/layout-and-article-drafts`. The requested slice is the proposed layout and thirteen article drafts, not publication of a verified owner journey. Module source identities and unresolved contracts are recorded in `docs/documentation-authoring.md` and the article source links.

The implementation reuses the Site layout and existing colors. It adds grouped expandable navigation, active-article state, full-text search, contextual contents, adjacent-article links, and a mobile dialog. The article collection and explicit allowlist feed the HTML/Markdown/search/discovery routes. Every article remains `draft: true`; production output does not publish those drafts. A Node-only docs fixture imports the actual docs routes and layout without CMS/account bindings.

## Verification performed

Runtime: Node `22.23.2`, repository-locked dependencies from `npm ci`, Astro `7.3.2`, EmDash `1.2.0`.

| Check | Result |
| --- | --- |
| `npm ci` | Passed on the repository's Node version. |
| `npm run setup` | Passed local schema preparation/migrations. No remote state used. |
| `npm run typecheck` | Passed: 0 errors, 0 warnings; 2 existing deprecated clipboard API hints. |
| `npm run build` | Passed the normal Cloudflare production build; existing large-bundle warning remains. |
| `npm run test:docs` | 4 tests passed: allowlist/draft boundary, body/version preservation, bounded search, selected article links. |
| `npm run test:docs-routes` | Passed against the Node-only docs fixture in development and production modes. All 13 local draft pages rendered; all 13 production pages and Markdown requests returned 404; public search stayed empty; llms.txt and unknown IDs returned 404. Query parameters did not enable production drafts. |
| `npm run test:account` | 14 existing tests passed. |
| `npm run audit:repo` and `git diff --check` | Passed. |
| GrillTrack CLI validation | Passed. The decision remains implemented, with verification gates below still open. |

The route test checks rendered draft notices, version-bearing source data, canonical URLs, active links, noindex/no-store headers, and absence of draft HTML/search payloads in production mode. It is an HTTP rendering test, not visual or keyboard proof.

## Blocked checks and remaining work

- `npm run test:smoke` could not start the production Cloudflare Worker: Wrangler failed with `uv_interface_addresses returned Unknown system error 1`. This environment limitation leaves real workerd route, CMS, and merchant-boundary regression checks unverified. The added production smoke assertions are not claimed passed on Cloudflare.
- Browser automation was attempted with Chromium. The browser process exited with `SIGTRAP` before a page opened. No screenshot, visual layout, focus-trap, touch, keyboard, or no-JavaScript browser result is claimed. Inspect desktop at 1440px and mobile at 390px; exercise every group, search/no-results, active link, Close/Escape/backdrop, focus return, resize while open, and non-JavaScript navigation.
- The full `npm run verify` gate is not claimed complete. Its Cloudflare-dependent checks must run in a compatible environment before merge.
- No Registry installation, live account, product transaction, provider lookup, Orders persistence, Inventory operation, or Ship label was performed. The drafts record these publication gates.
- Public docs MCP implementation and client compatibility are follow-up work. Native route definitions are not claims of live availability.

## Review and delivery

A separate read-only review inspected corpus selection, routes, layout/dialog logic, all article drafts, and sampled exact module contracts. It found no actionable source defects; it did not execute browser or production runtime checks. The immutable review identity is recorded in the accompanying review file after the implementation commit.

The connected GitHub account reported no push permission. The requested remote branch create returned HTTP 403, `Resource not accessible by integration`. No remote branch, pull request, merge, or deployment was created. The local contribution and patch can be pushed once the GitHub connection has repository contents write permission. No alternate credentials or delivery path were used to bypass that denial.

Rollback before publication is a source revert. Deployment rollback remains tied to the eventual verified hosting/release mechanism; no production release is part of this proof.
