---
article: reference/commerce
base: sha256:d758f421099d0e28f58d6f1087965e73f902de341674a0e92246d0dd2551e2d7
title: "Commerce"
summary: "Understand catalog identity, authoritative prices, availability, checkout, and orders."
audience: "Store owners and developers"
product: "DinkusKit Commerce"
version_scope: "Commerce 0.4.0"
---

## What Commerce owns

Commerce adds products, prices, cart and checkout orchestration, receipts, orders and shopper accounts to an EmDash site. The storefront supplies the customer-facing pages; installing Commerce does not create those pages automatically. Commerce owns product identity and the amount a customer pays. [Payments](/docs/reference/payments) owns processor connections, and [Inventory](/docs/reference/inventory) owns physical stock when a product is managed.

This reference describes Commerce `0.4.0`, released on the EmDash Registry as `dinkus-commerce` on 21 October 2026 (tag `v0.4.0`). It requires EmDash `1.2.0`. Changes merged after that release are not described here until they ship in a stable release.

## Product identity and pricing

Use the permanent Commerce item ID to look up a product and submit a cart line. The merchant's SKU is a separate editable attribute; a page URL is a host-owned publishing decision.

Prices use USD integer minor units represented as strings. For example, USD 12.00 is `{ "currency": "USD", "minor": "1200" }`. Regular price is required for a simple product to be listable. A missing price does not mean free. An explicit zero Regular price can be listed, but the paid-checkout path must be verified separately. A Sale price requires Regular and must be strictly lower. The customer-facing price is Sale when present, otherwise Regular.

The public catalog filters archived and nonlistable products. Product families with options expose variant members; they can omit the top-level price. Choose a sellable member and use its `catalogItemId` for checkout. Do not assume every catalog object has a price or that a family ID can be purchased without a choice.

Public catalog list and item responses also carry the feed channels the merchant approved for each product, so a storefront host can build public product feeds without admin reads. A product with no approved channel is never included.

## Availability

Unmanaged products use Commerce's manual availability: `in-stock`, `out-of-stock`, or `available-on-backorder`. They do not require an Inventory connection or expose an invented quantity.

Inventory is planned after v1. Begin with unmanaged products for the supported first-store journey. Existing managed products use their configured provider. Missing setup, malformed provider results, or an unavailable provider must not be interpreted as zero stock or silently replaced with local stock. Treat `availability-unavailable` as unavailable and respect the separate `sellable` and `listable` facts. See the [Inventory reference](/docs/reference/inventory) before enabling managed stock.

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

## US delivery addresses

A new checkout that ships a physical order to the United States needs a supported US state or the District of Columbia. Commerce accepts the two-letter abbreviation or the full name. Destinations outside the United States that the merchant configured, saved addresses and checkouts already started are not affected.

## Shopper accounts

Shoppers can sign in to the storefront with their email address and a 6-digit code, with no password. Commerce sends the code through the site's EmDash email service, so the site needs working email for sign-in. A code lasts 10 minutes, allows 5 tries, and a new one can be requested after 30 seconds.

A signed-in shopper sees every order placed with the same email address, newest first, including its status, carrier and tracking number when the order has shipped. The account keeps one saved delivery address and phone number, filled in from the shopper's latest order until the shopper changes or clears them.

Shopper accounts are stored by Commerce. They are not EmDash users and give no access to the EmDash admin. The storefront sends the session in the `x-commerce-customer-session` header; the session works only on the site that issued it.

## Installed checkout and orders

The Registry build reads `installedCheckout` and the secret `storeKey` setting, obtains scoped passes from DinkusKit, and calls hosted Payments. Empty or disabled configuration keeps checkout unavailable.

Commerce runs a background check every five minutes while it is switched on. It settles payments a shopper never returned from, then brings Orders and Ship up to date. If the site's scheduler fails or stalls when Commerce is switched on, the next request to Commerce registers the check instead, so the plugin does not need switching off and on.

Reconciliation requires a persisted paid checkout order before acknowledging its payment notice. The separate handoff to the Orders module catches receiver failures so it can be retried; acknowledgement alone is therefore not independent proof that the Orders screen displays the order. A browser return cannot establish payment success. Use the [test-order checks](/docs/store-owners/test-order) and confirm the order in Commerce's Orders screen.

## Next steps

Start with [your first product](/docs/store-owners/first-product), or build the host in [Integrate DinkusKit into a site](/docs/developers/integrate).

## Sources and verification limits

Read-only source review of the `v0.4.0` release on 2026-10-22. No installed-store or provider transaction was run for this update.

- [Release notes](https://github.com/dinkuskit/commerce/releases/tag/v0.4.0) and [changelog](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/CHANGELOG.md)
- [Plugin manifest](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/emdash-plugin.jsonc)
- [Registry routes and background check](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/src/plugin.ts)
- [Shopper accounts contract](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/docs/contracts/shopper-accounts.md)
- [Public catalog projection](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/src/features/catalog/public.ts)
- [Price rules](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/src/features/catalog/price.ts)
- [Installed checkout services](https://github.com/dinkuskit/commerce/blob/96bcecdd1da93b8081e04bc95ef46e21ab294671/src/features/checkout/registry-services.ts)
