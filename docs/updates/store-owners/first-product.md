---
article: store-owners/first-product
base: sha256:481a08673a917a6cc7a0bf151b1b960e2826895b02ae992c77e9d94259cad16e
title: "Add your first product"
summary: "Create a simple product, save its price and availability, and check what a customer sees."
audience: "Store owners"
product: "Commerce"
version_scope: "Commerce 0.6.0; EmDash 1.2.0; unmanaged product workflow"
---

## What you will finish

One simple, unmanaged product with a saved price and availability, on a published product page that customers can see. These controls match the Commerce 0.6.0 Registry bundle, where **Content > Products** is the one place to manage a product.

## Before you start

Complete [store setup](/docs/store-owners/setup). Your site needs the **Products** content type with a Commerce product field and a publish check, and your storefront must read Commerce's public catalog. Use a synthetic test product, such as **Sample postcard**, with an unused SKU such as `DOCS-POSTCARD-01`; those values are examples, not required identifiers.

For the first product, keep stock unmanaged. Inventory is not required for this path, and the **Manage stock** switch is marked Coming soon.

## Make the product page

1. Open **Content > Products** and create a page titled **Sample postcard**. Press **Save** so it exists as a Draft.
2. In the **Dinkus Commerce** panel beside the editor, the page says "Not a product yet. Add price and stock to sell it." Type the SKU in **SKU (optional)**, or leave it blank to have one made from the title, and press **Add price and stock**.
3. Commerce makes a Draft product named from the page title and links it to the page. EmDash asks you to apply the link; press **Save** on the page to keep it.

To sell an existing product that has no page yet, choose it under **Or one without a page** and press **Sell it here** instead. Keep the permanent product ID separate from its editable SKU.

## Price it and set availability

In the panel, enter `12.00` in **Regular** for this example. Leave **Sale** blank unless you intend a lower sale price. A product without a Regular price is not listed, and it does not become a free product.

For **Stock status**, choose **In stock** for this sample. **Out of stock** and **On backorder** are deliberate merchant choices, not physical quantity counts. Press **Save** in the panel.

For a physical product, enter **Weight (oz)** under **Shipping weight** and press **Save weight** when your shipping setup needs it. Photos, choices such as Color and Size, and GTIN, MPN and Brand are in the same panel; keep choices outside this first simple-product check.

## Publish to put it on sale

The product is a Draft, and not buyable, until its page is published. Press **Publish** on the page. The store's publish check then puts the product on sale, and the panel shows it **On sale**. Unpublishing or deleting the page takes it off the shop again.

To retire a product, press **Archive** in the panel. **Restore** brings it back as a Draft.

## Check the storefront

Open the public store as a customer. Find the product by its name and confirm its price and availability. Check the product page and cart, not just the admin. A page can take a short moment to appear right after it is published.

A saved admin product is not proof of publication. Confirm the storefront reads the installed public catalog and does not show stale sample content. If the product is visible but cannot be bought, check checkout readiness separately rather than changing its price or stock.

## If the product is missing

Check that the page is published, the panel says **On sale** rather than Draft or Archived, the Regular price was saved, and the stock status is listable. If the panel still says Draft after publishing, the site's publish check did not run; ask the site's developer. Confirm the storefront reads the correct installation and follows every catalog page: a filtered page can hold no products while still returning a continuation cursor.

**Commerce settings** lists **Products without a page**, each with **Make a page**, for products made before this screen or whose page was removed.

## Next step

[Complete and verify a test order](/docs/store-owners/test-order). Use the [Commerce reference](/docs/reference/commerce) for product identity and pricing rules.

## Sources

- [Product panel forms and labels](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/admin/products.ts).
- [One product screen and product states](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/implementation/one-product-screen.md).
- [Public catalog projection](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/catalog/public.ts).
- [Price rules](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/catalog/price.ts).
- [Template Store publish check](https://github.com/dinkuskit/template-store/blob/bcbfe13629fb972ca4af28e3480bf2da45558b0b/FEATURE_MAP.md).
