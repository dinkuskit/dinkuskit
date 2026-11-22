-- A plugin the owner disconnected under Your stores (connect-finish-setup-disconnect-137).
-- Finish setup cannot bring it back by itself: its next Connect needs the owner's Approve
-- again, and that Approve deletes the row. Uninstall cancelling a key adds no row.
CREATE TABLE dinkuskit_plugin_disconnect (
  site_id TEXT NOT NULL REFERENCES dinkuskit_store_identity (site_id),
  plugin TEXT NOT NULL CHECK (plugin IN ('commerce', 'payments', 'ship')),
  disconnected_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, plugin)
);

-- Before this table, Disconnect deleted the plugin's key and denied its Connect, but kept its grant,
-- so a plugin the owner disconnected on schema 15 looks like any plugin without a key. Record a
-- Disconnect for every plugin that has no key now but whose history shows the owner's word: a
-- Connect the owner approved or denied, or a grant for it. A Connect approved and not picked up yet
-- is the owner's newer Approve, so that plugin is left alone. Where history cannot tell a Disconnect
-- apart from something else, Finish setup asks for the owner's Approve: that is the safe side.
INSERT OR IGNORE INTO dinkuskit_plugin_disconnect (site_id, plugin, disconnected_at)
SELECT seen.site_id, seen.plugin, unixepoch()
FROM (
  SELECT site_id, service AS plugin FROM dinkuskit_store_connection
    WHERE protocol_version = 2 AND (consented_at IS NOT NULL OR status = 'denied')
  UNION
  SELECT site_id, service AS plugin FROM dinkuskit_service_grant
) AS seen
JOIN dinkuskit_store_identity i ON i.site_id = seen.site_id
WHERE seen.plugin IN ('commerce', 'payments', 'ship')
  AND NOT EXISTS (SELECT 1 FROM dinkuskit_plugin_key k WHERE k.site_id = seen.site_id AND k.plugin = seen.plugin)
  AND NOT EXISTS (SELECT 1 FROM dinkuskit_store_connection c
    WHERE c.site_id = seen.site_id AND c.service = seen.plugin AND c.status = 'approved' AND c.protocol_version = 2);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (16, '0016_plugin_disconnect.sql', unixepoch());
