# Authentication feasibility and next proof

Inspected EmDash and its auth package at 1.0.1, commit `0e8977c221dd8e5111511eb226faa3d164c829ef`. Six local package checks confirmed public auth exports, allowed-domain signup behavior, subscriber permission boundaries, and rejection of DinkusKit service scopes. These checks did not prove browser recovery, hosted identity or production reliability.

## Findings

- EmDash has passkeys, provider sign-in, magic-link recovery, sessions and a subscriber role distinct from editors. Public auth helpers exist.
- Native signup requires enabled, explicitly allowed email domains. General merchant signup needs a supported extension and proof.
- Native OAuth uses opaque tokens and CMS/MCP scopes. Inventory and Payments expect asymmetrically signed, service-specific tokens with authorized site claims. Successful sign-in alone does not prove control of a merchant site.
- Auth dependencies including arctic and several oslo packages are deprecated. Upstream migration remains an open maintenance concern, not evidence of an exploitable vulnerability.
- Internal EmDash route handlers are not stable public integration APIs.

Sources: [authentication guide](https://github.com/emdash-cms/emdash/blob/0e8977c221dd8e5111511eb226faa3d164c829ef/docs/src/content/docs/guides/authentication.mdx), [signup](https://github.com/emdash-cms/emdash/blob/0e8977c221dd8e5111511eb226faa3d164c829ef/packages/auth/src/signup.ts), [native scopes/tokens](https://github.com/emdash-cms/emdash/blob/0e8977c221dd8e5111511eb226faa3d164c829ef/packages/auth/src/tokens.ts), [dependency maintenance issue](https://github.com/emdash-cms/emdash/issues/3550).

## Bounded next proof

Use supported public APIs to prove sign-up, sign-in, recovery and sign-out for two synthetic merchants, including an email domain not configured by an operator. Neither merchant may edit the website. One merchant can explicitly connect two synthetic sites; the other cannot access or authorize those sites. Establish a verifiable site-control mechanism before issuing grants.

A small DinkusKit-owned account boundary should preserve stable identity and produce short-lived service-specific access accepted by the existing Inventory and Payments verifier contracts. Prove renewal, disabled accounts, revoked site access, wrong audiences and wrong sites. Verify actual browser/session behavior on the intended runtime.

If this needs internal handler imports or an expanding EmDash fork, choose a maintained authentication implementation behind the same account boundary. Do not wait on an upstream feature request to release the website.

Subscriptions, pricing, standalone stock screens and new-store hosting are outside this proof.
