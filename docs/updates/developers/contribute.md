---
article: developers/contribute
base: sha256:260bcb0c138494c4b6af7b2eb4a534e50a8bbb6158b89c05de4b897ca98df0d2
title: "Make and verify a core contribution"
summary: "Choose the owning repository, make one focused change, and report the evidence for review."
audience: "Developers"
product: "DinkusKit contribution workflow"
version_scope: "Commerce 0.6.0 and Payments 0.4.0 repository contribution workflow; Node 24.22.0"
---

## Choose the repository

Keep the change with the module that owns the behavior. The website repository owns this documentation and site presentation. Commerce owns catalog, authoritative pricing, checkout orchestration, and orders. Payments owns provider transport and connection status. Inventory and Ship own their respective product boundaries.

Read the chosen repository's current `AGENTS.md`, charter, contribution guide, and verification scripts before editing. The commands below were reconciled against the pinned Commerce and Payments sources; they are not a universal command set for every DinkusKit repository.

## What ships and where it runs

A repository contains the product and the tools used to build and check it. A file being in that repository does not mean it is installed in a merchant's store.

| Part | What a store owner receives or uses | Where it runs |
| --- | --- | --- |
| Registry plugin | The installable plugin artifact, including its supported admin screens. | Inside EmDash's plugin sandbox when installed through the Registry. |
| Hosted service | An authenticated service used by a plugin or another permitted client. | In a separate service runtime, outside the plugin sandbox. |
| Template-store | A starting storefront to adapt for a real store. | In the site's host and the shopper's browser, with installed plugins providing their own capabilities. |
| Playground | A disposable demonstration with synthetic data and guided steps. | A separate demo configuration, which can use native host wiring. |
| Developer tools | Local previews, fixtures and test controls for contributors. | In explicitly started development or test environments, outside the merchant plugin artifact. |

### Block Kit is the screen contract

DinkusKit's plugin admin screens use Block Kit: the plugin returns blocks and EmDash renders them. A React wrapper around EmDash's `BlockRenderer` in a local test tool does not make the plugin a native React admin extension. Conversely, returning Block Kit blocks does not prove sandbox isolation: a native host entry can return the same blocks. Verify the installed artifact and runtime, not just how the screen looks.

For example, Commerce's `tools/orders-preview/` displays the real Orders blocks with synthetic records. Its surrounding **Synthetic orders**, **Empty** and **Unavailable** buttons select test scenarios; they are not merchant features. Inventory's `tools/hosted-onboarding-ui/` similarly supplies simulated account consent around its Block Kit screen. Neither tool is something a template-store user must remove to start a store.

Keep these tools in the source repository for future testing, outside both beta and stable plugin artifacts. Beta is a prerelease of the merchant product, not a package of developer test controls. There is no need to delete the tools from source before a stable release.

### Services preserve the plugin boundary

A plugin may call an authenticated service through EmDash's permitted HTTP interface and declared network destinations. The service remains outside the sandbox; that does not remove isolation from the calling plugin. For example, Commerce and the Payments admin plugin can call the Payments service without calling each other's plugin code or sharing private plugin storage.

Merchant-owned hosting needs the corresponding services, credentials, endpoints and allowed-host configuration. The split architecture supports that direction; it is not proof that every current release offers a complete self-hosted setup. Check each product's current release documentation and verified setup path before promising availability or independent adoption.

### A demo is not an installation test

The playground is a conversion and exploration tool, not a live merchant store. Its tour widget and tour page already use Block Kit, while their native backend reads the visitor's demo state. Its host wiring also accommodates EmDash's playground database behavior. Those choices do not establish what runs in a real Registry installation.

Keep playground-only wiring and synthetic controls separate from the ordinary template setup. Qualify Registry releases with the actual installed artifact in an isolated runtime; a successful playground session or local preview is useful evidence of the demonstrated flow, not a substitute for that check. A sandbox-compatible source file likewise does not establish a published or working release. Use each repository's release status and version-bound proof for readiness claims.

## Start a focused branch

For a public contribution without repository write access, fork the chosen repository to your account, create a focused branch in that fork, push it to your fork, and open a pull request against upstream main. A public repository allows reading and pull requests; direct pushes require write access. Contributors with write access can use a dedicated branch in the upstream repository. Preserve unrelated work and describe the intended behavior before changing it. Follow the repository's current GrillTrack decision workflow.

Both repositories pin Node `24.22.0` in `.nvmrc`; a checkout last installed under Node 22 needs `npm ci` again. After selecting that runtime, their agent instructions call for:

```sh
node -v
./scripts/agent-skills
./scripts/grilltrack --project . validate
npm ci
```

The agent-skills command installs each repository's pinned tooling. Read the repository instructions before running it. Read and maintain the decision ledger through its CLI; do not hand-edit it. Run the matching verification commands in your own checkout and report their results.

## Verify the behavior you changed

| Repository | During edits | Before delivery |
| --- | --- | --- |
| Commerce | `bin/verify-commerce quick` | `bin/verify-commerce full` |
| Payments | `bin/verify-payments quick` | `bin/verify-payments full` |

Commerce's quick wrapper includes typechecking, unit tests, and repository audits. Full adds integration, sandbox, native-consumer, and settings checks. Payments' quick wrapper includes tests, typechecking, and its repository audit. Full adds Worker/runtime checks, builds, plugin validation, build-identity checks, and plugin-runtime tests. Read the matching verification skill for local prerequisites and browser/runtime requirements.

Add tests for observable changed behavior, including failures that must remain unavailable rather than succeeding through fallback. For a Registry product, verify the Registry build; a native-only result is not sufficient evidence of the supported merchant path.

Commerce and Payments require each pull request to declare a version bump with Changesets, or an empty changeset for work that changes no package version. While they are on 0.x, fixes are patch bumps. Their beta-to-stable release flow is separate from ordinary contribution checks. Consult the owning repository's current release instructions instead of publishing a package as part of a routine contribution.

## Prepare a reviewable pull request

Explain the problem, the change, and the resulting behavior. Report the exact commit and environment checked, the commands that passed, any required checks that could not run, and the limits of fixture or synthetic-provider evidence. Link public-safe evidence for the changed behavior.

Keep credentials, customer data, payment details, and private operational material out of source, logs, screenshots, and pull-request text. Do not import unrelated repository history or private proof bundles. These repositories treat every committed byte as immediately public.

Merging, package publication, deployment, production mutation, and live payment traffic are distinct actions with their own approval gates. A passing test suite or automated review does not authorize them.

## Next steps

Use [extension boundaries](/docs/developers/add-on) to decide whether your idea belongs in core. For website work, return to [Using AI assistants](/docs/ai-assistants) for the public documentation interfaces and their verification status.

## Sources

The commands are repository-specific. Read the current contribution guide and verification wrapper before use; a passing result for the website is not proof that Commerce or Payments passed their suites.

- [Commerce agent contract](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/AGENTS.md)
- [Commerce contributor guide](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/CONTRIBUTING.md)
- [Commerce verification wrapper](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/bin/verify-commerce)
- [Commerce changeset check](https://github.com/dinkuskit/commerce/blob/7b9923d8dfd3bc83513efe5ac80cff0bd6656e12/.github/scripts/check-changeset.mjs)
- [Payments agent contract](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/AGENTS.md)
- [Payments contributor guide](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/CONTRIBUTING.md)
- [Payments verification wrapper](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/bin/verify-payments)
- [Payments release and Changesets rules](https://github.com/dinkuskit/payments/blob/82c19d0d347d2c78a8e44dd2a3b2f00e530beb84/RELEASING.md)
- [Completed documentation contribution through a fork and pull request](https://github.com/dinkuskit/dinkuskit/pull/52)

The runtime and developer-tool examples above were checked against these source revisions on 27 October 2026. This is source evidence, not fresh certification of every released artifact or deployment.

- [Orders preview and synthetic scenario controls](https://github.com/dinkuskit/commerce/blob/c7965236a63d4263d5d3237c365bfbbb550a7f48/tools/orders-preview/main.jsx)
- [Commerce Registry build entry](https://github.com/dinkuskit/commerce/blob/c7965236a63d4263d5d3237c365bfbbb550a7f48/scripts/build-sandbox.mjs)
- [Commerce package contents](https://github.com/dinkuskit/commerce/blob/c7965236a63d4263d5d3237c365bfbbb550a7f48/package.json)
- [Inventory onboarding proof wrapper](https://github.com/dinkuskit/inventory/blob/79b0b1d903d9d1824ae3e56347e359c24c5d7577/tools/hosted-onboarding-ui/main.jsx)
- [Separate playground runtime configuration](https://github.com/dinkuskit/template-store/blob/575b6c068f84d8602b275e4d984170df4e97d998/astro.playground.config.mjs)
- [Block Kit tour with native demo-state access](https://github.com/dinkuskit/template-store/blob/575b6c068f84d8602b275e4d984170df4e97d998/src/features/playground-tour/tour-plugin.ts)
