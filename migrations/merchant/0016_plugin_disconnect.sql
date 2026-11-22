-- A plugin the owner disconnected under Your stores (connect-finish-setup-disconnect-137).
-- Finish setup cannot bring it back by itself: its next Connect needs the owner's Approve
-- again, and that Approve deletes the row. Uninstall cancelling a key adds no row.
CREATE TABLE dinkuskit_plugin_disconnect (
  site_id TEXT NOT NULL REFERENCES dinkuskit_store_identity (site_id),
  plugin TEXT NOT NULL CHECK (plugin IN ('commerce', 'payments', 'ship')),
  disconnected_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, plugin)
);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (16, '0016_plugin_disconnect.sql', unixepoch());
