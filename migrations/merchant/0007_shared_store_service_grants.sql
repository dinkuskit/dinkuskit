-- Clean v2 shared store identities and independent service grants.
-- Legacy site bindings are intentionally untouched and inert.
ALTER TABLE dinkuskit_store_connection
  ADD COLUMN protocol_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE dinkuskit_store_identity (
  site_id TEXT NOT NULL PRIMARY KEY,
  site_origin TEXT NOT NULL UNIQUE,
  account_subject TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE dinkuskit_service_grant (
  site_id TEXT NOT NULL REFERENCES dinkuskit_store_identity (site_id),
  service TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (site_id, service)
);

CREATE INDEX dinkuskit_service_grant_subject_idx
  ON dinkuskit_service_grant (site_id, revoked);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (7, '0007_shared_store_service_grants.sql', unixepoch());
