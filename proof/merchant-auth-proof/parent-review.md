# Parent review of the first merchant-auth proof

Recorded against uncommitted source identity `sha256:842a7c362db84012710cf1769018d1fd24c1dc9c13d11fc1e156fa2a6a40fdb5`. This is advisory evidence only. It is not merge authority and is not a clean exact-source review.

## Accepted required fixes

1. The claim that an unconfigured merchant domain requires operator preconfiguration or a non-public adapter change is false. `AuthAdapter` is exported and `getAllowedDomain` is a public interface. A custom adapter can implement general email signup as `SUBSCRIBER` without inserting domain rows or importing internals. Do not treat the native CMS allowlist as proof that all supported public EmDash auth APIs are unsuitable.

2. Homemade signup, magic-link, and session machinery in `src/account/runtime.ts` must not ship as an auth platform. Move synthetic HTTP/session/site-control runtime into `tests/helpers`. Use exported `requestSignup` / `completeSignup` / `sendMagicLink` / `verifyMagicLink` through the custom adapter when viable. Own HTTP/session plumbing is a local test fixture, not native EmDash browser integration. Disabled-account guards belong on the DinkusKit boundary because helpers may return disabled users.

3. Native CMS URLs cannot be configured in public `SignupConfig`. Record that coupling accurately. Do not call the exported helpers internal. Distinguish native CMS configured behavior from exported-library extension. If native browser or provider integration still cannot be established, recommend Better Auth as the next maintained provider proof. Do not select or implement Better Auth in this correction.

4. Tests must cover successful sign-in and recovery; disable blocking session access, new issuance, renewal, recovery, and sign-in; both synthetic sites inaccessible to Bob; wrong scope, issuer, audience, and site; actual token expiry; and revoke not resurrecting an outstanding challenge. Already-issued JWTs remain valid until expiry. Keep cookies, raw tokens, and signing secrets out of logs and receipts. Make no visual or browser claims without a browser.

5. `website-account-003` may record only the bounded proof as verified. Native browser and provider integration remain unresolved.

## Rejected findings

None. All five parent findings are accepted.

## Exact-source review

Not marked clean. Parent reviews again after commit.
