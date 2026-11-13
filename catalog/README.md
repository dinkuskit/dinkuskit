# DinkusKit Catalog (not deployed)

One catalog across every listed DinkusKit store, for shoppers' AI agents. Decisions: `agent-catalog-*-20261113` in the ledger; plan: `docs/plans/agent-catalog.md`.

- **Agent address:** `POST /api/ucp/mcp` answers UCP's catalog tools over MCP: `search_catalog`, `lookup_catalog`, `get_product`. `GET /.well-known/ucp` is the UCP profile.
- **Where products come from:** every five minutes the Worker reads each listed store's public feed at `/feeds/agent-catalog.json` (template store). Only what a shopper can already see is kept. A store that cannot be read keeps its last good products.
- **Who is listed:** stores connected to DinkusKit whose business is approved and active, with Payments connected, unless the owner turned the catalog off or the operator cut the store off. `CATALOG_EXCLUDED_ORIGINS` names test stores that are never listed.
- **Same product, several stores:** products share one id when their GTIN matches, or their brand and MPN. The lowest-priced store's words and pictures lead.
- **Buying:** each result points to the store's own product page. The catalog never holds a cart or takes money.
- **Limits:** agents that send `meta["ucp-agent"].profile` get 50 requests per 10 seconds; others share 30 a minute per address.

- **Search by meaning, photo and "similar to this":** each product gets one vector from its words and first picture (Workers AI `@cf/google/embeddinggemma-2`, a Vectorize index). `catalog.like` takes a product id or a base64 photo. Word and meaning ranks are joined. With the model or index missing or down, the catalog answers by words and says so in `messages`.
- **Categories:** each product's category is worked out by the catalog against Shopify's open Standard Product Taxonomy (MIT) and marked `inferred`. `filters.categories` takes taxonomy ids; a category matches everything beneath it. `scripts/seed-categories.mjs` fills the category index (about 14,600 categories, a little over Vectorize's included storage on its own; cents a month).

Not built yet: the owner's toggle on Your stores, matching the same product with no GTIN or MPN, and a checkout link per offer (waits for the store's `/buy` links).

Run the tests with `npm run test:catalog`. `wrangler.jsonc` holds placeholder ids only; deploying, creating the database and the two Vectorize indexes (768 dimensions, cosine), seeding categories and adding the `catalog.dinkuskit.com` address need the owner's go.
