# Agent Contract

This public repository owns the DinkusKit website and account experience. Assume every committed byte is public.

## Source priority

1. This file.
2. `docs/CHARTER.md`.
3. `.grilltrack/ledger.json`, maintained only through the GrillTrack CLI.
4. Current source, tests, and committed proof.

## Boundaries

- Build the website on EmDash using upstream native blocks. DinkusKit plugins must remain compatible with the EmDash Registry sandbox.
- Keep website editors separate from merchant accounts. A merchant identity may connect multiple stores, with explicit authorization for each site.
- EmDash authentication is a candidate to prove, not a selected production identity provider. DinkusKit owns stable account identity, site grants, and service-specific authorization.
- Inventory owns physical stock truth. Commerce owns catalog, prices, checkout orchestration and orders. Payments owns processor integration. This site must not duplicate those authorities.
- The first release serves existing EmDash sites. Subscription management and a standalone multi-store inventory portal are future possibilities, not current implementation scope.
- No credentials, environment files, tenant data, production configuration, private repository coordinates, private operating rationale, or unrelated repository history may be committed. Use only synthetic local fixtures.

## Working rules

- Product decisions flow through GrillTrack before implementation. Preserve decision history and use its CLI for ledger changes.
- Use isolated worktrees and focused branches/PRs. One source owner per worktree. Do not edit the main checkout or another worker's checkout.
- Keep generated output under ignored working directories. Follow `REPO_HYGIENE.md`.
- Match verification to the change. Runnable site changes need build/type checks and actual route smoke proof; visual claims need browser evidence.
- Record source identity, commands and limits in proof. Do not equate a stub or fixture with live authentication, registry installation or hosted service availability.
- Automated review is evidence, not merge authority.
- Publishing, merges, deployment, live account changes, billing, secrets/permissions changes and external messages require explicit user authorization. Authorization for one action does not grant authority for another.
