-- Sign in with DinkusKit.com for Ship's label page. A one-time code goes to Ship in
-- the browser; Ship trades it, server to server, for a 5-minute ship:labels pass and a
-- refresh token. Only hashes of codes and refresh tokens are kept.
-- A code works once, for 60 seconds, for one store, person, sign-in session and
-- PKCE challenge.
CREATE TABLE dinkuskit_ship_sign_in_code (
  code_hash TEXT NOT NULL PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES dinkuskit_store_identity (site_id),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX dinkuskit_ship_sign_in_code_expiry_idx ON dinkuskit_ship_sign_in_code (expires_at);

-- One row per Ship sign-in. Each refresh replaces token_hash and keeps the one before
-- in previous_hash; presenting previous_hash again ends the sign-in (reuse means a copy).
-- ended_at is set when DinkusKit.com refuses a refresh; Ship then signs in again.
CREATE TABLE dinkuskit_ship_sign_in (
  sign_in_id TEXT NOT NULL PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES dinkuskit_store_identity (site_id),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  previous_hash TEXT,
  created_at INTEGER NOT NULL,
  refreshed_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX dinkuskit_ship_sign_in_previous_idx ON dinkuskit_ship_sign_in (previous_hash);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (12, '0012_ship_sign_in.sql', unixepoch());
