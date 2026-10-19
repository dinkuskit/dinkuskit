---
title: Complete and verify a test order
summary: Confirm a TEST payment with the provider and independently find the saved order in Commerce.
audience: Store owners
product: Commerce and Payments
version: Commerce e8eca124 and Payments b92ec308 source; end-to-end purchase proof pending
draft: true
updated: 2026-10-19
---

## What counts as success

Two results are required: Payments confirms a paid TEST checkout through its own provider lookup, and the matching order is saved and visible in Commerce **Orders**. A success URL, a webhook, or a status badge alone is insufficient.

This draft has not been run against a qualified store/provider combination. Before publication, the complete sequence must be reproduced using the selected installable versions and an authorized test environment.

## Before you start

Complete [store setup](/docs/store-owners/setup) and [add a visible product](/docs/store-owners/first-product). Verify the active processor and explicit TEST mode. Use the test-payment instructions for that actual provider and connection. Do not enter real payment details into an unverified test path.

The presence of a processor adapter does not establish a working owner setup. The current Payments reference explains the narrower [provider support boundary](/docs/reference/payments).

## Place the test purchase

1. Open the storefront as a customer, add your sample product, and review the price and quantity.
2. Start checkout. If it is unavailable, return to setup rather than treating a browse-and-cart demo as a working payment flow.
3. Confirm the processor is using the configured test environment, then complete its supported test-payment flow.
4. Return to the store and record the non-sensitive checkout reference, amount, currency, and time. The browser return is a navigation event, not payment proof.

## Verify both results

Open Payments setup for the same store and current connection. Its test-order status comes from provider-confirmed payment and subsequent notice handling:

| Status | What still needs checking |
| --- | --- |
| `awaiting_notice` | The provider confirmed payment, but the matching notice has not reached Payments. |
| `awaiting_commerce` | The payment notice has not yet been acknowledged by Commerce. |
| `recorded` | Commerce acknowledged the checkout; independently verify the corresponding Orders entry. |

Then open Commerce **Orders**, find the matching order, and check the TEST marker, line items, total, and payment relationship. Do not mark the journey complete until the order is present. Keep both pieces of evidence tied to the same checkout and connection.

Current source has an important distinction: checkout payment acknowledgement and the Orders handoff are separate stages. The Orders receiver can fail while the persisted checkout remains paid. The Payments test-order prose describes acknowledgement as order confirmation, so an actual Orders read is necessary to resolve that gap in the proof.

## If the order has not appeared

Commerce's activation source schedules payment reconciliation every five minutes. Check that the installed host runs that scheduled work. A missing Cron Trigger can leave the flow waiting even after payment is confirmed. Do not change live infrastructure as an undocumented troubleshooting shortcut; ask the site operator to verify the selected host's setup.

If Payments reports `recorded` but Orders has no matching entry, preserve the checkout reference and investigate the Commerce Orders handoff. Repeating the payment creates another checkout and does not prove the first one was saved correctly.

Changing the provider, receiving account, or connection binding means the previous test may no longer qualify. Repeat the test for the new configuration once it is explicitly in TEST mode.

## Keep a useful test record

Record the EmDash/plugin versions, artifact identities, configured mode, non-sensitive checkout/order references, and the observed provider and Orders results. Exclude payment details, credentials, store keys, and customer data.

A completed TEST order proves this test configuration. Live payments, inventory accuracy, postage, refunds, and production readiness each require their own supported setup and evidence.

## Next step

Review the [Payments reference](/docs/reference/payments) and [troubleshooting and upgrade checks](/docs/troubleshooting) before changing the tested configuration.

## Sources and verification limits

- [Payments test-order contract](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/docs/test-order-check.md).
- [Commerce scheduled reconciliation](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/plugin.ts).
- [Commerce paid-order handoff](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/paid-orders.ts).
- [Commerce payment wake processing](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/wake.ts).
