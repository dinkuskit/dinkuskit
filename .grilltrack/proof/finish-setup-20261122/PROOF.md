# Finish setup, Ship on when it connects (step (b) of store-connect-order-135)

Decisions: `store-connect-approve-once-125`, `store-connect-ship-on-at-setup-126`,
`connect-shows-siblings-133`, `connect-uninstall-cancels-key-134`, and the proposed
`connect-finish-setup-disconnect-137` (awaiting the owner's approval).

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

## Email the owner got (test mail sink)

```
Subject: Dinkus Ship joined your store on DinkusKit

Dinkus Ship joined https://acme-goods.example, which My organization already connected to DinkusKit.
If you didn't expect this, open Your stores and press Disconnect for Dinkus Ship:
<DinkusKit.com>/account/sites
```

Payments got the same email naming Dinkus Payments.

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
