-- One store key per store, pasted once into Commerce's settings. Commerce trades it
-- at /api/store-passes for short-lived passes. Only the key's SHA-256 is kept.
-- Replace key overwrites the row, so the old key stops working at once.
-- window_start and window_count count trades in the current minute.
CREATE TABLE dinkuskit_store_key (
  site_id TEXT NOT NULL PRIMARY KEY REFERENCES dinkuskit_store_identity (site_id),
  key_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (10, '0010_store_keys.sql', unixepoch());
