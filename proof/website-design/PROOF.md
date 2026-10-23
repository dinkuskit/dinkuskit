# dinkuskit.com design: home (H4) and Start your store

Source: branch `claude/project-thread-9pyz0c` at `10edce5` (main merged in,
including #80's home copy), ledger entry `website-design-20261023`.

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
