-- Inventory Connect transactions and uniquely bound site grants.
-- SQL source of truth. Runtime applies only when this version is pending.

CREATE TABLE IF NOT EXISTS dinkuskit_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at) VALUES
  (1, '0001_better_auth.sql', unixepoch()),
  (2, '0002_dinkuskit.sql', unixepoch()),
  (3, '0003_store_connect.sql', unixepoch());

CREATE TABLE dinkuskit_store_connection (
  connection_id TEXT NOT NULL PRIMARY KEY,
  client_id TEXT NOT NULL,
  service TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_origin TEXT NOT NULL,
  callback_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  interval_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  account_subject TEXT,
  consented_at INTEGER,
  redeemed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX dinkuskit_store_connection_status_idx
  ON dinkuskit_store_connection (status, expires_at);

CREATE TABLE dinkuskit_site_binding (
  site_id TEXT NOT NULL PRIMARY KEY,
  site_origin TEXT NOT NULL UNIQUE,
  account_subject TEXT NOT NULL,
  service TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX dinkuskit_site_binding_subject_idx
  ON dinkuskit_site_binding (account_subject, revoked);
