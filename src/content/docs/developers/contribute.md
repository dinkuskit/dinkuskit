---
title: "Make and verify a core contribution"
summary: "Choose the owning repository, make one focused change, and report the evidence for review."
audience: "Developers"
product: "DinkusKit contribution workflow"
version: "Commerce e8eca124 and Payments b92ec308 source instructions"
draft: true
---

## Choose the repository

Keep the change with the module that owns the behavior. The website repository owns this documentation and site presentation. Commerce owns catalog, authoritative pricing, checkout orchestration, and orders. Payments owns provider transport and connection status. Inventory and Ship own their respective product boundaries.

Read the chosen repository's current `AGENTS.md`, charter, contribution guide, and verification scripts before editing. The commands below were reconciled against the pinned Commerce and Payments sources; they are not a universal command set for every DinkusKit repository.

## Start a focused branch

Begin from current `main` on a dedicated branch. Keep one product or infrastructure slice per pull request, preserve unrelated work, and identify the expected behavior before changing it. The inspected repositories require product decisions to pass through their GrillTrack workflow before implementation.

Both repositories pin Node `22.23.2` in `.nvmrc`. After selecting that runtime, their agent instructions call for:

```sh
node -v
./scripts/agent-skills
./scripts/grilltrack --project . validate
npm ci
```

The agent-skills command installs each repository's pinned tooling. Read and maintain the decision ledger through its CLI; do not hand-edit it. These setup commands have not been run as a full contributor environment proof for this draft.

## Verify the behavior you changed

| Repository | During edits | Before delivery |
| --- | --- | --- |
| Commerce | `bin/verify-commerce quick` | `bin/verify-commerce full` |
| Payments | `bin/verify-payments quick` | `bin/verify-payments full` |

Commerce's quick wrapper includes typechecking, unit tests, and repository audits. Full adds integration, sandbox, native-consumer, and settings checks. Payments' quick wrapper includes tests, typechecking, and its repository audit. Full adds Worker/runtime checks, builds, plugin validation, build-identity checks, and plugin-runtime tests. Read the matching verification skill for local prerequisites and browser/runtime requirements.

Add tests for observable changed behavior, including failures that must remain unavailable rather than succeeding through fallback. For a Registry product, verify the Registry build; a native-only result is not sufficient evidence of the supported merchant path.

Payments requires each pull request to declare a version bump with Changesets or an explicit empty changeset for non-bumping work. Its documented beta-to-stable flow is separate from ordinary contribution checks. Consult the owning repository's current release instructions instead of publishing a package as part of a routine contribution.

## Prepare a reviewable pull request

Explain the problem, the change, and the resulting behavior. Report the exact commit and environment checked, the commands that passed, any required checks that could not run, and the limits of fixture or synthetic-provider evidence. Link public-safe evidence for the changed behavior.

Keep credentials, customer data, payment details, and private operational material out of source, logs, screenshots, and pull-request text. Do not import unrelated repository history or private proof bundles. These repositories treat every committed byte as immediately public.

Merging, package publication, deployment, production mutation, and live payment traffic are distinct actions with their own approval gates. A passing test suite or automated review does not authorize them.

## Next steps

Use [extension boundaries](/docs/developers/add-on) to decide whether your idea belongs in core. For website work, return to [Using AI assistants](/docs/ai-assistants) for the public documentation interfaces and their verification status.

## Sources and verification limits

Read-only source reconciliation performed on 2026-10-19. The commands are source-verified; this draft does not claim the module suites were executed.

- [Commerce agent contract](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/AGENTS.md)
- [Commerce contributor guide](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/CONTRIBUTING.md)
- [Commerce verification wrapper](https://github.com/dinkuskit/commerce/blob/e8eca12488f992acbaef712d71c9ac1d45b35e78/bin/verify-commerce)
- [Payments agent contract](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/AGENTS.md)
- [Payments contributor guide](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/CONTRIBUTING.md)
- [Payments verification wrapper](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/bin/verify-payments)
- [Payments release and Changesets rules](https://github.com/dinkuskit/payments/blob/b92ec308eda74c2dfff8c2deca574bf2e17ff654/RELEASING.md)
