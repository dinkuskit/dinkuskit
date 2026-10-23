# DinkusKit.com design system (draft, before Stitch round 1)

Status: layout (L3 page + L5 header) and color (P5) locked; type next. Each value gets locked in its own
GrillTrack round (layout, then palette, then type) per `emdash-stitch-design`.
The green look approved on 30 Sep 2026 is replaced by the brand palette above.

## Who it is for

EmDash site owners who want to sell, and the agents that help them. The site
explains DinkusKit (Commerce, Payments, Ship plugins on the EmDash Registry
plus hosted services), gets an owner to `/start`, and hosts the docs.

## Atmosphere

- Density: 4 (balanced; generous whitespace, nothing cramped).
- Variance: 3 to 5 (mostly a calm grid; room for one offset hero).
- Mood: workshop-honest, quiet confidence, plain shop words. A tool built in
  the open, not a SaaS billboard.

## Color (LOCKED round 2, P5, 23 Oct 2026)

Built around the F3 ultraviolet logo and the plugin logos. Tokens live at the
top of `src/styles/site.css`.

| Token | Hex | Role |
| --- | --- | --- |
| --paper | #f7f6f3 | Page background (warm off-white) |
| --ink | #15171c | Text and headings (graphite, never #000) |
| --muted | #4f4b45 | Secondary copy |
| --line / --line-soft | #e3e0d8 / #ece9e2 | Rules and borders |
| --graphite | #1e2128 | Topic cards (with --graphite-ink #f4f2f8, --graphite-muted #b9b3c9) |
| --accent | #7e22ce | Links, eyebrows, progress (AA on paper) |
| --mark / --focus | #a855f7 | F3 ultraviolet: logo mark, focus rings (not body text) |
| --highlight | #f5d0fe | Button text on graphite |
| --button | #15171c | Primary buttons (graphite with --highlight text) |
| --commerce / --payments / --inventory / --ship | #10b981 / #38bdf8 / #f59e0b / #f97316 | Only where that plugin is named |
| --error | #8a1f1f | Errors only |

One accent (ultraviolet). No gradients, no glows.

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
