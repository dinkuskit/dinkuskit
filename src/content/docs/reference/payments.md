---
title: "Payments"
summary: "Understand the payment connection, test-order evidence, and Commerce handoff."
audience: "Store owners and developers"
product: "DinkusKit Payments"
version: "Payments 0.2.9 source at b92ec308; installed release not verified"
draft: true
updated: 2026-10-19
---

## What Payments owns

Payments connects a store to its server-selected processor. It owns provider transport, verified webhooks, connection status, and normalized payment results. [Commerce](/docs/reference/commerce) owns prices, carts, checkout attempts, receipts, and orders. Payment status and a saved Commerce order are distinct pieces of evidence.

One provider is active per store. A shopper cannot select a processor in checkout input, and an unknown provider does not trigger fallback to another one. The inspected code includes Stripe and Authorize.net adapters, with USD integer minor units and no currency conversion. An adapter's presence does not qualify its owner setup or release.

## Source and release scope

This draft follows commit `b92ec308eda74c2dfff8c2deca574bf2e17ff654`. Its package identifies `0.2.9` and development dependencies include EmDash `1.2.0`. The remote `v0.2.9` tag points to a different commit, `9a1509400f0578ae5d27d0df0e4959b49eac9884`; source HEAD is therefore not interchangeable with the tagged artifact. The README still describes unpublished `0.2.0` preparation.

No Registry package download, installed store, hosted account connection, or paid TEST transaction was verified for this draft. Select and verify a release before turning these contracts into installation instructions.

## Payment setup

The supported product direction is an EmDash Registry plugin with an authenticated Payment setup page and a hosted Payments service. The source defines an explicit DinkusKit account authorization flow, then a separate connection check. Saving account authorization alone does not create or verify a processor account.

A verified Stripe TEST connection is displayed as **Connected: Stripe test mode**. The setup screen's current overall states are **Not ready to sell**, **Connected: Stripe test mode**, and **Payment status not checked**. TEST success must not be presented as live-selling readiness.

The current Registry status decoder accepts Authorize.net connection evidence only as `unsupported`; its adapter code and approved provider ID do not establish equivalent verified setup through this screen. Qualifying that path is still a concrete documentation gap.

## When a test order counts

The Payments setup step uses both conditions for the current payment connection:

1. Payments' own provider lookup confirms a TEST checkout is paid.
2. Commerce persists the paid checkout order and acknowledges that checkout's payment notice.

The owner journey also requires that order to be visibly present in Commerce Orders. The inspected Commerce source treats the separate Orders-module handoff as retryable and catches receiver failures. This is a reconciliation gap in the older test-order explanation: Payments' acknowledgement evidence does not independently read the Orders screen. Check visible Orders separately before calling the end-to-end journey successful.

A webhook wakes reconciliation; it is not a substitute for provider lookup. A shopper returning to the site is not payment confirmation. The evidence is tied to the provider, receiving account, and binding. Reconnecting to another receiving account requires fresh proof.

| `testOrder.state` | Meaning |
| --- | --- |
| `awaiting_notice` | Provider payment is confirmed; the corresponding notice has not arrived. |
| `awaiting_commerce` | Payment is confirmed; Commerce has not yet confirmed its saved order. |
| `recorded` | Commerce acknowledged the notice after persisting the paid checkout order; verify the separate Orders view. |

The amount includes `currency: "USD"` and integer `minor` text. `paidAt` is milliseconds since the epoch. The setup page accepts this evidence only for a TEST connection with a binding and the matching provider.

## Troubleshooting the handoff

If the page is waiting for Commerce, check that the site's scheduler is actually invoking Commerce's five-minute reconciliation hook. An activation hook in source is not proof that a deployed host has its Cron Trigger configured. Inspect the existing order before placing a replacement order.

If the page asks you to sign in again, refresh that page's DinkusKit authorization. Current setup wording explicitly distinguishes the page's expired authorization from checkout's service credential. If the payment service cannot authenticate with Stripe, reconnecting the page does not repair that service-side problem.

Keep the setup page and hosted service contract compatible. The test-order contract notes that an older setup reader can reject the added field and remain in a checking state.

## Next steps

Follow [Complete and verify a test order](/docs/store-owners/test-order) after the selected installed release and test environment have been qualified. Developers should read the [Commerce reference](/docs/reference/commerce) for checkout authority.

## Sources and verification limits

Read-only source reconciliation performed on 2026-10-19. These links describe the inspected source, not service activation or live readiness.

- [Package identity](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/package.json)
- [Test-order contract](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/docs/test-order-check.md)
- [Registry status decoder](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/src/registry/status.ts)
- [Setup screen and recovery wording](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/src/registry/setup.ts)
- [Store TEST readiness agreement](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/docs/store-test-readiness.md)
- [Release controls](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/RELEASING.md)
- [Commerce acknowledgement conditions](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/wake.ts)
- [Commerce retryable Orders handoff](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/paid-orders.ts)
