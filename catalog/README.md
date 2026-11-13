# DinkusKit Catalog (not deployed)

One catalog across every listed DinkusKit store, for shoppers' AI agents. Decisions: `agent-catalog-*-20261113` in the ledger; plan: `docs/plans/agent-catalog.md`.

- **Agent address:** `POST /api/ucp/mcp` answers UCP's catalog tools over MCP: `search_catalog`, `lookup_catalog`, `get_product`. `GET /.well-known/ucp` is the UCP profile.
- **Where products come from:** every five minutes the Worker reads each listed store's public feed at `/feeds/agent-catalog.json` (template store). Only what a shopper can already see is kept.
- **Never older than 10 minutes:** a store that cannot be read keeps its last good products for at most 10 minutes after its last good read, then leaves until it can be read again. The age is checked before every answer, so this holds even if the five-minute timer stops. `get_product` goes further: before answering it checks that each store selling the product is still listed and reads that store's feed again (unless it was read in the last 30 seconds). Every selling store is checked, however many there are. If the list of listed stores cannot be read, `get_product` answers `temporarily_unavailable` instead of detail nobody checked.
- **Who is listed:** stores connected to DinkusKit whose business is approved and active, with Payments connected, unless the operator cut the store off. A store that stops qualifying leaves at the next read, at once when `get_product` is asked about one of its products, and in any case within 10 minutes. `CATALOG_EXCLUDED_ORIGINS` names test stores that are never listed.
- **Same product, several stores:** products share one id when their GTIN matches, or their brand and MPN. An MPN must match exactly, bar letter case and spacing: `AB-12` and `A-B12` are different parts. The lowest-priced store's words and pictures lead.
- **Buying:** each result points to the store's own product page. The catalog never holds a cart or takes money.
- **Limits:** requests that send `meta["ucp-agent"].profile` get 50 per 10 seconds; others get 30 a minute. Both are counted per address, so sending a different profile does not open a new allowance (the profile is not verified yet).

- **Search by meaning, photo and "similar to this":** each product gets one vector from its words and first picture (Workers AI `@cf/google/embeddinggemma-2`, a Vectorize index). `catalog.like` takes a product id or a base64 photo. Word and meaning ranks are joined. With the model or index missing or down, the catalog answers by words and says so in `messages`.
- **Categories:** each product's category is worked out by the catalog against Shopify's open Standard Product Taxonomy (MIT) and marked `inferred`. `filters.categories` takes taxonomy ids; a category matches everything beneath it. `scripts/seed-categories.mjs` fills the category index (about 14,600 categories, a little over Vectorize's included storage on its own; cents a month).

The owner's on/off switch lives in the store admin only (Commerce > Settings > Catalog); while it is off the store's feed lists no products and the next read drops them here.

Not built yet: matching the same product with no GTIN or MPN, and a checkout link per offer (waits for the store's `/buy` links).

Run the tests with `npm run test:catalog`. `npm run proof:catalog` runs the Worker as built for Cloudflare inside the Workers runtime on this machine, with both databases and the rate limits, and walks through stores entering and leaving the catalog; the stores themselves, Workers AI and Vectorize are not part of that run. `wrangler.jsonc` holds placeholder ids only; deploying, creating the database and the two Vectorize indexes (768 dimensions, cosine), seeding categories and adding the `catalog.dinkuskit.com` address need the owner's go.
