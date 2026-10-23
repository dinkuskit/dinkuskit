# dinkuskit.com 3D plugin cubes on `/start`

Source: branch `agy/start-3d-plugin-cubes` at `git:93d79e7617d92957798d7e879bb4946f32c64319` (base `main` `3cea4e5e6e4854c3f05a217663d1e3a07400e994`, including merged #80, #81, #82, and #83), ledger entry `start-3d-plugin-cubes-20261023`.

## What a visitor gets

- The plugin row at the top of `/start` (`Commerce + Payments + Ship`) renders interactive, drag-to-orbit 3D glTF 2.0 `.glb` cubes (`84×84` CSS px on desktop at `2x` DPR = `168×168` WebGL canvas; `56×56` CSS px on a phone at `2x` DPR = `112×112` WebGL canvas) powered by Three.js Studio WebGL PBR and a 6-strip HDR Studio Softbox environment (`PMREMGenerator`).
- Each cube has its own articulated child-node motion:
  - **Commerce** (`public/models/plugins/commerce.glb`, `952,802` bytes, UTF-8 embedded glTF 2.0): continuous 360° turntable rotation with a deep obsidian-graphite storefront body, glowing emerald showroom windows, and a shadow-unoccluded 6-bar blunt typographical Dinkus `*` asterisk roof skylight.
  - **Payments** (`public/models/plugins/payments.glb`, `318,354` bytes, UTF-8 embedded glTF 2.0): hero three-quarter isometric sway keeping the front POS slot and tilted `15°` anodized blue EMV card in view while the card dips into the reader and pulses electric cyan (`#38BDF8`).
  - **Inventory** (`public/models/plugins/inventory.glb`, `346,609` bytes, UTF-8 embedded glTF 2.0, available for standalone `<PluginCube3D plugin="Inventory" standalone />` mounting): continuous 360° turntable rotation with 3 CNC-chamfered strata and 2 multi-louver "Breathing Gill" chambers pulsing warm amber-to-gold.
  - **Ship** (`public/models/plugins/ship.glb`, `362,984` bytes, UTF-8 embedded glTF 2.0): continuous 360° turntable rotation with DOM-order-independent cycle timing (`t - inst.phaseOffset`), non-overlapping sequential top carton flap closing (`flap_left`, `flap_right`), and dual-side serrated kraft packing tape dispensing (`tape_back`, `tape_top`, `tape_front`).
- Until the `.glb` finishes loading—or when scripts are disabled, WebGL is unavailable, or `prefers-reduced-motion: reduce` is active (at initial load or toggled live)—each slot displays its static 2D `/brand/*.webp` poster (`[data-plugin-cube-fallback]`). When a `.glb` model fails to load (`onModelError`), `src/fx/plugin-cubes-3d.ts` disposes the WebGL renderer (`renderer.dispose()`).
- `scripts/pages-import.mjs` registers all 6 brand and plugin 2D `.webp` poster assets (`commerce.webp`, `payments.webp`, `inventory.webp`, `ship.webp`, `dinkuskit-f3-cube.webp`, `dinkuskit-f3-trio.webp`) into `POST /_emdash/api/media` with `deduplicate=true` (SHA-1 `contentHash` deduplication) and descriptive `alt` text so `/_emdash/admin` Media Library (`GET /_emdash/api/media`) lists and manages them without weakening `src/emdash-namespace-guard.ts`.

## How the 3D cubes and Media Library fallback work

`src/components/PluginCube3D.astro` renders the 2D `.webp` fallback image (`data-plugin-cube-fallback`) alongside a hidden `[data-plugin-cube]` stage container (`hidden` in SSR HTML). On the client, `src/fx/plugin-cubes-3d.ts` (zero-`any` TypeScript) checks `window.matchMedia('(prefers-reduced-motion: reduce)')` before loading `/vendor/three.min.js` and `/vendor/GLTFLoader.js`, then loads `/models/plugins/*.glb` directly via `GLTFLoader.load`. Once `onModelLoaded` fires, the stage un-hides and `li.has-3d-cube` hides the 2D `.webp` fallback image; if `onModelError` fires, `renderer.dispose()` cleans up the WebGL context and keeps the 2D fallback visible. A live `matchMedia('(prefers-reduced-motion: reduce)')` `'change'` listener (`syncReducedMotion`) cancels `requestAnimationFrame`, hides the `.plugin-cube-3d` stages, removes `has-3d-cube`, and restores the 2D `.webp` fallback immediately when reduced motion is turned on (retaining the initialized WebGL renderers and scene resources so animation can resume without reloading if reduced motion is turned back off).

## Checks (Chromium, headless, DevTools Protocol, dev server, Node 24.22.0)

| # | Situation | Result |
| --- | --- | --- |
| 1 | System light, first visit to `/start` (`1280×900`, `2x` DPR) | `switchPressed="false"` (moon icon), 3 plugin items (`Commerce`, `Payments`, `Ship`) upgraded to `li.has-3d-cube` with active `168×168` WebGL canvases, `[data-plugin-cube-fallback]` `display: none`, footer columns `Get started`, `Plugins`, `DinkusKit`, no sideways scroll (`overflow: false`) |
| 2 | Press the header Dark mode switch (`[data-theme-switch]`) | `data-theme="dark"`, `localStorage.getItem("dinkuskit-theme") === "dark"`, `switchPressed="true"` (sun icon), all 3 WebGL `.glb` cubes remain active (`cubesActive: 3`) with neon edge piping and drop-shadow halos against dark `--surface` |
| 3 | Live `prefers-reduced-motion: reduce` switched on with `/start` open | `has-3d-cube` count drops `3 -> 0`, all 3 `.plugin-cube-3d` stages set `hidden` (`stageHiddenCount: 3`), `requestAnimationFrame` loop cancelled (retaining initialized renderers/scene resources for resume), all 3 static 2D `/brand/*.webp` fallbacks visible (`fallbackVisibleCount: 3`) |
| 4 | Reduced motion from first load (`prefers-reduced-motion: reduce`) | `has3dCount: 0`, `canvasCount: 0` (Three.js/WebGL never initialized), all 3 static 2D `/brand/*.webp` posters visible (`fallbackVisibleCount: 3`) |
| 5 | Phone `390×844` (`2x` DPR), dark mode | `switchPressed="true"`, 1 plugin per row with `+` separators, all 3 items upgraded to `li.has-3d-cube` at `56×56` CSS px (`112×112` WebGL canvas), no sideways scroll (`overflow: false`) |
| 6 | Reload `/start` with scripts disabled (no-JS fallback) | `has3dCount: 0`, all 3 `.plugin-cube-3d` stages remain `hidden` (`stageHiddenCount: 3`), theme switch stays `hidden`, all 3 `/brand/{commerce,payments,ship}.webp` images loaded (`complete: true`, `naturalWidth`: `256`, `246`, `234`, `display: block`) |
| 7 | Standalone 4-cube Motion Studio showcase (`dinkuskit-plugin-cubes-pbr.html`) | `verify_motion.py`: `"overall_passed": true`, 0 console errors, 0 page errors, 4 active WebGL canvases across all 4 plugin `.glb` assets (`Payments`, `Ship`, `Inventory`, `Commerce`) at front, back (`yaw=215°`), and open-flap timeline cues |

## Immutable Proof Assets (`dinkuskit/dinkus-pr-assets`)

Published to release [`dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9`](https://github.com/dinkuskit/dinkus-pr-assets/releases/tag/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9) (sanitized local fixture and standalone Studio WebGL PBR captures; zero credentials, tokens, cookies, or customer data):

| Asset | Viewport / Cue | Bytes | SHA-256 | Immutable URL |
| --- | --- | ---: | --- | --- |
| `start-plugin-row-light.png` | `/start` plugin row (`988×159` clip at `2x` DPR, light) | `177,254` | `cf75f0f734fb4001a1adce1d83bf754f8f00e5c9573b94e08ef6e93f849ccd0d` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/start-plugin-row-light.png) |
| `start-plugin-row-dark.png` | `/start` plugin row (`988×159` clip at `2x` DPR, dark) | `180,295` | `a435da37068e94733849077dcb777503216bfef0ea9b3f64f945c387443f8a74` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/start-plugin-row-dark.png) |
| `start-desktop-light.png` | `/start` full page (`1280×900`, light, with header switch & footer) | `1,753,155` | `b2506419df0451dc2de0bcfd465e95259591354d009bcdad059dedb1ca722a84` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/start-desktop-light.png) |
| `start-desktop-dark.png` | `/start` full page (`1280×900`, dark, after pressing header switch) | `1,830,842` | `c652c96aad4fc91267c5b90fb33d937ca7d04d33c4bb3a539feec83c1d188344` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/start-desktop-dark.png) |
| `start-mobile-dark.png` | `/start` full page (`390×844`, dark, stacked plugin row + footer) | `965,287` | `ac322b3e21706de5ea91e755232848fd67aaceac59d2a3a165b85080512f9399` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/start-mobile-dark.png) |
| `cubes-studio-front.png` | 4-cube Studio WebGL PBR showcase (`1280×900`, front hero) | `1,254,455` | `cfba0c2cb0d0cf957c083a50e6b0fdd19bf88303337bf6490ff0bced96dccb9b` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/cubes-studio-front.png) |
| `cubes-studio-back.png` | 4-cube Studio WebGL PBR showcase (`1280×900`, back `yaw=215°`) | `1,234,645` | `01dc08bd701eb444a35a82bd0e96922f0606da8dd198f90656b392ff861ae615` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/cubes-studio-back.png) |
| `cubes-studio-flaps-open.png` | 4-cube Studio WebGL PBR showcase (`1280×900`, Ship flaps open) | `1,298,106` | `f427daf108f3a7acc77d2153ce4afa6587c2b64f8dce2fee98a5ffb66196d366` | [Download](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-start-3d-plugin-cubes-20261023-93d79e7617d9/cubes-studio-flaps-open.png) |

## Also run

- `./scripts/grilltrack --project . validate` — `valid`
- `npm run audit:repo` — `Repository path/manifest checks passed (452 files).`
- `npm run typecheck` — `0 errors, 0 warnings` across 108 files; zero `/\bany\b/u` matches in `src/fx/plugin-cubes-3d.ts` and `src/components/PluginCube3D.astro`
- `npm run build` — server build completed cleanly
- `node --experimental-strip-types --test tests/start-page.test.mjs` — 3/3 pass (`start checklist`, `start page`, `plugin 3D .glb cubes: binary glTF 2.0 assets, zero-any runtime, and reusable component contract`)
- `npm run test:theme-switch` — 4/4 pass
- `npm run test:pages-import` — pass (`added four block types and the card logo field, allowed them, registered six brand .webp media items in /_emdash/api/media, added and published /start, added the footer menus and site title and tagline; a rerun keeps everything`)
- `npm run test:docs-routes` — 4/4 pass
- `review-tools proof-assets --repo . --base 3cea4e5e6e4854c3f05a217663d1e3a07400e994 --head HEAD --asset-repo dinkuskit/dinkus-pr-assets --json` — `result: "pass"`, `required_fix: 0`

## Limits

This proof runs against the local EmDash fixture and headless Chromium, not live `dinkuskit.com`. Deploying to `dinkuskit.com` and running `pages-import.mjs --page start` against production remain human-gated maintainer actions.
