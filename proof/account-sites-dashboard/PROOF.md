# `/account/sites` dashboard layout overhaul · Issue #123

Completes [dinkuskit/dinkuskit#123](https://github.com/dinkuskit/dinkuskit/issues/123) on top of merged PR #124 (`378d8597f086c3dcb582b40b824aa7575265dc8d`).

## Source and changes

- Base: `origin/main` `a84c69fd9abbcb219a0c09668254d290df6950b8`
- Implementation commit: `164fe5eaccbc1111768a1516a6a12679c40c54df`
- Files changed:
  - `src/styles/site.css`: adds `.account-panel.stores-dashboard` (`max-width: 1020px`) using existing layout tokens.
  - `src/components/account/YourStores.astro`: replaces the narrow `24rem` `.account-form` wrapper with `<article class="store-card store-setup">`, adds store header (`siteOrigin`, live dot, `Test mode`/`Live mode` badge, `Store ID` chip), replaces raw bulleted `<ul><li>` lists and stacked buttons with structured `.status-list` / `.status-row` panels (2-column side-by-side `Connected plugins` | `Store services` on desktop, single-column stack on mobile) and compact secondary/quiet action buttons, and styles the native `Plugins` / `Shipping` / `Payments` tabs, `:has(input:checked)` choice cards, `$`-prefixed stacked currency fields, and light/dark surfaces with existing `site.css` tokens. Preserves all of PR #124's native tab links, `aria-current="page"`, independent POST actions (`shipping_settings`, `payments_settings`, `disconnect_plugin`, `service`, `revoke`), CSS `:has()` Free/Flat reveal, accessibility labels/roles, and test contracts.
  - `tests/checkout-settings-browser.test.mjs`: adds desktop width (`> 700px`), `list-style: none`, and desktop side-by-side vs mobile stacked panel layout assertions.

## Verification

All `npm run verify` stages pass across the three CI parts (`scripts/verify-ci.mjs`) on implementation commit `164fe5eaccbc1111768a1516a6a12679c40c54df`:

- `NODE_OPTIONS=--max-old-space-size=1152 node scripts/verify-ci.mjs site` (Node `v24.22.1`): `audit:repo`, `test:history-archive`, `test:guide-ui`, `build:dinkusguide-plugin`, `test:dinkusguide-plugin`, `setup`, `types:wrangler`, `typecheck` (118 files, 0 errors, 0 warnings, 5 inherited hints), `test:theme-switch`, `test:docs`, `test:account`, `test:catalog`, `proof:catalog`, `test:e2e-contract`, `test:e2e-mailbox-contract`, `build`, `test:docs-routes`, `test:pages-import`, `test:docs-sync`, `test:smoke`, `test:public-release-reuse`, `test:cms-operation-helpers`, `test:access-gate`, `test:safe-http-url`, `test:workers-builds` (3/3) all passed.
- `mise exec node@24.22.0 -- npm run test:cms-operation` & `mise exec node@24.22.0 -- npm run test:emdash-upgrade`: both passed on pinned Node `v24.22.0`.
- `mise exec node@24.22.0 -- env NODE_OPTIONS=--max-old-space-size=1152 node scripts/verify-ci.mjs accounts`: `setup`, `types:wrangler`, `build`, `test:agent-routes`, `test:inventory-runner`, `test:shared-store` (51/51), `test:foundation` (12/12), `test:checkout-settings-browser` (1440px/390px light/dark + 200% phone root font), `test:inventory-overview`, `test:organization-approvals` (5/5), `test:operator-admin` (8/8), `test:dev-cms`, `test:cloudflare-candidate` all passed.
- `mise exec node@24.22.0 -- env NODE_OPTIONS=--max-old-space-size=1152 node scripts/verify-ci.mjs merchant`: `test:merchant` (24/24) passed.

Limits: synthetic local Better Auth sessions, disposable D1/KV, and simulated store-proof / Payments-status transports only; no live store, live processor operation, hosted deploy, or merge is claimed or performed.

## Sanitized Before / After Visual Proof

- Release: [`dinkuskit/dinkus-pr-assets` · `dinkuskit-issue-123-164fe5eaccbc`](https://github.com/dinkuskit/dinkus-pr-assets/releases/tag/dinkuskit-issue-123-164fe5eaccbc)
- Provenance: built Cloudflare Worker with local disposable D1/KV and synthetic `checkoutSettingsFixture` (`settings-one.stores.example`, `settings-two.stores.example`), JavaScript disabled, captured at `1440x900` (desktop) and `390x900` (mobile) in both `light` and `dark` color schemes.
- Redaction: synthetic fixture data only; no customer, merchant, or credential data.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| [`before-plugins-1440-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/before-plugins-1440-light.png) | 239048 | `8fa28291e898c4518b58d99e69b5e404aaced71e6b63986700463f56babdab69` |
| [`before-shipping-1440-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/before-shipping-1440-dark.png) | 209012 | `83afd6b4d25edf631785155d55e9a790cdc0a5e453da05b43df044f0fd52e949` |
| [`before-plugins-390-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/before-plugins-390-light.png) | 205111 | `9a72c2ecf201854f3a45d18ddcd25e86c7d6f016ad930f68d4e1f29ffce47f37` |
| [`before-shipping-390-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/before-shipping-390-dark.png) | 180258 | `13f1b295eec279e6b8246d4095aeca3322e1741cf83e13df2cbe78105a72d7ba` |
| [`after-plugins-1440-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-plugins-1440-light.png) | 238145 | `3f6a58167bee02b0c2f134e53915bfa3b6d0044cedd9babdc46f392723c49da2` |
| [`after-plugins-1440-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-plugins-1440-dark.png) | 238807 | `5a5cf26ee3d01005b521de2986b314b34f2af4ca50e379f979bc5438e9c8e47f` |
| [`after-shipping-1440-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-shipping-1440-light.png) | 215404 | `656725fd91e236409147e700a492286112a03f29bf70fb73845c042f97015bb2` |
| [`after-shipping-1440-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-shipping-1440-dark.png) | 216320 | `59edcc481e5e7f7f9a18153e5831c030facdb990dfc595c8f69a62b05834b819` |
| [`after-payments-1440-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-payments-1440-light.png) | 201641 | `9c09364ce3425fe61188f1f5ad02a4fc73080377281cb6fe2556656bf4a83f0c` |
| [`after-payments-1440-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-payments-1440-dark.png) | 202397 | `49f5ff7ab3eec9fb36fc93d7c483c728cba56d046279b563f171fb3aa75a7292` |
| [`after-plugins-390-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-plugins-390-light.png) | 226954 | `a321c2de90fdc84d4bd62744a70dcb0d26e57bfb6f81e8e43062ef5165738ea4` |
| [`after-plugins-390-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-plugins-390-dark.png) | 229172 | `6cb1a900e556a5029107b0c33cdf7cc9f2c99bfdd2fd80c8705654909a87dc55` |
| [`after-shipping-390-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-shipping-390-light.png) | 203883 | `c208ac015b5ab4b8ef2d5f82093d07b9343aef715ff47a9081474b39177724e1` |
| [`after-shipping-390-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-shipping-390-dark.png) | 206272 | `8105119dfc1fff222e3887249f70f1623f5d49ccc8a1d83b10bc360343b87f23` |
| [`after-payments-390-light.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-payments-390-light.png) | 191032 | `1ce10f6d032ac65d6bf5bc6975fb2ed5678193046651bd7698fcef3f6c623544` |
| [`after-payments-390-dark.png`](https://github.com/dinkuskit/dinkus-pr-assets/releases/download/dinkuskit-issue-123-164fe5eaccbc/after-payments-390-dark.png) | 193205 | `72b4ba9bf31cce76542ae4452b9f4bde75a1ed40805519a911198c902752ba85` |

## Gates

- Merge and hosted deployment remain human-gated.
