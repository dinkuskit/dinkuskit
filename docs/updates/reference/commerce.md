---
article: reference/commerce
base: sha256:0b1d3137a8e3f3ca6957d8b1b805d3e6ab722bad45ba8e210af43b794dac06ec
title: "Commerce"
summary: "Understand catalog identity, authoritative prices, availability, checkout, and orders."
audience: "Store owners and developers"
product: "DinkusKit Commerce"
version_scope: "Commerce 0.6.0"
---

## What Commerce owns

Commerce adds products, prices, cart and checkout orchestration, receipts, orders and shopper accounts to an EmDash site. The storefront supplies the customer-facing pages; installing Commerce does not create those pages automatically. Commerce owns product identity and the amount a customer pays. [Payments](/docs/reference/payments) owns processor connections, [Ship](/docs/reference/ship) owns shipping labels, and [Inventory](/docs/reference/inventory) owns physical stock when a product is managed.

This reference describes Commerce `0.6.0`, released on the EmDash Registry as `dinkus-commerce` on 25 October 2026 (tag `v0.6.0`). It requires EmDash `1.2.0`. Changes merged after that release are not described here until they ship in a stable release.

## Connect to DinkusKit

Commerce connects to DinkusKit.com with a button, and nothing is pasted. An Administrator opens **Dinkus Commerce > Commerce settings** and presses **Connect Commerce**. The business owner opens the link it shows, signs in at DinkusKit.com and presses **Approve**; anyone helping can send the owner the same link. Commerce then gets its own store key and keeps it, with the Store ID, in its encrypted DinkusKit connection setting.

Commerce connects first: its Connect makes the store at DinkusKit.com, and Payments and Ship then join that store with their own Connect. After Connect, Commerce fetches its checkout settings from DinkusKit.com itself, when you press **Get checkout settings** and again on every background check. Choose shipping and TEST or live mode in **Set up Commerce** on DinkusKit.com. If DinkusKit.com no longer knows the store key, the page asks you to Connect again.

Stores that upgraded from `0.4.0` press Connect once; the old Checkout settings and Store key boxes are gone. Connect accepts only Registry installs.

## Admin screens

The store admin uses EmDash's built-in Block Kit screens only. Commerce adds a **Dinkus Commerce** folder to the sidebar with two pages:

| Page | What it does |
| --- | --- |
| **Orders** | Lists orders. **Inspect #N** opens one, with its status, payment and shipping. |
| **Commerce settings** | Connect, checkout settings, catalog choices (hide out-of-stock products, a placeholder image for products without one), and **Products without a page**, each with **Make a page**. |

There is no separate Commerce Products page. Products are managed on the site's own product pages, described next.

## One product screen

**Content > Products** is the one place to manage a product. Each product page has a **Dinkus Commerce** panel beside the editor.

- On a page with no product, press **Add price and stock**. It makes a Draft product named from the page title, with the SKU you type or one made from the title, and links it to the page. EmDash asks you to apply the link; the page keeps it when you press **Save**. The panel also lists products without a page, so one can be sold on this page instead.
- On a linked page, the panel shows the product's state (Draft, On sale or Archived) and SKU, and edits its name, price and sale price, stock status, choices, weight, photos, and GTIN, MPN and Brand. **Archive** takes it off the shop; **Restore** brings it back as a Draft.

Publishing the page puts the product on sale, and unpublishing or deleting the page takes it off. A new product is a Draft, not buyable, until its page is published. The store's publish check makes this change through a private Commerce route; Commerce itself never reads the CMS.

To show this panel, Commerce `0.6.0` asks for two new permissions when it is installed or upgraded: `admin.editor-draft:read`, to read the page's title and product link, and `admin.editor-draft:patch`, to set only the page's `commerce_item_id` field.

## Product identity and pricing

Use the permanent Commerce item ID to look up a product and submit a cart line. The merchant's SKU is a separate editable attribute; a page URL is a host-owned publishing decision.

Prices use USD integer minor units represented as strings. For example, USD 12.00 is `{ "currency": "USD", "minor": "1200" }`. Regular price is required for a simple product to be listable. A missing price does not mean free. An explicit zero Regular price can be listed, but the paid-checkout path must be verified separately. A Sale price requires Regular and must be strictly lower. The customer-facing price is Sale when present, otherwise Regular.

The public catalog filters archived, Draft and nonlistable products. A product can have up to three options (such as Color and Size), up to fifty values per option, and up to fifty variant members. Product families with options expose variant members; they can omit the top-level price. Choose a sellable member and use its `catalogItemId` for checkout. Do not assume every catalog object has a price or that a family ID can be purchased without a choice.

Public catalog list and item responses also carry the feed channels the merchant approved for each product, so a storefront host can build public product feeds without admin reads. A product with no approved channel is never included.

## Availability

Unmanaged products use Commerce's manual availability: `in-stock`, `out-of-stock`, or `available-on-backorder`. They do not require an Inventory connection or expose an invented quantity.

Inventory is planned after v1, and the Registry build has no Manage stock switch. Begin with unmanaged products. Missing setup, malformed provider results, or an unavailable provider must not be interpreted as zero stock or silently replaced with local stock. Treat `availability-unavailable` as unavailable and respect the separate `sellable` and `listable` facts. See the [Inventory reference](/docs/reference/inventory).

## Public storefront routes

Prefix these routes with `/_emdash/api/plugins/<installed-plugin-id>/`. Resolve the actual installed identity; the stable Registry runtime ID is `r_gshdrqaldna3r7sn`, while `dinkus-commerce` identifies the native development entry.

| Route | Method | Contract |
| --- | --- | --- |
| `catalog/public` | GET | A page of public products and an optional opaque cursor. |
| `catalog/public/item?itemId=…` | GET | One projected product or `null`; no canonical page URL. |
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

Agents and command-line tools read and complete orders through the private `orders` route with an EmDash API token that can manage plugins.

## US delivery addresses

A new checkout that ships a physical order to the United States needs a supported US state or the District of Columbia. Commerce accepts the two-letter abbreviation or the full name. Destinations outside the United States that the merchant configured, saved addresses and checkouts already started are not affected.

## Shopper accounts

Shoppers can sign in to the storefront with their email address and a 6-digit code, with no password. Commerce sends the code through the site's EmDash email service, so the site needs working email for sign-in. A code lasts 10 minutes, allows 5 tries, and a new one can be requested after 30 seconds.

A signed-in shopper sees every order placed with the same email address, newest first, including its status, carrier and tracking number when the order has shipped. The account keeps one saved delivery address and phone number, filled in from the shopper's latest order until the shopper changes or clears them.

Shopper accounts are stored by Commerce. They are not EmDash users and give no access to the EmDash admin. The storefront sends the session in the `x-commerce-customer-session` header; the session works only on the site that issued it.

## Installed checkout and orders

The Registry build trades its own store key at DinkusKit.com for short-lived scoped passes and calls hosted Payments and Ship with them. The key never goes to Payments, Ship or a store page. A store that is not connected, or whose checkout settings are missing or turned off, keeps checkout unavailable.

Commerce runs a background check every five minutes while it is switched on. It settles payments a shopper never returned from, refreshes the checkout settings, then brings Orders and Ship up to date. If the site's scheduler fails or stalls when Commerce is switched on, the next request to Commerce registers the check instead, so the plugin does not need switching off and on.

Reconciliation requires a persisted paid checkout order before acknowledging its payment notice. The separate handoff to the Orders module catches receiver failures so it can be retried; acknowledgement alone is therefore not independent proof that the Orders screen displays the order. A browser return cannot establish payment success. Use the [test-order checks](/docs/store-owners/test-order) and confirm the order in Commerce's Orders screen.

Coupon codes are refused at checkout on Registry stores in this release.

## Next steps

Start with [your first product](/docs/store-owners/first-product), or build the host in [Integrate DinkusKit into a site](/docs/developers/integrate).

## Sources and verification limits

Read-only source review of the `v0.6.0` release on 2026-10-25. The release's beta, `0.6.0-beta.1`, passed all 15 live test journeys on the beta store before release. No provider transaction was run for this update.

- [Release notes](https://github.com/dinkuskit/commerce/releases/tag/v0.6.0) and [changelog](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/CHANGELOG.md)
- [Plugin manifest](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/emdash-plugin.jsonc)
- [Registry routes and background check](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/plugin.ts)
- [One product screen](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/implementation/one-product-screen.md)
- [Connect to DinkusKit](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/registry-connect.ts)
- [Shopper accounts contract](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/contracts/shopper-accounts.md)
- [Product variant model](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/contracts/product-variant-model.md)
- [Public catalog projection](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/catalog/public.ts)
- [Price rules](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/catalog/price.ts)
