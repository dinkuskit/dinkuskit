---
article: developers/plugin-courier
base: new
title: "Let DinkusKit plugins hear each other on your own EmDash site"
summary: "Add the courier, the small piece of store code that carries news between DinkusKit plugins, to an EmDash site on Cloudflare that does not start from the store template."
audience: "Developers"
product: "DinkusKit courier"
version_scope: "Courier v0.1.0 on EmDash 1.4.0 and 1.5.0, Cloudflare Workers"
nav_label: "Plugin courier"
section: "Developers"
order: 65
---

## Outcome and prerequisites

Some DinkusKit plugins need news from another plugin. For example, Reviews needs to hear when Commerce marks an order shipped. EmDash runs each plugin in its own sandbox, and one plugin cannot call another, so the store's own code carries the news. That code is the **courier**, a small package from DinkusKit.

The DinkusKit store template runs the courier from its own one-minute timer, so a store that started from the template has nothing to do. This page is for an EmDash site that goes its own way.

You need:

- an EmDash site on EmDash 1.4.0 or later;
- the site deployed to Cloudflare Workers;
- access to the site's source code.

Self-hosted sites on Node are not supported yet.

## Install it

```sh
npm install github:dinkuskit/courier#v0.1.0
```

## Run it on the Worker's timer

The courier runs on the Worker's timer. First, give the Worker a Cron Trigger that fires once a minute, in `wrangler.jsonc`:

```json
{ "triggers": { "crons": ["* * * * *"] } }
```

Then run the courier from the Worker's `scheduled()` handler:

```ts
import { courierScheduled } from "@dinkuskit/courier/store";

export default {
  // ...your fetch handler
  scheduled: courierScheduled(),
};
```

If your Worker already has a `scheduled()` handler, such as EmDash's own for scheduled publishing, call `courierScheduled()(controller, env, ctx)` from inside it.

## Check that it works

Open the admin page of a plugin that receives news, such as Reviews. It says when the courier last came by. If it says the courier is missing, the timer is not running.

The Worker's logs show a line starting `[courier]` only when something needs attention: a plugin's door refused, or more news is waiting for the next run.

## What it can and cannot do

- It carries only news that may arrive about a minute late. Anything a shopper waits for, such as a saved address at checkout, is asked for during the request instead.
- It keeps nothing. Each plugin keeps its own records, and buyer details stay in your store's database.
- Only your store can use the plugins' courier routes. EmDash refuses any request from outside the store. The routes refuse a signed-in administrator too.
- It is temporary. It retires once EmDash lets plugins send events to each other.

## Sources

- Courier: https://github.com/dinkuskit/courier (README and docs/doors.md)
- The rule it follows: https://github.com/dinkuskit/dinkuskit/blob/main/docs/plugin-communication.md
