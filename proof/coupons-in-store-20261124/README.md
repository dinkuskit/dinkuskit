# Coupons row on Your stores (website-coupons-in-store-20261124)

Source: this branch, built with `npm run build`, served by the merchant test runtime (`tests/helpers/merchant-harness.mjs`) with the synthetic store from `tests/helpers/checkout-settings-fixture.mjs`. Chromium, JavaScript off, the owner signed in, `/account/sites?store=<id>&tab=plugins`.

- `coupons-row-1440.png` and `coupons-row-390.png`: the Plugins tab at 1440 px and 390 px. The Coupons row reads "Set up in your store. Coupons is its own EmDash plugin, so there is nothing to turn on here." There is no "Coming soon" and no Turn on Coupons button.
- `tests/shared-store-routes.test.mjs` checks the same text, that the page still refuses a request to turn Coupons on, and that Commerce's key still gets no coupon pass.

Limits: a local synthetic store, not the live site. The page goes live only with a DinkusKit.com deploy.
