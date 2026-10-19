---
title: "Commerce"
summary: "Understand catalog identity, authoritative prices, availability, checkout, and orders."
audience: "Store owners and developers"
product: "DinkusKit Commerce"
version: "Commerce 0.3.0 source at e8eca124; installed release not verified"
draft: true
---

## What Commerce owns

Commerce adds products, prices, cart and checkout orchestration, receipts, and orders to an EmDash site. The storefront supplies the customer-facing pages; installing Commerce does not create those pages automatically. Commerce owns product identity and the amount a customer pays. [Payments](/docs/reference/payments) owns processor connections, and [Inventory](/docs/reference/inventory) owns physical stock when a product is managed.

This reference follows source commit `e8eca12488f992acbaef712d71c9ac1d45b35e78`, whose package and plugin manifest both identify `0.3.0`. The repository's `v0.3.0` tag points to that commit. The package declares the exact EmDash peer `1.2.0`. These facts do not verify an installable Registry artifact or an existing store's compatibility. The README and release-preparation document still contain older `0.2.0` descriptions.

## Product identity and pricing

Use the permanent Commerce item ID to look up a product and submit a cart line. The merchant's SKU is a separate editable attribute; a page URL is a host-owned publishing decision.

Prices use USD integer minor units represented as strings. For example, USD 12.00 is `{ "currency": "USD", "minor": "1200" }`. Regular price is required for a simple product to be listable. A missing price does not mean free. An explicit zero Regular price can be listed, but the paid-checkout path must be verified separately. A Sale price requires Regular and must be strictly lower. The customer-facing price is Sale when present, otherwise Regular.

The public catalog filters archived and nonlistable products. Product families with options expose variant members; they can omit the top-level price. Choose a sellable member and use its `catalogItemId` for checkout. Do not assume every catalog object has a price or that a family ID can be purchased without a choice.

## Availability

Unmanaged products use Commerce's manual availability: `in-stock`, `out-of-stock`, or `available-on-backorder`. They do not require an Inventory connection or expose an invented quantity.

Managed products use their configured provider. Missing setup, malformed provider results, or an unavailable provider must not be interpreted as zero stock or silently replaced with local stock. Treat `availability-unavailable` as unavailable and respect the separate `sellable` and `listable` facts. See the [Inventory reference](/docs/reference/inventory) before enabling managed stock.

## Public storefront routes

Prefix these routes with `/_emdash/api/plugins/<installed-plugin-id>/`. Resolve the actual installed identity; the stable Registry runtime ID in the inspected source is `r_gshdrqaldna3r7sn`, while `dinkus-commerce` identifies the native development entry.

| Route | Method | Contract |
| --- | --- | --- |
| `catalog/public` | GET | A page of public products and an optional opaque cursor. |
| `catalog/public/item?itemId=…` | GET | One projected product or `null`; no canonical page URL. |
| `checkout/guest/readiness` | GET | The installed checkout readiness response. |
| `checkout/guest/prepare` | POST | An empty request creates a server-issued guest capability. |
| `checkout/guest/start` | POST | Cart lines and required contact details, authorized by that capability. |
| `checkout/guest/status` | POST | The authorized purchase's current checkout projection. |

The catalog accepts only its documented query keys. Continue pagination until no cursor remains, including pages whose filtered product list is empty. Media entries carry EmDash media IDs; the host resolves public image URLs.

Checkout rereads authoritative prices and availability. Never send a browser-computed price, tenant, provider choice, or order status as authority. See [site integration](/docs/developers/integrate) for the purchase flow.

## Installed checkout and orders

Current Registry source reads `installedCheckout` and the secret `storeKey` setting, obtains scoped passes from DinkusKit, and calls hosted Payments. Empty or disabled configuration keeps checkout unavailable. The source now includes network grants and hosted integration; older descriptions of an entirely unwired Registry checkout are historical.

Commerce's activation hook schedules payment reconciliation every five minutes. Reconciliation requires a persisted paid checkout order before acknowledging its payment notice. The separate handoff to the Orders module catches receiver failures so it can be retried; acknowledgement alone is therefore not independent proof that the Orders screen displays the order. A browser return cannot establish payment success. Use the [test-order checks](/docs/store-owners/test-order) and confirm the order in Commerce's Orders screen.

## Next steps

Start with [your first product](/docs/store-owners/first-product), or build the host in [Integrate DinkusKit into a site](/docs/developers/integrate).

## Sources and verification limits

Read-only source reconciliation performed on 2026-10-19. No installed-store or provider transaction was run for this draft.

- [Package and exports at the inspected commit](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/package.json)
- [Public catalog projection](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/catalog/public.ts)
- [Price rules](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/catalog/price.ts)
- [Registry routes and scheduled reconciliation](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/plugin.ts)
- [Installed checkout services](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/registry-services.ts)
- [Installation identities](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/shared/plugin-identity.ts)
- [Payment-notice acknowledgement](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/wake.ts)
- [Retryable Orders handoff](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/paid-orders.ts)
