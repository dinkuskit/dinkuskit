---
article: start-here
base: sha256:322b7925f75b225b63d13cb69023a0bf0897d8d0fe055ed2dbfd387eafbb84a5
title: "Choose your path and check requirements"
summary: "Start with an existing EmDash site, or find the contracts you need to build and extend one."
audience: "Store owners and developers"
product: "DinkusKit"
version_scope: "EmDash 1.2.0; Commerce 0.6.0; Payments 0.4.0; Ship 0.3.0 (stable Registry); Inventory coming after v1"
---

## Choose your path

DinkusKit adds commerce to an existing EmDash site. Your store's EmDash admin remains the place to manage products and orders. The DinkusKit account at DinkusKit.com connects a business and its stores to the services they are authorized to use.

| You want to… | Start with |
| --- | --- |
| Set up commerce on your existing site | [Set up a store](/docs/store-owners/setup), then [add a product](/docs/store-owners/first-product). |
| Check that the purchase flow works | [Complete and verify a test order](/docs/store-owners/test-order). |
| Build customer-facing product and checkout pages | [Integrate DinkusKit into a site](/docs/developers/integrate). |
| Add functionality alongside DinkusKit | [Build an add-on using supported extension points](/docs/developers/add-on). |
| Change an existing module | [Make and verify a core contribution](/docs/developers/contribute). |

The owner journey finishes with a published product, a provider-confirmed TEST payment, and the matching order in Commerce **Orders**. Test success does not establish live-selling readiness.

## Understand the pieces

- [Commerce](/docs/reference/commerce) owns the catalog, prices, checkout and orders. Products are managed on the site's own **Content > Products** pages, through a **Dinkus Commerce** panel. A storefront still needs to render Commerce's public contracts.
- [Payments](/docs/reference/payments) connects the store to its payment processor and supplies verified payment results.
- [Ship](/docs/reference/ship) buys USPS shipping labels for paid orders. It is outside the required first-test-order journey.

Inventory is planned after v1 and is not required for the first store. Commerce supports unmanaged products with manual availability.

Each plugin connects itself to DinkusKit.com with a button, and nothing is pasted. Commerce connects first, because its Connect makes the store at DinkusKit.com; Payments and Ship then join that store.

There is no separately installable "Kit" package. Template Store is the supporting storefront example; it supplies the product pages, cart and checkout that the plugins do not.

## Check the release versions

The stable EmDash Registry offers Commerce 0.6.0 (`dinkus-commerce`, released 25 October 2026), Payments 0.4.0 (`dinkus-payments`, 23 October 2026) and Ship 0.3.0 (`dinkus-ship`, 23 October 2026). All three require EmDash 1.2.0. Inventory is coming after v1.

Record the installed EmDash version, Registry plugin versions and installation identities before setup. Beta listings (names ending in `-beta`) are separate installations with their own identities. Use the installed version when comparing screens; newer source on GitHub can have different labels until it ships in a stable release.

The first owner check uses an unmanaged product and Stripe TEST mode. The product and checkout journeys pass on the beta store before every stable release. Installing into an arbitrary existing theme still requires the theme's product pages, cart and checkout integration.

## Before the owner journey

You need an existing EmDash site served on its https address, permission to install and configure its plugins as an Administrator, and someone who can integrate the storefront when the theme does not already support it. The business owner needs a DinkusKit.com account to approve each plugin's Connect.

Keep website editor access separate from the DinkusKit account. A signed-in person does not automatically have authority over every business or store.

## Next step

Continue to [Set up a store on your EmDash site](/docs/store-owners/setup). Developers can go directly to [site integration](/docs/developers/integrate).

## Sources

- [Commerce 0.6.0 release](https://github.com/dinkuskit/commerce/releases/tag/v0.6.0), [Payments 0.4.0 release](https://github.com/dinkuskit/payments/releases/tag/v0.4.0) and [Ship 0.3.0 release](https://github.com/dinkuskit/ship/releases/tag/v0.3.0).
- [Commerce 0.6.0 package](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/package.json) and [one product screen](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/implementation/one-product-screen.md).
- [Commerce Connect](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/registry-connect.ts).
- [Website charter](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/docs/CHARTER.md).
