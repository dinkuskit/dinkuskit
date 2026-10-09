# Organization approvals proof

Decision: `website-organization-approvals-028`.
Base: `f3ba14bb19ffcf582de49443f1cf4b386211f039`.
Scope: current local CMS Admin admission decisions and independent selected-contact notifications.

## Verification

Targeted parent verification used Node 22.23.1; full acceptance uses the repository-pinned Node 22.23.2. All fixtures are synthetic and local.

- Approval suite: 6 tests pass, including actual EmDash software-passkey sessions
  against built workerd routes. Covers CMS-only access without merchant cookies,
  anonymous/merchant denial, current CMS demotion and disablement, missing/foreign
  Origin and foreign request host, private/no-store reads, automatic-admission
  exclusion, approve/deny, idempotent and conflicting submissions, competing
  decisions, notification failure, concurrent retry claims, SMS and unverified
  contact unavailability with no fallback, and unchanged lifetime allocations.
- Transaction tests inject intent persistence failure and verify rollback of
  both admission and audit. Missing-profile intent, stale-claim fencing and
  changed-contact denial are covered.
- Migration suite: 4 tests pass. Fresh, CLI, restart, and populated version-5
  upgrade retain references; `foreign_key_check` is empty after upgrade. Existing
  membership, admission and selection records remain present.
- Full repository `npm run verify`: exit 0 on Node 22.23.2. All 67 TAP tests pass, plus the route smoke, development CMS, release reuse, CMS helpers, Access gate, safe URL, native CMS operation, actual 1.0.1-to-1.2 upgrade, and Cloudflare candidate checks. Typecheck reports zero errors.

Logs are retained in ignored `.grilltrack/work/organization-approvals/`:
`tests-parent.log`, `migrations-parent.log`, `verify-node-pinned.log`,
`build-parent.log`, and `typecheck-parent.log`. The first full run stopped at a CMS passkey fixture authentication failure;
the isolated CMS test passed on recheck. That failed run remains in
`verify-parent.log` and is not acceptance evidence. The next full run reached the CMS operation check but stopped because Node 22.23.1 differed from the exact 22.23.2 fixture requirement; that log is `verify-final.log`, also not acceptance evidence. Both ACP turns were cancelled after concrete parent
findings and confirmed terminal cleanup before parent source repairs.

## Browser proof

The parent independently drove the actual loopback workerd UI using Codex browser
controls. A separate fixture obtains a real native EmDash session through the
software-passkey harness and transfers that synthetic session to the browser;
no role headers, fake locals or merchant session confer approval authority.

- Redwood Works appeared pending, with verified selected email. Clicking Approve
  produced Active/Admitted and an actor/time audit, while an injected email
  failure left Notification pending. After enabling the synthetic sink, clicking
  Retry changed the notification to delivered without changing the decision or
  its timestamp.
- The queue then showed only Lakeside Lab. Clicking Deny produced Denied/Denied
  and its audit, with Notification unavailable (`sms_unavailable`). No fallback
  email or SMS was sent.
- Screenshots were visually inspected; the inherited simple page layout retained
  readable decision, contact and retry controls. No visual redesign was attempted.

Selected sanitized screenshots are retained locally under the working proof
root: `approved-pending.jpg`, `approved-delivered.jpg`, and
`denied-sms-unavailable.jpg`. They contain only generated synthetic identities,
no credentials or auth URLs. Routine media is not committed to the product repo.

## Limits

No live email/SMS, provider configuration, account grants, service activation,
deployment or merge occurred. CMS authorization and the merchant transaction
span separate databases; there is no distributed atomic CMS-role change lock.
Delivery uses a leased claim, with possible repeated external delivery after an
ambiguous provider failure; exactly-once delivery is not claimed. Retries are
explicit CMS Admin actions, not a newly provisioned background scheduler.

The production CMS namespace remains gated. Local native-session proof does not
claim hosted Cloudflare Access activation. External review evidence belongs in
`REVIEW.md` and must match the final PR source tuple before the maintainer gate.

## Screenshot integrity

| Local artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `approved-pending.jpg` | 144030 | `7af8436d5bcc2dc9c2e7c5a31f06d1b7f2df0572a36bb274317d68810ff1d3ab` |
| `approved-delivered.jpg` | 75678 | `116dd6f9075ee7a4a0365131e8c280dcfa64f68ba40896b65f4e802de65499ff` |
| `denied-sms-unavailable.jpg` | 74990 | `99070d82be4029e46723b2fdce27d9bdcf494694f0ca5311fe7249e735db1b7b` |
