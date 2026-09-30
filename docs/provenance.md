# Public source provenance

This repository has independent Git history. No history, private source, operational records or environment files were imported from another project.

The Astro/Node/React/EmDash configuration and live collection registration were adapted from the public MIT-licensed [EmDash blank template at 1.0.1](https://github.com/emdash-cms/emdash/tree/0e8977c221dd8e5111511eb226faa3d164c829ef/templates/blank). Dependency pins follow that release's workspace catalog, with an explicit SQLite runtime dependency.

Native page composition uses the public `Blocks` component from `emdash/ui`, versioned `blocks` fields, and a local `text_section` renderer. This is EmDash's CMS page-block API, distinct from the React Block Kit used by sandboxed plugin admin screens. It does not depend on `@dinkuskit/blocks` or reuse a legacy block implementation.

The public [DinkusKit store template's native-block migration documentation](https://github.com/dinkuskit/template-store/blob/main/docs/implementation/upstream-blocks-transition.md) was consulted for field and seed conventions. No store template code, legacy blocks, inventory data, seed content, lockfile, or Git history was copied. The two starter pages and checks were authored for this repository.

The authentication research links upstream source at immutable commit `0e8977c221dd8e5111511eb226faa3d164c829ef`. Feasibility checks import only `@emdash-cms/auth` public exports. The DinkusKit account identity and proof-labeled JWT bridge were authored here; synthetic HTTP/session/site-control runtime lives in `tests/helpers`. Inventory and Payments verifier source was read for contract shape and was not copied. `@emdash-cms/auth` 1.0.1 is a direct test dependency; `jose` 6.2.12 (the foundation lockfile version) is a direct dependency for the local issuer and compatibility checks.

Merchant product routes use Better Auth 1.7.6 public APIs (`betterAuth`, `magicLink` with hashed tokens, native D1 `database` binding). Schema SQL was compiled from that version via `getMigrations`. `@emdash-cms/cloudflare` 1.0.1 and `@astrojs/cloudflare` 14.3.3 were inspected for the remaining whole-site adapter conversion and were not used to replace the Node CMS adapter in this slice. Community `emdash-better-auth` is not a dependency.

The authentication research links upstream source at immutable commit `0e8977c221dd8e5111511eb226faa3d164c829ef`; it contains findings and proof criteria, not copied authentication code.

The hosted Cloudflare candidate uses public `@astrojs/cloudflare` 14.3.3, `@emdash-cms/cloudflare` 1.0.1 (`d1`, `r2`, `access`, `@emdash-cms/cloudflare/worker`, `@emdash-cms/cloudflare/auth` `authenticate`), and official EmDash docs for installation, themes, and Cloudflare deployment. No EmDash internals were forked. Operator allowlist, Access team, and audience values are runtime/build input and are not stored in this repository.
