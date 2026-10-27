# Agent Contract

This public repository owns the DinkusKit website and account experience. Assume every committed byte is public.

## Running GrillTrack

Run `./scripts/agent-skills` first; it installs the pinned SaariusSkills
skills into ignored `.cursor/skills/`. Use
`./scripts/grilltrack --project . validate` or `show` for ledger reads.
The CLI-only ledger rule remains in force. SmokySkills is enabled only after
maintainer access and an immutable commit pin are supplied.

## Organization direction and research

The [organization vision](https://github.com/dinkuskit/.github/blob/36aab690a7ef66dc119aab70e258ea979c54841a/VISION.md) and
[planning boundaries](https://github.com/dinkuskit/.github/blob/36aab690a7ef66dc119aab70e258ea979c54841a/ROADMAP.md) describe the shared direction: independently
useful connected tools for one accountable business operator, optional first-party
or merchant-selected assistants, and adoption in useful stages. They do not
replace this repository's current runtime contracts or establish new capability,
release, deployment, or action authority.

For a material product, architecture, implementation, or verification question,
use the pinned `emdash-commerce` skill and its
[selective REA guidance](https://github.com/saariuslystoned/SaariusSkills/blob/23f2bb1208b3baa7aedaa87faec00395f9bdd061/skills/emdash-commerce/SKILL.md). Research the actual question; routine fixes do
not require a new research cycle. Keep research findings, accepted designs, and
active work distinct, and reuse the owning issue or decision record. Public
outputs must be original and public-safe.

## Source priority

1. This file.
2. The linked organization vision and planning boundaries for shared direction.
3. `docs/CHARTER.md` for this website's scope.
4. `.grilltrack/ledger.json`, maintained only through the GrillTrack CLI.
5. Current source, tests, and committed proof for implemented behavior.

## Boundaries

- Build the website on EmDash using upstream native blocks. DinkusKit plugins must remain compatible with the EmDash Registry sandbox.
- Keep website editors separate from merchant accounts. A merchant identity may connect multiple stores, with explicit authorization for each site.
- Better Auth is the selected merchant identity implementation. DinkusKit owns stable account identity, explicit site grants, and service-specific authorization. EmDash editor identity stays separate.
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
- The `/_emdash` gate admits only Access-verified emails on `EMDASH_OPERATOR_ALLOWLIST` and Access-verified service tokens whose common name is on `EMDASH_OPERATOR_SERVICE_TOKENS` (as Editor, never Admin, and only once the CMS already has an enabled Admin). Both are runtime secrets; never commit their values. Agents never use an operator's identity. An agent that edits the CMS uses its own EmDash API token (`ec_pat_`, made by the Admin with only the scopes it needs) on `/_emdash/api/*`, including the MCP at `/_emdash/api/mcp`; the gate lets EmDash tokens through there only, never on `admin`, `setup`, `auth` or `oauth`, and only once an Admin exists (`DEPLOY.md`, decision `website-agent-api-tokens-20261027`). Service tokens stay for workflows such as Docs publish.
- Publishing, merges, deployment, live account changes, billing, secrets/permissions changes and external messages require explicit user authorization. Authorization for one action does not grant authority for another.
