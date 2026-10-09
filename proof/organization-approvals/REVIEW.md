# Organization approvals parent review

Source identity: `sha256:2078efda95f08c6b0ab0a226ec982d08223e85d14430119e26b2fdacbf1e2eff`.
The identity hashes sorted changed source/test paths (excluding decision/proof
and product prose), each UTF-8 path plus NUL, bytes, then NUL. The complete file
manifest is retained in the ignored working proof directory.

## Standards and source intent

The parent inspected the ACP draft, rejected material gaps, and completed the
repairs after both workers' terminal cleanup receipts. The final source uses
public EmDash interfaces, preserves the independent directory grant and first-50
admission rules, and limits the CMS capability to admission and its notifications.
No credentials, real tenants, private history, live grants or deployment were
introduced. Local workerd and browser proof exercise the real session boundary.

Adjudicated draft findings:

- `required_fix`, resolved: the original helper queried a nonexistent CMS `user`
  table. It now uses the exported Kysely auth adapter and current local Admin.
- `required_fix`, resolved: editing migration 0004 did not upgrade existing CHECK
  constraints. Migration 0006 now preserves populated version-5 relationships,
  and the D1 upgrade/foreign-key test passes.
- `required_fix`, resolved: audit/intent inserts could attach to an automatic
  admission or contradictory retry. The audit is now inserted only for pending
  state, and a winning server-generated identifier gates subsequent writes.
- `required_fix`, resolved: dispatch, retry and visible delivery status were
  missing. The supported email binding and separate synthetic sink now cover
  failure, retry, concurrent claims and unavailable SMS without fallback.
- `required_fix`, resolved: browser GETs were incorrectly required to have an
  Origin header. GET checks canonical site provenance; POST additionally checks
  exact Origin. Actual browser navigation and form submissions pass.

No unresolved source finding was accepted at this parent review checkpoint.
The following limits are explicit rather than hidden guarantees: CMS role
checks and merchant writes are not one cross-database transaction; external
email acceptance may repeat after an ambiguous failure or expired claim lease;
SMS and hosted CMS activation remain unqualified. There is no blanket new
operator role and no expansion into service provisioning or account privileges.

## Delivery review gate

Parent review does not replace CI, comprehensive exact-source OpenClaw, or native
ClawSweeper. Those must bind the published PR's current base/head. Their terminal
receipts and adjudications are retained under the ignored working proof root
and reported in the delivery handoff. Merge and deployment remain human-owned.
