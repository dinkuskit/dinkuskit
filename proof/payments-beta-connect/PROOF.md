# Payments beta Connect source proof

Base: `6417e23bc7a5880cdc9688240853d6a746030c94` in `dinkuskit/dinkuskit`.
Implementation: `1954410a1597ddcc83bdedbef71c3f4fdb00f90c`.
Decision: `website-payments-beta-connect-072`, recorded through the repository GrillTrack CLI.
Contract: [shared store connections](../../docs/shared-store-connections.md).

## Identity

Pinned EmDash 1.2.0 `makeRegistryPluginId` (from `node_modules/emdash/src/registry/plugin-id.ts`)
derives `r_3brsc2on3bu673rn` for publisher `did:plc:ekk4pjmkh3k3ql2kfoex3qt4` with slug
`dinkus-payments`, and `r_sffx6l4z6mpqliki` with slug `dinkus-payments-beta`. The beta value
matches the installed ID the Payments plugin derives for its beta package.

## Verification

Locked dependencies already installed in a fresh cloud container.

- `npm run verify` on Node 22.22.0 passed every step through `test:public-release-reuse`,
  including typecheck (zero errors and warnings, two existing clipboard hints), build,
  `test:merchant`, `test:shared-store` (35 tests), `test:foundation`, `test:operator-admin`
  and `test:smoke`. It stopped at `test:cms-operation-helpers`, which fails the same way on
  unchanged main in this container (an owned process tree that will not stop).
- The steps after it were run one by one: `test:access-gate` and `test:safe-http-url` passed
  on Node 22.22.0; `test:cms-operation`, `test:emdash-upgrade` and `test:cloudflare-candidate`
  passed on Node 22.23.2, the version they require.

`tests/shared-store-isolation.test.mjs` covers the change with simulated and stubbed network
transports: the beta identity and its fixed paths, refusal of slug paths and another
publisher's beta ID, a beta connection storing its own callback, refusing a stable-shaped
receipt, reading only the beta proof path and redeeming a `dinkus-payments` /
`payments:admin` pass, a stable connection reading only the stable path, and the proof
fetch refusing another service's client or callback, another origin, an unregistered
installation and a missing callback.

No visual change is claimed. No deployment, remote runtime, real store, grant, Registry
install or account change was performed. The first Connect from a store running the
installed Payments beta is the live proof.
