---
title: Choose your path and check requirements
summary: Start with an existing EmDash site, or find the contracts you need to build and extend one.
audience: Store owners and developers
product: DinkusKit
version: EmDash 1.2.0 source baseline; module installation compatibility still under review
draft: true
updated: 2026-10-19
---

## Choose your path

DinkusKit adds commerce to an existing EmDash site. Your store's EmDash admin remains the place to manage products and orders. The DinkusKit account connects a business and its stores to the services they are authorized to use.

| You want to… | Start with |
| --- | --- |
| Set up commerce on your existing site | [Set up a store](/docs/store-owners/setup), then [add a product](/docs/store-owners/first-product). |
| Check that the purchase flow works | [Complete and verify a test order](/docs/store-owners/test-order). |
| Build customer-facing product and checkout pages | [Integrate DinkusKit into a site](/docs/developers/integrate). |
| Add functionality alongside DinkusKit | [Build an add-on using supported extension points](/docs/developers/add-on). |
| Change an existing module | [Make and verify a core contribution](/docs/developers/contribute). |

The owner journey finishes with a visible product, a provider-confirmed TEST payment, and the corresponding order visible in Commerce. Test success does not establish live-selling readiness.

## Understand the pieces

- [Commerce](/docs/reference/commerce) owns the catalog, prices, checkout orchestration, and orders. A storefront still needs to render its public contracts.
- [Payments](/docs/reference/payments) connects the store to its payment processor and supplies verified payment results.
- [Inventory](/docs/reference/inventory) owns physical stock for managed products. Unmanaged products use Commerce's manual availability, so Inventory is not a universal prerequisite.
- [Ship](/docs/reference/ship) handles optional shipping-service workflows. It is outside the required first-test-order journey.

There is no separately installable “Kit” package in this guide. Template Store is a supporting storefront example; creating a new template site does not prove installation into an existing site.

## Check the source and release versions

The current website and Commerce source use EmDash `1.2.0`. The inspected Commerce package is `0.3.0`; Payments source identifies `0.2.9`. Inventory and Ship remain private `0.0.0` packages. These are source identities, not a tested installation matrix. Each product reference records its exact reviewed commit and release discrepancies.

Before using an installation guide, match the installed EmDash version, actual Registry artifact, plugin identity, and hosted-service version to a tested combination. Development source, a Git tag, and an installable Registry artifact are different things. In particular, the Payments `0.2.9` source snapshot and release tag do not point to the same commit.

The existing-site installation sequence and a complete test purchase have not yet been reproduced for these drafts. If you are evaluating the software now, work with the maintainer on an authorized test site and retain the exact versions used. Do not treat the source version table as a stable-release recommendation.

## Before the owner journey

You need access to an existing EmDash site, permission to install and configure its plugins, and someone who can integrate the storefront when the theme does not already support it. The supported hosted Payments path also needs a DinkusKit business/store connection and an explicitly confirmed test payment configuration.

Keep website editor access separate from the DinkusKit merchant account. A signed-in person does not automatically have authority over every business or store.

## Next step

Continue to [Set up a store on your EmDash site](/docs/store-owners/setup). Developers can go directly to [site integration](/docs/developers/integrate).

## Sources and verification limits

This draft reconciles public source as of 2026-10-19. It does not claim a Registry installation or successful purchase.

- [Website charter](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/docs/CHARTER.md).
- [Website package versions](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/package.json).
- [Commerce package](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/package.json) and [Payments package](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/package.json).
