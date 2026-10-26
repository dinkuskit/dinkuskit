---
article: developers/add-on
base: sha256:67809fc4a6c59f74cc3fe218a2b0e23e26538992b7671f74f1e90e302a258e40
title: "Build an add-on using supported extension points"
summary: "Choose a real integration boundary and distinguish host additions from core provider work."
audience: "Developers"
product: "DinkusKit Commerce extension boundaries"
version_scope: "Commerce 0.6.0 host-side source example; no independent Registry add-on SDK established"
---

## Choose the extension boundary

A public TypeScript export is not proof that a separate Registry plugin can call it with another plugin's storage or settings. The inspected source provides useful host APIs and provider ports, but this review has not established a generic independently installable DinkusKit add-on SDK.

The example below runs in the storefront host. It is not an independently installable Registry plugin, and installing Commerce from the Registry does not install a TypeScript dependency into your Astro project.

| Work | Appropriate boundary |
| --- | --- |
| Product grids, product pages, purchase UI | Commerce's public HTTP catalog and checkout contracts. |
| Product structured data on a host page | The exported host-side structured-data helper, with authoritative public product facts. |
| EmDash lifecycle or scheduled work | EmDash's own plugin hooks and installation rules. |
| A new payment processor or inventory transport | The owning module's provider contracts and core contribution review. |

Commerce's `plugin:activate` and `cron` handlers demonstrate EmDash hooks. They do not establish DinkusKit-specific events for arbitrary add-ons. A provider port used by core orchestration likewise does not prove cross-plugin invocation or an approved installation experience.

## Example: prepare product structured data in the host

Commerce exports `buildProductJsonLd` from `@dinkuskit/commerce/features/structured-data`. Its implementation is a pure host-side builder: it performs no storage or network access and is intentionally excluded from the Registry backend graph.

The input combines the public product projection with the host's canonical page URL. This wrapper calls the exported builder:

```ts
import {
  buildProductJsonLd,
  type StructuredProductInput,
} from "@dinkuskit/commerce/features/structured-data";

export function productStructuredData(
  product: StructuredProductInput,
  canonicalPageUrl: string,
) {
  return buildProductJsonLd({
    product,
    page: { url: canonicalPageUrl },
  });
}
```

Commerce 0.6.0 also exports `buildProductPreviewJsonLd` for an editorial page with no Commerce product: it copies only the page's name, URL, description and images, and never makes an Offer.

Use a public, resolved product and a canonical URL selected by the host. Do not invent stock quantities, merchant identifiers, delivery times, or return policy values. Optional policy inputs should come from the store's authoritative published policies. A product without a price produces no Offer.

The wrapper was run against an earlier Commerce source with an in-stock USD 12.00 product; the builder it calls is unchanged in 0.6.0. It returned an Offer priced at 12.00 and preserved the SKU and canonical URL. A product without a price returned no Offer; a missing canonical URL was rejected. This check does not establish an installable companion package or the host framework's safe JSON rendering.

## When the change belongs in core

Commerce owns authoritative price, checkout attempts, inventory-provider binding, and the provider ports. Payments owns isolated processor adapters and server-side processor selection. Extending those contracts may require coordinated versioning, tests, and review in the owning repository.

Do not create a second order writer, override a failed provider with local state, or infer a supported new processor from a TypeScript interface. Follow [Make and verify a core contribution](/docs/developers/contribute), and qualify the selected Registry path before promising a merchant-facing add-on.

## Installation boundary

There is no qualified independently installable DinkusKit add-on example in this guide. For host-side code, first verify how your project obtains the selected Commerce dependency and test its output in the storefront. For a separate Registry plugin, establish the supported EmDash permissions and cross-plugin contract before promising installation instructions.

## Sources

The source-only structured-data example was checked on 20 October 2026 and its builder compared with the 0.6.0 release on 26 October 2026. It made no network request and changed no store data.

- [Package export map](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/package.json)
- [Structured-data public entry](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/structured-data/index.ts)
- [Builder and types](https://github.com/dinkuskit/commerce/tree/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/structured-data)
- [Commerce EmDash hooks](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/plugin.ts)
- [Inventory-provider port](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/src/features/inventory-provider/types.ts)
- [Payments product boundary](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/AGENTS.md)
