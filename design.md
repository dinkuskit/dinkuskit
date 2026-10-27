# Design direction

The current public design is the Stitch “Expressive Emerald & Ultraviolet” system recorded in `.stitch/DESIGN.md` and implemented in `src/styles/site.css`. It supersedes the September 30 green-led introduction palette.

Use the existing CSS tokens: ultraviolet `--accent`/`--mark`, emerald `--focus` and action buttons, graphite surfaces, and the product-specific cyan, amber and orange accents. New components must inherit these tokens and their light/dark values instead of hard-coding an older green palette. Preserve readable typography, the accepted layout and current logo treatment. Bobby reaffirmed this direction for DinkusGuide on October 27, 2026.

Confirmed constraints: use EmDash and upstream native blocks; serve existing EmDash site owners first; keep merchant sign-in separate from website editing; merchant account routes exist, but do not present hosted trial activation, site grants, or Stripe connection as working; describe unavailable account and service features honestly.

The approval covers the current desktop public-page presentation. It does not claim mobile proof or approve new account/portal designs.
