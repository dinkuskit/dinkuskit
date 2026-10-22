# DinkusKit.com design system (draft, before Stitch round 1)

Status: DRAFT. Nothing below is locked. Each value gets locked in its own
GrillTrack round (layout, then palette, then type) per `emdash-stitch-design`.
The starting point is the light, green, restrained look approved on
30 Sep 2026 (`design.md`).

## Who it is for

EmDash site owners who want to sell, and the agents that help them. The site
explains DinkusKit (Commerce, Payments, Ship plugins on the EmDash Registry
plus hosted services), gets an owner to `/start`, and hosts the docs.

## Atmosphere

- Density: 4 (balanced; generous whitespace, nothing cramped).
- Variance: 3 to 5 (mostly a calm grid; room for one offset hero).
- Mood: workshop-honest, quiet confidence, plain shop words. A tool built in
  the open, not a SaaS billboard.

## Color (current values, to be re-grilled)

| Name | Hex | Role |
| --- | --- | --- |
| Paper | #f7f8f4 | Page background |
| Ink | #17251f | Body text and headings (warm off-black, never #000) |
| Forest | #215d43 | Links and the one accent (buttons, focus) |
| Moss | #477451 | Brand mark asterisks, eyebrow tints |
| Sage line | #d4ddd3 | Rules and borders |
| Muted ink | #42594b | Secondary copy |
| Alert | #8a1f1f | Errors only |

One accent per palette, saturation under 80 percent. No purple or neon
gradients, no glows.

## Type (current, to be re-grilled)

- Today: `system-ui` for everything; headings bold with tight tracking.
- To grill: a display face with character for headings, a high-legibility
  body face, and a monospace face for versions, keys and code in the docs.
- Headlines scale with `clamp()`; body copy stays 60 to 70ch wide.

## Pages, in grill order

1. Home (`/`, CMS page `home`)
2. Start your store (`/start`, CMS page `start`; checklist and Connect flow
   must keep working)
3. Getting started (`/getting-started`, CMS page `getting-started`)
4. Shared header and footer
5. Later: docs (`/docs/*`), terms, account pages

## Hard rules

- Every page is a CMS page (`pages` collection, `layout` blocks). A new
  section is a new block type in `seed/seed.json`, never a code-only route.
- Keep `data-*` hooks, accessible names and copy that tests pin.
- No emojis in chrome, no made-up numbers, no buttons for features that are
  not live.
- No horizontal scroll at 320 to 767 px.
