-- Who revoked a store's service grant. 'owner': disconnected on the sites page;
-- Connect may grant it again. 'operator': cut off in the EmDash admin; Connect
-- refuses until an operator restores it. 'operator_restored': the cut-off was
-- lifted; the owner presses Connect again. NULL on active grants.
ALTER TABLE dinkuskit_service_grant ADD COLUMN revoked_by TEXT
  CHECK (revoked_by IS NULL OR revoked_by IN ('owner', 'operator', 'operator_restored'));

-- Grants revoked before this column existed: an operator cut-off is in the action
-- history; every other revoke was the owner's.
UPDATE dinkuskit_service_grant SET revoked_by = 'operator'
  WHERE revoked = 1 AND EXISTS (
    SELECT 1 FROM dinkuskit_operator_action a
    WHERE a.action = 'service_cut_off' AND a.target_type = 'store'
      AND a.target_id = dinkuskit_service_grant.site_id
      AND a.service = dinkuskit_service_grant.service
  );
UPDATE dinkuskit_service_grant SET revoked_by = 'owner'
  WHERE revoked = 1 AND revoked_by IS NULL;

-- Allow 'service_restored' in the operator action history. Nothing references
-- this table, so it is copied and replaced.
CREATE TABLE dinkuskit_operator_action_new (
  action_id TEXT NOT NULL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN (
    'organization_approved', 'organization_declined',
    'person_suspended', 'person_restored',
    'service_cut_off', 'service_restored'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN ('organization', 'person', 'store')),
  target_id TEXT NOT NULL,
  service TEXT,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO dinkuskit_operator_action_new SELECT action_id, action, target_type,
  target_id, service, actor_user_id, actor_email, created_at FROM dinkuskit_operator_action;
DROP TABLE dinkuskit_operator_action;
ALTER TABLE dinkuskit_operator_action_new RENAME TO dinkuskit_operator_action;
CREATE INDEX IF NOT EXISTS dinkuskit_operator_action_target_idx
  ON dinkuskit_operator_action (target_type, target_id, created_at);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (9, '0009_service_grant_revoked_by.sql', unixepoch());
