-- NULL is legacy authorization, never upgraded to an isolated recipient.
ALTER TABLE dinkuskit_ship_sign_in_code ADD COLUMN ship_recipient TEXT;
ALTER TABLE dinkuskit_ship_sign_in_code ADD COLUMN ship_generation TEXT;
ALTER TABLE dinkuskit_ship_sign_in_code ADD COLUMN ship_mode TEXT;
ALTER TABLE dinkuskit_ship_sign_in ADD COLUMN ship_recipient TEXT;
ALTER TABLE dinkuskit_ship_sign_in ADD COLUMN ship_generation TEXT;
ALTER TABLE dinkuskit_ship_sign_in ADD COLUMN ship_mode TEXT;
INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (13, '0013_ship_recipient.sql', unixepoch());
