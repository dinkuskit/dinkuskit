# Offline mailbox contract proof

Repository: dinkuskit/dinkuskit. Branch: codex/approved-landing-pr39-20261011.
Frozen dependency: ed60ae7fb4ae657ddf2a0b30dddb7d1593575f1e.
This slice consumes the parent contract without changing its module or tests.

Node 22.23.2 focused command:

```sh
node --test tests/e2e/mailbox-contract.test.mjs tests/e2e/run-contract.test.mjs
```

51 passed, zero failed: 13 mailbox cases plus 38 unchanged parent cases.
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

## Historical pre-integration verification

Initial full `npm run verify` passed audit, setup, type generation, typecheck,
account tests, both contract suites and build; it stopped in unchanged
inventory-memory-runner tests with `website_port_occupied`. That occupied-port
result was reproduced in an isolated rerun. Runtime checks are temporarily
held for the existing verification owner; no unrelated source or process was
changed. That pre-integration attempt did not qualify full verification; it is retained
as historical evidence and superseded by the current integration checks below.

## Current integrated verification

Base/main: `ed60ae7fb4ae657ddf2a0b30dddb7d1593575f1e`; integration input: `eba27738da45a8a38bd3f67b50c166b7b55781ff`.
Normal merge preserves PR39 and merged PR38 ancestry. Both source modules and
test suites are unchanged; package verification wiring includes both suites.
Parent independently ran 51 focused tests: 13 mailbox and 38 run-contract cases.
Full `npm run verify` passed on attempt 2: all 26 command stages and 151 native
tests, including CMS, upgrade and Cloudflare denial fixtures. Attempt 1 stopped
at the unchanged upgrade fixture when synthetic passkey login returned 401;
the same source passed the one bounded rerun. Both outcomes are retained.
Current source hashes and command groups are in `verification.json`.
Decisions `website-e2e-run-contract-049` and `website-e2e-mailbox-contract-050`
are reverified through the pinned CLI after these checks.
Independent exact-source reviews remain pending for the final committed candidate
against main. No deployment, account/credential change or live mail/browser
action is claimed.
