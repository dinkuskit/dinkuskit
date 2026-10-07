-- Additive organization, membership, intake, and admission foundation.
-- Legacy subjects and site grants remain authoritative and are never rekeyed.
ALTER TABLE dinkuskit_store_connection ADD COLUMN organization_id TEXT;

CREATE TABLE IF NOT EXISTS dinkuskit_organization (
  organization_id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_operator', 'suspended', 'closed')),
  owner_user_id TEXT NOT NULL,
  authority_subject TEXT NOT NULL UNIQUE,
  admission_status TEXT NOT NULL DEFAULT 'pending_operator' CHECK (admission_status IN ('legacy', 'admitted', 'pending_operator')),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS dinkuskit_membership (
  organization_id TEXT NOT NULL REFERENCES dinkuskit_organization (organization_id),
  user_id TEXT NOT NULL REFERENCES "user" (id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'administrator', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dinkuskit_one_owner_per_org
  ON dinkuskit_membership (organization_id) WHERE role = 'owner' AND status = 'active';
CREATE INDEX IF NOT EXISTS dinkuskit_membership_user_idx
  ON dinkuskit_membership (user_id, status);

CREATE TABLE IF NOT EXISTS dinkuskit_signup_attempt (
  attempt_id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_channel TEXT NOT NULL CHECK (service_channel IN ('email', 'phone')),
  promotional_email INTEGER NOT NULL CHECK (promotional_email IN (0, 1)),
  promotional_sms INTEGER NOT NULL CHECK (promotional_sms IN (0, 1)),
  agreement_accepted INTEGER NOT NULL CHECK (agreement_accepted = 1),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consumption_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dinkuskit_signup_attempt_expiry_idx ON dinkuskit_signup_attempt (expires_at);
CREATE TABLE IF NOT EXISTS dinkuskit_signup_profile (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" (id),
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  phone_verified INTEGER NOT NULL DEFAULT 0 CHECK (phone_verified IN (0, 1)),
  service_channel TEXT NOT NULL CHECK (service_channel IN ('email', 'phone')),
  promotional_email INTEGER NOT NULL CHECK (promotional_email IN (0, 1)),
  promotional_sms INTEGER NOT NULL CHECK (promotional_sms IN (0, 1)),
  agreement_accepted INTEGER NOT NULL CHECK (agreement_accepted = 1),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dinkuskit_admission (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" (id),
  first_organization_id TEXT NOT NULL REFERENCES dinkuskit_organization (organization_id),
  slot_number INTEGER CHECK (slot_number IS NULL OR (slot_number >= 1 AND slot_number <= 50)),
  created_at INTEGER NOT NULL,
  UNIQUE (first_organization_id),
  UNIQUE (slot_number)
);

CREATE INDEX IF NOT EXISTS dinkuskit_org_owner_idx
  ON dinkuskit_organization (owner_user_id, status);

CREATE TABLE IF NOT EXISTS dinkuskit_user_selection (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" (id),
  organization_id TEXT NOT NULL REFERENCES dinkuskit_organization (organization_id),
  updated_at INTEGER NOT NULL
);

-- One-time pre-foundation snapshot only. New users never receive legacy authority.
INSERT OR IGNORE INTO dinkuskit_organization
  (organization_id, name, status, owner_user_id, authority_subject, admission_status, created_by_user_id, created_at, updated_at)
SELECT 'legacy_' || a.user_id, 'My organization',
       CASE WHEN a.disabled = 1 THEN 'suspended' ELSE 'active' END,
       a.user_id, a.subject, 'legacy', a.user_id, a.created_at, a.updated_at
FROM dinkuskit_account a;
INSERT OR IGNORE INTO dinkuskit_membership
  (organization_id, user_id, role, status, permissions, created_at, updated_at)
SELECT 'legacy_' || a.user_id, a.user_id, 'owner', 'active',
       '["membership:manage","inventory:admin"]', a.created_at, a.updated_at
FROM dinkuskit_account a;
INSERT OR IGNORE INTO dinkuskit_admission
  (user_id, first_organization_id, slot_number, created_at)
SELECT a.user_id, 'legacy_' || a.user_id, NULL, a.created_at FROM dinkuskit_account a;
INSERT OR IGNORE INTO dinkuskit_user_selection (user_id, organization_id, updated_at)
SELECT a.user_id, 'legacy_' || a.user_id, a.updated_at FROM dinkuskit_account a;

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (4, '0004_account_foundation.sql', unixepoch());
