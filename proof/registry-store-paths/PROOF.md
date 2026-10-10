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
The Payments consumer lane (PR34) completed the actual upstream handleRegistryInstall and installed browser flow against website source 6c38e938fe535ebe3ffa719edd2e7bf766be3171. This packet's follow-up changes are proof/ledger metadata only; the source digest above and website runtime bundle are unchanged.

The inspected installer record persists source=registry, status=active, publisher did:plc:ekk4pjmkh3k3ql2kfoex3qt4, slug dinkus-payments and runtime ID r_3brsc2on3bu673rn. Official artifact checksum/archive/identity checks and explicit access/public-route acknowledgment were exercised using local synthetic authoritative records. The installed browser flow completed normal merchant consent, the exact hashed callback, one token exchange and two successful status requests. The consumed hashed proof endpoint returned404; anonymous/subscriber requests returned401/403; another admin did not inherit the status session. Stored registry_session was encrypted. No processor call occurred. The screenshot shows status checked while processor connection and test-order readiness remain incomplete.

Immutable artifact SHA256 values:
- Installed Payments tarball: 7851000b747cc4ace2c9c13dc98696eb26b8a655e29e49a91029a66009ee2774.
- Installed state record: f403560cddff267460db4ad00a45bf4f3cdd626b51c267910b3ddfb4755015b1.
- Payments status screenshot: 66c0815c7626b792411f7e4565389db46dbc9273297cfe5cde35078b8dd1366d.
- Website dist/server/entry.mjs: e320884da9e7eeefbef988e4b508481ec0adb951a4ee04b4f2723eb7d8ad2a5b.
- Website built-memory-test-entry.mjs: 4427e92e8eee066cb7ba60567a3e534cf850f12067f79f6a21a0bb524af5aa0e.
- Website inventory-memory-runner.mjs: 2cc2b4403f56e53be8d7a2311e05eebf634c77cb89ddfee8c496db80bb38d536.

Payments owns the generated installer record, real-integration.json, package and browser capture; public curated consumer proof is tracked through Payments PR34. Website source review independently inspected those records and the screenshot without importing consumer source/history or raw sessions. Limits: authoritative Registry records and status transport are local simulations; provenance was absent-optional in the local fixture. This proves the actual installer and installed route identity, not live PDS/Registry publication, production transport, Inventory Registry installation, deployment or merge readiness.
