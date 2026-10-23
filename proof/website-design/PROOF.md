# dinkuskit.com design: home (H4) and Start your store

Source: branch `claude/project-thread-9pyz0c` at `10edce5` (main merged in,
including #80's home copy), ledger entry `website-design-20261023`. The review
fixes below were checked on the commit that adds this section.

## How it was captured

`npm run dev` (Node 24.22.0) in the cloud container with the local EmDash
database. That database predates this branch's seed, so it was brought up to
date the way the live CMS will be: `scripts/pages-import.mjs --page home` and
`--page start` added the Plugin logo field and the Plugin row block, then the
admin API loaded the seed's home and /start content (#80's home words with
Commerce, Ship and Payments picked on the first three cards; the Plugin row at
the top of /start; no Connect note on step 3), as an editor would.
Chromium (headless, Playwright) took full-page shots at 1280x900 and 390x844
(phones at 2x, saved at 390 wide), light and dark. The wash and card dither
are the real effects, so each shot holds one frame of them. The wash is fixed
to the window, so a visitor sees it behind the whole page as they scroll; a
full-page shot would paint it only on the first screen, so for these shots it
was stretched to the page height.

## What it showed

| Check | Result |
| --- | --- |
| Sideways scroll | none on either page, any size or scheme |
| Broken images | none |
| Home cards | logo on the left, centered top to bottom; the card without one keeps its text in line; on a phone the logo sits above the heading |
| Page bodies | no DinkusKit logo; the F3 trio is only in the header |
| /start plugin row | Commerce + Payments + Ship on desktop; one plugin a row on a phone |
| /start progress | "0 of 4 done" with segment 1 marked next; ticking steps 1 and 2 fills two segments and marks the third; four ticks fill all four, show the done message and survive a reload |
| /start order lock (main's #73) | later steps stay locked with "Finish step 1 first" under their headings |

## Images

`home-{light,dark}-{desktop,phone}.webp`,
`start-{light,dark}-{desktop,phone}.webp`, and `bar-two-ticked.webp` (the
checklist head after two ticks).

## Review fixes (ClawSweeper on `9573485` and `5ebc2d8`)

Same local server, after the three fixes:

| Check | Result |
| --- | --- |
| Design notes | `.stitch/DESIGN.md` now calls the brand images owner-supplied; no repository or branch is named |
| Docs in dark mode (`/docs/troubleshooting`, search for "Stripe") | search box `rgb(23, 34, 32)` behind `rgb(236, 253, 245)` text; table header `rgb(20, 29, 27)` (it was EmDash's light `#f5f5f5` fallback); phone menu `rgb(17, 24, 23)` (it was `#f7f8f4`). Light mode keeps light surfaces. `docs-dark-desktop.webp`, `docs-dark-phone-menu.webp` |
| Reduced motion switched on with the page open (Playwright `emulateMedia`) | mouse on card 2: card tilted (`--ry` 2.80deg), wash running (1 live). After the switch: no tilt class, tilt variables cleared, `transform: none`, wash stopped (0 live), and moving the mouse changes nothing. Switching back restores both |
| Reduced motion from the first load | no tilt with the mouse on a card, wash not running |

`src/docs/docs.css` now uses the site's color tokens, and `site.css` points
EmDash's own content-component colors (`--color-surface`, `--color-border`,
`--color-muted`, `--color-bg-subtle`) at the palette, so Portable Text tables
follow dark mode. `src/fx/surface-fx.ts` listens for reduced-motion changes:
the cards drop their tilt and any pending frame, and the viewport pool stops or
restarts the wash.

## Also run on this head

`npm run typecheck` (0 errors), `npm run build`, `npm run test:pages-import`
(now covering the new field and block), the start checklist test in
`tests/start-page.test.mjs` (now covering the bar), and `npm run audit:repo`
pass. `npm run test:foundation` passed 9 of 11 here: the two account
foundation tests that open SQLite failed to load `better-sqlite3`, which this
container built for Node 22 (`NODE_MODULE_VERSION 127`) while the tests ran on
Node 24; nothing in this change touches them.

## Limits

No deploy and no live CMS change. The live site needs this branch deployed,
then `pages-import --page home --page start` in the owner's paste (adding a
block type is an Admin action), then an editor picks the card logos and adds
the Plugin row to /start.
