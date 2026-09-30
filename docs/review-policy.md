# Review policy

Changes use three independent checks: deterministic CI, agent-owned OpenClaw
review, and native ClawSweeper review. Both reviewers run on the maintainer's
Spark-2 Codex OpenAI subscription. Canonical review instructions and the shared
review-tools package live in SmokySkills.

The agent requests comprehensive OpenClaw review for the current base and head.
ClawSweeper reacts to ready PR changes or a trusted standalone
`@clawsweeper review` / `@clawsweeper re-review` comment. Draft PRs do not dispatch
ClawSweeper. GitHub-hosted jobs bind and relay native events; CI does not launch
or sequence either reviewer. Only an owner may authorize merge after current
evidence and findings have been checked.

The native caller is inactive until maintainers configure
`CLAWSWEEPER_SPARK_ENABLED=true`, the reusable relay's
`CLAWSWEEPER_RELAY_REPOSITORY` destination variable, and the scoped
`CLAWSWEEPER_DISPATCH_TOKEN` secret. Manual dispatch defaults to non-publishing
review. Never place review engine credentials in this repository.

This initial repository has no product code. CI validates GitHub workflows
using a checksum-pinned actionlint release; add product checks alongside future
implementation.
