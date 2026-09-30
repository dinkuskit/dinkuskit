-- DinkusKit-owned merchant identity and grant tables.
-- Separate from Better Auth user/session/account/verification and from EmDash CMS D1.
CREATE TABLE IF NOT EXISTS dinkuskit_account (
  user_id TEXT NOT NULL PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dinkuskit_site_grant (
  account_subject TEXT NOT NULL,
  site_id TEXT NOT NULL,
  attested INTEGER NOT NULL DEFAULT 0,
  granted_at INTEGER,
  PRIMARY KEY (account_subject, site_id)
);

CREATE TABLE IF NOT EXISTS dinkuskit_jwks (
  kid TEXT NOT NULL PRIMARY KEY,
  public_jwk TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS dinkuskit_account_disabled_idx ON dinkuskit_account (disabled);
