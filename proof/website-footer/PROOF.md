# dinkuskit.com footer: pick 3B

Ledger entry `website-footer-20261023`. Stitch round 8 made five footers
(FT1 to FT5) on the real home page; Ronald liked FT3's big wordmark with FT4's
dither strip, and a Stitch tiebreaker placed the strip four ways (3A to 3D).
He picked 3B: the strip as the divider between the wordmark row and the links.

## What is editable

| Footer part | Where an editor changes it |
| --- | --- |
| DinkusKit (large) | Settings, site title |
| "Built with EmDash. Growing in the open." | Settings, tagline |
| Get started, Plugins, DinkusKit columns | Menus `footer-get-started`, `footer-plugins`, `footer-dinkuskit` (the menu's label is the column heading) |
| Plugin logos beside Commerce, Payments, Ship | shown for a link whose label is a plugin name |

A column whose menu is missing or empty is left out. The footer carries no
DinkusKit logo; the F3 trio stays in the header.

## How it was captured

`npm run dev` (Node 24.22.0) in the cloud container with the local EmDash
database, which had no footer menus or site settings, as dinkuskit.com's
database has none from this seed. `scripts/pages-import.mjs --footer` added
the three menus (3, 3 and 4 links) and set the empty title and tagline; a
second run kept all five. Chromium (headless, Playwright) then shot the footer
at 1280x900 and 390x844 (phones at 2x, saved at 390 wide), light and dark,
with the wash stretched page-long as in `proof/website-design`.

| Check | Result |
| --- | --- |
| Home, docs and /start | the footer shows three columns, the strip and the title and tagline |
| Strip | 9px, emerald to ultraviolet, dithered by the 12px Bayer tile; the docs page (no effects script) uses the same tile from `site.css` |
| Phone | one column, no sideways scroll |
| Broken images | none |

Images: `home-{light,dark}-{desktop,phone}.webp`, `docs-dark-desktop.webp`.

## Also run

`npm run test:pages-import` (now covering the footer menus, site settings, an
editor's added link and tagline surviving a rerun, and the rendered footer),
`npm run typecheck` (0 errors), `npm run build`, `npm run audit:repo`.

## Limits

No deploy and no live CMS change. After deploy, the owner's paste runs
`pages-import --footer` (setting an empty title or tagline is an Admin action);
it prints the title and tagline the footer will show.
