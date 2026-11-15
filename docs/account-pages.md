# Account pages

What a store owner or staff member sees on dinkuskit.com after signing in
(decisions `website-account-pages-plain-words-049` and
`website-owner-renames-business-050`). Every action and permission check is the
one described in [merchant-account-model.md](merchant-account-model.md) and
[organization-approvals.md](organization-approvals.md); these pages only decide
the words, the order and the messages.

Words on screen: a merchant organization is a **business**, admission is
**approval** (Waiting for approval, Approved, Not approved), and roles are
Owner, Administrator and Staff.

## `/account`

Top to bottom:

1. The selected business's name, "Signed in as {email}" and **Log out**.
2. **Name your business**, for the owner only, while the name is still the
   sign-up default "My organization". Only the owner can rename a business,
   using the same 1 to 120 character rule as creating one. Shoppers never see
   the name; the owner, staff and the DinkusKit operator do.
3. One next-step card for the selected business:
   - waiting for approval: approval comes by email, and a store can connect
     after that;
   - not approved: the business cannot connect a store;
   - approved with no store: install the DinkusKit Payments plugin in the
     EmDash store, open its setup page and press Connect;
   - store connected: the addresses of stores that still have a service
     turned on, and **Set up your store**, which opens `/account/sites`;
   - staff (not the owner): what they can do, in plain words.
   Owners also see the approval email notice. Approval never turns a service
   on; the card says what to do next instead of saying so.
4. **Staff**, for the owner and administrators who can manage staff: everyone
   with their role and permissions, **Change what they can do** (boxes ticked
   to match), **Make administrator** (owner only) and **Remove** for each person
   except the owner, and **Add a staff member** by email.
5. **Your businesses**, only for someone in more than one business: each
   business with its approval, **Switch business**, and **Create another
   business**.
6. **Account settings**, folded away: **Disable my login** and its limits.

After a staff change the page says what happened. A browser form that fails
(no DinkusKit login for that email, not on this staff, not allowed) comes back
to `/account` with a plain message instead of an error page. Requests that
are not from a browser form still get the JSON errors.

## `/account/sites` (Your stores)

The heading is "Your stores" and the page names the business. It lists a
store only while that store still has a service turned on. With no store
connected, it says to install the DinkusKit Commerce plugin in the EmDash
store, open Commerce Settings and press Connect, then do the same in Payments
and Ship. Set up Commerce shows which plugins are connected and the checkout
settings Commerce reads by itself; there is no store key to make or paste.
That section is only for those connected stores. Each store has plain-link
**Plugins · Shipping · Payments** navigation below its origin and Store ID,
using `?store=<siteId>&tab=shipping` (or `plugins` / `payments`). The current
link has `aria-current="page"`; the row scrolls rather than wraps, with 44px
targets and no JavaScript requirement. The default is Plugins until Commerce
is connected, then Shipping. Unknown store/tab selections fall back to each
store's default without selecting a different business's store.

Plugins holds the connected-plugin list, Disconnect buttons and service
controls. Shipping has **Free shipping on every order** or **Flat charge per
order**; only Flat reveals labeled dollar-prefixed Flat charge and optional
Free shipping over boxes, using CSS `:has`. Payments has bordered Test / Live
choices with their consequences stated. Only the owner sees the settings
forms. Each tab has its own native **Save shipping** / **Save payments** action;
it stays on that tab for successful saves and amount errors. Saving Shipping
cannot alter Payments mode, and saving Payments cannot alter any shipping
field or its revision, even when another tab's earlier read is stale. The
existing combined `checkout_settings` POST remains accepted for older clients;
new forms send `shipping_settings` or `payments_settings`, not hidden values
for the other half. No schema migration or hosted availability is implied.

Revoke still turns one service off. It does not delete the store or add a
remove button. When nothing is left on, the store leaves this page.
`/account/sites/archive` (Archived stores) shows it, including the same Set up
Commerce row, and the revoked service says to press Connect in the store to
connect again. That note stays on the archive, not on the live list.

## Emails and check-your-email

- Sign-up, sign-in and recovery emails name the action in the subject, the
  first line and the button ("Finish creating your account", "Sign in to
  DinkusKit", "Recover your account"), say the link works once and expires in
  5 minutes, and say the email can be ignored if it was not asked for.
- `/account/check-email` still never says whether an address has an account.
- The approval email names the business instead of its ID: "Your business is
  approved on DinkusKit" or "Your business wasn't approved on DinkusKit".

## Sign-up

A phone number in the wrong form explains the form with an example. "I agree
to the account terms" links to `/terms`, which shows the entry with the slug
`terms` in the EmDash admin's Pages, written by the owner. Until that entry
exists, `/terms` answers "Content is not available yet".
