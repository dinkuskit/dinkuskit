# Organization admission decisions

Decision `website-organization-approvals-028` records the approved scope.
Current EmDash CMS Admins on dinkuskit.com alone may approve or deny pending
organizations. Initially the sole maintainer is the only CMS Admin; future local
Admins inherit this authority. This replaces the proposed separate approval
role. Merchant-store Admins have no such authority. The separate read-only
operator directory grant remains unchanged.

The queue is `/account/organization-approvals`, linked in the website navigation
for a signed-in CMS Admin. It shows the oldest 50 pending organizations; more
appear as decisions are completed. Detail is limited to pending organizations
or organizations with an admission decision recorded by this workflow. It does
not confer person, store, or all-purpose directory access.

## Authority and provenance

EmDash resolves the opaque CMS session into `Astro.locals.user`. The public
`createKyselyAdapter` from `@emdash-cms/auth/adapters/kysely` reloads that user's
current record from `locals.emdash.db`. Exact `Role.ADMIN`, the official
`users:manage` permission, and enabled state are required. Reads bracket database
work with a second actor check; mutations reload the same actor immediately
before the decision or dispatch call. Email is audit context, never authority.
No merchant login, selected organization, raw role header, custom upstream role,
or private EmDash handler is used.

Production requests must target `https://dinkuskit.com`. POST additionally
requires the exact browser Origin; missing/foreign origins fail closed. Local
development can use loopback. Only the separate test entry admits its exact
loopback origin through a request-scoped transport. Responses are private and
no-store. Existing production CMS namespace and Access gates remain intact;
this source change does not activate them or grant a live principal access.

CMS and merchant D1 are separate databases. Current CMS authorization is checked
at the mutation boundary; there is no distributed transaction with concurrent
CMS role changes. The atomic transaction below covers merchant data only.

## Admission and notifications

Approve changes Pending to Active/Admitted. Deny changes Pending to Denied.
Admission never connects a store, provisions Inventory, activates Payments or
grants account privileges. Denied organizations remain visible to their members
as denied but cannot be selected or used for organization authority. First-50
lifetime allocation, identity subjects, memberships, and ownership are retained.

One D1 batch inserts an audit only for a still-pending organization, updates the
organization only for that winning server-generated decision identifier, and
inserts its durable notification intent. Unique organization keys prevent
competing outcomes. Repeating the same decision leaves the original audit and
intent unchanged; an opposite decision conflicts. Already auto-admitted and
legacy organizations cannot acquire an operator decision through this API.
Migration 0006 preserves the organization and dependent records while adding the
Denied state, audit, and notification tables. The populated upgrade test checks
foreign keys and retained allocation/selection records.

Both outcomes notify only the selected verified service contact, independently
of promotional consent. Email must match the current account email with both
verification flags set. Missing, changed or unverified selected contacts have
an explicit unavailable reason. SMS remains unavailable, even when verified;
there is no fallback to email. Eligibility is checked again before dispatch.

Email uses the existing Cloudflare `EMAIL` binding shape. The status message
states the decision and links to the merchant's account, not the Admin console.
A missing binding or delivery failure leaves the decision committed and the
notification pending with a sanitized reason. The detail page offers retry.
A request-scoped synthetic sink proves successful and failed sends locally.
No actual email/SMS or provider configuration is part of this change.

A five-minute claim lease and unique claim token prevent ordinary concurrent
retries from sending twice and prevent stale completion from overwriting a
newer claim. Pending or abandoned processing intents can be retried by a current
CMS Admin. There is no background scheduler in this slice. An ambiguous external
failure, or a provider request lasting beyond its lease, can cause repeated
external delivery; exactly-once delivery is not claimed. Provider acceptance is
recorded as delivered, not proof that the recipient read the message.

Appeals, reversals, suspension, deletion, new quotas, mandatory rejection reasons
and bulk decisions are outside this slice. Deployment and merge remain separate
gates.

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
node --experimental-strip-types scripts/organization-approvals-proof.mjs
```

The browser fixture starts loopback workerd, obtains a real EmDash session through
its native software-passkey test harness, and transfers that synthetic session
to the browser without printing it. Open the reported `/__proof/cms-browser`
URL. Approving Redwood Works demonstrates committed admission with an injected
email failure. The test-only `/__proof/approvals` control can switch the sink to
success for a browser retry. Denying Lakeside Lab shows unavailable SMS. Fixture
controls and captured messages exist only in the isolated test entry.

See `proof/organization-approvals/PROOF.md` for results and limits.
