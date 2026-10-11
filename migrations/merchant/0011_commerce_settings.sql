-- What the owner chose in Set up Commerce for each store: the shipping charge and
-- test or live. shipping_revision goes up each time the charge changes, because
-- Commerce keys its trusted shipping snapshot on it.
CREATE TABLE dinkuskit_commerce_settings (
  site_id TEXT NOT NULL PRIMARY KEY REFERENCES dinkuskit_store_identity (site_id),
  shipping_mode TEXT NOT NULL CHECK (shipping_mode IN ('free', 'flat')),
  shipping_minor INTEGER NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
  shipping_revision INTEGER NOT NULL DEFAULT 1 CHECK (shipping_revision >= 1),
  live INTEGER NOT NULL DEFAULT 0 CHECK (live IN (0, 1)),
  updated_by_user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (11, '0011_commerce_settings.sql', unixepoch());
