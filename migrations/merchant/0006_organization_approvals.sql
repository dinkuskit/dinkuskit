-- Organization approval decisions, actor audit, and notification dispatch intents.
-- D1 supports deferred checks, but does not make foreign_keys=OFF safe. Copy every
-- table that points at the parent before replacing the parent.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE dinkuskit_organization_new (
  organization_id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_operator', 'suspended', 'closed', 'denied')),
  owner_user_id TEXT NOT NULL,
  authority_subject TEXT NOT NULL UNIQUE,
  admission_status TEXT NOT NULL DEFAULT 'pending_operator' CHECK (admission_status IN ('legacy', 'admitted', 'pending_operator', 'denied')),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);
INSERT INTO dinkuskit_organization_new SELECT organization_id, name,
  status, owner_user_id, authority_subject, admission_status, created_by_user_id,
  created_at, updated_at, closed_at FROM dinkuskit_organization;

CREATE TABLE dinkuskit_membership_new (
  organization_id TEXT NOT NULL REFERENCES dinkuskit_organization_new (organization_id),
  user_id TEXT NOT NULL REFERENCES "user" (id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'administrator', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
INSERT INTO dinkuskit_membership_new SELECT * FROM dinkuskit_membership;

CREATE TABLE dinkuskit_admission_new (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" (id),
  first_organization_id TEXT NOT NULL REFERENCES dinkuskit_organization_new (organization_id),
  slot_number INTEGER CHECK (slot_number IS NULL OR (slot_number >= 1 AND slot_number <= 50)),
  created_at INTEGER NOT NULL,
  UNIQUE (first_organization_id),
  UNIQUE (slot_number)
);
INSERT INTO dinkuskit_admission_new SELECT * FROM dinkuskit_admission;

CREATE TABLE dinkuskit_user_selection_new (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" (id),
  organization_id TEXT NOT NULL REFERENCES dinkuskit_organization_new (organization_id),
  updated_at INTEGER NOT NULL
);
INSERT INTO dinkuskit_user_selection_new SELECT * FROM dinkuskit_user_selection;

DROP TABLE dinkuskit_membership;
DROP TABLE dinkuskit_admission;
DROP TABLE dinkuskit_user_selection;
DROP TABLE dinkuskit_organization;
ALTER TABLE dinkuskit_organization_new RENAME TO dinkuskit_organization;
ALTER TABLE dinkuskit_membership_new RENAME TO dinkuskit_membership;
ALTER TABLE dinkuskit_admission_new RENAME TO dinkuskit_admission;
ALTER TABLE dinkuskit_user_selection_new RENAME TO dinkuskit_user_selection;
CREATE INDEX IF NOT EXISTS dinkuskit_org_owner_idx
  ON dinkuskit_organization (owner_user_id, status);
CREATE UNIQUE INDEX dinkuskit_one_owner_per_org
  ON dinkuskit_membership (organization_id) WHERE role = 'owner' AND status = 'active';
CREATE INDEX dinkuskit_membership_user_idx
  ON dinkuskit_membership (user_id, status);

CREATE TABLE IF NOT EXISTS dinkuskit_organization_approval_audit (
  decision_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL PRIMARY KEY REFERENCES dinkuskit_organization (organization_id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied')),
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  decided_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dinkuskit_organization_notification (
  notification_id TEXT NOT NULL PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES dinkuskit_organization (organization_id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'none')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'delivered', 'unavailable')),
  unavailable_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT,
  claimed_at INTEGER,
  last_error TEXT,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (organization_id)
);
CREATE INDEX IF NOT EXISTS dinkuskit_organization_notification_ready_idx
  ON dinkuskit_organization_notification (status, claimed_at);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (6, '0006_organization_approvals.sql', unixepoch());
