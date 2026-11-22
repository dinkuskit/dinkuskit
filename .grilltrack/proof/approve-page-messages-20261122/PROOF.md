# Approve page messages (store-connect-plain-messages-127)

Step (a) of `store-connect-order-135`. Two cases on `/account/connect` used to
leave the business owner with nothing to read:

- a business still waiting for DinkusKit's approval got an empty 403;
- an Approve link past its 10 minutes (`CONNECTION_MAX_LIFETIME_MS`) sent the
  owner to Your stores with no word, or, when the page had been opened inside the
  10 minutes, kept showing **Approve** and then said only "This connection could
  not be approved."

## Pictures (22 Nov 2026)

Taken from the built Worker under the merchant test harness
(`tests/helpers/merchant-harness.mjs`): a signed-up owner, a Commerce Connect
started through `/api/store-connections`, the link run out with the test-only
`/__proof/expire-connection` route, and a second business created so it waits
for approval.

- `waiting-business.png`: HTTP 403, "Your business is waiting for approval",
  with what happens next and a link to the account.
- `link-ran-out.png`: HTTP 410, "This link ran out", saying links last 10
  minutes and to press Connect in Commerce again.

## Checks

`tests/account-foundation.test.mjs`: the waiting business sees the words and no
Approve button; an opened link that ran out shows the 410 page, an Approve
pressed on it afterwards lands on the same page, and another account opening the
same link still goes to its own stores. Non-owners keep the empty 403.
