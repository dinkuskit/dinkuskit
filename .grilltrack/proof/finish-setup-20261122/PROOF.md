# Finish setup, Ship on when it connects (step (b) of store-connect-order-135)

Decisions: `store-connect-approve-once-125`, `store-connect-ship-on-at-setup-126`,
`connect-shows-siblings-133`, `connect-uninstall-cancels-key-134`, and
`connect-finish-setup-disconnect-137` (locked on the owner's approval, 2026-11-22).

## Pictures (22 Nov 2026)

Taken from the built Worker under the merchant test harness
(`tests/helpers/merchant-harness.mjs`), with Playwright's Chromium and JavaScript
off. A synthetic owner signed up; Commerce for `https://acme-goods.example` was
connected with the owner's Approve; Payments and then Ship joined with
`POST /api/store-connections/finish` (no second Approve). Store receipts come from
the harness's `/__proof/receipt` simulation, not a real store.

- `ship-not-connected.png`: Your stores, Plugins tab, after Commerce and Payments.
  There is no Turn on Ship switch; Ship says "Off. Press Connect or Finish setup in
  the Ship plugin in EmDash to turn it on."
- `ship-on-after-finish-setup.png`: the same card after Ship's Finish setup:
  "Ship plugin: connected", **Disconnect Ship**, and "Ship: On".
- `ship-on-key-cancelled.png`: Ship's own key was cancelled (as an uninstall does)
  while Ship stays on for the store: "Ship plugin: not connected", "Ship: On", and a
  **Disconnect Ship** button in the services list, so the owner can still turn Ship
  off without a key.
- `ship-off-after-disconnect.png`: after pressing that button Ship is off for the
  store and the button is gone.

## Email the owner got (test mail sink)

```
Subject: Dinkus Ship joined your store on DinkusKit

Dinkus Ship joined https://acme-goods.example, which My organization already connected to DinkusKit.
If you didn't expect this, open Your stores and press Disconnect for Dinkus Ship:
<DinkusKit.com>/account/sites
```

Payments got the same email naming Dinkus Payments.

## Review fixes (Disconnect during Finish setup)

- The approval write itself now refuses a Finish setup (no owner present) when the
  owner has disconnected that plugin or revoked Ship for the store, so a Disconnect
  pressed while Finish setup is still reading the store receipt cannot be overtaken.
  Disconnect also denies a connection still `pending` as well as `approved`.
- `tests/plugin-connect.test.mjs`: "a Disconnect pressed while Finish setup reads the
  store receipt stops it before any key or grant" (Payments and Ship) and "the
  approval write itself refuses Finish setup once the owner disconnected or revoked,
  even for a connection still waiting". Both fail on the previous head (`704c2c7`)
  and pass now.
- `tests/shared-store-routes.test.mjs`, against the built Worker: Payments' receipt is
  slowed by 5 s, the owner presses Disconnect Payments 300 ms into Finish setup, and
  Finish setup answers 409 with no store key; the old key stays invalid and the page
  says "Payments plugin: not connected" with no Finish setup offered.

## Worker trace with stored rows (head after `ad88252`)

`worker-trace.mjs` drives the built Worker and prints each request and reply, with
keys, passes, PKCE values and secrets redacted. After each step it prints the rows
read from the Worker's local D1 file. Its output is `worker-trace.md`:

1. **Allowed Finish setup.** Finish setup answers 200 with Payments' own key, and
   the key trades for a checkout pass. D1 then holds one Commerce key, one Payments
   key and the Payments grant.
2. **Disconnect during Finish setup.** The receipt read is slowed to 5 s. The
   owner presses Disconnect Payments 300 ms in, and the Finish setup sent before it
   answers 409 with no key. The old key then gets `invalid_store_key`. D1 holds no
   Payments key, the connection is denied, and the Disconnect is recorded.
3. **Stale key cancel.** The owner approves a new Payments Connect that has not
   been picked up yet. An uninstall cancel then presents the key the Disconnect
   removed and gets 401. The approved Connect stays approved, and its token
   exchange still hands over a key. A cancel with that current key answers 200 and
   leaves only Commerce's key.

`tests/plugin-connect.test.mjs` also has "an uninstall whose key the owner
disconnected meanwhile cancels nothing, and cannot deny the Connect approved
since". It pauses the cancel after its key read, so a Disconnect and a new Approve
happen in between. It fails on `ad88252` and passes now: the denial and the key
delete run in one batch, and both only while that exact key is still current.

The plugin side runs the plugins' real entry points against this Worker. See
`proof/finish-setup-20261122/authority-chain-trace.md` in dinkuskit/payments#122
(37 checks) and dinkuskit/ship#101 (34 checks).

## Data compatibility (migration 0016)

Before 0016, Disconnect deleted the plugin's key and denied its approved Connect, but
kept its grant and recorded nothing else. 0016 therefore records a Disconnect for each
plugin that has no key but whose history shows the owner's word: a Connect the owner
approved or denied, or a grant. A Connect approved and not picked up yet is the owner's
newer Approve, so that plugin is left alone. Where schema 15 cannot tell a Disconnect
from something else (a grant without a key), Finish setup asks for the owner's Approve.

`tests/merchant-migrations.test.mjs`:
- "merchant D1 migration 0016 keeps a schema-15 Disconnect: Finish setup gets no key
  until the owner approves again". On the built Worker, it does the following:
  1. Commerce and Payments connect through Approve.
  2. The store goes back to schema 15: the 0016 table and ledger row are removed, and
     Disconnect Payments runs the way schema 15 did it (key deleted, approved Connect
     denied, grant left on).
  3. The Worker restarts and applies 0016. Only Payments is recorded.
  4. Payments' Finish setup answers 409 `owner_approval_required` with no key, and D1
     holds only Commerce's key.
  5. Ship, which never connected, still finishes setup with its own key.
  6. After the owner's Approve, Payments' token answers 200 with a key, and the record
     is cleared.

  This test fails on `45a78da`, where 0016 recorded nothing.
- "merchant D1 migration 0016 keeps a schema-15 store's keys, grants and checkout
  settings, and records a Disconnect only for a granted plugin with no key". It
  upgrades a schema-15 database with an organization, a store, Commerce and Ship keys,
  Ship and Payments grants and checkout settings. Every row stays unchanged. Only
  Payments (a grant, no key) is recorded. The table refuses rows that break its
  foreign key or check, and a second run is a no-op.

## Checks

`tests/shared-store-routes.test.mjs` ("Finish setup through the routes ..."): lookup
says Finish setup only for a store this business already connected; a wrong
verifier and a missing store receipt are refused; Finish setup works once; Payments
gets its pass and key, Ship gets its key and Ship turns on; the store:connection
pass reads the business and plugins; a plugin cancels only its own key; after the
owner's Disconnect, Finish setup answers `owner_approval_required` until the owner
approves again. `npm run test:shared-store`, `test:merchant`, `test:foundation`,
`test:agent-routes`, `test:organization-approvals`, `test:operator-admin`,
`test:checkout-settings-browser`, `test:docs`, `test:account` and `astro check` pass.
Nothing here was run against dinkuskit.com; the new routes go live only with a deploy.
