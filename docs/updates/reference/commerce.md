---
article: reference/commerce
base: sha256:042811cb89bf1d74ba5906750bbf3c5d0877a93b518a04db7f006784e122b8e3
title: "Commerce"
summary: "Understand catalog identity, authoritative prices, availability, checkout, and orders."
audience: "Store owners and developers"
product: "DinkusKit Commerce"
version_scope: "Commerce 0.8.0"
---

## What Commerce owns

Commerce adds products, prices, cart and checkout orchestration, receipts, orders and shopper accounts to an EmDash site. The storefront supplies the customer-facing pages; installing Commerce does not create those pages automatically. Commerce owns product identity and the amount a customer pays. [Payments](/docs/reference/payments) owns processor connections, [Ship](/docs/reference/ship) owns shipping labels, and [Inventory](/docs/reference/inventory) owns physical stock when a product is managed.

This reference describes Commerce `0.8.0`, released on the EmDash Registry as `dinkus-commerce` on 1 November 2026 (tag `v0.8.0`). It requires EmDash `1.4.0`. Changes merged after that release are not described here until they ship in a stable release.

## Connect to DinkusKit

Commerce connects to DinkusKit.com with a button, and nothing is pasted. An Administrator opens **Dinkus Commerce > Commerce settings** and, under **Connect Commerce**, presses **Connect**. The business owner opens the link it shows, signs in at DinkusKit.com and presses **Approve**; anyone helping can send the owner the same link. Commerce then gets its own store key and keeps it, with the Store ID, in its encrypted DinkusKit connection setting.

Commerce connects first: its Connect makes the store at DinkusKit.com, and Payments and Ship then join that store with their own Connect. After Connect, Commerce fetches its checkout settings from DinkusKit.com itself, when you press **Get checkout settings** and again on every background check. Choose shipping and TEST or live mode in **Set up Commerce** on DinkusKit.com. Shipping is free or a flat charge; a flat charge can also be free once an order's goods, after any discount, reach an amount you set there. A checkout with only digital items pays no shipping, whichever you choose; one physical item in the basket brings the charge back, once per checkout. If DinkusKit.com no longer knows the store key, the page asks you to Connect again.

Stores that upgraded from `0.4.0` press Connect once; the old Checkout settings and Store key boxes are gone. Connect accepts only Registry installs.

## Admin screens

The store admin uses EmDash's built-in Block Kit screens only. Commerce adds a **Dinkus Commerce** folder to the sidebar with two pages:

| Page | What it does |
| --- | --- |
| **Orders** | Lists orders. **Inspect #N** opens one, with its status, payment, the customer's email and phone, and the Ship to and Bill to addresses. |
| **Commerce settings** | Connect, checkout settings, and catalog choices (hide out-of-stock products, a placeholder image for products without one). |

There is no separate Commerce Products page. Products are managed on the site's own product pages, described next.

Staff with the EmDash **Editor** role can manage products and merchant store settings and work **Orders**: inspect, Complete order, Move back to Processing and Correct address. Connecting DinkusKit and checkout setup need an **Administrator**. Orders shows each customer's email, phone and addresses, so give the Editor role only to people you trust with them.

## Merchant store settings

In **Commerce settings**, choose the store country and the physical
shipping destinations. On the first country save, blank destinations default
to that country. Later changes to the store country preserve the destinations;
a saved empty list enables none. The phone requirement can be saved before a
country is chosen.

Checkout checks the shipping destinations for a new physical checkout. With no
destinations enabled, a physical basket cannot proceed to payment. There is no
separate selling/customer country list, and billing may be in any country. These settings do not collect a
billing address or determine taxes or currency.

## One product screen

**Content > Products** is the one place to manage a product. Each product page has two panels beside the editor: **Dinkus Commerce** and **Product image & gallery**.

- A page with no product opens on its price form: Regular, Sale, an optional SKU (made from the title if left blank), Stock status, a **Physical product** switch and Weight. **Save** makes a Draft product named from the page title, with those values, and links it to the page. Commerce keeps the link, so there is no product box on the page to fill in or save. Every product is made for its page this way, and a page sells one product, so there are no products without a page to sort out.
- A linked page shows the product's status (Draft, On sale, Published: off the shop or Archived), SKU and name, then cards like a Shopify product form. A simple product has **Pricing & stock** (Regular, Sale, SKU and Stock status, one Save) open, then **Variants**, **Shipping** (weight in ounces, for physical products) and **Identifiers** (GTIN, MPN and Brand) collapsed. A product with options has no product-level price: its **Variants** card is open with the first variant's card inside it, and the other variants, Shipping and Identifiers are collapsed. After a save or a refusal the card it concerned is the open one. A Save from a form loaded before another editor's save is refused whole, SKU included, and a variant's card is refused when its SKU changed under it; reload the product to see their change first. **Archive** takes it off the shop; **Restore** brings it back as a Draft.
- A product is simple until it has an option. The collapsed **Variants** card asks for an option name, such as Size, and its values, comma-separated: **Add options** makes the product variable, with the product itself as the first variant and a new variant for each other value, its SKU made from the product's SKU and the value; one Save makes up to seven new variants, and **Add a variant** adds more. Each variant is then its own card with Regular, Sale, SKU and Stock status; **Edit options** renames options and values and sets each variant's fulfillment; **Add another option** (up to three) and **Add a variant** (up to fifty) extend it.
- **Product image & gallery** chooses the product's picture and up to eight gallery pictures from the Media Library, in order. It works once the page sells a product; until then it points to **Dinkus Commerce**.
- A product with no Regular price is not for sale, so the panel says **Add a Regular price to sell it**, and a published page's product reads **Published: off the shop** until it has one. Saving with Regular empty answers with the same words instead of **Product saved**.
- The page title is the product's name. Publishing the page copies the title to the product, so the shop, cart, checkout and new orders show it. Paid orders keep the name they were bought under. To rename a product, change the page title and publish. A store must have the publish check that sends the title (DinkusKit Template Store from template-store#158) before it upgrades to this Commerce; until then products keep their current names.

Publishing the page puts the product on sale, and unpublishing or deleting the page takes it off. A new product is a Draft, not buyable, until its page is published. The store's publish check makes this change through a private Commerce route; Commerce itself never reads the CMS.

To show this panel, Commerce asks for the `admin.editor-draft:read` permission when it is installed or upgraded, to read the page's title. Commerce `0.6.0` also asked for `admin.editor-draft:patch`, to fill the page's **Commerce product** field; later versions keep the link themselves and no longer ask for it. Update the store's template along with Commerce: a template that still reads the page's **Commerce product** field when it publishes puts only pages with that field filled on sale, and new pages no longer get it.

## Saving and upgrading catalog data

Price and stock-status saves, including submitted feed channels, commit together.
A competing product edit refuses the staged rows for that product without a
partial save. A **Save weight** action commits all submitted variant weights
together. These
actions work within EmDash's default ten-subrequest sandbox limit. If another
editor changes the product after a form opens, reload before saving again.

If a save succeeds but the panel cannot refresh, Commerce says the changes were
saved and offers **Reload product**. If the write outcome cannot be confirmed,
it says **Save outcome unknown**; reload to check the values before submitting
again. An error is not a reason to assume nothing was stored.

Existing product IDs, SKUs and order snapshots remain unchanged. Old values are
read until each field is saved in the new product record. Cleared values stay
cleared. This transition retains old records but does not write changes back to
them. Run one Commerce version at a time; downgrading after these saves requires
an explicit data conversion. Do not run old and new binaries as concurrent writers.

For direct kernel consumers, price, manual-availability and feed-eligibility
readers now require the catalog reader as their third argument. Use these
readers or the catalog API, rather than reading the legacy collections directly;
raw legacy records may no longer be current. A product supports at most fifty
variants, and saves exceeding the host's 1 MiB record limit are refused before
writing.

## Product identity and pricing

Use the permanent Commerce item ID to look up a product and submit a cart line. The merchant's SKU is a separate editable attribute; a page URL is a host-owned publishing decision.

Prices use USD integer minor units represented as strings. For example, USD 12.00 is `{ "currency": "USD", "minor": "1200" }`. Regular price is required for a simple product to be listable. A missing price does not mean free. An explicit zero Regular price can be listed, but the paid-checkout path must be verified separately. A Sale price requires Regular and must be strictly lower. The customer-facing price is Sale when present, otherwise Regular.

The public catalog filters archived, Draft and nonlistable products. A product can have up to three options (such as Color and Size), up to fifty values per option, and up to fifty variant members. Product families with options expose variant members without a top-level price. Choose a sellable member and use its `catalogItemId` for checkout. Looking up a concrete member through `catalog/public/item?itemId=…` returns its public family, whose `id` can differ from the requested member. When refreshing a cart, find that member in `variants.members` and use its own price, availability and fulfillment; do not substitute a sibling or the family's top-level facts. Paginated catalog rows are grouped the same way. Do not assume every catalog object has a price or that a family ID can be purchased without choosing a variant.

Public catalog list and item responses also carry the feed channels the merchant approved for each product, so a storefront host can build public product feeds without admin reads. A product with no approved channel is never included.

## Availability

Unmanaged products use Commerce's manual availability: `in-stock`, `out-of-stock`, or `available-on-backorder`. They do not require an Inventory connection or expose an invented quantity.

Inventory is planned after v1, and the Registry build has no Manage stock switch. Begin with unmanaged products. Missing setup, malformed provider results, or an unavailable provider must not be interpreted as zero stock or silently replaced with local stock. Treat `availability-unavailable` as unavailable and respect the separate `sellable` and `listable` facts. See the [Inventory reference](/docs/reference/inventory).

## Public storefront routes

Prefix these routes with `/_emdash/api/plugins/<installed-plugin-id>/`. Resolve the actual installed identity; the stable Registry runtime ID is `r_gshdrqaldna3r7sn` and the beta package's is `r_fjzjvld3ssb4j63o`. Commerce runs one build, the Registry build; `dinkus-commerce` identifies the native development entry only the Template Store's playground still registers. It serves these routes except `policies/public` and `checkout/guest/readiness`, which the Registry build alone registers.

| Route | Method | Contract |
| --- | --- | --- |
| `catalog/public` | GET | A page of public products and an optional opaque cursor. Each product carries `page`, the entry id of the page that sells it, once that page is published. |
| `catalog/public/item?itemId=…` or `?pageId=…` | GET | One projected product or `null`; no canonical page URL. With `pageId`, the product that published page sells. |
| `policies/public` | GET | The store's published policies. |
| `checkout/guest/readiness` | GET | The installed checkout readiness response. |
| `checkout/guest/prepare` | POST | An empty request creates a server-issued guest capability. |
| `checkout/guest/start` | POST | Cart lines and required contact details, authorized by that capability. |
| `checkout/guest/status` | POST | The authorized purchase's current checkout projection. |
| `account/sign-in/start` | POST | Emails a shopper a 6-digit sign-in code. |
| `account/sign-in/verify` | POST | Exchanges the code for a shopper session. |
| `account/sign-out` | POST | Ends the shopper session. |
| `account/orders` | GET | The signed-in shopper's orders. |
| `account/profile` | GET, POST | The signed-in shopper's saved delivery address and phone. |

The catalog accepts only its documented query keys. Continue pagination until no cursor remains, including pages whose filtered product list is empty. Media entries carry EmDash media IDs; the host resolves public image URLs.

Checkout rereads authoritative prices and availability. Never send a browser-computed price, tenant, provider choice, or order status as authority. See [site integration](/docs/developers/integrate) for the purchase flow.

Agents and command-line tools read and complete orders through the private `orders` route with an EmDash API token of an Editor or Administrator (EmDash still requires the token's `admin` scope). Each order carries `shipTo` and `billTo` as full addresses and `billToMatchesShipTo`, true when the two are the same. The `address` action is the Orders page's Correct address: it replaces `shipTo` on a Processing order at the order version it read, with the same checks as checkout and only to a country the store ships to, and never changes billing. Move a Completed order back to Processing first.

Agents and command-line tools manage products through the private `catalog` route (POST) with an EmDash API token that can edit content. Each request names one `op` and runs the same checks as the product page panels:

| `op` | Does |
| --- | --- |
| `list` | Lists products: id, name, SKU, and when it was archived. |
| `get` | One product (`catalogItemId`) with its options, variants, prices, pictures and feed channels. With `entryId` instead, the product that page sells: the one its panel picked, else the one it last sold; `product: null` when it sells none. |
| `create` | Makes a Draft from `name` and `sku` for the product page `entryId`, which is required: make the page first. It is the panel's first Save: `fulfillment` (`physical`, the default, or `digital`), `regular`, `sale`, `stockStatus` and `weightOz` are saved in the same call when given (a digital product's weight is refused before anything is made), and the answer carries the price form (`price`, with `saved: false` and a message when the price was refused). A page that already sells a product is refused. Send a `commandId` so a retry finds the same product. |
| `prices`, `option`, `labels`, `sku`, `weight`, `identifiers`, `archive`, `media`, `feeds` | Change prices and stock status, options and their labels, the SKU, weight, GTIN/MPN/Brand, Archive or Restore, pictures, and product feed eligibility. |

Publishing the page still puts the product on sale, so an agent sells a product by making its page through EmDash, creating the product with the page's `entryId`, pricing it and publishing its page through EmDash. Commerce keeps the link, as it does for the panel, and the page has no product field to set. A store whose template predates this still reads the page's own **Commerce product** field (`commerce_item_id`) when it publishes; there, the agent also sets that field to the product's `catalogItemId`, or the store is updated first. Manage stock stays off, as in the panels. A refused write answers with the reason.

A write may carry `expected`: the first 12 hex digits of the SHA-256 of the product's `get` answer as JSON (for a variant, of its product, named as `productId`). Commerce then saves only while the product still reads that way, so an agent never overwrites a change it did not see.

The `dinkus-commerce` command-line tool wraps these as `products show`, `create`, `set-price`, `set-sale-price`, `set-stock-status`, `set-sku`, `set-weight`, `set-identifiers`, `save-media`, `set-feeds`, `add-option`, `archive` and `restore`. `products create` makes the Content > Products page too (found by slug, or made as a Draft from the name), then the product for it, priced with `--regular`, `--sale`, `--stock-status` and `--weight-oz` when given, so one command does it all. When Commerce refuses that price, the command still reports the Draft it made and exits with `price_refused`. Each change shows a preview with `--dry-run` and is sent only with the `--confirm` value it printed, which Commerce checks before it saves.

Select CLI configuration with `--profile <name>` or `DINKUS_COMMERCE_PROFILE`. A requested name must be explicitly defined in a config file's `profiles` object; inherited names do not count. A missing name or malformed selected profile stops with exit `2` before any HTTP request, rather than silently sending a change to the base site. Profile maps and matching entries must be JSON objects; an explicitly defined empty object still inherits that file's base metadata. Existing configuration precedence and restrictions on sending credentials to project-configured sites are unchanged. See the repository's [CLI specification](https://github.com/dinkuskit/commerce/blob/main/docs/CLI-SPEC.md#configuration-and-authentication) for paths and examples.

The CLI's `--timeout` covers each request through reading its response body. A timeout or dropped connection while receiving a response exits with code `3`, even after response headers arrive, and is not automatically retried. For a write, read the product or order before submitting again: an incomplete response does not prove nothing was saved.

Ctrl-C before a change request starts dispatch exits with code `4`. After a catalog or order change starts dispatch, Ctrl-C exits with code `3` and reports that the outcome is unknown, rather than claiming nothing was sent. Read back the product or order before resubmitting; starting a request is not proof that it reached the store or was saved.

## Billing addresses

Every checkout needs a billing address. The storefront asks for it with "Billing address same as delivery address" ticked by default and sends a full copy; a basket with only digital items asks for it directly. The billing address may be in any country, including when delivery is US only. It is kept with the order as the shopper gave it and cannot be changed after payment; **Correct address** on an order changes only the delivery address. Orders paid before billing addresses were recorded show **Not recorded**.

## US delivery addresses

A new checkout that ships a physical order to the United States needs a supported US state or the District of Columbia. Commerce accepts the two-letter abbreviation or the full name. Destinations outside the United States that the merchant configured, saved addresses and checkouts already started are not affected.

## Shopper accounts

Shoppers can sign in to the storefront with their email address and a 6-digit code, with no password. Commerce sends the code through the site's EmDash email service, so the site needs working email for sign-in. A code lasts 10 minutes, allows 5 tries, and a new one can be requested after 30 seconds.

A signed-in shopper sees every order placed with the same email address, newest first, including its status, carrier and tracking number when the order has shipped. The account keeps one saved delivery address and phone number, filled in from the shopper's latest order until the shopper changes or clears them.

Shopper accounts are stored by Commerce. They are not EmDash users and give no access to the EmDash admin. The storefront sends the session in the `x-commerce-customer-session` header; the session works only on the site that issued it.

## Installed checkout and orders

The Registry build trades its own store key at DinkusKit.com for short-lived scoped passes and calls hosted Payments and Ship with them. The key never goes to Payments, Ship or a store page. A store that is not connected, or whose checkout settings are missing or turned off, keeps checkout unavailable. An explicit readiness flag from Payments other than the boolean `true` blocks creation of a new payment session. Historical payment lookups do not require current payment readiness.

Commerce runs a background check every five minutes while it is switched on. It settles payments a shopper never returned from, refreshes the checkout settings, then brings Orders and Ship up to date. If the site's scheduler fails or stalls when Commerce is switched on, the next request to Commerce registers the check instead, so the plugin does not need switching off and on.

Reconciliation requires a persisted paid checkout order before acknowledging its payment notice. The separate handoff to the Orders module catches receiver failures so it can be retried; acknowledgement alone is therefore not independent proof that the Orders screen displays the order. A browser return cannot establish payment success. Use the [test-order checks](/docs/store-owners/test-order) and confirm the order in Commerce's Orders screen.

Coupon codes are refused at checkout on Registry stores in this release.

## Completing and correcting an order

Open **Orders**, then **Inspect #N**. New orders are **Processing**;
**Completed** means shipped, not delivered. Test orders stay in the normal list
and are marked **TEST**; do not use them for real fulfillment or postage.

- Before shipment, use **Correct address** on a Processing order that has a
  delivery address. The corrected country must be one of the store's shipping
  destinations. This changes where the order goes, not its frozen checkout or
  billing address.
- Without Ship, use **Complete order** to record shipment by hand. Carrier and
  tracking number are optional, at most 64 characters each. Commerce records the
  completion time and shows the order as Completed; this does not buy a label or
  send a shipping email. Signed-in shoppers can see the status, carrier and
  tracking number in their order history when the storefront provides it.
- A Completed order's address is locked. To correct a mistake, choose **Move back
  to Processing** and confirm. This clears the completion time, carrier and
  tracking number, but keeps any corrected delivery address. It does not cancel
  a shipping label. Correct the order and complete it again as appropriate.

If an order changed after you opened its form, the stale save changes nothing.
Open the order again and check its current details before retrying.

## Next steps

Start with [your first product](/docs/store-owners/first-product), or build the host in [Integrate DinkusKit into a site](/docs/developers/integrate).

## Sources and verification limits

This article lives in the Commerce repository, is reviewed with the code it describes, and was published from the `v0.8.0` tag. Each stable release's beta passes the live test journeys on the beta store before release. No provider transaction is run for this article.

- [Release notes](https://github.com/dinkuskit/commerce/releases/tag/v0.8.0) and [changelog](https://github.com/dinkuskit/commerce/blob/v0.8.0/CHANGELOG.md)
- [Plugin manifest](https://github.com/dinkuskit/commerce/blob/v0.8.0/emdash-plugin.jsonc)
- [Registry routes and background check](https://github.com/dinkuskit/commerce/blob/v0.8.0/src/plugin.ts)
- [One product screen](https://github.com/dinkuskit/commerce/blob/v0.8.0/docs/implementation/one-product-screen.md)
- [Connect to DinkusKit](https://github.com/dinkuskit/commerce/blob/v0.8.0/src/features/checkout/registry-connect.ts)
- [Shopper accounts contract](https://github.com/dinkuskit/commerce/blob/v0.8.0/docs/contracts/shopper-accounts.md)
- [Product variant model](https://github.com/dinkuskit/commerce/blob/v0.8.0/docs/contracts/product-variant-model.md)
- [Public catalog projection](https://github.com/dinkuskit/commerce/blob/v0.8.0/src/features/catalog/public.ts)
- [Price rules](https://github.com/dinkuskit/commerce/blob/v0.8.0/src/features/catalog/price.ts)
