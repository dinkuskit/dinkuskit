---
article: reference/ship
base: sha256:b4e1b7070b9c2011b72592d51934015820a6fe58fc8f48e6a061218317b53015
title: "Ship"
summary: "Understand the Ship plugin, the hosted shipping service, and sandbox labels."
audience: "Store owners and developers"
product: "Ship"
version_scope: "Ship 0.2.1"
---

Ship buys USPS shipping labels for Commerce orders. [Commerce](/docs/reference/commerce) owns checkout shipping charges and order records; Ship handles labels and reports tracking back. Ship does not own product stock or payment confirmation.

Shipping is outside the required first-test-order outcome. Start with [requirements](/docs/start-here) and [store setup](/docs/store-owners/setup); a test label cannot establish that checkout was paid or that Commerce saved the order.

This reference describes the Ship plugin `0.2.1`, released on the EmDash Registry as `dinkus-ship` on 22 October 2026 (tag `v0.2.1`; its plugin code is the same as `0.2.0`, released 21 October), and the hosted Ship service at ship.dinkuskit.com.

## The plugin and the hosted service

Ship has two parts that work together:

| Part | What it does |
| --- | --- |
| Ship plugin (`dinkus-ship`) | Adds a **Shipping** page to the store admin for Editors and Administrators. It lists the paid orders Commerce sent to Ship, shows USPS prices, and has **Buy label**, **Print label** and **Cancel label**. |
| Hosted Ship service | Takes Commerce's orders, buys, keeps and cancels labels, sends the shopper the shipped email, and serves the owner's own pages at ship.dinkuskit.com (sign in with DinkusKit.com): settings, the owner's Pitney Bowes postage account, and label history. |

The plugin keeps no label data. Every click reads from, or buys through, the hosted service, so the two always agree. Ship's own pages are the full path, and the fallback when the plugin is not installed.

## Set up the plugin

Install **Ship** from the plugin Registry, then open its settings and paste the **Store ID** and **store key** from the Set up Commerce box on DinkusKit.com, the same ones Commerce uses. Ship must be switched on for the store at DinkusKit.com.

The plugin never sends the store key to Ship or to a store page. It trades the key at DinkusKit.com for a pass that lasts five minutes and reuses that pass for clicks in the next minute. A key replaced at DinkusKit.com, or Ship switched off there, stops the Shipping page within a minute.

## Buy a label

1. Open **Shipping** in the store admin and pick a paid order.
2. Check the box, the weight (items plus box) and the service: USPS Ground Advantage by default, Priority Mail or Priority Mail Express. Then review the USPS prices.
3. Press **Buy label**. Nothing is bought without this press.
4. Press **Print label**. The PDF opens in a new tab through a link that works for five minutes and only for that label.

Within a few minutes Commerce picks the label up from Ship and marks the order Completed with USPS and the tracking number, the same as when the label is bought on Ship's own page. **Cancel label** cancels the label only; it does not cancel or refund the Commerce order. Payment refunds belong to the payment and order workflow.

If a label purchase's answer is lost, Ship reconciles the original purchase before allowing a new one.

## Sandbox and practice labels

Ship runs on the Pitney Bowes sandbox. Live postage is not available yet. A sandbox PDF and tracking number are not postage for mailing a parcel.

| TEST-order label | Behavior |
| --- | --- |
| Pitney Bowes sandbox label | Available when the sandbox configuration is complete. Uses sandbox rates, shipment creation, PDF, and tracking; it charges no real postage. The page marks it TEST SANDBOX. |
| Practice label | Made without calling Pitney Bowes when the owner presses **Make practice label instead**, or when sandbox labels are unavailable. The PDF says TEST - NOT POSTAGE and PRACTICE LABEL - DO NOT MAIL. |

A TEST order stays TEST everywhere and never gets live postage. A real order needs the owner's own Pitney Bowes postage account connected on Ship's settings page; until one is connected, prices and labels for real orders are refused.

Tracking updates (In transit, Out for delivery, Delivered, Problem) come from Pitney Bowes for live labels only, so they do not appear while Ship is on the sandbox.

## Integration boundary

Commerce calls three routes on the hosted service with a DinkusKit store pass scoped `ship:orders`:

| Route | Purpose |
| --- | --- |
| `POST /v1/orders` | Accept a versioned Commerce shipping record. |
| `GET /v1/labels` | Read label events awaiting acknowledgement. |
| `POST /v1/labels/ack` | Acknowledge a delivered label event. |

The plugin's Shipping page calls routes under `/v1/admin/` with a pass scoped `ship:admin`. The store always comes from the signed pass, never from anything in the request. Ship accepts the current or a newer order version and never overwrites it with an older one. It keeps the US delivery address, line quantities and email; billing details and payment credentials stay out of Ship. None of these is a public, unauthenticated API.

## Sources and review scope

Reviewed on 2026-10-22 from the `v0.2.1` release, without signing in, buying labels or buying postage:

- [Release notes](https://github.com/dinkuskit/ship/releases/tag/v0.2.1) and [changelog](https://github.com/dinkuskit/ship/blob/42cffda4d1baf3aa0774ec6055b9d7c607cb81dd/CHANGELOG.md)
- [Repository overview](https://github.com/dinkuskit/ship/blob/42cffda4d1baf3aa0774ec6055b9d7c607cb81dd/README.md) and [plugin manifest](https://github.com/dinkuskit/ship/blob/42cffda4d1baf3aa0774ec6055b9d7c607cb81dd/emdash-plugin.jsonc)
- [What the Ship plugin calls](https://github.com/dinkuskit/ship/blob/42cffda4d1baf3aa0774ec6055b9d7c607cb81dd/docs/contracts/ship-plugin-v1.md)
- [Hosted service contract](https://github.com/dinkuskit/ship/blob/42cffda4d1baf3aa0774ec6055b9d7c607cb81dd/service/README.md)
