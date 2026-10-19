---
title: Add your first product
summary: Create a simple product, save its price and availability, and check what a customer sees.
audience: Store owners
product: Commerce
version: Commerce 0.3.0 Registry admin source; installed UI walkthrough not yet verified
draft: true
---

## What you will finish

One simple, unmanaged product with a saved price, explicit availability, and a visible storefront listing. This draft uses labels from the current Registry admin source. It still needs a complete walkthrough against the selected installed artifact.

## Before you start

Complete [store setup](/docs/store-owners/setup). Your storefront must already read Commerce's public catalog. Use a synthetic test product, such as **Sample postcard**, with an unused SKU such as `DOCS-POSTCARD-01`; those values are examples, not required identifiers.

For the first product, keep stock unmanaged. Inventory is not required for this path. Do not change an existing managed product to unmanaged merely to bypass a provider failure.

## Create and price the product

1. Open the installed Commerce **Products** page. In **Add product**, enter **Name**, **SKU**, and the appropriate **Fulfillment** choice, **Physical** or **Digital**.
2. Choose **Add product** and select the saved product. Keep its permanent item identity distinct from its editable SKU.
3. Enter a **Regular** price. For the example, use `12.00`. Leave **Sale** blank unless you intend a lower sale price. A product without a regular price does not become a free product.
4. For the unmanaged product, choose its **Stock status**. Use **In stock** for this sample. **Out of stock** and **On backorder** are deliberate merchant choices, not physical quantity counts.
5. Choose **Save**, reload the product, and check the saved values. If it is physical, review the weight fields needed by your selected shipping setup. The first test-order journey does not establish postage or shipping-provider readiness.

The current source also supports choices and variant members. Keep those outside the first simple-product check. A product family can lack a top-level price; customers must choose a sellable member when buying a variant product.

## Check the storefront

Open the public store as a customer. Find the product by its name and confirm its price and availability. Check the product page and cart, not just the admin list. The storefront receives Commerce's public projection; archived or nonlistable items are filtered there.

A saved admin item is not sufficient proof of publication. Confirm the host renders the installed public catalog and does not show stale fixture content. If the product is visible but cannot be bought, inspect checkout readiness separately rather than changing its price or stock blindly.

## If the product is missing

Check that the product is not archived, its regular price was saved, and its availability is listable. Confirm the storefront is reading the correct installation and handles every catalog page. A filtered catalog page can contain no products while still returning a continuation cursor.

These are checks derived from current catalog behavior. They have not been established as tested recovery steps on the selected release; record the actual symptom before adding a troubleshooting claim.

## Next step

[Complete and verify a test order](/docs/store-owners/test-order). Use the [Commerce reference](/docs/reference/commerce) for product identity and pricing rules.

## Sources and verification limits

Source inspected on 2026-10-19; this draft did not create a product in a running store.

- [Registry product forms and labels](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/admin/products.ts).
- [Public catalog projection](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/catalog/public.ts).
- [Price rules](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/catalog/price.ts).
