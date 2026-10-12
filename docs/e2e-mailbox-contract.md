# E2E mailbox identity contract

This source-only fixture contract correlates one manifest-allocated synthetic
recipient with a bounded set of message metadata. It is not a Gmail, OAuth,
browser, mail-search, sending, or live authentication implementation.

## API

`createMailboxSelection(manifest, allocation)` first calls the slice-1
`validateManifest` export. The allocation must name the exact selected
recipient reference and synthetic `.invalid` address, mailbox identity,
intent, subject, run, environment, receive window, callback origin/path, and
browser role/context. The returned selection is a deep-frozen snapshot, so
later caller mutation cannot broaden it. The origin must equal the manifest's
target origin and the browser role must equal its role. The recipient reference
is manifest-admitted; the synthetic address mapping is supplied by the trusted
fixture allocator, not independently authenticated by this contract.

`selectMailboxMessage(selection, candidates, now)` requires an explicit injected
canonical current timestamp and accepts at most 50 candidates.
Candidates have an allowlisted safe metadata shape only. A unique exact match
in the receive window passes only when placement is `inbox`; a matching
message in `spam` is delivery evidence with `received-not-inbox`, not a
pass. Stale, ambiguous, wrong recipient, subject, intent, environment, run,
origin, or path results are blocked. Raw URL, HTML, token, cookie, and auth
state fields are undeclared and rejected.

`createOpaqueHandoff({ selection, match, consumer, now, ttlMs })` requires the
original selection and an unused successful result returned by
`selectMailboxMessage` for that exact selection. Copies and fabricated frozen
objects confer no authority. It retains the consumer callback in process,
with expiry capped at receipt time plus five minutes and the manifest deadline.
One match can produce only one handoff. The
fixed consumer signature is:

```js
{
  capability: 'synthetic-opaque-consumer-v1',
  consume({ selection, match, context, capability }) {
    return { status: 'passed' }
      // or { status: 'blocked', reason: 'tool-policy-blocked' }
      // or { status: 'assisted', assistance_at: '...' }
  }
}
```

Call `handoff.redeem(originalContext, canonicalTimestamp)` with the explicit
injected current time. Omitted, invalid, backdated or expired times refuse.
The inputs given to `consume` are frozen safe metadata; its return is reduced
to allowlisted result fields. Consumer exceptions and boundary validation
errors do not retain supplied values. This is a synchronous offline fixture
interface; an asynchronous browser adapter is not implemented or qualified.

The consumer is the only injected fixture boundary permitted to hold an
opaque value. Handoff replay, expiry, wrong context, missing/unsupported
consumer, consumer exceptions, and tool-policy blocks refuse safely. No
fallback click, redemption, cookie, or alternate route is attempted.

## Verification and limits

Run `npm run test:e2e-mailbox-contract`. `npm run verify` includes this
fixture suite. These tests prove only an offline contract over synthetic
metadata and an injected in-process consumer. They do not qualify a hosted
browser primitive, provider headers, a real mailbox, a live link lifetime,
OAuth scope, delivery, or an unattended identity flow. Missing consumer
support is blocked or explicitly human-assisted with a timestamp and
assistance flag; it is never treated as unattended success.

A future fixed runtime consumer needs exact manifest/intent allocation,
read-only retrieval for one bound mailbox and recipient with a finite receive
window, and an in-process continuation in the original isolated browser
context. It must validate the actual link's origin/path itself; the fixture
only compares declared metadata. It must keep raw bodies/URLs, credentials,
runtime responses and errors out of CLI arguments, files, model output and
receipts, preserve navigation policy, and stop on refusal. Ordinary navigation
or a successful fixture callback does not prove such containment. Forwarding
headers, actual 300-second validity, transport logging, asynchronous timeout
and cancellation, and independent post-auth state remain live qualification
requirements. No credential grant or generic browser administrator interface
is provided by this module.
