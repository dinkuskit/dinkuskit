# Offline mailbox contract proof

Repository: dinkuskit/dinkuskit. Branch: codex/e2e-mailbox-contract-20261011.
Frozen dependency: c9062f843615ba1eb6ec94204e4583f5927f2fdf.
This slice consumes the parent contract without changing its module or tests.

Node 22.23.2 focused command:

```sh
node --test tests/e2e/mailbox-contract.test.mjs tests/e2e/run-contract.test.mjs
```

36 passed, zero failed: 13 mailbox cases plus 23 unchanged parent cases.
Three added regression cases failed before repair and passed after repair:
handoff lacking a matched message; allocation foreign to manifest role/origin;
validation errors retaining supplied synthetic canaries. Additional tests cover
invalid/omitted/backdated redemption times, single match issuance, bounded
expiry, consumer output stripping and no retry after policy refusal.

Fixture evidence demonstrates exact recipient/subject/intent/run/environment/
origin/path correlation, stale and ambiguous refusal, Spam delivery metadata
without Inbox success, one-use original-context continuation, missing or
unsupported consumers, and explicitly assisted outcomes. It does not prove
provider headers, a live mailbox, an actual magic URL, supported browser
transport, safe async navigation or unattended authentication.

Initial full `npm run verify` passed audit, setup, type generation, typecheck,
account tests, both contract suites and build; it stopped in unchanged
inventory-memory-runner tests with `website_port_occupied`. That occupied-port
result was reproduced in an isolated rerun. Runtime checks are temporarily
held for the existing verification owner; no unrelated source or process was
changed. The complete repository check remains pending a free verification
slot. This is an environmental limitation, not a clean full-verification claim.

Independent exact-source review remains pending. This is an explicit dependency
stack; native default-base review remains blocked until authorized parent-first
landing. No merge, deployment, account/credential change or live mail/browser
action is claimed.
