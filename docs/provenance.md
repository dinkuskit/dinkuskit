# Public source provenance

This repository has independent Git history. No history, private source, operational records or environment files were imported from another project.

The Astro/Node/React/EmDash configuration and live collection registration were adapted from the public MIT-licensed [EmDash blank template at 1.0.1](https://github.com/emdash-cms/emdash/tree/0e8977c221dd8e5111511eb226faa3d164c829ef/templates/blank). Dependency pins follow that release's workspace catalog, with an explicit SQLite runtime dependency.

Native page composition uses the public `Blocks` component from `emdash/ui`, versioned `blocks` fields, and a local `text_section` renderer. This is EmDash's CMS page-block API, distinct from the React Block Kit used by sandboxed plugin admin screens. It does not depend on `@dinkuskit/blocks` or reuse a legacy block implementation.

The public [DinkusKit store template's native-block migration documentation](https://github.com/dinkuskit/template-store/blob/main/docs/implementation/upstream-blocks-transition.md) was consulted for field and seed conventions. No store template code, legacy blocks, inventory data, seed content, lockfile, or Git history was copied. The two starter pages and checks were authored for this repository.

The authentication research links upstream source at immutable commit `0e8977c221dd8e5111511eb226faa3d164c829ef`. Feasibility checks import only `@emdash-cms/auth` public exports. The DinkusKit account identity and proof-labeled JWT bridge were authored here; synthetic HTTP/session/site-control runtime lives in `tests/helpers`. Inventory and Payments verifier source was read for contract shape and was not copied. `@emdash-cms/auth` 1.0.1 is a direct test dependency; `jose` 6.2.12 (the foundation lockfile version) is a direct dependency for the local issuer and compatibility checks.

Merchant product routes use Better Auth 1.7.6 public APIs (`betterAuth`, `magicLink` with hashed tokens, native D1 `database` binding). Schema SQL was compiled from that version via `getMigrations`. `@emdash-cms/cloudflare` 1.0.1 and `@astrojs/cloudflare` 14.3.3 were inspected for the remaining whole-site adapter conversion and were not used to replace the Node CMS adapter in this slice. Community `emdash-better-auth` is not a dependency.

The authentication research links upstream source at immutable commit `0e8977c221dd8e5111511eb226faa3d164c829ef`; it contains findings and proof criteria, not copied authentication code.

The hosted Cloudflare candidate uses public `@astrojs/cloudflare` 14.3.3, `@emdash-cms/cloudflare` 1.0.1 (`d1`, `r2`, `access`, `@emdash-cms/cloudflare/worker`, `@emdash-cms/cloudflare/auth` `authenticate`), and official EmDash docs for installation, themes, and Cloudflare deployment. No EmDash internals were forked. Operator allowlist, Access team, and audience values are runtime/build input and are not stored in this repository.

## Vendored 3D runtime scripts and first-party glTF 2.0 plugin cube assets

The `/start` 3D plugin cube runtime loads two MIT-licensed browser runtime files from upstream [Three.js `r128` (`three@0.128.0`)](https://github.com/mrdoob/three.js/tree/r128) (`Copyright 2010-2021 Three.js Authors`, `SPDX-License-Identifier: MIT`):

- `public/vendor/three.min.js`: unmodified upstream [`build/three.min.js` at tag `r128`](https://github.com/mrdoob/three.js/blob/r128/build/three.min.js) (`THREE.REVISION = "128"`, `603,445` bytes, SHA-256 `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2`). Carries the upstream `@license` / `SPDX-License-Identifier: MIT` header at lines 1–5 with zero local modifications.
- `public/vendor/GLTFLoader.js`: upstream [`examples/js/loaders/GLTFLoader.js` at tag `r128`](https://github.com/mrdoob/three.js/blob/r128/examples/js/loaders/GLTFLoader.js) (`96,755` bytes, SHA-256 `61f0b1c81fd99e10ffe59fc762c7dd64ff06a14a0861593f09380f6d995a6de9`). The only local modification is prepending the 6-line `@license` / `Copyright 2010-2021 Three.js Authors` / `SPDX-License-Identifier: MIT` / upstream source URL comment header at lines 1–6 above the unmodified `r128` IIFE body (`96,550` bytes, upstream SHA-256 `5c15967ba830918a9caea6338712c994c354bccd4edc4569bde411c3ec06a3e6`).

The four 3D plugin cube models (`public/models/plugins/commerce.glb`, `public/models/plugins/payments.glb`, `public/models/plugins/inventory.glb`, and `public/models/plugins/ship.glb`) and their runtime controller (`src/fx/plugin-cubes-3d.ts`, `src/components/PluginCube3D.astro`) were authored specifically for this repository as first-party procedural Three.js `r128` PBR assets (`THREE.GLTFExporter r128`). Each model is stored in UTF-8 embedded glTF 2.0 container format (`asset.version: "2.0"` with `data:application/octet-stream;base64,...` buffer URIs, deduplicated `bufferViews`, and `UNSIGNED_SHORT` triangle indices, loaded natively by `THREE.GLTFLoader.prototype.parse`) so the scene graph (`nodes`, `meshes`, `materials`, `textures`, `images`, `accessors`, `bufferViews`, `buffers`) is human-auditable in Git diffs without opaque binary blobs.

