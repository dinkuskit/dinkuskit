---
title: "Build an add-on using supported extension points"
summary: "Choose a real integration boundary and distinguish host additions from core provider work."
audience: "Developers"
product: "DinkusKit Commerce extension boundaries"
version: "Commerce 0.3.0 source exports; independent Registry add-on example unverified"
draft: true
---

## Choose the extension boundary

A public TypeScript export is not proof that a separate Registry plugin can call it with another plugin's storage or settings. The inspected source provides useful host APIs and provider ports, but this review has not established a generic independently installable DinkusKit add-on SDK.

That is a concrete gap in the planned independent add-on tutorial. This draft documents a bounded host-side integration available in source. It does not claim that the example is a separately installable Registry extension.

| Work | Appropriate boundary |
| --- | --- |
| Product grids, product pages, purchase UI | Commerce's public HTTP catalog and checkout contracts. |
| Product structured data on a host page | The exported host-side structured-data helper, with authoritative public product facts. |
| EmDash lifecycle or scheduled work | EmDash's own plugin hooks and installation rules. |
| A new payment processor or inventory transport | The owning module's provider contracts and core contribution review. |

Commerce's `plugin:activate` and `cron` handlers demonstrate EmDash hooks. They do not establish DinkusKit-specific events for arbitrary add-ons. A provider port used by core orchestration likewise does not prove cross-plugin invocation or an approved installation experience.

## Example: prepare product structured data in the host

Commerce exports `buildProductJsonLd` from `@dinkuskit/commerce/features/structured-data`. Its implementation is a pure host-side builder: it performs no storage or network access and is intentionally excluded from the Registry backend graph.

The input combines the public product projection with the host's canonical page URL. This source-derived function shows that boundary:

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

Use a public, resolved product and a canonical URL selected by the host. Do not invent stock quantities, merchant identifiers, delivery times, or return policy values. Optional policy inputs should come from the store's authoritative published policies. A product without a price produces no Offer.

This example checks the exported function's source shape. It has not been run against an installed companion package or a storefront build. Before publication, verify the selected package artifact and test the output in the site's structured-data rendering path, including the host framework's safe JSON serialization. An ordinary host dependency is not an installation instruction for the Registry plugin.

## When the change belongs in core

Commerce owns authoritative price, checkout attempts, inventory-provider binding, and the provider ports. Payments owns isolated processor adapters and server-side processor selection. Extending those contracts may require coordinated versioning, tests, and review in the owning repository.

Do not create a second order writer, override a failed provider with local state, or infer a supported new processor from a TypeScript interface. Follow [Make and verify a core contribution](/docs/developers/contribute), and qualify the selected Registry path before promising a merchant-facing add-on.

## Before this tutorial can be published

Select an independently installable example, identify its supported EmDash permissions and DinkusKit boundary, build the exact artifacts, and prove installation alongside the supported Commerce release. If the only qualified example remains host-side, explicitly revise the tutorial's scope with the owner instead of labeling it an SDK tutorial.

## Sources and verification limits

Read-only source reconciliation performed on 2026-10-19.

- [Package export map](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/package.json)
- [Structured-data public entry](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/structured-data/index.ts)
- [Builder and types](https://github.com/dinkuskit/commerce/tree/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/structured-data)
- [Commerce EmDash hooks](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/plugin.ts)
- [Inventory-provider port](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/src/features/inventory-provider/types.ts)
- [Payments product boundary](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/AGENTS.md)
