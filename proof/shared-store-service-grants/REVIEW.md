# Shared store source review

Reviewed base d148a87211abcee6ac72614465a5bb0273e79be8 and source digest sha256:fddf9c85df3aa1a5542e6cca18d0c26639b526b2b3bee542f2b02f2739f93835 (algorithm in PROOF.md).

Accepted and fixed before final validation:
- Reject draft duplicate protocol_version in public proof/token responses; canonical proof uses version: 2 and token response retains four documented fields.
- Guard identity reservation atomically against expiry, denial, mismatched claims and lost ownership. Capture current time after asynchronous reads.
- Show all separately fenced service grants in operator store details rather than hiding the second service.
- Update test clients to consume the server identity rather than asserting caller-chosen IDs.

Independent regressions and local route/browser proof pass. No unresolved local source findings.
Existing development connections intentionally require v2 reconnect, per the recorded decision; this is not a missing compatibility migration.
This local review does not substitute for the required immutable-head external reviews or authorize merge/deployment.
