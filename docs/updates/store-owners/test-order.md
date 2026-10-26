---
article: store-owners/test-order
base: sha256:d7c6b3f387c1e924892f5e567660fed02722461fd2f6d2411bc09fa0ac5063a1
title: "Complete and verify a test order"
summary: "Confirm a TEST payment with the provider and independently find the saved order in Commerce."
audience: "Store owners"
product: "Commerce and Payments"
version_scope: "EmDash 1.2.0; Commerce 0.6.0; Payments 0.4.0 (stable Registry)"
---

## What counts as success

Two results are required: Payments confirms a paid TEST checkout through its own provider lookup, and the matching order is saved and visible in Commerce **Orders**. A success URL, a webhook, or a status badge alone is insufficient.

## Before you start

Complete [store setup](/docs/store-owners/setup) and [publish a product](/docs/store-owners/first-product). In **Payments status**, check that **Payment setup** shows **Connected: Stripe test mode**, and that **Set up Commerce** at DinkusKit.com has **Test (no real money)** selected. Use the test-payment instructions for that actual provider and connection. Do not enter real payment details into an unverified test path.

The presence of a processor adapter does not establish a working owner setup. The current Payments reference explains the narrower provider support boundary.

## Place the test purchase

1. Open the store as a shopper, open a product page and press Add to cart. Review the product, price and quantity in the cart.
2. Enter an email and a US delivery address, then press Checkout. If the button says Checkout unavailable, store setup is incomplete: check that Commerce settings says "Checkout settings are up to date" before attempting payment.
3. On Stripe's checkout page, confirm it is in TEST mode. Use card 4242 4242 4242 4242, expiry 12/34 and CVC 123. Do not use a real card.
4. After payment, Stripe returns you to the store's thank-you page. Check that it shows the order and that the cart is empty. Continue with the admin check below; the return page alone does not confirm payment.

## Verify both results

1. In the store admin, open **Dinkus Commerce > Orders** and find the matching #N (TEST) order. Press Inspect #N. Check Status: Processing and Payment: Provider-paid.

If you need to diagnose a delayed result, open **Payments status** for the same store and connection. Its test-order status reports the provider lookup and notice handling:

| Status | What still needs checking |
| --- | --- |
| `awaiting_notice` | The provider confirmed payment, but the matching notice has not reached Payments. |
| `awaiting_commerce` | The payment notice has not yet been acknowledged by Commerce. |
| `recorded` | Commerce acknowledged the checkout; independently verify the corresponding Orders entry. |

Match the order's line items, total and payment to this checkout. Do not mark the check complete until the matching order is visible.

## If the order has not appeared

Commerce runs a background check every five minutes that settles payments and brings Orders up to date. Check that the installed host runs that scheduled work. If the site's scheduler stalls, the next request to Commerce registers the check again, so switching the plugin off and on is not needed. Do not change live infrastructure as an undocumented troubleshooting shortcut; ask the site operator to verify the selected host's setup.

If Payments reports `recorded` but Orders has no matching entry, preserve the checkout reference and investigate the Commerce Orders handoff. Repeating the payment creates another checkout and does not prove the first one was saved correctly.

Changing the provider, receiving account, or connection binding means the previous test may no longer qualify. Repeat the test for the new configuration once it is explicitly in TEST mode.

## Keep a useful test record

Record the EmDash/plugin versions, artifact identities, configured mode, non-sensitive checkout/order references, and the observed provider and Orders results. Exclude payment details, credentials, store keys, and customer data.

A completed TEST order proves this test configuration. Live payments, inventory accuracy, postage, refunds, and production readiness each require their own supported setup and evidence.

## Next step

Review the [Payments reference](/docs/reference/payments) and [troubleshooting and upgrade checks](/docs/troubleshooting) before changing the tested configuration.

## Sources

- [Payments test-order contract](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/docs/test-order-check.md) and [setup screen](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/src/registry/setup.ts).
- [Commerce background check](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/plugin.ts).
- [Commerce paid-order handoff](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/paid-orders.ts).
- [Commerce payment wake processing](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/wake.ts).
- [Commerce order labels](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/orders/admin/view.ts).
- [Template Store cart and checkout labels](https://github.com/dinkuskit/template-store/blob/bcbfe13629fb972ca4af28e3480bf2da45558b0b/src/features/guest-cart/present.ts).
- [Maintainer-confirmed checkout journey and exact button labels.](https://github.com/dinkuskit/dinkuskit/issues/58)
