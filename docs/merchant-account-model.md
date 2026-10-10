# Merchant account model

Status: local account-foundation implementation. This document describes source behavior and synthetic proof, not a deployment, live authentication attestation, qualified SMS route, service provisioning, or production permissions change.

## Login, organization and service authority

Better Auth authenticates the person. An organization owns sites and Inventory pools and has exactly one Owner. One login can belong to several organizations, including as an employee, and explicitly switches its current organization. The selected authority is the organization’s stable subject and canonical `JSON.stringify([issuer, subject])` account key. Email changes never rekey the business. Membership and disabled state are read from D1; a cookie is only a session locator.

Pending organizations remain visible and selectable, but cannot authorize service connections. Missing, removed or suspended selected membership fails closed. A signed-in person can explicitly choose another available organization; resolution never silently replaces an invalid selected organization. A login without complete intake can finish signup but has no organization or service authority.

The organization Owner explicitly grants Administrator authority to manage employees. The delegation contains `membership:manage` and optional `membership:view` and `site:view` ceilings. Administrators add existing eligible DinkusKit users by email and manage ordinary members only. They cannot promote or change an Owner/Administrator, exceed their ceiling, access another organization, transfer ownership, close an organization, or grant Inventory administration. Ordinary members start with no permissions. Website roster/site visibility is enforced separately; service staff authorization needs an Inventory-owned narrower contract. Management writes recheck current actor membership, organization status and delegated ceiling inside the write.

CMS editor identity and platform operator authority remain separate. Membership never implies either. Actual operator principals, manual approval, customer suspension/recovery tools and a global customer directory remain unimplemented. No invitation or campaign sends are implemented.

## Compact signup and consent

One page collects a required email, an optional phone number, separate optional promotional email/SMS preferences (unchecked), and a separate required agreement checkbox (decision `website-optional-phone-signup-033`). The service-contact choice appears only when a phone number is typed; without one the contact is email (`website-email-contact-without-phone-034`), and promotional SMS cannot be chosen. Staff setup, pools and billing occur later. The eligibility contract is:

```text
email_present && email_verified &&
service_contact (email unless a phone is given) && agreement_accepted
```

The implemented path verifies email through pinned Better Auth 1.7.6 magic links. A phone number, when given, is stored unverified; no SMS delivery or phone OTP runtime exists or is claimed, and a phone service-contact choice is not a promise that a text route operates. Admission to the first 50 and operator approval do not need a phone number.

Each submission creates an immutable five-minute attempt and an HttpOnly, SameSite=Lax browser locator. Completion requires that exact unexpired, unused attempt and an independently verified matching user email. Consumption uses a unique marker, and a verified profile is immutable. Anonymous submissions for the same email cannot replace another browser’s choices. An unsolicited link or raw auth-API login can authenticate the person, but cannot create an eligible profile, organization, grant or service token. A signed-in login-only person can complete the same signup page. Verification never sets the other contact’s verified state or either promotional preference.

Better Auth retains its hashed email tokens, expiry, replay handling and auth boundary. A future phone adapter must independently prove OTP expiry, attempt/rate limits, one-use consumption, delivery idempotence and privacy. Website/Better Auth owns the verification state; a browser receives no general phone-control authority and inbound SMS ingestion is not a signup dependency. Android’s [SmsManager contract](https://developer.android.com/reference/android/telephony/SmsManager) separates send-result from recipient-delivery callbacks; transport acceptance alone cannot establish verification. No device, carrier, credentials, server consumer or live send is configured by this foundation.

## Lifetime pilot admission

Only a person’s first qualifying organization can receive automatic admission, within the first 50 slots. Additional organizations wait for operator approval. Employee additions allocate nothing. The organization begins pending; creation, initial Owner, immutable person-first-organization record, conditional bounded allocation and activation execute in one D1 transaction. No organization becomes active before a slot exists. Deterministic initial organization identity makes completion retries idempotent. Slot numbers have unique and 1–50 constraints.

The first-organization record belongs to the person’s lifetime eligibility, independent of current ownership. Closure, transfer, suspension and membership removal never recycle it or its slot. Admission, verification and actual Inventory provisioning remain separate states. No subscription price, tier quota, paid checkout or permanently-free entitlement is selected.

## Migration and service boundaries

Unpublished migration 0004 adds organizations, memberships, selection, immutable signup attempts/profiles and admission. Existing pre-foundation synthetic accounts map to one Owner organization retaining their exact subject, site bindings and public signing history; disabled legacy accounts remain blocked. Backfill executes only in the upgrade transaction. New users never become legacy accounts on a later request. Repeated requests and runtime restart retain the applied version. The repository has no existing real customers; this is compatibility proof rather than a speculative customer migration interface.

The website’s configured issuer remains `https://dinkuskit.com/account`. Inventory Connect still requires explicit site consent, S256 PKCE and verified site-proof receipts. New issuance and grant mutations use current organization authority; broad `inventory:admin` is Owner-only. Already-issued JWTs remain valid until `exp`; membership changes are not instant downstream revocation. Hosted proof-fetch/plugin-dispatcher prerequisites remain independently owned and must be proved before activation. The [shared connection protocol](shared-store-connections.md) defines separate Inventory and Payments grants. The old development bindings are not migrated into those grants; updated consumers must reconnect explicitly. Production transport and consumer integration remain prerequisites, and no refresh lifecycle is introduced.

Inventory remains authoritative for physical stock, pool/site mapping, provisioning and teardown. The website duplicates no stock ledger and never directly deletes Durable Object data. Current Inventory operation/status routes are not a global operator directory or complete pool enumeration. A proposed separate read-only summary contract should provide authoritative distinct pools/sites, attachment/provisioning status and `asOf`; unavailable differs from zero. Website-held membership/contact/grant states must not become Inventory-owned contact storage or impersonation authority. Source handoff references are the reviewed [Inventory account mappings](https://github.com/dinkuskit/inventory/blob/c565c984d4635bdb6a20194d58a39bd74b3f50fe/src/cloudflare/account-connections.ts) and [authentication contract](https://github.com/dinkuskit/inventory/blob/c565c984d4635bdb6a20194d58a39bd74b3f50fe/src/cloudflare/account-auth.ts).

## Closure, personal login and rollout limits

Only the Owner may transfer ownership or close an organization. Those execution flows remain unavailable. Closure requires a separately approved, authoritative Inventory teardown contract: exact owned-pool manifest, idempotent ordering, blocked grants during closure, visible retries/failures and individually confirmed irreversible scope. Do not promise restoration, backup or undelete.

Personal login deletion must first resolve every owned organization through supported transfer or individually confirmed closure. It never cascades into employer organizations or pools. The implemented reversible login-disable action is distinct and blocked while owned organizations remain. It ends sessions and disables that login, without deleting organizations, grants or Inventory data. Actual personal deletion is not implemented.

After additional memberships/organizations exist, the old one-login/one-business resolver is unsafe as a rollback. Retain the additive schema and use deliberate capability stop/forward repair; never destructively downgrade, orphan scopes or merge identities. Deployment, live account grants, publishing and merges remain explicit maintainer gates.

## Local acceptance evidence

`npm run verify` includes the foundation suite alongside merchant auth/Connect/CMS isolation, migration repeat/restart, Inventory regression, type/build and repository checks. Foundation cases exercise interleaved signup browsers, immutable opt-ins, expired/unsolicited attempts, a completed direct-auth bypass, pending selection, canonical employee authority, stale forms, current role/ceiling denials, local D1 contention for slot 50, 51-person allocation, idempotent completion, and legacy subject/binding/public-key preservation. Synthetic fixtures and SQLite transaction checks are not live email, hosted auth, provisioning, deployment or SMS evidence. Exact source identity, raw results and limits belong in the task’s proof packet.
