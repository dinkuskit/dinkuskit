# Organization account foundation proof

This is the initial source/capture record at `3b7a67d623d7d4f742e360f109fbc48419ff0207`. The accepted migration finding, corrected source identity and current verification are in [REPAIR.md](REPAIR.md). Historical evidence below remains preserved.

Implementation identity: `sha256:fea64fd4092534767156ec8294f356aa6aef3f7fdcdef98b8cec578b634cb747`. The [source manifest](source-manifest.json) binds 30 source, documentation and test files to baseline `2bfb7627b52598d45c2026a3d43e852c812a8256`. Decision-ledger metadata and this proof are outside that implementation digest.

## Verified behavior

- One login can belong to multiple organizations. Explicit switching persists even for pending organizations; authority derives from the selected organization's stable subject and current membership. Removed or invalid selections fail closed.
- An organization has one Owner. Owners explicitly grant Administrator ceilings; Administrators manage ordinary Members within those ceilings. Roster and site visibility are independently checked. Broad Inventory authority remains Owner-only.
- Signup requires both contacts, a service-contact choice and agreement. Promotional email and SMS are separate optional unchecked choices. An expiring five-minute browser-bound attempt captures an immutable preference snapshot; matching verified-email completion consumes it atomically. A raw authentication login creates no organization or service authority.
- The first 50 qualifying people's first organizations receive lifetime pilot admission in the organization-creation transaction. Additional organizations stay operator-pending. Employee joins, repeated completion, simulated ownership changes and closure never recycle an allocation.
- Additive migration 0004 snapshots legacy authority once during the upgrade, preserving legacy subjects, site bindings and public signer history. Disabled legacy authority stays unavailable; routine authentication never backfills new authority.
- Connect checks the selected admitted organization and current Owner before claiming a challenge and again during approval, redemption and issuance. A removed Owner during delayed receipt retrieval cannot create a binding. Stale posted organization context is rejected.
- Login disabling is distinct from closing an organization and is blocked while organizations remain owned. No closure, transfer, personal deletion or employer-data cascade is implemented.

## Verification and source coverage

On exact Node 22.23.2, `npm run verify` exited 0: account tests 8/8, Inventory runner tests 9/9, merchant tests 18/18, foundation tests 6/6, plus the HTTP smoke, development CMS, public-release reuse, CMS helper, Access guard, safe HTTP, persistent CMS operation/restart and candidate-denial checks. Typecheck reported 0 errors, 0 warnings and one unused-import hint.

The six foundation tests exercise actual built handlers and initialized local D1: independent browser signup snapshots; raw-auth and expired/replayed intake; persistent selected organization and employee delegation; contention for the final admission slot; 51-person allocation/idempotence and lifetime SQL invariants; upgrade-only legacy preservation; and pending/stale/removed Owner Connect rejection. SQLite simulations of ownership changes or closure are allocation-invariant proof, not implementations of those actions.

Full functional verification binds to `sha256:31f9d9e97e1ba1d714e9ef8776d602f50f781d7115db51e3d99e0bf868496384`. Every one of those 29 files remains byte-identical. The sole subsequent implementation change is account-form select sizing; a fresh build and Chrome check prove the final 390 CSS-pixel viewport and document both measure 390 pixels, with the selector approximately 350 pixels wide. `npm run audit:repo` and `git diff --check` pass.

## Browser evidence

Dedicated Chrome proof exercised synthetic signup and captured-mail completion through Better Auth, pending organization selection and switching. Capture date: 2026-10-07 UTC. Desktop signup predates only the independent selector-width repair; final account captures include it. All captures use synthetic local fixtures. Parent visual inspection found no credentials, raw verification links, cookies, keys, tokens, customer data or browser account information. No image editing or redaction was needed.

Selected immutable media belongs in the designated access-controlled PR-asset shelf, never the source Git tree. Storage locators and publication receipts remain in the ignored handoff. The public provenance record is:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `signup-chrome-desktop.jpg` | 113473 | `d70d6c06bd99aebbf3fabbf318426abc171d6b0ac24fcbf97e3c0a1180d6a71f` |
| `account-mobile-review.jpg` | 45335 | `4ba718db393a1d80d1a6bccd101e11c3ba58ff327ad6c31808a88479f3f716d0` |
| `account-chrome-desktop-final.jpg` | 198391 | `93d129a37d69d2dbb502f7c4c715f242785b47cce2fb1817062816b580262cf2` |

These screenshots prove local page rendering and the stated browser behavior; they do not prove hosted authentication, SMS delivery, service health, remote plugin installation or live Inventory/Payments activation.

## Finding disposition and remaining gates

Local review accepted and repaired: request-time legacy backfill; anonymous preference capture; admission transaction/window races; selected-organization authority; employee delegation/visibility; missing substantive coverage; Connect claim ordering and missing form context; Owner removal during proof fetch; and mobile selector overflow. The previous three-case worker claim was rejected as insufficient coverage. Dedicated Chrome supersedes unsuitable in-app-browser responsive captures.

No outstanding required local fix remains in this bounded foundation. Current exact-commit CI, comprehensive OpenClaw and native ClawSweeper evidence must be assessed separately before a maintainer merge. Source publication is not merge or deployment approval.

Not implemented or qualified: real phone OTP/delivery, operator approval console, live operator principals, Inventory staff/summary/provisioning/teardown, ownership transfer/closure/deletion execution, production Payments issuance and refresh-consumer prerequisites, hosted service activation, or subscription tiers/prices/quotas. Cold-start concurrent schema bootstrap is not claimed. No production account, credential, remote D1, device, provider or deployment mutation was performed.
