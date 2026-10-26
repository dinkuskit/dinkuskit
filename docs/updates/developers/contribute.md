---
article: developers/contribute
base: sha256:5c0872dadd78e0bccc6695bd62fb31d23686cc14fb437eb101065f4aa53428ef
title: "Make and verify a core contribution"
summary: "Choose the owning repository, make one focused change, and report the evidence for review."
audience: "Developers"
product: "DinkusKit contribution workflow"
version_scope: "Commerce 0.6.0 and Payments 0.4.0 repository contribution workflow; Node 24.22.0"
---

## Choose the repository

Keep the change with the module that owns the behavior. The website repository owns this documentation and site presentation. Commerce owns catalog, authoritative pricing, checkout orchestration, and orders. Payments owns provider transport and connection status. Inventory and Ship own their respective product boundaries.

Read the chosen repository's current `AGENTS.md`, charter, contribution guide, and verification scripts before editing. The commands below were reconciled against the pinned Commerce and Payments sources; they are not a universal command set for every DinkusKit repository.

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
