-- Append-only history of operator actions taken from the EmDash admin.
-- Actors are dinkuskit.com EmDash Admins, recorded by CMS user id and email.
CREATE TABLE IF NOT EXISTS dinkuskit_operator_action (
  action_id TEXT NOT NULL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN (
    'organization_approved', 'organization_declined',
    'person_suspended', 'person_restored',
    'service_cut_off'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN ('organization', 'person', 'store')),
  target_id TEXT NOT NULL,
  service TEXT,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS dinkuskit_operator_action_target_idx
  ON dinkuskit_operator_action (target_type, target_id, created_at);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (8, '0008_operator_actions.sql', unixepoch());
