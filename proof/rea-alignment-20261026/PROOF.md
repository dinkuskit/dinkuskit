# Documentation and agent-entrypoint alignment proof

Date: 2026-10-26. Repository: `dinkuskit/dinkuskit`. Branch:
`codex/rea-alignment-20261026`. Implementation commit: `127ee349978e1854b86b2e9c17554cd2e7df73b8`. Freshly fetched base: `f72b57b7961f602e431e6a05764c834018c670bd`.

This source-only alignment follows the public [organization vision](https://github.com/dinkuskit/.github/blob/36aab690a7ef66dc119aab70e258ea979c54841a/VISION.md),
[planning boundaries](https://github.com/dinkuskit/.github/blob/36aab690a7ef66dc119aab70e258ea979c54841a/ROADMAP.md), and
[canonical research guidance](https://github.com/saariuslystoned/SaariusSkills/blob/23f2bb1208b3baa7aedaa87faec00395f9bdd061/skills/emdash-commerce/SKILL.md). It implements no new product architecture.

## Acceptance and evidence

| Requirement | Evidence and limit |
| --- | --- |
| Current connection order | `src/account/connect.ts` still enforces `connect_commerce_first`; its contents are unchanged. README, charter, and connection docs distinguish this from future peer independence. |
| Assistant copy | Only the two homepage seed descriptions change: optional first-party/BYO assistants, read-only starting posture, and capabilities bounded by supported interfaces/permissions. No claim that all agent actions already work, or that a documentation assistant grants store access. |
| Historical hosting snapshot | README labels the earlier static deployment record as historical and points to the later deployment procedure; it does not assert newly observed hosted state. |
| Publication boundary | No `docs/updates/**` file or publishing workflow changed. Seed edits affect fresh seed instances and do not overwrite initialized CMS content. |
| Selective research bootstrap | [bootstrap.json](bootstrap.json) records each installed skill's immutable source and file count. Full installed trees match `git ls-tree` blob hashes; canonical Markdown references resolve. Cached reinstallation is byte-identical and preserves an unrelated sentinel. Existing bundle pins are unchanged. Only `emdash-commerce` uses the newer pin. |
| Public-safe changes | Local Markdown links resolve; changed text introduces no private workspace or research references. Published baseline links resolve at their pinned public revisions. |

## Checks

- `bash -n scripts/agent-skills`: passed.
- Isolated bootstrap with temporary cache and skill destination: passed; no user-level installation.
- `git diff --check`: passed.
- `npm run verify`: **in progress at this source handoff**, not a full-suite pass. Repository audit, typecheck, production and docs-preview builds, documentation route/import/publication/refusal checks, and the completed merchant/shared-store batches pass. The current account/foundation batch is still running. The existing disposable smoke renderer now also asserts the qualified homepage assistant copy. Final exact-head result belongs in the PR body and CI, avoiding proof-only source churn.

## Scope and gates

No hosted CMS publication, deployment, release, merge, account/permission change, or
live store action was performed. Local fixtures and source verification do not
establish current hosted availability, a released package pair, or production
readiness. Review evidence must be bound to the PR's exact head; future source
changes require fresh relevant checks.
