---
article: developers/plugin-courier
base: new
title: "Let DinkusKit plugins hear each other on your own EmDash site"
summary: "Add the courier, the small piece of store code that carries news between DinkusKit plugins, to an EmDash site that does not start from the store template."
audience: "Developers"
product: "DinkusKit courier"
version_scope: "Unreleased; courier checked against EmDash 1.4.0 and 1.5.0"
nav_label: "Plugin courier"
section: "Developers"
order: 65
---

## Outcome and prerequisites

Some DinkusKit plugins need news from another plugin. For example, Reviews needs to hear when Commerce marks an order shipped. EmDash runs each plugin in its own sandbox, and one plugin cannot call another, so the store's own code carries the news. That code is the **courier**, a small package from DinkusKit.

The DinkusKit store template already includes the courier, so if your store started from the template, there is nothing to do. This page is for an EmDash site that goes its own way.

You need an EmDash site on EmDash 1.4.0 or later, deployed to Cloudflare Workers or to Node, and access to its source code.

## Install it

```sh
npm install github:dinkuskit/courier#<tag>
```

Use the tag the courier's README names for your EmDash version.

## Run it on Cloudflare

The courier runs on the Worker's timer. Give the Worker a Cron Trigger that fires once a minute, in `wrangler.jsonc`:

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

If your Worker already has a `scheduled()` handler, call `courierScheduled()(controller, env, ctx)` from inside it.

## Run it on Node

On Node, the courier runs on page visits, at most once a minute, after the page is answered. Visitors do not need to be signed in. Add it to your site's middleware:

```ts
import { sequence } from "astro:middleware";
import { courierOnVisit } from "@dinkuskit/courier/store";

export const onRequest = sequence(courierOnVisit(), yourMiddleware);
```

It does nothing on Cloudflare, so a site that builds for both can keep this line and the timer.

## Check that it works

Open the admin page of a plugin that receives news, such as Reviews. It says when the courier last came. If it says the courier is missing, the timer or the middleware line is not running. On Node, a store with no visits gets no deliveries until the next visit.

## What it can and cannot do

- It carries only news that may arrive about a minute late. Anything a shopper waits for, such as a saved address at checkout, is asked for during the request instead.
- It keeps nothing. Each plugin keeps its own records, and buyer details stay in your store's database.
- Only your store can use the plugins' courier routes. EmDash refuses any request from outside, including a request from a signed-in administrator.
- It is temporary. It retires once EmDash lets plugins send events to each other.

## Sources

- Courier: https://github.com/dinkuskit/courier (README and docs/doors.md)
- The rule it follows: https://github.com/dinkuskit/dinkuskit/blob/main/docs/plugin-communication.md
