# Documentation layout and article drafts

## Scope and source

Prepared on 2026-10-19 from website commit `cf9375959f194ad7435bcf7374efdf63cd668188`, on isolated branch `docs/layout-and-article-drafts`. The requested slice is the proposed layout and thirteen article drafts, not publication of a verified owner journey. Module source identities and unresolved contracts are recorded in `docs/documentation-authoring.md` and the article source links.

The implementation reuses the Site layout and existing colors. It adds grouped expandable navigation, active-article state, full-text search, contextual contents, adjacent-article links, and a mobile dialog. The article collection and explicit allowlist feed the HTML/Markdown/search/discovery routes. Every article remains `draft: true`; production output does not publish those drafts. A Node-only docs fixture imports the actual docs routes and layout without CMS/account bindings.

## Original contributor verification

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

## PR review follow-up, 2026-10-19

The owner approved the focused revisions requested in [review 5576435530](https://github.com/dinkuskit/dinkuskit/pull/52#pullrequestreview-5576435530). All thirteen articles remain drafts. The article row now shows the editorial update date and Copy/View as Markdown. Copy fetches the same native Markdown endpoint, creates a `text/plain` clipboard item during the user gesture, and reports success or a View-link fallback. Draft Markdown uses the same local-development selector and noindex/no-store headers as draft HTML. No public index, CMS boundary, deployment setting, product contract, or publication flag is widened.

The reviewer reports `test:docs` (4/4), development/production docs route checks, `test:account` (14/14), and Astro check (0 errors) on imported commit `2daa928`. Their browser observations cover desktop search and keyboard entry to results, a 375px drawer with initial focus and Escape/focus return, no horizontal scrolling, and article-body links. These are attributed review observations, not a claim that the original contributor ran them.

### Current revision checks

Source identity: the 20 changed runtime, article, and test files are captured in the ignored `verified-source.sha256` manifest (sorted repository paths; one SHA-256 per file). Manifest SHA-256: `b378226e52864eaa1315bfed1ef4c20546481bd590cfe3dd5cca5abeb598598d`. These source contents are checked again before the final commit; later proof/ledger edits do not change them.

Runtime: official Node `22.23.2` Darwin arm64 archive, verified against Node's published SHA-256 (`61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6`). The runtime is task-local; the user's default Node is unchanged. Dependencies were installed with `npm ci` from the unchanged lockfile. Wrangler logs and local test state stay ignored.

- `npm run test:docs`: 4/4 passed, including editorial date preservation.
- `npm run typecheck`: 0 errors, 0 warnings; two pre-existing deprecated clipboard API hints in the account helper. An initial sandbox log-directory warning was avoided for subsequent runs with a task-local `WRANGLER_LOG_PATH`.
- `npm run test:docs-routes`: passed development and production for all thirteen articles. Checks cover the row/date/links, local Markdown 200 with content type and noindex/no-store, production Markdown/HTML 404, empty public search, absent llms.txt, unknown IDs and preview-query exclusion. The first attempt encountered a port conflict while the previous preview was running; after stopping only that known DinkusKit preview, the complete command passed.
- Real Chrome clipboard write/read matched the native Markdown endpoint exactly. Real Playwright WebKit 26.6 copy and keyboard paste-back also matched exactly (4,654 characters for Start here). No clipboard implementation was stubbed for those success checks; WebKit is not a claim about every Safari release.
- Desktop 1440px and mobile 375px were visually inspected. Browser checks passed for grouped navigation, active location, search and keyboard entry, no-results feedback, dialog initial focus/containment, Close/Escape/backdrop/focus return, resize closure, and no horizontal overflow. Resize assertions wait for the media-query event.
- A deliberately failed Markdown fetch produced the accessible failure message and left the button usable. View as Markdown navigated to the correct dated body. With JavaScript disabled, Copy stayed hidden and expandable article navigation remained usable. A separate CDP permission-denial scenario could not be configured (`Target.getBrowserContexts`: Not allowed); no clipboard-permission-denial result is claimed.
- Full `npm run verify`: **passed, exit 0**, on Node 22.23.2. This includes audit/setup/generated types, typecheck, docs/account/E2E contracts, production build, agent and merchant routes, Inventory and shared-store checks, organization/operator authorization, real workerd smoke, local CMS, release/process helpers, Access/safe-URL checks, persisted CMS restart, the 1.0.1 → 1.2 upgrade, and the Cloudflare candidate. The smoke explicitly confirmed production draft exclusion from HTML, Markdown, search and llms.txt, with no preview-query bypass. Full log SHA-256: `559b530520dd46abe83bc416a6d80af1181e763088f24e3f6ed529cd03c356f7`.

Screenshots remain local and ignored under `.grilltrack/work/pr52/output/playwright/`: desktop SHA-256 `f7ea4ee89fdab25b4785d96ffb3ddb5f96a9f2a2c49b141d38350c9e5a44eb82`, mobile `a5c7a3a23b93f909d7e8af91656c6342936ab50f16e0e2308baaf207af76306e`, WebKit `45219456227658cfb7f00b9bad0035caf05ed3f4e0eb97477c5eb033b55d9dbf`. Generated logs remain in `.grilltrack/work/pr52/`.

### Remaining gates

- GitHub's [Website checks](https://github.com/dinkuskit/dinkuskit/actions/runs/39303635806) and [CI](https://github.com/dinkuskit/dinkuskit/actions/runs/39303635802) for `2daa928` explicitly state **awaiting approval from a maintainer**. The workflow approval-policy API returned HTTP 403 for this account; no permissions or workflow security settings were changed. These runs are not passing CI evidence. Check the final pushed head's runs separately.
- No Registry installation, live account, product transaction, provider lookup, Orders persistence, Inventory operation, or Ship label was performed. Those remain article-publication gates.
- Public docs MCP implementation/client compatibility and a qualified independent add-on example remain separate launch work. Draft publication and deployment need their own authorization and evidence.

## Review and delivery

A separate read-only review inspected corpus selection, routes, layout/dialog logic, all article drafts, and sampled exact module contracts. It found no actionable source defects; it did not execute browser or production runtime checks. The immutable review identity is recorded in the accompanying review file after the implementation commit.

The contribution was first prepared locally because the contributor’s GitHub connection could not create an upstream branch (HTTP 403). The owner subsequently authorized the fork-and-pull-request route. The two supplied commits were imported with authorship preserved into `saarius/dinkuskit`, then submitted as [dinkuskit/dinkuskit#52](https://github.com/dinkuskit/dinkuskit/pull/52). No merge or deployment is part of this contribution.

Rollback before publication is a source revert. Deployment rollback remains tied to the eventual verified hosting/release mechanism; no production release is part of this proof.
