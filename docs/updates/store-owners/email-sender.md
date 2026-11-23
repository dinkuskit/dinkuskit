---
article: store-owners/email-sender
base: new
title: "Switch your store's email to SMTP"
summary: "Send your store's email through an SMTP email company instead of Cloudflare, so the abandoned cart email can go out."
audience: "Store owners"
product: "Store email"
version_scope: "Unreleased"
nav_label: "Store email"
section: "Store owners"
order: 45
---

## What you will finish

All of your store's email goes out through an SMTP email company. This includes order confirmations, shipping confirmations, review emails, sign-in links and the abandoned cart email. You make the change on one screen in EmDash, and you can switch back at any time.

## Why switch

A store built from the DinkusKit template on Cloudflare starts on Cloudflare's own sender, which EmDash shows as `cloudflare-email`. It sends from your store's address, and it needs nothing set up beyond Cloudflare's **Onboard** step for your domain.

Cloudflare allows **transactional email only**. That means email a shopper expects because of something they did, such as an order or a sign-in. The abandoned cart email is marketing, because the shopper never finished paying. So while Cloudflare's sender is picked, your store does not send cart emails. The Store emails page shows them as **Not sent: cart emails need an SMTP sender**.

Switch to SMTP if you want cart emails to go out. If you don't use cart emails, you can stay on Cloudflare.

## Before you start

- **An account with an SMTP email company that allows marketing email.** From that company you need:
  - the SMTP host;
  - the port, either 587 or 465;
  - a username and password, which some companies call an SMTP key or app password;
  - a sender address on your own domain, set up with the DNS records the company gives you.

  Port 25 is not supported.
- **Your store's encryption key.** EmDash encrypts the SMTP password with the store's `EMDASH_ENCRYPTION_KEY`. Stores built from the DinkusKit template are set up with one. If EmDash says it cannot save the password, ask whoever set up your store to add the key. They must never replace a key the store already uses.

## Switch to SMTP

1. In your store's admin, open **Settings > Email**.
2. Under **Email Provider**, pick **SMTP**.
3. Fill in the SMTP host, port, username, password and sender address from your email company. Then press **Save Settings**.
4. Under **Send Test Email**, enter your own address and press **Send Test**. The test goes through the full email pipeline. Check that it arrives, and that it comes from your sender address.

From now on, every email your store sends goes through SMTP. EmDash uses one sender for the whole store.

## Check the cart email

1. Open the **Store emails** page in your store's admin.
2. Check that the sender in use is SMTP.
3. Under **Abandoned cart email**, pick **Shoppers who ticked the box** or **All customers**. It starts as **Off**.

Cart emails that were not sent while Cloudflare was picked are not sent later. Only carts left after the switch get one.

## Switch back to Cloudflare

Open **Settings > Email**, pick **cloudflare-email**, and save. EmDash keeps your saved SMTP login, so switching to SMTP again takes one save. While Cloudflare is picked, cart emails stop again.

## If the test email fails

- **Authentication failed.** Use the SMTP key or app password from your email company, not your account password.
- **The connection times out.** Check the host, and use port 587 or 465.
- **The email arrives in spam or from the wrong address.** Finish the email company's DNS steps for your domain, then send the test again.
