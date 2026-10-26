---
article: store-owners/setup
base: sha256:cbe41670d428e7db9a7a7fd892aa2f9a4f2c8d4778a07e025ecae328eaef6b27
title: "Set up a store on your EmDash site"
summary: "Prepare your existing site, connect the right store, and identify what must work before adding a product."
audience: "Store owners"
product: "Commerce and Payments"
version_scope: "EmDash 1.2.0; Commerce 0.6.0; Payments 0.4.0 (stable Registry)"
---

## What you will finish

An existing EmDash site with Commerce and Payments installed and connected to DinkusKit.com, a Stripe TEST connection, checkout settings in Commerce, and a theme that shows the Commerce catalog. Installing the plugins does not add a storefront to every theme; arrange that integration before attempting the first order.

## Before you start

Read [requirements and version scope](/docs/start-here). Use a test site you can restore, served on its https address, where you are an Administrator and can install plugins and change the theme. The business owner who should own this store needs a DinkusKit.com account. Start from a supported EmDash installation; this guide does not replace it with a new template site.

If your theme has no product pages, cart and checkout, a developer must add the [site integration](/docs/developers/integrate). Products are managed on the site's **Content > Products** pages, so the site needs a `products` collection whose pages carry a Commerce product field (`commerce_item_id`), and a publish check that puts a product on sale when its page is published. Template Store has both. Installing Commerce alone does not supply them.

## Install the plugins

Record your EmDash version. In Plugins, install **Commerce** 0.6.0 (`dinkus-commerce`) and **Payments** 0.4.0 (`dinkus-payments`) from the stable Registry, and compare the versions your site offers. Commerce asks for two editor permissions, `admin.editor-draft:read` and `admin.editor-draft:patch`, so its panel can link a product to its page.

Keep the installations' identities: public routes and callbacks depend on them, and stable and beta installations are distinct. Connect accepts only Registry installs.

The sidebar then shows a **Dinkus Commerce** folder with **Orders** and **Commerce settings**, and Payments adds a **Payments status** page.

## Connect Commerce first

1. Open **Dinkus Commerce > Commerce settings** and press **Connect Commerce**.
2. The page shows **Approve at DinkusKit.com** with a link. The business owner opens it, signs in at DinkusKit.com and presses **Approve**. Anyone helping can send the owner the same link.
3. Back in Commerce settings, the page says it is connected to DinkusKit.com and names the Store ID.

Nothing is pasted. Commerce's Connect makes the store at DinkusKit.com and gives Commerce its own store key, which it keeps in its encrypted settings.

## Connect Payments and Stripe

1. Open **Payments status** to reach **Payment setup**. Select **Authorize Payments at DinkusKit** and press **Approve** at DinkusKit.com. The page brings you back and checks the approval on its own.
2. If no processor is connected, the **Connect payments** step offers **Set up Stripe**. Complete Stripe's TEST setup; if Stripe needs more information, **Set up or resume Stripe** lists what is missing.
3. Press **Check connection**. A verified test connection shows **Connected: Stripe test mode**.

If Payments says "Connect the Commerce plugin first.", finish the Commerce step above. See the [Payments reference](/docs/reference/payments) for the other messages.

## Choose checkout settings

1. At DinkusKit.com, open **Your stores** and find **Set up Commerce** for this store. It lists which plugins are connected.
2. Choose the **Shipping charge** (Free, or a flat amount in dollars) and **Payments**: **Test (no real money)** for this guide. Press **Save checkout settings**.
3. Back in **Commerce settings**, press **Get checkout settings**. The page says "Checkout settings are up to date".

Commerce also reads these settings on its own every five minutes. Until Payments is connected and set up, Commerce settings tells you which step to finish first.

## Check the result

Confirm the site still renders its existing content, the store under **Your stores** belongs to the intended business and shows Commerce and Payments connected, and **Orders**, **Commerce settings** and **Payments status** open for an Administrator. Then check that the storefront reads the installed catalog routes and shows checkout availability honestly.

A connected store with no product is not yet a usable store, and neither state proves a successful payment. Shipping labels are optional; set up [Ship](/docs/reference/ship) later if you need them.

## If setup cannot continue

Keep the stage and the actual message: Registry installation, Commerce Connect, Payments Connect, Stripe setup, checkout settings, or storefront integration. If a page asks you to **Connect again**, DinkusKit.com no longer knows that plugin's key; press it rather than reinstalling. Do not reset another service to fix an unknown problem. [Troubleshooting](/docs/troubleshooting) explains what evidence to collect.

## Next step

[Add your first product](/docs/store-owners/first-product).

## Sources

- [Commerce Connect and checkout settings](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/admin/connect.ts) and [Connect flow](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/registry-connect.ts).
- [Commerce 0.6.0 plugin manifest](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/emdash-plugin.jsonc) and [one product screen](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/implementation/one-product-screen.md).
- [Payments setup screen](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/src/registry/setup.ts).
- [Template Store publish check](https://github.com/dinkuskit/template-store/blob/bcbfe13629fb972ca4af28e3480bf2da45558b0b/FEATURE_MAP.md).
