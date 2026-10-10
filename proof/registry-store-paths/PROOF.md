# Payments Registry path repair

Base: f664a60b4fc4b8c35d7228dbb37c01c44292e768.
Source digest: sha256:469e2539b58eb10c8de304957ec5c279a46b74f5bdfb402626409508bdfee397.
Digest covers sorted src/account/config.ts, tests/fixtures/built-memory-test-entry.mjs, tests/shared-store-isolation.test.mjs and tests/shared-store-routes.test.mjs; each UTF-8 path plus NUL, bytes plus NUL.

## Change and provenance
Payments' fixed callback and proof registration now uses the Registry installed ID r_3brsc2on3bu673rn. Identity input is the public Payments manifest (publisher did:plc:ekk4pjmkh3k3ql2kfoex3qt4, slug dinkus-payments), present before the consumer repair at Payments commit 469eab1. Pinned EmDash 1.2.0 makeRegistryPluginId derives that ID; the upstream Registry installer selects the same runtime identifier. No package source or unrelated history was imported.

The website still chooses exact paths from the registered client/service. No caller-controlled plugin ID, callback allowlist expansion, arbitrary proof URL, DNS bypass or service-grant change was added. Inventory's existing slug paths are explicitly config-managed/local only; its placeholder publisher is not Registry publication evidence.

## Local verification
Node 22.23.2. The new upstream-derivation regression failed against the old slug registration, then passed after repair. It rejects the old slug, another publisher's derived ID, callback query and wrong route. Existing proof-transport tests verify the exact registered proof path and redirect rejection.

Full npm run verify passed: 83 tests, audit, generated types, typecheck/build, route/CMS persistence and upgrade checks, and production/candidate denial checks. The first attempt failed fetching an external font; the URL returned HTTP200 and the unmodified retry completed. Working logs are ignored under .grilltrack/work/registry-store-paths/ (regression-before.log, regression-after.log, verify.log, verify-retry.log).

## Paired proof and delivery gate
Actual local Registry installer plus installed Payments callback/proof integration is a required paired acceptance check, owned by the Payments consumer lane (PR34). At this source freeze it is pending; local synthetic route tests above do not establish Registry installation. The final handoff must include the installer record, exact source/bundle identities and reviewed consumer proof. No production Registry publication, hosted availability, Inventory Registry claim, deployment or merge is authorized by this packet.
