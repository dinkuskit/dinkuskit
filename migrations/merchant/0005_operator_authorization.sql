-- Server-owned operator authorization. No grant is seeded by this migration.
CREATE TABLE IF NOT EXISTS dinkuskit_operator_grant (
  account_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  grant_reference TEXT NOT NULL,
  revoked_by TEXT,
  revoked_at INTEGER,
  revoke_reference TEXT,
  PRIMARY KEY (account_id, scope)
);

CREATE INDEX IF NOT EXISTS dinkuskit_operator_grant_scope_idx
  ON dinkuskit_operator_grant (scope, revoked_at);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (5, '0005_operator_authorization.sql', unixepoch());
