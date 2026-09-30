# Local source review

Reviewed implementation: `git:86e4d211069cef5c1b0b21d2fdeac81676d7c51d`.

This is the owning Codex session's source review, not an independent external review or merge approval. Subsequent review/ledger metadata commits preserve this implementation's source, tests, and dependency lock.

## Standards and source intent

The public proof imports only exported EmDash helpers, supplies its signup policy through the public AuthAdapter interface, and keeps synthetic sessions/email/site-control under tests/helpers. No product login route, internal-handler dependency, provider fork, production account access, external email, billing, or deployment was added. Source identity is isolated on the assigned branch. Earlier platform, audience, trial, future-product, and canonical-domain locks remain intact.

The two-merchant HTTP proof covers actual helper token consumption and fixture cookie behavior, explicit grants after synthetic site-control challenges, denial of both sites to the second merchant, stable account identity through sign-in/recovery, disabled-account refusal, renewal, grant revocation, stale challenge refusal, issuer/audience/site/scope rejection, and real JWT expiry. The separate direct probe used the exact current Inventory and Payments verifier sources and confirmed their outstanding-token behavior. npm run verify passed independently on Node22.23.2 (9 tests, 0 typecheck diagnostics, build and route smoke).

## Adjudication

- **Accepted required fixes, resolved:** replace the blanket arbitrary-domain impossibility claim with a tested public adapter extension; use actual EmDash helpers instead of synthetic signup; move synthetic session/site-control plumbing out of product source; add the requested disable/revoke/expiry/isolation checks; limit verification claims to the local proof. See parent-review.md.
- **Rejected conclusion:** the native configured allowlist does not make every exported-library integration unsuitable. EmDash remains a candidate for supported library composition.
- **Deferred:** native Astro/browser merchant sessions, live recovery mail, persistent accounts and grants, input/origin/CSRF policy, and real EmDash Connect/plugin site-control attestation. Better Auth is recommended for the next maintained-provider proof, without selecting it here.
- **Deferred resource limitation:** issuer-side revoke/disable stops new tokens and renewal; the current offline service verifiers accept already-issued JWTs until expiry. Immediate resource-side revocation needs a separately designed contract.
- **No remaining required fix** for the bounded local proof. No production-readiness, browser-recovery, or external-review verdict is claimed.

The dependency review restored jose6.2.12 from the foundation lock instead of downgrading it and declared @emdash-cms/auth1.0.1 as a direct test dependency. Ephemeral credentials, cookies, and signing material remain in process memory; retained receipts contain outcomes only. Both native ACP turns reported completed task and observed local worker cleanup; backend history discard is unsupported.
