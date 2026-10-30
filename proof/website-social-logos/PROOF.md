# dinkuskit.com Discord and GitHub logos

Issue [#106](https://github.com/dinkuskit/dinkuskit/issues/106). Source: branch
`claude/project-thread-1vasfg` from main `6e4140c`.

## What a visitor gets

- The header shows the GitHub and Discord logos before the light/dark switch,
  in place of the "GitHub" text link.
- The footer shows the same two logos beside the tagline. GitHub leaves the
  DinkusKit column; Website source (the website's own repository) stays there
  as text.
- Each logo is a link whose name is real, visually hidden text: "DinkusKit on
  GitHub", "Join DinkusKit on Discord". The logo is `aria-hidden`, so a screen
  reader reads the name once, and nothing depends on a tooltip.
- Both open in the same tab, like every other header link. An editor who sets
  a link to open in a new tab gets that in both places, with
  `rel="noopener noreferrer"` and "(opens in a new tab)" in the name.
- Each logo is a 44x44 target with the site's green focus ring.

## Where the links live

Both are links in the existing EmDash menu `footer-dinkuskit`, marked with
EmDash's own menu-item "CSS classes" field (`social-github`,
`social-discord`). `src/components/social-links.ts` picks them in menu order
(one of each kind), and `SocialLinks.astro` draws them in the header and the
footer, so each URL lives in one place. No EmDash field, setting or internal
was added or patched. EmDash 1.2.0 (the pinned version) has `cssClasses` on
menu items in the seed, the admin and the REST API.

## Logos

Drawn by `astro-iconset` 0.0.6, the integration EmDash's marketing template
uses, with `@iconify-json/simple-icons` 1.2.100 (Simple Icons 16.35.0,
CC0-1.0; Simple Icons takes each mark from its brand's official assets). Only
`simple-icons:discord` and `simple-icons:github` are bundled, inline SVG at
build time, with no request to an icon service. The marks remain the
trademarks of Discord Inc. and GitHub, Inc.

## Fresh seed and existing CMS

- Fresh seed: `seed/seed.json` marks GitHub `social-github` and adds Discord
  (`https://discord.gg/7yHZGj8p88`, from Ronald) marked `social-discord`.
- Existing CMS (dinkuskit.com): `npm run pages:import -- --url … --footer`
  adds the seed's class to the menu link with the same URL when it lacks it,
  keeps the link's other classes, label and position, and inserts Discord
  after GitHub like any new seed link; nothing else changes (`DEPLOY.md`,
  "Discord and GitHub logos").

## Checks (Node 24.22.0)

| Command | Result |
| --- | --- |
| `npm run typecheck` | 0 errors, 0 warnings |
| `npm run test:pages-import` | 15 unit tests pass; the existing-CMS run marks GitHub once and adds Discord after it, a rerun changes nothing, editor order kept; `/start` shows both logos with their names in header and footer, an editor's new-tab choice for Discord with `rel` and text, no GitHub text in the header or the column |
| `npm run test:docs-routes` | a fresh seed's published page shows both logos in header and footer, Website source stays in its column |
| `npm run test:cms-operation`, `npm run test:emdash-upgrade` | pass; the upgrade check builds the cms-operation config inside the pinned 1.0.1 source, which has no logos, so that config adds the icon integration only when the logos exist |
| `npm run build`, `npm run build:cloudflare` | both build |
| `npm run test:theme-switch`, `npm run audit:repo` | pass |

Browser (Chromium, headless, Playwright, docs preview dev server, `/start`):
desktop 1280x800 and phone 390x844, light and dark. No sideways scroll in any
of the four. Every logo link measures 44x44. Tab reaches GitHub then Discord
in the header, focus ring shown (`desktop-light-header-focus.webp`).

## Limits

- Discord's API answers the invite with the DinkusKit server (guild
  "DinkusKit") and no `expires_at`: it does not expire. Not checked: the join
  screen as seen by a signed-out visitor in a browser.
- Local proof only: nothing was deployed and the live CMS was not changed.
