# Merchant admission status proof

Decision: `website-merchant-admission-status-029`.
Base: `775236b61e2a5f1a417b44f4f6e2dea630c4749c`.
Scope: read-only current membership admission status and owner-only sanitized notification summary on `/account`.

## Verification

Pinned Node22.23.2. Targeted approval suite passes7 tests, including new real CMS/merchant workerd flows. Typecheck reports zero errors; build passes. Full `npm run verify`: exit0, all68 TAP tests and all script checks pass, including native CMS operation, actual EmDash upgrade and Cloudflare candidate denial.

Per-organization assertions prove same-session Pending -> Admitted after a CMS decision even when email fails, explicit retry changing only notification wording to accepted for sending, Denied with SMS unavailable, automatic admission without invented audit, missing contact unavailable, owner/member/outsider privacy, removed-membership revocation, rejected merchant decision/retry attempts, denied-only page without an empty switch control, unchanged lifetime allocations/audit, and no service grants. Account responses are private/no-store. Recipient, CMS actor, notification IDs and raw errors are absent from the status section.

The parent independently signed into the built workerd UI using synthetic merchant magic-link sessions and drove browser refreshes after real native CMS-session decisions. Observed owner Pending -> Admitted with pending email, then accepted-for-sending after retry, and Denied with SMS unavailable. Member sees admission only; outsider sees neither organization. The simple inherited page layout was visually inspected; no redesign was made. Test-only fixtures never confer production identity or authority.

The ACP turn failed with a transport PING timeout; terminal cleanup was confirmed. The parent reviewed its partial draft, tightened the database membership/owner scope, completed generic unavailable and decision-persistence wording, and added the actual privacy/refresh regression proof. Worker output alone is not acceptance.

Logs and sanitized screenshots are retained under ignored `.grilltrack/work/merchant-admission-status/`: `typecheck-parent.log`, `build-parent.log`, `test-parent.log`, `verify-parent.log`, and `browser-manifest.json`. No session tokens/cookies are included in curated proof.

## Limits

Read-only account UX: no admission mutation, merchant retry power, new roles, appeal/resubmission, billing, provider setup, live sends, activation, deployment or merge. Existing transport status `delivered` means the send binding accepted the request; the page explicitly does not claim recipient delivery. Notification availability does not change admission. Existing selection/auth and automatic-admission behavior remain authoritative. Browser fixture and local workerd proof do not establish hosted availability.

## Screenshot integrity

| Local screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| `member-status-only.jpg` | 112558 | `065c2985bb5aff772ed8fb833ab65932057bb39fa1df7243ce63379311cb288f` |
| `outsider-isolation.jpg` | 104005 | `1d925f617b96b1894a0b224942384354d8b826920072b3cacfd49bb9c0c8bec2` |
| `owner-accepted-and-denied.jpg` | 115917 | `7ad6f71f5ec8e5eb469f3fb5fe437ae578119cc487b920fed20ce04e29a50dd1` |
| `owner-admitted-pending-email.jpg` | 114993 | `8a73f03897cf354869dcaace5319ae0de58780dc2f865c5837aa06c6765ee7fe` |
| `owner-pending.jpg` | 110201 | `eb9d737f3b2bb9f570390bf90419d24c81d2af322728fcc32a2c296c9fe422a6` |
