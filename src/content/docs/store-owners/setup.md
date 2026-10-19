---
title: Set up a store on your EmDash site
summary: Prepare your existing site, connect the right store, and identify what must work before adding a product.
audience: Store owners
product: Commerce and Payments
version: Commerce 0.3.0 and Payments 0.2.9 source; existing-site installation still to verify
draft: true
---

## What you will finish

An existing EmDash site with the correct commerce components, an authorized Payments connection, and a storefront that can display products. This draft describes the sequence supported by current source; the exact Registry installation and hosted setup still need to be demonstrated before the article can be published as a complete walkthrough.

## Before you start

Read [requirements and version scope](/docs/start-here). Use a test site you can restore, with permission to install plugins and change its theme. You also need access to the DinkusKit business that should own this store. Start from a supported EmDash installation; this guide does not replace it with a new template site.

If your theme has no product, cart, and checkout pages, a developer must add the [site integration](/docs/developers/integrate). Installing Commerce alone does not supply those pages.

## Prepare the existing site

1. Record the site's EmDash version and the exact Commerce and Payments artifacts selected for testing. Check the product references for known source/release differences. Obtain the supported Registry packages through the maintainer's current release process; a source checkout is not an equivalent installed plugin.
2. Install the verified plugins into the existing site. Keep their actual installation identities: public routes and callbacks depend on those identities, and stable and beta installations are distinct.
3. Open the Payments plugin's setup page and start **Connect** there. The connection checks the store address and returns you through that installation's callback. Do not construct your own callback or copy another store's connection URL.
4. Sign in to the intended DinkusKit business and review the store and requested service before approving. Check that the correct store appears under **Your stores** after the return. The exact UI and connection result still require a test-site verification for the selected versions.
5. Complete the supported TEST payment configuration. Check the processor and mode in Payments. A connected account alone does not mean a live checkout is ready.

## Configure Commerce and the storefront

Current website source includes **Set up Commerce** and a one-time store key. Commerce's current installed integration reads the `installedCheckout` configuration and a secret `storeKey`. The key is used server-side to request short-lived service passes; it does not belong in a theme, browser script, screenshot, or documentation example.

Follow the matched setup flow for the selected artifact to transfer the configuration. This draft does not prescribe manually constructed settings JSON: the admitted site, issuer, binding, and service configuration have to agree. A missing or invalid configuration keeps checkout unavailable.

Have the storefront read the installed Commerce public catalog and use its guest checkout flow. Product prices and order state come from Commerce; a browser subtotal is only presentation. Leave optional Ship and managed Inventory configuration outside this first test unless the selected product actually requires them.

## Check the result

Confirm the site still renders its existing content, the correct store is connected to the intended business, and the installed Commerce and Payments pages open for an authorized editor. Then check that the storefront uses the installed catalog routes and presents checkout availability honestly.

The next step is a saved product. A connected store with no catalog or storefront is not yet a usable store, and neither state proves a successful payment.

## If setup cannot continue

Keep the stage and actual error: Registry installation, store connection, processor setup, Commerce settings, or storefront integration. Do not reset another service to fix an unknown problem. [Troubleshooting](/docs/troubleshooting) explains the source-backed boundaries and what evidence to collect.

## Next step

[Add your first product](/docs/store-owners/first-product).

## Sources and verification limits

The sequence is derived from source inspected on 2026-10-19. No live account was connected and no store key was created for this draft.

- [Website store connection contract](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/docs/shared-store-connections.md).
- [Website Commerce setup](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/src/account/commerce-settings.ts).
- [Installed Commerce service configuration](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/registry-services.ts).
