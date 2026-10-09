export type OrganizationRole = 'owner' | 'administrator' | 'member';
export type Organization = {
  organizationId: string;
  name: string;
  status: 'active' | 'pending_operator' | 'suspended' | 'closed' | 'denied';
  admissionStatus: 'legacy' | 'admitted' | 'pending_operator' | 'denied';
  ownerUserId: string;
  authoritySubject: string;
};
export type Membership = Organization & {
  role: OrganizationRole;
  membershipStatus: 'active' | 'suspended' | 'removed';
  permissions: string[];
};

const now = () => Math.floor(Date.now() / 1000);
const id = () => `org_${crypto.randomUUID()}`;

function map(row: Record<string, unknown>): Organization {
  return {
    organizationId: String(row.organization_id),
    name: String(row.name),
    status: String(row.status) as Organization['status'],
    admissionStatus: String(row.admission_status) as Organization['admissionStatus'],
    ownerUserId: String(row.owner_user_id),
    authoritySubject: String(row.authority_subject),
  };
}

export async function loadOrganization(db: D1Database, organizationId: string): Promise<Organization | null> {
  const row = await db.prepare('SELECT * FROM dinkuskit_organization WHERE organization_id = ?')
    .bind(organizationId).first<Record<string, unknown>>();
  return row ? map(row) : null;
}

export async function listMemberships(db: D1Database, userId: string): Promise<Membership[]> {
  const result = await db.prepare(
    `SELECT o.*, m.role, m.status AS membership_status, m.permissions
     FROM dinkuskit_organization o JOIN dinkuskit_membership m
     ON m.organization_id = o.organization_id
     WHERE m.user_id = ? AND m.status = 'active' AND o.status IN ('active', 'pending_operator', 'denied')
     ORDER BY o.created_at`,
  ).bind(userId).all<Record<string, unknown>>();
  return (result.results ?? []).map(row => ({
    ...map(row),
    role: String(row.role) as OrganizationRole,
    membershipStatus: String(row.membership_status) as Membership['membershipStatus'],
    permissions: JSON.parse(String(row.permissions || '[]')) as string[],
  }));
}

export async function authorizeOrganization(
  db: D1Database, userId: string, organizationId: string,
): Promise<Membership | null> {
  const row = await db.prepare(
    `SELECT o.*, m.role, m.status AS membership_status, m.permissions
     FROM dinkuskit_organization o JOIN dinkuskit_membership m
     ON m.organization_id = o.organization_id
     WHERE m.organization_id = ? AND m.user_id = ? AND m.status = 'active'
       AND EXISTS (SELECT 1 FROM dinkuskit_account a WHERE a.user_id = m.user_id AND a.disabled = 0)`,
  ).bind(organizationId, userId).first<Record<string, unknown>>();
  if (!row || row.status === 'closed' || row.status === 'suspended' || row.status === 'denied') return null;
  return {
    ...map(row),
    role: String(row.role) as OrganizationRole,
    membershipStatus: String(row.membership_status) as Membership['membershipStatus'],
    permissions: JSON.parse(String(row.permissions || '[]')) as string[],
  };
}

export async function selectedOrganizationId(db: D1Database, userId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT s.organization_id
     FROM dinkuskit_user_selection s
     JOIN dinkuskit_membership m ON m.organization_id = s.organization_id AND m.user_id = s.user_id
     JOIN dinkuskit_organization o ON o.organization_id = s.organization_id
     WHERE s.user_id = ? AND m.status = 'active' AND o.status IN ('active', 'pending_operator')`,
  ).bind(userId).first<{ organization_id: string }>();
  return row?.organization_id ?? null;
}

export async function selectOrganization(db: D1Database, userId: string, organizationId: string): Promise<boolean> {
  const result = await db.prepare(`INSERT INTO dinkuskit_user_selection (user_id, organization_id, updated_at)
    SELECT ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM dinkuskit_membership m JOIN dinkuskit_organization o USING (organization_id)
      JOIN dinkuskit_account a ON a.user_id = m.user_id
      WHERE m.user_id = ? AND m.organization_id = ? AND m.status = 'active'
        AND o.status IN ('active', 'pending_operator') AND a.disabled = 0
    ) ON CONFLICT(user_id) DO UPDATE SET organization_id = excluded.organization_id, updated_at = excluded.updated_at`)
    .bind(userId, organizationId, now(), userId, organizationId).run();
  return changed(result);
}

export async function authoritySubjectForOrganization(db: D1Database, organizationId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT authority_subject FROM dinkuskit_organization
     WHERE organization_id = ? AND status = 'active' AND admission_status <> 'pending_operator'`,
  ).bind(organizationId).first<{ authority_subject: string }>();
  return row?.authority_subject ?? null;
}

const ELIGIBLE_USER = `SELECT u.id FROM "user" u
  JOIN dinkuskit_account a ON a.user_id = u.id AND a.disabled = 0
  JOIN dinkuskit_signup_profile p ON p.user_id = u.id AND p.email = u.email
  WHERE u.id = ? AND p.phone <> '' AND p.agreement_accepted = 1
    AND ((p.email_verified = 1 AND u.emailVerified = 1) OR p.phone_verified = 1)`;

function changed(result: unknown): boolean {
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0;
}

/** The pending insert, lifetime allocation and activation share one D1 transaction. */
export async function createOrganization(db: D1Database, userId: string, name: string, initial = true): Promise<Organization> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 120) throw new Error('invalid_organization_name');
  const t = now();
  const organizationId = initial ? `initial_${userId}` : id();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO dinkuskit_organization
      (organization_id, name, status, owner_user_id, authority_subject, admission_status, created_by_user_id, created_at, updated_at)
      SELECT ?, ?, 'pending_operator', ?, ?, 'pending_operator', ?, ?, ?
      WHERE EXISTS (${ELIGIBLE_USER})
        AND (? = 0 OR NOT EXISTS (SELECT 1 FROM dinkuskit_admission WHERE user_id = ? AND first_organization_id <> ?))`)
      .bind(organizationId, clean, userId, crypto.randomUUID(), userId, t, t, userId, initial ? 1 : 0, userId, organizationId),
    db.prepare(`INSERT OR IGNORE INTO dinkuskit_membership
      (organization_id, user_id, role, status, permissions, created_at, updated_at)
      SELECT ?, ?, 'owner', 'active', '["membership:manage","membership:view","site:view"]', ?, ?
      WHERE EXISTS (SELECT 1 FROM dinkuskit_organization WHERE organization_id = ? AND owner_user_id = ? AND status IN ('active', 'pending_operator'))`)
      .bind(organizationId, userId, t, t, organizationId, userId),
    db.prepare(`INSERT OR IGNORE INTO dinkuskit_admission (user_id, first_organization_id, slot_number, created_at)
      SELECT ?, ?, NULL, ? WHERE EXISTS (SELECT 1 FROM dinkuskit_organization WHERE organization_id = ? AND owner_user_id = ?)`)
      .bind(userId, organizationId, t, organizationId, userId),
    db.prepare(`UPDATE dinkuskit_admission
      SET slot_number = (SELECT COALESCE(MAX(slot_number), 0) + 1 FROM dinkuskit_admission)
      WHERE user_id = ? AND first_organization_id = ? AND slot_number IS NULL
        AND (SELECT COALESCE(MAX(slot_number), 0) FROM dinkuskit_admission) < 50
        AND EXISTS (${ELIGIBLE_USER})`)
      .bind(userId, organizationId, userId),
    db.prepare(`UPDATE dinkuskit_organization SET status = 'active', admission_status = 'admitted', updated_at = ?
      WHERE organization_id = ? AND status = 'pending_operator' AND EXISTS (
        SELECT 1 FROM dinkuskit_admission WHERE user_id = ? AND first_organization_id = ? AND slot_number IS NOT NULL
      )`).bind(t, organizationId, userId, organizationId),
    db.prepare(`INSERT INTO dinkuskit_user_selection (user_id, organization_id, updated_at)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM dinkuskit_membership WHERE organization_id = ? AND user_id = ? AND status = 'active')
      ON CONFLICT(user_id) DO NOTHING`).bind(userId, organizationId, t, organizationId, userId),
  ]);
  const org = await loadOrganization(db, organizationId);
  if (!org) throw new Error('signup_incomplete');
  return org;
}

export async function createAdditionalOrganization(db: D1Database, userId: string, name: string): Promise<Organization> {
  const org = await createOrganization(db, userId, name, false);
  await selectOrganization(db, userId, org.organizationId);
  return org;
}

/** Consume only the current browser snapshot for an independently verified email. */
export async function consumeSignupAttempt(db: D1Database, userId: string, email: string, attemptId: string): Promise<boolean> {
  const t = now();
  const consumptionId = crypto.randomUUID();
  await db.batch([
    db.prepare(`UPDATE dinkuskit_signup_attempt SET consumed_at = ?, consumption_id = ?
      WHERE attempt_id = ? AND email = ? AND consumed_at IS NULL AND expires_at > ?
        AND EXISTS (SELECT 1 FROM "user" u JOIN dinkuskit_account a ON a.user_id = u.id
          WHERE u.id = ? AND u.email = ? AND u.emailVerified = 1 AND a.disabled = 0)`)
      .bind(t, consumptionId, attemptId, email, t, userId, email),
    db.prepare(`INSERT OR IGNORE INTO dinkuskit_signup_profile
      (user_id, email, phone, service_channel, promotional_email, promotional_sms, agreement_accepted, email_verified, created_at)
      SELECT ?, email, phone, service_channel, promotional_email, promotional_sms, agreement_accepted, 1, ?
      FROM dinkuskit_signup_attempt WHERE attempt_id = ? AND consumption_id = ?`)
      .bind(userId, t, attemptId, consumptionId),
  ]);
  const eligible = await db.prepare(ELIGIBLE_USER).bind(userId).first();
  if (!eligible) return false;
  // A legacy account keeps its existing organization and lifetime record.
  const first = await db.prepare('SELECT first_organization_id FROM dinkuskit_admission WHERE user_id = ?').bind(userId).first();
  if (!first) await createOrganization(db, userId, 'My organization');
  return true;
}

export async function canManageMembership(db: D1Database, userId: string, organizationId: string): Promise<boolean> {
  const membership = await authorizeOrganization(db, userId, organizationId);
  return Boolean(membership && (membership.role === 'owner' || (membership.role === 'administrator' && membership.permissions.includes('membership:manage'))));
}

export const EMPLOYEE_PERMISSIONS = ['membership:view', 'site:view'] as const;
export const ADMIN_PERMISSIONS = ['membership:manage', ...EMPLOYEE_PERMISSIONS] as const;
type ManagementResult = 'ok' | 'forbidden' | 'not_found';

// Used inside each write, so revoked actors and changed ceilings cannot win a race.
const MANAGER = `SELECT 1 FROM dinkuskit_membership actor
  JOIN dinkuskit_organization o ON o.organization_id = actor.organization_id
  JOIN dinkuskit_account a ON a.user_id = actor.user_id
  WHERE actor.organization_id = ? AND actor.user_id = ? AND actor.status = 'active'
    AND o.status IN ('active', 'pending_operator') AND a.disabled = 0
    AND (actor.role = 'owner' OR (actor.role = 'administrator'
      AND EXISTS (SELECT 1 FROM json_each(actor.permissions) WHERE value = 'membership:manage')))
    AND (actor.role = 'owner' OR NOT EXISTS (
      SELECT 1 FROM json_each(?) requested WHERE NOT EXISTS (
        SELECT 1 FROM json_each(actor.permissions) ceiling WHERE ceiling.value = requested.value
      )
    ))`;

export async function memberUserIdByEmail(db: D1Database, email: string): Promise<string | null> {
  const row = await db.prepare(`SELECT u.id FROM "user" u JOIN dinkuskit_account a ON a.user_id = u.id
    WHERE lower(u.email) = ? AND a.disabled = 0 AND u.emailVerified = 1 AND (
      EXISTS (SELECT 1 FROM dinkuskit_signup_profile p WHERE p.user_id = u.id AND p.agreement_accepted = 1)
      OR EXISTS (SELECT 1 FROM dinkuskit_admission d JOIN dinkuskit_organization o ON o.organization_id = d.first_organization_id
        WHERE d.user_id = u.id AND o.admission_status = 'legacy')
    )`).bind(email.trim().toLowerCase()).first<{ id: string }>();
  return row?.id ?? null;
}

export async function grantAdministrator(db: D1Database, actorId: string, organizationId: string, targetUserId: string, permissions: string[]): Promise<ManagementResult> {
  const clean = [...new Set(permissions)];
  if (!clean.includes('membership:manage') || clean.some(p => !(ADMIN_PERMISSIONS as readonly string[]).includes(p))) return 'forbidden';
  const result = await db.prepare(`UPDATE dinkuskit_membership SET role = 'administrator', permissions = ?, updated_at = ?
    WHERE organization_id = ? AND user_id = ? AND role IN ('member', 'administrator') AND status = 'active'
      AND EXISTS (SELECT 1 FROM dinkuskit_membership actor JOIN dinkuskit_account a ON a.user_id = actor.user_id
        JOIN dinkuskit_organization o ON o.organization_id = actor.organization_id
        WHERE actor.organization_id = ? AND actor.user_id = ? AND actor.role = 'owner'
          AND actor.status = 'active' AND a.disabled = 0 AND o.status IN ('active', 'pending_operator'))`)
    .bind(JSON.stringify(clean), now(), organizationId, targetUserId, organizationId, actorId).run();
  return changed(result) ? 'ok' : 'forbidden';
}

export async function addMemberByEmail(db: D1Database, actorId: string, organizationId: string, email: string): Promise<ManagementResult> {
  if (!await canManageMembership(db, actorId, organizationId)) return 'forbidden';
  const target = await memberUserIdByEmail(db, email);
  if (!target) return 'not_found';
  const t = now();
  const result = await db.prepare(`INSERT INTO dinkuskit_membership
    (organization_id, user_id, role, status, permissions, created_at, updated_at)
    SELECT ?, ?, 'member', 'active', '[]', ?, ? WHERE EXISTS (${MANAGER})
    ON CONFLICT(organization_id, user_id) DO UPDATE SET status = 'active', permissions = '[]', updated_at = excluded.updated_at
    WHERE dinkuskit_membership.role = 'member' AND dinkuskit_membership.status <> 'active'`)
    .bind(organizationId, target, t, t, organizationId, actorId, '[]').run();
  return changed(result) ? 'ok' : 'forbidden';
}

export async function setEmployeePermissions(db: D1Database, actorId: string, organizationId: string, targetUserId: string, permissions: string[]): Promise<ManagementResult> {
  const clean = [...new Set(permissions)];
  if (clean.some(p => !(EMPLOYEE_PERMISSIONS as readonly string[]).includes(p))) return 'forbidden';
  const result = await db.prepare(`UPDATE dinkuskit_membership SET permissions = ?, updated_at = ?
    WHERE organization_id = ? AND user_id = ? AND role = 'member' AND status = 'active'
      AND EXISTS (${MANAGER})`)
    .bind(JSON.stringify(clean), now(), organizationId, targetUserId, organizationId, actorId, JSON.stringify(clean)).run();
  return changed(result) ? 'ok' : 'forbidden';
}

export async function deletionGuard(db: D1Database, userId: string): Promise<{ allowed: false; reason: 'owned_organizations' } | { allowed: true }> {
  const row = await db.prepare(
    `SELECT 1 FROM dinkuskit_organization WHERE owner_user_id = ? AND status <> 'closed' LIMIT 1`,
  ).bind(userId).first();
  return row ? { allowed: false, reason: 'owned_organizations' } : { allowed: true };
}
