-- One store key per plugin, handed to the plugin at the end of Connect (store-connect-
-- per-plugin-key-080). The owner never sees it. Only the key's SHA-256 is kept.
-- Connecting a plugin again overwrites only that plugin's row; Disconnect deletes it.
-- window_start and window_count count trades in the current minute.
CREATE TABLE dinkuskit_plugin_key (
  site_id TEXT NOT NULL REFERENCES dinkuskit_store_identity (site_id),
  plugin TEXT NOT NULL CHECK (plugin IN ('commerce', 'payments', 'ship')),
  key_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, plugin)
);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (14, '0014_plugin_keys.sql', unixepoch());
