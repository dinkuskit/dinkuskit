# How DinkusKit plugins exchange information

Status: rule locked on 22 Nov 2026 (decision `plugin-communication-rule-20261122`). The courier described here is not built yet.

EmDash runs each Registry plugin in its own sandbox, and one plugin cannot call another. This page is the one rule for how information moves anyway. Use it before designing any feature where one plugin needs something another plugin holds.

## 1. Hosted services

- A hosted DinkusKit service may hold store operations or buyer details only where an outside account requires it. Today that is Payments (Stripe, Authorize.net) and Ship (postage).
- A hosted service may read what a store already publishes. Today that is the cross-store catalog.
- A hosted service is never used just to connect two plugins.

## 2. Plugins in the same store talk through the store

- The store's own server code can reach every installed plugin from the inside, so it carries the information. Buyer details stay in the store's database.
- DinkusKit provides the carrying part, the courier, as its own small package. The store template includes it. Any other EmDash site adds it with two lines.
- The Guide tells owners to start with the template, and has one page for sites going their own way.
- A plugin that depends on a handoff says so plainly in its admin page when the courier is missing.

## 3. Two lanes

| Lane | Use it when | Examples |
| --- | --- | --- |
| Inline, during the request | A shopper is waiting, or a minute late costs money | A saved address at checkout. Later: stock and coupon checks. |
| Courier, about once a minute | The news may arrive a little late | An order shipped, for Reviews. A scheduled product page published, for Commerce. |

Every item of news carries an id. A receiving plugin ignores an id it has already seen, so a repeated or retried delivery changes nothing.

## 4. The courier

- It holds no shop logic. Each plugin offers a private outbox route and a private inbox route, and the courier carries between whichever plugins are installed.
- It is one repeat-safe function. On Cloudflare it runs on the store's timer. On a Node host it runs on page visits, at most once a minute.
- Only the store can call the routes. A request from outside is refused before it reaches the plugin.
- It stores no buyer details. Each plugin keeps its own place.

Two things are proven in the build before the courier is relied on:

1. It finds installed plugins' routes without a per-plugin change to the store.
2. It delivers safely with nobody signed in.

## 5. EmDash

- DinkusKit keeps asking upstream for plugin events: a plugin declares the events it sends and listens to, and the owner approves each link at install.
- The courier is a stopgap built to be replaced. It retires only after EmDash releases plugin events, the plugins have moved to them, and the journeys pass on the beta store without it.

## How the big platforms do it

- Shopify pushes an `orders/fulfilled` webhook to apps, and tells apps to also run reconciliation jobs that fetch data on a schedule.
- WooCommerce fires `woocommerce_order_status_completed` inside the same process, and every plugin listening hears it.
- WordPress runs timed jobs on page load, at most once every 60 seconds.

The store-run courier is the closest equivalent available inside EmDash today.
