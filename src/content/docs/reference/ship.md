---
title: Ship
summary: Understand the hosted shipping service, sandbox labels, and the distinction from the unreleased plugin.
audience: Store owners and developers
product: Ship
version: Source review at 42afe339e483; hosted sandbox implementation; private 0.0.0 packages
draft: true
---

Ship provides optional shipping automation around Commerce orders. [Commerce](/docs/reference/commerce) owns checkout shipping charges and order records; Ship handles label workflows and returns tracking events. Ship does not own product stock or payment confirmation.

Shipping is outside the required first-test-order outcome. Start with [requirements](/docs/start-here) and [store setup](/docs/store-owners/setup); a test label cannot establish that checkout was paid or that Commerce saved the order.

## Hosted service and plugin are separate

The reviewed repository contains two distinct implementations:

| Surface | Source-backed scope |
| --- | --- |
| Hosted service in `service/` | Commerce order intake, an authenticated owner label page, postage-account settings, sandbox label operations, and tracking delivery back to Commerce. |
| Root EmDash plugin package | A private local settings and workflow candidate. Its default manifest declares no network hosts, and its description keeps provider actions disabled. |

The hosted service is the repository's current path for Commerce orders. Installing the root package must not be described as enabling that service. The package's additional workflow and label-asset exports require host integration; their existence is not proof of an independently installable Registry shipping workflow.

Both packages remain private at `0.0.0`, and this review found no GitHub release. The service README describes a hosted sandbox deployment, but this documentation review did not verify a running service, store authorization, or a deployed version.

## Understand sandbox and practice labels

The service's provider implementation supports the Pitney Bowes sandbox. Live postage is not implemented in the inspected source. A sandbox PDF and tracking number are not postage for mailing a parcel.

| TEST-order label | Behavior in the reviewed service |
| --- | --- |
| Pitney Bowes sandbox label | Available when the sandbox configuration is complete. Uses sandbox rates, shipment creation, PDF, and tracking; it charges no real postage. The interface marks it TEST SANDBOX. |
| Practice label | Generated without a provider request when the owner selects practice, or sandbox labels are unavailable. The PDF says TEST - NOT POSTAGE and PRACTICE LABEL - DO NOT MAIL. |

A TEST order remains TEST through either path. The code refuses to buy postage for a TEST order outside the sandbox. For non-TEST orders, the implemented account path requires the owner's connected postage account, but its current provider connection is still sandbox-only.

## Order and label responsibilities

Commerce sends an authenticated, versioned order record. Ship accepts the current or a newer order version and does not overwrite it with an older delivery. The admitted shipping record includes a US destination and line quantities. Billing details and payment credentials are outside that record.

The owner-page source provides package weight and service review, prices, label creation, PDF printing, and cancellation. A label purchase requires a deliberate owner action. Ship stores the label PDF and queues tracking for Commerce to collect and acknowledge. These are source contracts, not a claim that the same flow has been tested on your site.

If a provider response is lost, the source attempts to reconcile the original transaction before allowing a new purchase. Cancellation concerns the label; it does not cancel or refund the Commerce order. Payment refunds belong to the payment/order workflow.

## Integration boundary

The service exposes three Commerce-facing routes:

| Route | Purpose |
| --- | --- |
| `POST /v1/orders` | Accept a versioned Commerce shipping record. |
| `GET /v1/labels` | Read label events awaiting acknowledgement. |
| `POST /v1/labels/ack` | Acknowledge a delivered label event. |

These routes require a DinkusKit-issued store authorization with the `ship:orders` scope. The store identity comes from the signed authorization, not a browser-supplied identifier. The owner label page uses its own signed-in authorization. Neither interface is a public documentation endpoint or an unauthenticated storefront API.

Before publishing setup instructions, verify the deployed service revision, the matching Commerce handoff, account permissions, and the complete sandbox journey. A live-postage guide additionally requires a supported production provider implementation. No live-postage or Registry installation command is established here.

## Sources and review scope

Reviewed on 2026-10-19 without signing in, creating labels, buying postage, or testing a hosted deployment. Sources are pinned to `42afe339e483bb366839822291ce4168c1045d61`:

- [Repository overview and plugin limitations](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/README.md).
- [Hosted service contract](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/service/README.md).
- [Root package](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/package.json), [plugin manifest](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/emdash-plugin.jsonc), and [service package](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/service/package.json).
- [Service routes](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/service/src/worker.ts), [label operations](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/service/src/store.ts), and [sandbox provider](https://github.com/dinkuskit/ship/blob/42afe339e483bb366839822291ce4168c1045d61/service/src/pitney.ts).
