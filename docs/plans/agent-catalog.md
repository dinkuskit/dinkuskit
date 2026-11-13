# One catalog for every DinkusKit store: scope

Written 13 Nov 2026 for Ronald. Decisions are locked (see Decisions). Nothing has been deployed.

Checked against: Shopify's agent docs (read 13 Nov 2026), UCP spec 2026-08-25, Commerce main `12a15e6`, template-store main `31a6520`, dinkuskit main `c429d72`, Cloudflare Vectorize pricing (page dated 30 Oct 2026). The gap list from the cart thread is in the project notes and I checked it against the docs. It holds up.

## The goal (Ronald, 13 Nov)

**DinkusKit stores show up inside ChatGPT, Gemini and the other AI apps, at no cost to the store owner.** In his words: "this should be the end goal", and "im not looking to pay shopify ; im looking to offer dinkuskit users a similar level of functionality without the cost".

## Short answer

**Yes, this is reachable, and every route to it is free.** None of it needs Shopify.

Shopify gets its stores into the AI apps by collecting every store's products in one place and handing them to each app. We can do the same. Every store already signs in to dinkuskit.com and already publishes a product feed. What is missing is the middle piece: **one DinkusKit catalog that collects every listed store's products and hands them on.**

That one catalog then has several ways out, in the order I would do them:

1. **Google (AI Mode and Gemini).** The clearest path. Google's own help page says "store builders" may run one parent Merchant Center account with a sub-account per store. Listing is free.
2. **ChatGPT.** Free, but by application. OpenAI says product feeds are for approved partners today, with a waitlist and a self-serve merchant platform "later this year". Shopify and Etsy stores are already in. We apply as DinkusKit.
3. **Copilot and Perplexity.** Both have free merchant programmes with a sign-up form.
4. **Our own agent address** (`catalog.dinkuskit.com/api/ucp/mcp`), for any agent that speaks the open standard. This is the part that looks like Shopify's Global Catalog. It is cheap once the catalog exists, but on its own no big app will call it.

What I cannot promise: OpenAI, Microsoft and Perplexity each decide who they let in, and a platform with two stores may wait. Google is the one with a published rule that fits us.

Ronald's call, 13 Nov: build the catalog now. The free applications go out as soon as there is one real store to show.

## What Shopify's Global Catalog is, in plain terms

- **One address for every Shopify store:** `catalog.shopify.com/api/ucp/mcp`. An agent asks "trail running shoes under $150" and gets products from any Shopify store. Each store also has its own address at `its-domain/api/ucp/mcp` with the same three tools.
- **Three tools,** straight from the open UCP standard: `search_catalog` (find by words, or by a photo), `lookup_catalog` (fetch up to 50 known products fresh), `get_product` (full detail, sizes and colours, what is in stock, a checkout link per seller).
- **The same product from many sellers is shown once.** Shopify gives each product a Universal Product ID and lists every seller's offer under it. Some of that grouping is guessed by Shopify's AI, and the docs say so.
- **Filters:** price, in stock, ships to, ships from, new or secondhand, category, colour, size, gender, star rating, price tier, specific shops.
- **Buying stays with the seller.** Each result carries that store's own checkout link. The catalog never takes money.
- **Rules for agents using it:** show results only to shoppers, keep prices no longer than 10 minutes and other details no longer than 24 hours, no bulk copying, no training on it, keep the seller's name and links intact.
- **Who may ask:** anyone, with no key, at a low shared speed. Agents that sign their requests or hold a key get more (5 requests a second by default).
- **Money:** a paid placements programme is in invite-only preview. An agent builder earns 0.3% on sales it sends, more when the store funds a campaign. Paid results are marked.
- **It is not only Shopify stores any more.** Two things I found that the earlier notes did not have:
  - Shopify's **Agentic plan** lets a brand on any platform list in Shopify's catalog without a Shopify store (Shopify news, "AI commerce at scale").
  - In beta, the catalog also returns **"external offers"**: products Shopify indexed from a store's own website. They link to the store's product page and carry no Shopify checkout.

  The Agentic plan is paid, so it is out (Ronald, 13 Nov). The external offers crawl is free and needs nothing from us.

## How each AI app lets a store in

This answers the question left open in the UCP scope: do ChatGPT, Gemini and Copilot call `/.well-known/ucp` on stores that are not on Shopify? **No, not on their own.** Each app takes products from feeds it has accepted, plus its own crawling.

| App | Where its products come from | The free way in | Can DinkusKit do it for every store? |
| --- | --- | --- | --- |
| Google AI Mode and Gemini | The Shopping Graph, built from Merchant Center feeds and free listings | A Merchant Center account in good standing with products approved for free listings | **Yes, by Google's published rule.** "Store builders" are eligible for an advanced account: one parent account, a sub-account per store, products sent through the Merchant API. Each store's web address has to be verified, which our store site can do for the owner. |
| ChatGPT | Feeds from approved partners (sent by SFTP, full copy at least daily), plus its crawler. Shopify and Etsy catalogs are already in. | Apply at chatgpt.com/merchants. No fee for sales on the store's own site. US shoppers only for now. | **Unknown.** OpenAI mentions "supported providers" but does not say how a platform becomes one. Apply and ask. |
| Copilot | Copilot Merchant Program | A free interest form (store name, address, contact) | Unknown. Not checked on Microsoft's own page, only a news write-up. |
| Perplexity | Perplexity Merchant Program, plus crawling | A free sign-up form. Perplexity's page says it is aimed at large retailers. | Unknown. |

Buying inside the chat (Google's UCP checkout, ChatGPT's agentic checkout, Copilot Checkout) is a later step on each app and is early access everywhere. Being **found** comes first and is what this plan covers. When a shopper clicks, they land on the store's own page and pay there, which matches our locked rule.

Sources are the apps' own pages except Copilot (a news write-up) and the crawler details (a BigCommerce guide). One thing to check at build time: the template store has no `robots.txt` page of its own that I could find, so I have not confirmed the AI crawlers are let in.

The useful part: **our template store already produces the Google Merchant feed these programmes want** (`/feeds/google-merchant.xml`, plus a Meta one).

## What we already have

| Piece | Where | State |
| --- | --- | --- |
| A list of every connected store and its web address | dinkuskit.com merchant database (`dinkuskit_store_identity`: site id, site address, owner account) | Live |
| Approval of each business by you before it gets services | dinkuskit.com operator admin (business approvals, cut off) | Live |
| A signed way for a store to call dinkuskit.com | Store key traded for 5-minute passes at `/api/store-passes` | Live |
| Product feeds on every store | Template store `/feeds/google-merchant.xml`, `/feeds/meta-catalog.csv`, `/agents.md`, `/llms.txt`, `/llms-full.txt` | Live |
| Barcode (GTIN), part number (MPN) and brand per product | Commerce admin, Identifiers. Already in the feeds. | Live |
| Agent-only product copy (summary, highlights, specs) | Template store agent feed (`aiProjection`) | In code |
| A structured agent catalog feed (JSON) | Built in template store code (`dinkuskit.commerce.agent-catalog-feed/v1`) but I found no page that serves it as JSON | Needs one route |
| A link that opens a store's checkout with an item in it | `/buy/ID:QTY`, part of the server cart being built now | Coming |
| Each store's own agent address | UCP phase 1, locked, built after the first real order | Parked |
| Search on Cloudflare | D1 for the records, Vectorize for search by meaning, Workers AI to turn text into search vectors | Available, not used yet |

## How ours would work

1. **Listing.** A store that is connected to DinkusKit, approved, and able to take payment can be listed. The owner sees a "List my products in the DinkusKit catalog" switch.
2. **Filling the index.** The catalog reads the store's agent feed from the store's own public address. Only things a shopper can already see on the store leave it: name, description, photos (as links to the store's own images), price, in stock or not, sizes and colours, brand, barcode, part number, product link, store name, shipping and returns links. No stock counts, no orders, no customer details, no cost prices.
3. **Staying fresh.** When an owner publishes, changes a price, or something sells out, the store sends dinkuskit.com a small signed "my catalog changed" note and the catalog re-reads that store. Once a day it re-reads everyone as a safety net. When an agent asks for one product's full detail, the catalog checks price and stock with the store at that moment.
4. **Searching.** An agent calls `search_catalog` at `catalog.dinkuskit.com/api/ucp/mcp`. Words are matched both exactly and by meaning. Results come back in UCP's standard shape, each with the store's name, the product page, and the `/buy` link.
5. **Buying.** The shopper lands on that store's own cart or checkout. The catalog never holds a cart and never touches money. This matches the locked rule that the shopper always pays on the store's own page.
6. **Later, when a store has its own agent address,** the result also points to it, so an agent can build a cart there.

### What it would cost on Cloudflare

Search by meaning is the only part with a meter. Using a 768-number vector per product:

- Included in the Workers Paid plan: about **13,000 products** stored and roughly **50,000 searches a month** at that size.
- Cloudflare's own example beyond that: 50,000 products and 200,000 searches a month is about **$1.94 a month**.
- Records, the Worker itself and turning text into vectors are small change at this size. *My estimate, not measured.*

So cost is not a reason to wait or to charge stores.

### Risks and how each is handled

| Risk | Handling |
| --- | --- |
| Junk or scam listings | Only approved businesses with working payments are listed. You can already cut a store off. A cut-off store drops out of the catalog. |
| Product text written to trick an agent | Results are marked as untrusted content, the same as our browser tools do. Text is stored as plain text. |
| Someone copying the whole catalog | Speed limits per agent and per address. Usage rules copied from Shopify's. Everything in it is already public on each store, so the exposure is small. |
| Stale prices | The change note plus the live check on `get_product`. Checkout is always the final word, as UCP says. |
| A big store drowning out small ones | A cap on how many results one store gets per page. See question 7. |
| A search surge slowing dinkuskit.com sign-in | The catalog runs as its own Worker, not inside the website. |

## What the first version leaves out

From the 11 gaps, here is my call on each.

| Gap | First version | Why |
| --- | --- | --- |
| 1. Matching the same product with no barcode | No. Group only on an exact barcode, or brand plus part number. | With a handful of stores there is little to match. Guessing wrong puts the wrong seller under a product. |
| 2. One shared category list | No category filter yet. | Shopify's Standard Product Taxonomy is open source and maps to Google's list. Adopting it is a Commerce product field and its own decision. |
| 3. Star ratings | No. | We have no reviews anywhere. |
| 4. Ships to and ships from | "Ships to US" only. | Ship is US only. |
| 5. Price tiers | No. Plain price range only. | Tiers need categories and volume. |
| 6. Photo and "similar to this" search | No. | Nice to have, separate index. |
| 7. Agent-only product copy | Yes, read it where a store has it. | Already in our agent feed. |
| 8. Local shops with in-store stock | No. | No store locations in Commerce. |
| 9. Live prices and stock | Yes. Change notes plus a live check. | Cheap to do right from the start. |
| 10. Signed agents, higher limits, personal results | Anyone may search at a limited speed. No tiers, no personal results. | Matches the locked "which agents may shop" answer. |
| 11. Deals with the AI apps | Google through a store-builder account, then free applications to the others (questions 10 and 11). | This is the goal. |

## Decisions (Ronald, 13 Nov 2026, 14:27 to 14:30 UTC)

Locked in the dinkuskit ledger as `agent-catalog-*-20261113`.

| # | Question | Decision | His words |
| --- | --- | --- | --- |
| 1 | Build it, and when? | **Build it now.** | "build it now" |
| 2 | Where? | Own Worker at `catalog.dinkuskit.com/api/ucp/mcp`. | "agreed" |
| 3 | Who is listed? | Connected, approved, payment-ready stores. Never test stores. **The owner gets a toggle in the store admin**, starting on. | "agreed, store owners shoud get a toggle in admin to show it or not" |
| 4 | What leaves the store? | Only what a shopper can already see. | "agreed" |
| 5 | How fresh? | **Copy Shopify:** live, not nightly. Price and stock never older than 10 minutes, other details 24 hours. Daily re-read as a safety net. | "copy shopify hre" |
| 6 | Same product in several stores? | **Copy Shopify:** one universal product id, shown once with each seller's offer. Matched on barcode or brand plus part number first, inferred matches after, marked as inferred. | ditto marks under 5 |
| 7 | Order of results, and money? | **Copy Shopify:** best match, buyable now. No per-store cap. No fee, no paid placement. | ditto marks under 5 |
| 8 | Who may search? | **Copy Shopify:** anyone, no key. Unnamed agents share a low limit. Named agents get 5 a second. Shopify's usage rules on a terms page. | ditto marks under 5 |
| 9 | First version? | The three tools, plus a **category filter** (Shopify's open Standard Product Taxonomy, MIT licence, category worked out by the catalog) and **photo and similar-product search**. | "def the three standard tools ... categories/images seems easy to include if shopify is" |
| 10 | Google first? | Yes. One DinkusKit Merchant Center account converted to a store-builder account, a sub-account per store. | "agreed" |
| 11 | Apply to ChatGPT, Copilot, Perplexity? | Yes, once one real store is live. | "agreed" |
| 12 | Goal wording | "DinkusKit stores appear in the major AI shopping apps at no cost to the owner. DinkusKit never pays another platform to be listed." | "agreed" |

I read the ditto marks on 6, 7 and 8 as "copy Shopify". If you meant plain "agreed", the only differences are: 6 adds inferred matching later, 7 drops my cap of 3 per store.

**Still open: star ratings.** Shopify's catalog does filter by rating. I recommend leaving it out for now because no DinkusKit store has reviews, so there is nothing to filter on. Recorded as proposed, not locked.

## Build order

1. **Store side:** a JSON catalog feed route on the store site, the "catalog changed" note to dinkuskit.com, and the owner's toggle in the store admin.
2. **Catalog Worker:** the store list, reading feeds, the search index (words, meaning, photos), categories, and the three tools at `/api/ucp/mcp`.
3. **Proof on the beta store,** then a journey.
4. **Going live** needs Ronald's go: a new Worker, the `catalog.dinkuskit.com` address, and a dinkuskit.com deploy.
5. **Google:** needs Ronald to create the Merchant Center account and press the store-builder request.

## Sources (read 13 Nov 2026)

- Shopify: [About Catalogs](https://shopify.dev/docs/agents/catalog), [Global Catalog MCP](https://shopify.dev/docs/agents/catalog/global-catalog), [Global Catalog extension](https://shopify.dev/docs/agents/catalog/global-catalog-extension) (filters, similarity search, external offers beta), [Promoted placements](https://shopify.dev/docs/agents/catalog/promoted-placement), [Auth and rate limiting](https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting), [AI commerce at scale](https://www.shopify.com/news/ai-commerce-at-scale) (Agentic plan).
- UCP: [Catalog capability 2026-08-25](https://ucp.dev/2026-08-25/specification/shopping/catalog/).
- Cloudflare: [Vectorize pricing](https://developers.cloudflare.com/vectorize/platform/pricing/).
- OpenAI: [Power product discovery in ChatGPT](https://chatgpt.com/merchants/) (apply, waitlist, Shopify and Etsy already integrated, no fees on own-site sales), [Commerce get started](https://developers.openai.com/commerce/guides/get-started.md) (approved partners, SFTP, daily snapshot, prohibited products).
- Google: [Request an advanced account setup](https://support.google.com/merchants/answer/14089347?hl=en) (store builders eligible, sub-account domain verification), [UCP guide, prepare your Merchant Center account](https://developers.google.com/merchant/ucp/guides/overview/merchant-center).
- Perplexity: [Shop like a Pro](https://www.perplexity.ai/hub/blog/shop-like-a-pro) (free Merchant Program). Copilot: [news write-up of the Copilot Merchant Program](https://www.websitebuilderexpert.com/news/copilot-merchant-program/).
- How AI apps source products (secondary sources): [BigCommerce merchant guide](https://www.bigcommerce.com/articles/ecommerce/get-products-into-chatgpt-google-ai-mode-perplexity/), [Botify, ACP vs UCP](https://www.botify.com/blog/acp-vs-ucp).
- Our code: dinkuskit `migrations/merchant/0003`, `0004`, `0007`; template-store `src/features/commerce-feeds/agent-feeds.ts`, `src/pages/feeds/`; Commerce `src/features/feeds/`.
- Not checked: WooCommerce and BigCommerce have no cross-store catalog of their own that I know of, so there is no second giant to copy here. The Agentic plan's price and terms. Whether Shopify lets a store opt out of the Global Catalog.
