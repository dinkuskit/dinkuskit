# E2E run contract — slice 1

DinkusKit owns a versioned, non-secret boundary for E2E admission, evidence and
fake-resource cleanup. The fixture is source-only: it validates shape and
correlation but does not authenticate a receipt, install a Registry plugin,
contact Stripe, or prove a hosted deployment.

## Contract

Every manifest declares `admission_required` (`manual` or `any`), required
assistance references, environment, and a target containing account, canonical
site origin, exact source revision/digest, deployment and provenance class:
`local-fixture`, `test-build`, or `public-release`. Local origins are loopback
(`127.0.0.1`, `localhost`, `[::1]`); nonlocal targets (`hosted-a` / `test-build`
and `deployed-b` / `public-release`) cannot use loopback origins and require
non-loopback canonical HTTPS origins (synthetic HTTPS hosted `.invalid` origins
are permitted). A receipt repeats every target field plus
stage ID and owning repository. Required provider/state/Registry/Stripe
receipts are separate from supplementary screenshots and agent assertions.
Receipt hashes are bounded `sha256:` references. Cross-product stage ownership
is intentional and need not equal the manifest owner.

Assessment reports actual assistance and blocks automatic admission for a
manual run, omitted checkpoints, helper seeding without a record, local claims
of hosted provider success, every provenance/identity mismatch, and incomplete
cleanup. A passed journey with failed, unknown or inconsistent cleanup is
incomplete. Failed stages preserve the public-safe failure descriptor,
binding owning stage repository to declared manifest stage ownership and any
last accepted receipt reference to actual accepted stage evidence (explicitly
null when failing before successful stages).

## Lifecycle

The deterministic fake uses an injected clock. It records cleanup ownership and
the exact admitted resource selector before allocation. Allocation outside that
selector is rejected. Heartbeats renew only before the manifest/default
45-minute hard deadline; missing-heartbeat failure is anchored to the earliest
applicable heartbeat or hard deadline. The first failure reason, timestamp and
expiry (failure plus one hour) survive restart and late janitor checks.

Cleanup requires independently declared per-service safety receipts:
retry suppression, authority invalidation or bounded authority expiry, and
resource absence. Boolean claims are not receipts. Failed cleanup remains an
admission blocker and supports bounded retry after unavailable/ambiguous
operations. Success seals evidence and tears down immediately. History expires
at terminal time plus fourteen days, independently of removal time, and does
not discard unresolved ownership.

## Sanitized expected failure

```text
expected: provider-ready
observed: provider-timeout
proof: proof-last
owning_repo: merchant-auth
next_action: retry-provider
```

This is a public-safe fixture descriptor: it contains no token, cookie, account
data, raw provider response or private URL. Live gates still require an
authorized hosted A test-build and deployed B public release, exact source and
deployment provenance, real provider/Registry/Stripe receipts, authenticated
artifact verification, and a separately approved browser/device run. Those
gates are deliberately not implemented here.

## Source API and proof limits

Run `npm run test:e2e-contract` for the 36 native `node:test` cases; `npm run
verify` includes them. The contract module is `tests/e2e/run-contract.mjs`.
`validateManifest` and `validateResult` validate declared shapes.
`assessRun(manifest, result, assessedAt)` reduces evidence and returns the run,
environment, target, journey, cleanup and assistance independently. Stage
`allowed_environments` declares which claim classes can satisfy its oracles.
The manifest's three `cleanup_oracles` name the retry, authority and resource
owners/providers independently of the supplied cleanup receipts. An authority
expiry receipt is unresolved until its timestamp, even when the caller reports
cleanup success.

`FakeLifecycle` admits one exact fake resource per run. Its default clock is
controlled by `advance`; a `clock` function may inject external time.
`reserve` records ownership and cleanup intent; `allocate` can simulate a crash
before saving the ID. `reconcileInterrupted` enforces deadlines before reconciliation, preserving failure while recovering owned resource identity for cleanup and preserving first failure time/expiry across timely or prior failure.
`fail` immediately requires retry suppression and stops new run actions;
service-safe receipts are required to resolve that requirement. `cleanup`
observes fake resource absence after exact deletion, or requires an explicit
absence receipt when the fake resource disappeared independently. Unavailable
or ambiguous operations stay unresolved and may be retried without extending
failure expiry. Budget pause affects admission, while cleanup remains enabled.

Snapshot restoration checks declared fields, complete failure and terminal
metadata consistency for failed and cleanup-pending states, and internal
chronology, not storage authenticity. The fixture retains the cleanup ownership tombstone when
inactive history expires; it does not implement a provider's data purge or
revocation. Receipt refs, source refs and hashes are correlation declarations;
a qualified future adapter must independently resolve and authenticate them.
The tests demonstrate policy over fake resources, not live provider safety,
remote janitor availability, hosted A interruption recovery or deployed B.
