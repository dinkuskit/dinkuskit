# DinkusKit Catalog (not deployed)

One catalog across every listed DinkusKit store, for shoppers' AI agents. Decisions: `agent-catalog-*-20261113` in the ledger; plan: `docs/plans/agent-catalog.md`.

- **Agent address:** `POST /api/ucp/mcp` answers UCP's catalog tools over MCP: `search_catalog`, `lookup_catalog`, `get_product`. `GET /.well-known/ucp` is the UCP profile.
- **Where products come from:** every five minutes the Worker reads each listed store's public feed at `/feeds/agent-catalog.json` (template store). Only what a shopper can already see is kept. A store that cannot be read keeps its last good products.
- **Who is listed:** stores connected to DinkusKit whose business is approved and active, with Payments connected, unless the owner turned the catalog off or the operator cut the store off. `CATALOG_EXCLUDED_ORIGINS` names test stores that are never listed.
- **Same product, several stores:** products share one id when their GTIN matches, or their brand and MPN. The lowest-priced store's words and pictures lead.
- **Buying:** each result points to the store's own product page. The catalog never holds a cart or takes money.
- **Limits:** agents that send `meta["ucp-agent"].profile` get 50 requests per 10 seconds; others share 30 a minute per address.

Not built yet: search by meaning, categories, photo search, the owner's toggle on Your stores.

Run the tests with `npm run test:catalog`. `wrangler.jsonc` holds placeholder ids only; deploying, creating the database and adding the `catalog.dinkuskit.com` address need the owner's go.
