# Organization admission decisions

Decision `website-organization-approvals-028` records the approved scope.
Current EmDash CMS Admins on dinkuskit.com alone may approve or deny pending
organizations. Initially the sole maintainer is the only CMS Admin; future local
Admins inherit this authority. This replaces the proposed separate approval
role. Merchant-store Admins have no such authority. The separate read-only
operator directory grant remains unchanged.

Since decision `website-operator-approvals-in-admin-039` the queue lives in
the EmDash admin as the **Business approvals** page of the site-local operator
plugin (`src/operator-admin/`), at
`/_emdash/admin/plugins/dinkuskit-operator/approvals`. The old
`/account/organization-approvals` address redirects there. The page lists every
organization that is not closed: waiting ones first, then the rest newest first,
with the first 50 shown as approved automatically. Each row has Approve and
Decline buttons, who answered, and whether the owner was told.

## Authority

The plugin's only route requires the official `users:manage` permission, which
in EmDash 1.2 means a current, enabled Admin; EmDash re-reads the user on every
request and enforces its own CSRF header on plugin routes. In production the
whole `/_emdash` namespace is also behind Cloudflare Access and the operator
allow-list (`DEPLOY.md`). The route takes the acting Admin from the host, never
from the request body. Email is audit context, never authority. No merchant
login, selected organization or merchant role grants anything here.

CMS and merchant D1 are separate databases. Current CMS authorization is checked
at the mutation boundary; there is no distributed transaction with concurrent
CMS role changes. The atomic transaction below covers merchant data only.

## Admission and notifications

Approve changes Pending to Active/Admitted. Deny changes Pending to Denied.
Admission never connects a store, provisions Inventory, activates Payments or
grants account privileges. Denied organizations remain visible to their members
as denied but cannot be selected or used for organization authority. First-50
lifetime allocation, identity subjects, memberships, and ownership are retained.

The first answer on a waiting organization uses one D1 batch: it inserts an
audit only for a still-pending organization, updates the organization only for
that winning server-generated decision identifier, and inserts its durable
notification intent. Unique organization keys prevent competing first outcomes.

After that, and for the first 50 approved automatically, the operator can
change the answer at any time (decision 039). The latest answer replaces the
audit row and is appended to `dinkuskit_operator_action` with the acting Admin.
A change never queues a second notice, and an unsent notice for the earlier
answer is marked unavailable (`decision_changed`) so it can never go out late.
Confirming an automatic approval records who checked it. Closed and suspended
organizations cannot be changed here. Migration 0006 preserves the organization
and dependent records while adding the Denied state, audit, and notification
tables. The populated upgrade test checks foreign keys and retained
allocation/selection records.

Both outcomes notify only the selected verified service contact, independently
of promotional consent. Email must match the current account email with both
verification flags set. Missing, changed or unverified selected contacts have
an explicit unavailable reason. SMS remains unavailable, even when verified;
there is no fallback to email. Eligibility is checked again before dispatch.

Email uses the existing Cloudflare `EMAIL` binding shape. The status message
states the decision and links to the merchant's account, not the Admin console.
A missing binding or delivery failure leaves the decision committed and the
notification pending with a sanitized reason. The approvals page offers "Send again".
A request-scoped synthetic sink proves successful and failed sends locally.
No actual email/SMS or provider configuration is part of this change.

A five-minute claim lease and unique claim token prevent ordinary concurrent
retries from sending twice and prevent stale completion from overwriting a
newer claim. Pending or abandoned processing intents can be retried by a current
CMS Admin. There is no background scheduler in this slice. An ambiguous external
failure, or a provider request lasting beyond its lease, can cause repeated
external delivery; exactly-once delivery is not claimed. Provider acceptance is
recorded as delivered, not proof that the recipient read the message.

Appeals, deletion, new quotas, mandatory rejection reasons and bulk decisions
are outside this slice. Suspending a person and cutting off a store are on the
operator plugin's People and Stores pages (decisions 036 and 037).

## Merchant account status

`/account` reads the current active memberships on every GET and shows each
organization as Pending, Admitted, or Denied. Automatic admission is shown as
Admitted without inventing an operator decision or audit. Admission does not
connect a site or activate a service. The page is private and `no-store`.

Only an organization's owner sees its sanitized notification summary. Email
delivery state is described as pending, processing, unavailable, or “Email
accepted for sending”; accepted means the binding send resolved and does not
confirm recipient delivery. SMS unavailability is shown without exposing a
recipient, actor, claim identifier, or provider error. Members see admission
status only, and the read is limited to organizations in their current active
membership list. Notification availability never changes the admission decision, and merchants cannot retry notifications or make admission decisions.

## Local verification

Use the repository's Node 22 runtime (`.nvmrc`):

```sh
npm run verify
node --experimental-strip-types scripts/operator-admin-proof.mjs
```

`tests/operator-admin.test.mjs` and `tests/organization-approvals.test.mjs` run
the real plugin route in loopback workerd with a real EmDash Admin session from
the native software-passkey test harness. The proof script starts the same
fixture with synthetic businesses for clicking through the admin pages in a
browser. Fixture controls and captured messages exist only in the isolated test
entry.

See `proof/organization-approvals/PROOF.md` for the earlier results and limits.
