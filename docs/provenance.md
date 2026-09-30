# Public source provenance

This repository has independent Git history. No history, private source, operational records or environment files were imported from another project.

The Astro/Node/React/EmDash configuration and live collection registration were adapted from the public MIT-licensed [EmDash blank template at 1.0.1](https://github.com/emdash-cms/emdash/tree/0e8977c221dd8e5111511eb226faa3d164c829ef/templates/blank). Dependency pins follow that release's workspace catalog, with an explicit SQLite runtime dependency.

Native page composition uses the public `Blocks` component from `emdash/ui`, versioned `blocks` fields, and a local `text_section` renderer. This is EmDash's CMS page-block API, distinct from the React Block Kit used by sandboxed plugin admin screens. It does not depend on `@dinkuskit/blocks` or reuse a legacy block implementation.

The public [DinkusKit store template's native-block migration documentation](https://github.com/dinkuskit/template-store/blob/main/docs/implementation/upstream-blocks-transition.md) was consulted for field and seed conventions. No store template code, legacy blocks, inventory data, seed content, lockfile, or Git history was copied. The two starter pages and checks were authored for this repository.

The authentication research links upstream source at immutable commit `0e8977c221dd8e5111511eb226faa3d164c829ef`; it contains findings and proof criteria, not copied authentication code.
