# Merchant admission status parent review

Source identity: `sha256:e008d372e9a0dbe9a9abd089db0e736b2cfe793d6454a3247c16d1f410947ab3`. Hashes sorted changed source/test paths, each UTF-8 path plus NUL, file bytes plus NUL; excludes decision/proof/product prose. Manifest retained in ignored working proof.

Standards: focused read-only account change, public-safe synthetic fixtures, current server-side membership and owner checks, no new authority or transport writes. Existing CMS and merchant boundaries, automatic admission and selection are preserved.

Source intent: Pending/Admitted/Denied is read on refresh. Only current owners can join sanitized notification state; the DTO never selects recipients, actors, claim identifiers or raw errors. Email acceptance is explicitly distinguished from recipient delivery. Notification unavailability does not alter the visible admission decision. The no-selectable case omits the empty switch action.

Draft adjudication: `required_fix`, resolved — the draft queried notifications for all supplied memberships and relied on a caller snapshot. The final single query binds the authenticated user, enabled account and active membership, and joins notices only for current ownership. `required_fix`, resolved — missing-contact state was invisible and decision persistence unexplained; generic unavailable wording and explicit independent decision copy are present. `required_fix`, resolved — early tests matched global page text that could be satisfied by an automatic-admission organization; final tests bind assertions to each specific organization and exercise owner/member/outsider and removed membership.

No unresolved source finding at this checkpoint. Full acceptance, CI and comprehensive OpenClaw/native ClawSweeper on the published exact base/head remain delivery requirements. Terminal external receipts will be retained in the ignored delivery packet to avoid changing the reviewed source tuple. Merge remains human-owned.
