---
article: developers/integrate
base: sha256:6cd75bfff5d94e2b18403a169405a9d81a2d0cc1f4a660a5e3b08cdce4b9c632
title: "Integrate DinkusKit into a site"
summary: "Build a storefront around Commerce's public catalog and capability-based purchase flow."
audience: "Developers"
product: "DinkusKit Commerce and Payments"
version_scope: "Commerce 0.6.0 Registry HTTP contracts; EmDash 1.2.0"
---

## Outcome and prerequisites

Your storefront displays Commerce products and delegates the purchase to Commerce. The host owns pages, navigation, public media URLs, and shopper interaction. It does not become a pricing or payment engine.

Use an existing EmDash site with Commerce 0.6.0 installed from the Registry and connected to DinkusKit.com, a configured canonical site origin, a published priced product and a Stripe TEST Payments connection. This guide describes the HTTP contract; the cart-line example is a request fragment, not a complete storefront.

Commerce 0.6.0 declares EmDash 1.2.0 as its exact peer. Registry installations are the supported merchant product, and only they can Connect to DinkusKit.com. Native createPlugin() and dinkusCommerce() entries are for development and tests; they do not replace the installed Registry routes.

## Resolve the installed routes

Use the runtime identity of the actual installation in `/_emdash/api/plugins/<installed-plugin-id>/`. The inspected stable Registry identity is `r_gshdrqaldna3r7sn`; beta is `r_fjzjvld3ssb4j63o`. Do not copy the native slug `dinkus-commerce` into a Registry URL.

Read `GET catalog/public`, then follow every returned cursor until it is absent. Empty pages can still have a cursor because Commerce filters nonlistable rows. For a product page, `GET catalog/public/item?itemId=…` returns the projected product or `null`. The host maps the permanent item ID to its own published page and resolves media IDs into image URLs.

Respect `availability.listable` and `availability.sellable`. An option-bearing product family may omit a top-level `price`; its `variants.members` carry the purchasable member IDs, selections, prices, and availability. Checkout uses the selected member's `catalogItemId`.

## Give products a page

Owners manage products on the site's **Content > Products** pages, through Commerce's **Dinkus Commerce** editor panel, so the host must provide:

- a `products` collection whose pages have a `commerce_item_id` field. The panel fills it; nobody pastes an ID.
- a publish check: when a person publishes, unpublishes or deletes a product page, the host calls Commerce's private `catalog-items/set-on-sale` route as that person, so the product goes on or off sale with its page. Commerce never reads the CMS.

Without the publish check, a product made from the panel stays a Draft and the public catalog leaves it out. Template Store's publish check is the reference implementation.

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

Then follow the TEST order checks: confirm a provider-paid TEST payment and the matching Commerce Orders entry. Record the installed versions, plugin identities and host build so the result applies to your integration.

## Next steps

Read [Commerce](/docs/reference/commerce) for the catalog and order boundary, [Payments](/docs/reference/payments) for confirmation, and [extension surfaces](/docs/developers/add-on) for host additions.

## Sources

The route names were checked against the Commerce 0.6.0 release source. Template Store provides a source example. Confirm its compatibility with your theme and installed release before adapting it.

- [Public catalog source](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/catalog/public.ts)
- [Registry route declarations](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/plugin.ts)
- [Prepare, start, and status input admission](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/guest.ts)
- [Public checkout projection](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/project.ts)
- [Checkout contact contract](https://github.com/dinkuskit/commerce/tree/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout-contact)
- [Installation identities](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/shared/plugin-identity.ts)
- [One product screen and the on-sale route](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/implementation/one-product-screen.md)
- [Template Store publish check](https://github.com/dinkuskit/template-store/blob/bcbfe13629fb972ca4af28e3480bf2da45558b0b/FEATURE_MAP.md)
