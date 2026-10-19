---
title: "Integrate DinkusKit into a site"
summary: "Build a storefront around Commerce's public catalog and capability-based purchase flow."
audience: "Developers"
product: "DinkusKit Commerce and Payments"
version: "Commerce 0.3.0 source contract; installed example verification pending"
draft: true
---

## Outcome and prerequisites

Your storefront displays Commerce products and delegates the purchase to Commerce. The host owns pages, navigation, public media URLs, and shopper interaction. It does not become a pricing or payment engine.

Use an existing EmDash site with a qualified Commerce Registry installation, a configured canonical site origin, a priced product, and an explicitly TEST Payments connection. This draft identifies the current source contracts. A working example on an installed Registry release and a saved TEST order remain required before publication.

The inspected Commerce package is `0.3.0`, with exact EmDash peer `1.2.0`. Registry installations are the supported product; native `createPlugin()` and `dinkusCommerce()` are developer and test entries. Native success alone does not prove the existing-site Registry journey.

## Resolve the installed routes

Use the runtime identity of the actual installation in `/_emdash/api/plugins/<installed-plugin-id>/`. The inspected stable Registry identity is `r_gshdrqaldna3r7sn`; beta is `r_fjzjvld3ssb4j63o`. Do not copy the native slug `dinkus-commerce` into a Registry URL.

Read `GET catalog/public`, then follow every returned cursor until it is absent. Empty pages can still have a cursor because Commerce filters nonlistable rows. For a product page, `GET catalog/public/item?itemId=…` returns the projected product or `null`. The host maps the permanent item ID to its own published page and resolves media IDs into image URLs.

Respect `availability.listable` and `availability.sellable`. An option-bearing product family may omit a top-level `price`; its `variants.members` carry the purchasable member IDs, selections, prices, and availability. Checkout uses the selected member's `catalogItemId`.

## Preserve Commerce's authority

The supported cart line shape contains identity and quantity only:

```json
{
  "lines": [
    { "catalogItemId": "selected-commerce-item-id", "quantity": 1 }
  ]
}
```

The ID above is an example placeholder, not a product to install. Commerce reads prices and availability again at checkout. Current start input also supports `contact`; collect it according to the selected version's checkout-contact contract and the requirements returned by prepare. The lines-only fragment above is not a complete checkout for a store requiring contact details.

## Use prepare, start, and status

1. Call `POST checkout/guest/prepare` with `{}` from the configured same-origin site. Prepare creates a server-issued capability without starting a payment.
2. Retain the returned `capability.capability` before calling start. The result names `x-commerce-guest-capability` as the header for later calls.
3. Call `POST checkout/guest/start` with cart lines and required contact input, passing that header. Show the server projection and navigate to its `checkout.redirectUrl` when present.
4. On return, call `POST checkout/guest/status` with `{}` and the same capability. Render the returned `checkout.state`, order projection, or recoverable error. The return URL itself is not evidence of payment.

The browser cannot mint tenant, cart, order, or attempt authority. Keep the capability out of URLs and logs. A trusted same-origin server wrapper can retain it and replay the header; a guessed cart ID cannot replace it.

Guest writes require the trusted configured origin, the request origin, and the admitted browser or wrapper headers to agree. A server wrapper must send `Origin` matching that configured site origin. The routes do not accept an arbitrary cross-origin storefront.

Retry an unresolved purchase with its existing capability. Once paid, the same capability remains associated with that purchase; a later new purchase starts with a fresh prepare. Keep the old capability separately if the interface still displays the earlier receipt.

## Check the result

Verify anonymous catalog reads, listability, variant selection if used, disabled purchase controls for unavailable products, and retained capabilities across the provider return. Exercise an unavailable Payments configuration and confirm that the UI shows the returned failure instead of success.

Then run the [TEST order checks](/docs/store-owners/test-order): provider lookup must confirm payment, and Commerce must save the order visible in Orders. Record installed plugin identities, versions, host build, and test result. These runtime checks have not been performed for this draft.

## Next steps

Read [Commerce](/docs/reference/commerce) for the catalog and order boundary, [Payments](/docs/reference/payments) for confirmation, and [extension surfaces](/docs/developers/add-on) for host additions.

## Sources and verification limits

Read-only source reconciliation performed on 2026-10-19. No runnable installed-store example is claimed.

- [Public catalog source](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/catalog/public.ts)
- [Actual Registry route declarations](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/plugin.ts)
- [Prepare, start, and status input admission](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/guest.ts)
- [Public checkout projection](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/project.ts)
- [Checkout contact contract](https://github.com/dinkuskit/commerce/tree/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout-contact)
- [Installation identities](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/shared/plugin-identity.ts)
