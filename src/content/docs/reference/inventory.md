---
title: Inventory
summary: Understand stock ownership, managed availability, and the limits of the current Inventory source.
audience: Store owners and developers
product: Inventory
version: Source review at 2b51314c7150; private 0.0.0 packages; no installable release verified
draft: true
updated: 2026-10-19
---

Inventory owns physical stock: SKU identities, locations, quantities, reservations, movements, and receipts. [Commerce](/docs/reference/commerce) owns products, prices, checkout, and orders. A storefront must use those authorities instead of maintaining another stock counter.

This reference describes the reviewed source and its product contracts. It does not establish an available Registry installation or a supported production setup. For the initial store journey, begin with [requirements](/docs/start-here) and [store setup](/docs/store-owners/setup).

## When Inventory is needed

The product contract distinguishes unmanaged and managed products. An unmanaged product uses Commerce's manual availability and sends no stock commands. A managed product uses exactly one configured inventory provider. DinkusKit Inventory is the default and only first-party provider in the v1 contract; a conforming third-party provider is an advanced integration boundary, not an established installable add-on SDK.

The current Template Store shipping profile keeps Inventory off. Its managed-stock demonstration is a separate development profile. This is why Inventory must not be listed as a universal prerequisite for the first test order. Older descriptions of Commerce and Inventory launching together describe product direction; they do not prove a mandatory dependency or a released managed-stock configuration.

Existing managed products must retain their identity and configuration. If their provider is missing, incompatible, or unavailable, the contract refuses stock-dependent operations. It does not convert the product to unmanaged or substitute a local quantity.

## Read stock in context

An inventory pool groups stock under one authoritative ledger. Each physical location has its own quantities, and each storefront connection has an explicit fulfillment location. Matching product names or SKUs do not establish that mapping.

| Quantity | Meaning |
| --- | --- |
| On hand | Physical stock currently recorded at the location. |
| Reserved | Stock held for orders. |
| Outgoing transfer | Stock committed to leave the location. |
| Available | On hand minus reserved stock and outgoing commitments. |
| Expected | Stock committed to arrive but not yet dispatched. |
| In transit | Dispatched stock that has not yet been received. |

For example, ten on hand with three reserved and two committed to a transfer leaves five available. Expected and in-transit stock do not increase current availability.

## Changes have receipts

The command contract requires a stock change and its immutable receipt to commit together. Opening stock begins with a physical count and reviewed opening balances. Later corrections create new movements; they do not rewrite old receipts.

A successful preview changes no stock. A confirmation must return a committed result before the caller treats the change as complete. After a timeout, the outcome is unknown: resolve or retry the original command identity with the same contents. Creating a replacement command could apply the change twice.

The reviewed source includes SKU registration, initial-stock and adjustment previews and confirmations, stock views, and location-move controls in the EmDash plugin. It also contains hosted routes and reservation/transfer kernels. This establishes implementation scope in source, not proof that every operation is available to a particular installed store.

## Current release limits

Both `@dinkuskit/inventory` and the EmDash plugin package remain private at `0.0.0`. The current package and plugin manifest target EmDash `1.2.0`; the README's older `0.41.0` statement is not the current manifest identity. No GitHub release or installable artifact was found in this review.

A supported owner guide still needs an exact released artifact, verified Registry installation, account connection, and a tested Commerce/provider combination. Until those are established, this page supplies no installation command or production migration procedure. Manufacturing, purchasing, and legacy-system synchronization are outside this reference's scope.

## Sources and review scope

Reviewed on 2026-10-19 without deploying, connecting an account, or changing stock. Inventory sources are pinned to `2b51314c715071bed05a3b6332739ad39eeb8acb`:

- [Product and provider contracts](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/docs/CHARTER.md).
- [Command and receipt contract](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/docs/COMMAND-RECEIPT-CONTRACT.md).
- [Root package](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/package.json), [plugin package](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/plugins/emdash-inventory/package.json), and [plugin manifest](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/plugins/emdash-inventory/emdash-plugin.jsonc).
- [EmDash plugin implementation](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/plugins/emdash-inventory/src/plugin.ts) and [hosted route implementation](https://github.com/dinkuskit/inventory/blob/2b51314c715071bed05a3b6332739ad39eeb8acb/src/cloudflare/hosted-worker.ts).
- [Template Store shipping-profile boundary](https://github.com/dinkuskit/template-store/blob/75f49ff6ded989726a76676eb27d8ae9b64ab980/AGENTS.md), pinned separately to `75f49ff6ded989726a76676eb27d8ae9b64ab980`.
