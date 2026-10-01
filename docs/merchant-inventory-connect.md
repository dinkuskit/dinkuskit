# DinkusKit Inventory Connect Protocol & Local Proof Contract

This document specifies the merchant store-connection protocol between the DinkusKit website and DinkusKit Inventory (EmDash plugin), the local proof test harness, and the production boundary conditions.

## Protocol Contract Overview

The merchant connect workflow establishes an authorization grant between a merchant's store (running DinkusKit Inventory on EmDash) and the merchant's DinkusKit account.

### 1. Connection Initiation
- **Endpoint**: `POST /api/store-connections`
- **Caller**: DinkusKit Inventory plugin
- **Request Body**:
  - `client_id`: `dinkus-inventory-emdash`
  - `service`: `inventory`
  - `site_id`: Plugin-owned persistent identifier and origin proof, not native EmDash installation id.
  - `site_origin`: Canonical origin of the store (e.g. `https://store.example`)
  - `callback_uri`: Exact fixed callback path on store origin: `<site_origin>/_emdash/admin/plugins/dinkus-inventory/inventory`
  - `code_challenge`: SHA-256 PKCE code challenge (base64url-encoded)
  - `code_challenge_method`: `S256`
- **Response**: `200 OK` with JSON:
  - `connection_id`: UUID identifying the pending authorization request
  - `challenge`: Opaque public random receipt challenge (UUID)
  - `verification_uri`: User-facing verification URL (e.g. `/account/connect?connection_id=...`)
  - `expires_at`: Millisecond timestamp (maximum lifetime 10 minutes / 600,000 ms)
  - `expires_in`: Lifetime in seconds (600 seconds)
  - `interval`: Polling interval in seconds (5 seconds)

### 2. Continuation & Authentication Preservation
- Unauthenticated access to `/account/connect?connection_id=<id>` responds with `303 See Other` to `/account/sign-in?callbackURL=%2Faccount%2Fconnect%3Fconnection_id%3D<id>`.
- The continuation URL is strictly validated by `safeAccountPath`:
  - Must target local `/account` paths only.
  - For `/account/connect`, exactly one query parameter `connection_id` matching `^[A-Za-z0-9_-]{1,128}$` is permitted.
  - Foreign hostnames, protocol-relative prefixes (`//`), scheme indicators (`://`), backslashes, control characters, CMS paths (`/_emdash`), and malformed percent-encoding fail-closed to `/account`.
- Merchant authentication uses Better Auth with session cookies scoped under the `dk-merchant` prefix (e.g. `dk-merchant.session_token`).
- Upon magic-link sign-in or signup completion, the merchant is redirected back to the preserved continuation URL.

### 3. Consent, Out-of-Band Proof Receipt & Authorization
- **Endpoint**: `POST /account/connect?connection_id=<id>`
- **Authentication**: Active merchant session cookie (`dk-merchant` prefix)
- **Proof Receipt Endpoint**:
  - Store hosts proof path: `/_emdash/api/plugins/dinkus-inventory/store-proof?connection_id=<id>`.
  - The proof receipt endpoint is a PUBLIC connection-scoped receipt, not an authenticated endpoint.
  - The initiating administrator action on the store is host-attested and private.
  - The public receipt contains no verifier, merchant cookie, or bearer token.
  - **Version 1 Receipt Field Equality**: Verification enforces exact equality of the following version 1 fields:
    - `version`: `1`
    - `connection_id`: Matching pending connection UUID
    - `challenge`: Matching public random receipt challenge issued during initiation
    - `client_id`: `dinkus-inventory-emdash`
    - `service`: `inventory`
    - `site_id`: Plugin-owned persistent identifier and origin proof
    - `site_origin`: Canonical store origin
    - `callback_uri`: Fixed callback path `<site_origin>/_emdash/admin/plugins/dinkus-inventory/inventory`
    - `code_challenge`: Matching PKCE challenge
    - `expires_at`: Matching expiration timestamp
- **Actions**:
  - `action=approve`: Confirms the store connection. Verifies that the store's out-of-band proof receipt satisfies version 1 field equality. If valid, binds the site to the merchant subject in the database and redirects with `303 See Other` to the store's registered `callback_uri`.
  - `action=deny`: Denies the connection. Redirects with `303 See Other` directly to the registered `callback_uri` without appending an error query parameter.

### 4. PKCE Token Exchange & JWT Claims
- **Endpoint**: `POST /api/store-connections/token`
- **Caller**: DinkusKit Inventory plugin
- **Request Body**:
  - `client_id`: `dinkus-inventory-emdash`
  - `connection_id`: Authorized connection UUID
  - `code_verifier`: Original PKCE code verifier (matching S256 challenge)
- **Response**: `200 OK` with JSON:
  - `token_type`: `Bearer`
  - `access_token`: ES256 signed JSON Web Token
  - `expires_in`: TTL in seconds (default 300 seconds; maximum 600 seconds)
  - `site_id`: Bound store identifier
- **JWT Claims**:
  - `iss`: Canonical issuer `https://dinkuskit.com/account`
  - `aud`: `inventory`
  - `scope`: `inventory:admin`
  - `sub`: Merchant account subject identifier
  - `site_id`: Plugin-owned store identifier
  - `iat` / `exp`: Issue and expiration Unix timestamps

### 5. Cryptographic Keys & Verification Contract
- **Canonical JWKS Location**: `https://dinkuskit.com/account/.well-known/jwks.json`
  - *Note*: Live canonical JWKS URL is CONTRACT only; merchant activation has not been deployed. In production Cloudflare Workers builds, test-only routes and simulated transports remain disabled fail-closed.
- Tokens are signed with ES256 and verified using public keys published via the JWKS endpoint.

### 6. Revocation & Short Expiry Semantics
- Merchants can revoke site bindings via `POST /account/sites` (`action=revoke&site_id=<id>`).
- Post-revocation fail-closed enforcement:
  - Re-approval of connections for revoked sites is strictly blocked, redirecting with `?error=reinstall_requires_manual_migration`.
  - No new grant or access token can be minted for the revoked site.
- Per project CHARTER:
  - No active token introspection endpoint or distributed revocation list is maintained.
  - Pre-issued JWTs remain valid until their short expiration timestamp (`exp`, maximum 300–600 seconds).
  - Expiration is cryptographically enforced and rejected once `exp` elapses.

---

## Proof Transport Simulation vs Actual Plugin Prerequisites

### Local Proof Transport Simulation
The local test suite and proof launcher simulate out-of-band proof verification in an isolated, loopback-only environment:
- **Receipt Simulation**: Stored in a local test KV sink (`MERCHANT_PROOF_SIMULATION` accessed via `POST /__proof/receipt`).
- **Synthetic Mailbox**: Synthetic mailbox capture lives in local KV (not in-memory transport) (`MERCHANT_MAIL_CAPTURE` accessed via `/__proof/browser [Test only / no external email]`).
- **Ephemeral Port Binding**: The local workerd test runner binds to an OS-assigned dynamic port (e.g. `http://127.0.0.1:<port>`). Port numbers are never hardcoded or assumed.

### Actual Plugin Integration Prerequisites
For full integration with DinkusKit Inventory:
1. **Installed-Plugin Dispatcher Qualification**: Approval needs actual installed-plugin dispatcher qualification for full integration; existing local KV simulation is not that.
2. **Production Network Transport**: Production network transport requires separate qualification and approval. Workers-side proof fetching must enforce strict IP validation, DNS rebinding defenses, and egress filtering. No vague certification claims are made; production endpoints remain disabled fail-closed until network policies are qualified.
3. **Origin & Site Binding**: The `site_id` must match verified plugin-owned origin records.

---

## Proof Launcher

The proof launcher runs the end-to-end verification sequence on a local built workerd runtime using the actual built worker:

### Prerequisites
Run prerequisites with Node version matching `.nvmrc` (v22.23.2):
```bash
npm run setup && npm run build
```

### Execution Commands
```bash
# Automated invariant verification (runs all steps against built worker and exits cleanly)
node scripts/merchant-connect-proof-launcher.mjs

# Interactive session for manual testing (creates fresh unclaimed connection and waits for SIGINT/SIGTERM)
node scripts/merchant-connect-proof-launcher.mjs --serve
```

When run with `--serve`, the launcher:
- Completes automated invariant checks against the actual built worker.
- Generates a fresh unclaimed non-revoked connection for interactive browser testing.
- Prints the safe Consent URL, dynamic Origin, JWKS URL, and synthetic mailbox link.
- Writes an ignored runtime interface file containing only public metadata, safe URLs, running PID, and stop handle.
- Keeps all secret material (PKCE verifiers) exclusively in process memory without persisting or logging tokens.
