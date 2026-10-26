---
article: troubleshooting
base: sha256:69c520d73f3008b85d076745a45d11e0f237a61aa7b71a1f2839fc28e0478343
title: "Resolve setup problems and check upgrade compatibility"
summary: "Locate the failing stage, keep useful evidence, and check the exact versions before changing a store."
audience: "Store owners and developers"
product: "DinkusKit"
version_scope: "Commerce 0.6.0; Payments 0.4.0; Ship 0.3.0; version-specific diagnosis and upgrade checks"
---

## Start with the failing stage

Separate plugin installation, each plugin's Connect, processor configuration, checkout settings, storefront rendering, and order persistence. They use different contracts, so a successful step does not prove the next one. Record the exact message, affected stage, and versions before changing settings.

Start with the observed message. In Payments 0.4.0, "Not ready to sell" means a setup step is still incomplete, and "Payment status not checked" means no check has run yet. Press **Check connection** and read each step; a verified TEST connection shows **Connected: Stripe test mode**.

| Symptom | Check next |
| --- | --- |
| A plugin page says **Connect again** | DinkusKit.com no longer knows that plugin's key, for example after Disconnect under **Your stores**. Press **Connect again** and have the owner approve; do not reinstall the plugin. |
| Payments says "Connect the Commerce plugin first." | Commerce's Connect makes the store at DinkusKit.com. Connect Commerce, then Payments. |
| Connect says it needs the https web address | Connect works only for a Registry install on the store's https address. A native development install shows a "(DEV)" note instead. |
| Product stays Draft after its page is published | The site's publish check. Without it, Commerce never hears that the page was published. See [first product](/docs/store-owners/first-product). |
| Product is on sale in the admin but not the storefront | Saved Regular price, stock status, public catalog projection, installed plugin identity, and pagination. A page can take a short moment to appear right after publishing. |
| Browsing works but checkout is unavailable | Commerce settings: is it connected, and does it say "Checkout settings are up to date"? Then **Set up Commerce** at DinkusKit.com and Payments' own setup. |
| Paid TEST checkout is waiting for Commerce | Commerce's five-minute background check and the matching notice and connection. See [test-order verification](/docs/store-owners/test-order). |
| Payments says recorded, but Orders has no entry | The separate Commerce Orders handoff. Keep the original checkout reference and verify persistence directly. |
| Connect fails for a beta plugin | A beta install (a `-beta` listing) is a separate installation with its own identity and Connect; a stable install's connection cannot be reused for it. |

## Gather evidence without secrets

Include the EmDash version, plugin package/artifact identities, hosting adapter, the step that failed, and a short sanitized error. Record whether the evidence comes from source inspection, local fixtures, an installed test store, or a hosted service. A screenshot of a success page does not substitute for provider and persisted-order evidence.

Keep store keys, service passes, Connect links, authentication cookies, payment data, and personal customer information out of reports. Share only the minimum non-sensitive reference needed to locate the attempted operation.

## Before upgrading

1. Record the currently working versions and how the site can be restored. Consult the host's supported backup and rollback process.
2. Read the target module's release notes and migration instructions for the exact artifact. Check its required EmDash version and dependent service contracts.
3. Distinguish a source version, a Git tag, a beta Registry package, and a stable Registry package. The [requirements page](/docs/start-here) and references explain known mismatches; they are not a complete compatibility matrix.
4. Reproduce the supported update in an isolated test environment. Check product rendering, checkout availability, and a fresh provider-confirmed TEST order saved in Commerce.
5. Review the evidence before scheduling a live update under your project's release controls.

There is no universal upgrade or database reset command in this guide. Store connections and orders must not be discarded to make an upgrade appear successful. A store that pasted a store key into an earlier release (Commerce 0.4.0 or earlier, earlier Payments, Ship 0.2.1) presses Connect once in that plugin after upgrading; the old pasted settings are gone. Commerce 0.6.0 asks for two new editor permissions when it is upgraded.

## Next step

Return to the article for the failing stage. Developers proposing a fix should follow [core contribution guidance](/docs/developers/contribute).

## Sources

These are diagnostic checks, not automatic repair commands. No production upgrade or account recovery was performed during this review. Preserve an uncertain payment or connection outcome and investigate it before creating another attempt.

- [Commerce Connect and checkout settings](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/admin/connect.ts) and [Connect flow](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/checkout/registry-connect.ts).
- [Commerce public catalog](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/catalog/public.ts) and [product states](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/docs/implementation/one-product-screen.md).
- [Payments setup screen and recovery wording](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/src/registry/setup.ts) and [test-order check](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/docs/test-order-check.md).
- [Ship 0.3.0 release](https://github.com/dinkuskit/ship/releases/tag/v0.3.0).
- [Website store connection contract](https://github.com/dinkuskit/dinkuskit/blob/cf9375959f194ad7435bcf7374efdf63cd668188/docs/shared-store-connections.md).
