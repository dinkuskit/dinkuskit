# dinkuskit.com light/dark switch

Ledger entry `website-theme-switch-20261023`. On 23 Oct 2026 Ronald asked for
a light/dark switch: the redesign was proofed in both modes, but visitors had
no way to pick one.

## What a visitor gets

- The page follows their system setting until they press the switch at the end
  of the header menu.
- A press picks the other mode, and this browser keeps the choice: on every
  page, and after a reload.
- A kept choice is applied by a small script in `<head>` before the page
  paints, so a reload never flashes the other mode.
- The switch is a button named "Dark mode", pressed when the page is dark. It
  shows a moon in light mode and a sun in dark mode, and works with Enter and
  Space.
- Without scripts the switch stays hidden and the system setting decides, as
  before.

## How the colors follow

Each palette color in `src/styles/site.css` is now one `light-dark(light, dark)`
pair holding the same values as before. The switch sets `data-theme` on `<html>`,
which sets `color-scheme`, and every pair follows it. This is the token pattern
from the emdash-stitch-design skill's visual cycle, and it replaces the
separate dark block, so the dark colors live in one place.

The dithered wash reads `--paper` as that pair. The skill's shader resolves it
against `data-theme` on every frame, and its observer redraws when the
attribute changes, so a paused wash (reduced motion) takes the new colors too.

## Checks (Chromium, headless, Playwright, dev server, Node 24.22.0)

| # | Situation | Result |
| --- | --- | --- |
| 1 | System light, first visit to / | no `data-theme`, page `rgb(249, 250, 248)`, switch shown, not pressed, moon; wash average 205 |
| 2 | Press the switch | `data-theme="dark"`, stored `dark`, page `rgb(17, 24, 23)`, pressed, sun; wash average 96 |
| 3 | Reload | still dark, pressed |
| 4 | Reload with the module scripts blocked | still dark from the head script alone; the switch stays hidden |
| 5 | Open /docs/troubleshooting | dark, pressed (docs share the header) |
| 6 | Press on the docs page | light, stored `light` |
| 7 | System dark, first visit to /start | no `data-theme`, page dark, switch pressed |
| 8 | Press | light, stored `light`, wash average 205 |
| 9 | No choice yet, system turns dark on an open page | page dark, switch turns pressed |
| 10 | Reduced motion, system light | page light, wash average 205 |
| 11 | Reduced motion, press | page dark, still wash redrawn dark (average 96) |
| 12 | Phone 390x844, Enter on the focused switch | dark, pressed, focus ring shown |
| 13 | Phone, Space | light; no sideways scroll in any case |

"Wash average" is the mean brightness (0 to 255) of the wash canvas.

Images: `home-light-desktop-header.webp`, `home-dark-desktop-header.webp`
(after one press; the purple edge is the hover state), `docs-dark-desktop-header.webp`,
`home-dark-phone-header.webp` and `home-light-phone-header.webp` (keyboard focus
ring shown).

## Also run

`npm run test:theme-switch` (new, in `verify`): the switch follows the system
until pressed and then keeps the choice; the head script applies `light` or
`dark` and ignores anything else; a browser that refuses storage still switches
the open page; every palette color has both halves and nothing else reads
`prefers-color-scheme`. Plus `npm run typecheck`, `npm run build`,
`npm run test:pages-import`, `npm run test:docs-routes`, `npm run test:smoke`
and `npm run audit:repo`.

## Limits

`light-dark()` needs Chrome or Edge 123, Firefox 120 or Safari 17.5 (all from
2024) or newer. No deploy and no CMS change: the switch ships with the next
deploy and needs no page import.
