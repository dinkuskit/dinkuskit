---
title: Resolve setup problems and check upgrade compatibility
summary: Locate the failing stage, keep useful evidence, and check the exact versions before changing a store.
audience: Store owners and developers
product: DinkusKit
version: Source-derived checks; tested recovery procedures still pending
draft: true
updated: 2026-10-19
---

## Start with the failing stage

Separate plugin installation, store connection, processor configuration, storefront rendering, and order persistence. They use different contracts, so a successful step does not prove the next one. Record the exact message, affected stage, and versions before changing settings.

The checks below follow the current source. They are not presented as failures observed and repaired in a running store. The launch article must replace or supplement them with tested recovery steps from the [owner journey](/docs/store-owners/setup).

| Symptom | Check next |
| --- | --- |
| Product appears in admin but not the storefront | Saved price, archive state, public catalog projection, actual installed plugin identity, and pagination. See [first product](/docs/store-owners/first-product). |
| Browsing works but checkout is unavailable | The host's guest readiness response, admitted Commerce configuration, and current Payments setup. A demo can intentionally disable checkout. |
| Managed availability is unavailable | The configured Inventory provider and its version. Do not substitute a local quantity or silently switch the item to unmanaged. |
| Paid TEST checkout is waiting for Commerce | Scheduled payment reconciliation and the matching notice/connection. See [test-order verification](/docs/store-owners/test-order). |
| Payments says recorded, but Orders has no entry | The separate Commerce Orders handoff. Retain the original checkout identity and verify persistence directly. |
| Connect fails for a beta plugin | The selected installation's fixed callback and proof route. A stable install's identity cannot simply be reused for beta. |

## Gather evidence without secrets

Include the EmDash version, plugin package/artifact identities, hosting adapter, the step that failed, and a short sanitized error. Record whether the evidence comes from source inspection, local fixtures, an installed test store, or a hosted service. A screenshot of a success page does not substitute for provider and persisted-order evidence.

Keep store keys, service passes, authentication cookies, payment data, and personal customer information out of reports. Share only the minimum non-sensitive reference needed to locate the attempted operation.

## Before upgrading

1. Record the currently working versions and how the site can be restored. Consult the host's supported backup and rollback process.
2. Read the target module's release notes and migration instructions for the exact artifact. Check its required EmDash version and dependent service contracts.
3. Distinguish a source version, a Git tag, a beta Registry package, and a stable Registry package. The [requirements page](/docs/start-here) and references explain known mismatches; they are not a complete compatibility matrix.
4. Reproduce the supported update in an isolated test environment. Check product rendering, checkout availability, and a fresh provider-confirmed TEST order saved in Commerce.
5. Review the evidence before scheduling a live update under your project's release controls.

There is no universal upgrade or database reset command in this guide. Existing managed-stock identities, store connections, and orders must not be discarded to make an upgrade appear successful.

## Next step

Return to the article for the failing stage. Developers proposing a fix should follow [core contribution guidance](/docs/developers/contribute).

## Sources and verification limits

Source review on 2026-10-19; no recovery operation or production upgrade was performed.

- [Commerce public catalog](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/catalog/public.ts).
- [Commerce installed configuration](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/checkout/registry-services.ts).
- [Payments test-order check](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/docs/test-order-check.md).
- [Website connection contract](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/docs/shared-store-connections.md).
