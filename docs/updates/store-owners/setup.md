---
article: store-owners/setup
base: sha256:3a7cb8aebdb94cf1dd74d7ed00869b4375eff8586e37e4758e7926dba21a4ac2
title: "Set up a store on your EmDash site"
summary: "Prepare your existing site, connect the right store, and identify what must work before adding a product."
audience: "Store owners"
product: "Commerce and Payments"
version_scope: "EmDash 1.4.0; Commerce 0.8.0; Payments 0.5.0 (stable Registry)"
---

## What you will finish

An existing EmDash site with Commerce and Payments installed and connected to DinkusKit.com, a Stripe TEST connection, checkout settings in Commerce, and a theme that shows the Commerce catalog. Installing the plugins does not add a storefront to every theme; arrange that integration before attempting the first order.

## Before you start

Use an EmDash test site you can restore, served on its HTTPS address, where you are an Administrator and can install plugins and change the theme. The business owner who should own this store needs a DinkusKit.com account.

If your theme has no product pages, cart and checkout, a developer must add the [site integration](/docs/developers/integrate). Your site needs a `products` collection and a publish check that puts a product on sale when its page is published. Commerce 0.8.0 stores the product-to-page link itself. If your template's publish check still reads the page's `commerce_item_id` field, update the template before creating new products. Installing Commerce alone does not supply the collection or the publish check.

## Install the plugins

Record your EmDash version. In Plugins, install **Commerce** 0.8.0 (`dinkus-commerce`) and **Payments** 0.5.0 (`dinkus-payments`) from the stable Registry. Both require EmDash 1.4.0. Commerce asks for `admin.editor-draft:read` so its product panel can read the page title.

Keep the installations' identities: public routes and callbacks depend on them, and stable and beta installations are distinct. Connect accepts only Registry installs.

With these releases, **Dinkus Commerce** has **Orders** and **Commerce settings**, and **Dinkus Payments** has **Payment settings**.

## Connect Commerce first

1. Open **Dinkus Commerce > Commerce settings**. Under **Connect Commerce**, press **Connect**.
2. The page shows **Approve at DinkusKit.com** with a link. The business owner opens it, signs in at DinkusKit.com and presses **Approve**. Anyone helping can send the owner the same link.
3. Back in Commerce settings, the page says it is connected to DinkusKit.com and names the Store ID.

The Approve link lasts 10 minutes. If it runs out, DinkusKit.com says so: go back to the store admin and press **Connect** again. If your business is still waiting for DinkusKit's approval, no store can connect until it is approved, and the Approve page says so.

Nothing is pasted. Commerce's Connect makes the store at DinkusKit.com and gives Commerce its own store key, which it keeps in its encrypted settings.

## Connect Payments and Stripe

1. Open **Dinkus Payments > Payment settings** to reach **Payment setup**, and press **Connect**. Select **Authorize Payments at DinkusKit** and press **Approve** at DinkusKit.com. The page brings you back and checks the approval on its own.
2. If no processor is connected, choose the **Business country** where your business is registered, then press **Set up Stripe** and complete Stripe's TEST setup. If you already chose a country and need to continue, press **Set up or resume Stripe**. Stripe's setup lists anything still missing.
3. Press **Check connection**. A verified test connection shows **Connected: Stripe test mode**.

If Payments says "Connect the Commerce plugin first.", finish the Commerce step above. See the [Payments reference](/docs/reference/payments) for the other messages.

## Choose checkout settings

1. At DinkusKit.com, open **Your stores** and find this store under **Set up Commerce**. On its **Shipping** tab, choose free shipping or a flat charge and press **Save shipping**. This sets what shoppers pay, not where you ship.
2. On the store's **Payments** tab, choose **Test** ("No real money moves") and press **Save payments**.
3. Back in **Commerce settings** in EmDash, press **Get checkout settings**. The page says "Checkout settings are up to date".
4. For a physical test order, also open **Merchant store settings** on that EmDash page. Enter your **Store country** and the **Allowed physical shipping destinations**, then press **Save merchant settings**. For a U.S. test delivery, include `US`. If no destinations are enabled, a physical basket cannot reach payment even with free shipping and current checkout settings.

Commerce also reads these settings on its own every five minutes. Until Payments is connected and set up, Commerce settings tells you which step to finish first.

## Check the result

Confirm the site still renders its existing content, the store's **Plugins** tab under **Your stores** shows Commerce and Payments connected for the intended business, and **Orders**, **Commerce settings** and **Payment settings** open for an Administrator. Then check that the storefront reads the installed catalog routes and shows checkout availability honestly.

A connected store with no product is not yet a usable store, and neither state proves a successful payment. Shipping labels are optional; set up [Ship](/docs/reference/ship) later if you need them.

## If setup cannot continue

Keep the stage and the actual message: Registry installation, Commerce Connect, Payments Connect, Stripe setup, checkout settings, or storefront integration. If a page asks you to **Connect again**, DinkusKit.com no longer knows that plugin's key; press it rather than reinstalling. Do not reset another service to fix an unknown problem. [Troubleshooting](/docs/troubleshooting) explains what evidence to collect.

## Next step

Use the [Commerce 0.8.0 product screen instructions](/docs/reference/commerce#one-product-screen) to add your first product. The [first-product walkthrough](/docs/store-owners/first-product) describes older screens; check its version scope before following its steps.

## Sources

- [Commerce 0.8.0 Connect and checkout settings](https://github.com/dinkuskit/commerce/blob/v0.8.0/src/admin/connect.ts) and [merchant store settings](https://github.com/dinkuskit/commerce/blob/v0.8.0/docs/implementation/merchant-store-settings.md).
- [Commerce 0.8.0 plugin manifest](https://github.com/dinkuskit/commerce/blob/v0.8.0/emdash-plugin.jsonc) and [one product screen](https://github.com/dinkuskit/commerce/blob/v0.8.0/docs/implementation/one-product-screen.md).
- [Payments 0.5.0 plugin manifest](https://github.com/dinkuskit/payments/blob/v0.5.0/emdash-plugin.jsonc) and [setup screen](https://github.com/dinkuskit/payments/blob/v0.5.0/src/registry/setup.ts).
- [Hosted Your stores tabs](https://github.com/dinkuskit/dinkuskit/blob/9cffb179a1b2396bebaee4ca8e6292623874a028/src/components/account/YourStores.astro).
