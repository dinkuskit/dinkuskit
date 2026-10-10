import { decideOrganization, type ApprovalDecision } from './organization-approvals.ts';

/**
 * Operator actions behind the EmDash admin operator pages. Every caller is a
 * dinkuskit.com EmDash Admin; the plugin route enforces that before these run.
 * Each change records who did it in dinkuskit_operator_action.
 */
export type OperatorActor = { userId: string; email: string };

export const OPERATOR_SERVICES = [
  { service: 'payments', label: 'Payments', connectable: true },
  { service: 'inventory', label: 'Inventory', connectable: true },
  { service: 'coupons', label: 'Coupons', connectable: false },
  { service: 'ship', label: 'Ship', connectable: false },
] as const;
export type OperatorService = (typeof OPERATOR_SERVICES)[number]['service'];
export const PAGE_SIZE = 25;

const now = () => Math.floor(Date.now() / 1000);
const changed = (result: unknown) => Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0;
const like = (term: string) => `%${term.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`;

function logAction(db: D1Database, actor: OperatorActor, action: string, targetType: string, targetId: string, service: string | null = null) {
  return db.prepare(`INSERT INTO dinkuskit_operator_action
    (action_id, action, target_type, target_id, service, actor_user_id, actor_email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`op_${crypto.randomUUID()}`, action, targetType, targetId, service, actor.userId, actor.email, now());
}

export type ReviewState = 'waiting' | 'approved' | 'declined' | 'suspended';
export type ReviewOrganization = {
  organizationId: string; name: string; ownerEmail: string; createdAt: number;
  state: ReviewState; automatic: boolean;
  decidedBy: string | null; decidedAt: number | null;
  /** The owner's email notice for the first answer on a waiting business, if one was queued. */
  notice: { notificationId: string; status: 'pending' | 'processing' | 'delivered' | 'unavailable'; channel: string } | null;
};

function reviewState(status: string): ReviewState {
  if (status === 'pending_operator') return 'waiting';
  if (status === 'denied') return 'declined';
  if (status === 'suspended') return 'suspended';
  return 'approved';
}

/** Waiting organizations first, then every other one newest first. Closed ones are left out. */
export async function listReviewOrganizations(db: D1Database, page = 1): Promise<{ rows: ReviewOrganization[]; hasNext: boolean }> {
  const result = await db.prepare(`SELECT o.organization_id, o.name, u.email AS owner_email, o.created_at, o.status,
      d.slot_number, a.actor_email, a.decided_at, n.notification_id, n.status AS notice_status, n.channel AS notice_channel
    FROM dinkuskit_organization o
    JOIN "user" u ON u.id = o.owner_user_id
    LEFT JOIN dinkuskit_admission d ON d.first_organization_id = o.organization_id
    LEFT JOIN dinkuskit_organization_approval_audit a ON a.organization_id = o.organization_id
    LEFT JOIN dinkuskit_organization_notification n ON n.organization_id = o.organization_id
    WHERE o.status <> 'closed'
    ORDER BY CASE WHEN o.status = 'pending_operator' THEN 0 ELSE 1 END,
      CASE WHEN o.status = 'pending_operator' THEN o.created_at ELSE -o.created_at END, o.organization_id
    LIMIT ? OFFSET ?`).bind(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE).all<Record<string, unknown>>();
  const rows = (result.results ?? []).map(r => ({
    organizationId: String(r.organization_id), name: String(r.name), ownerEmail: String(r.owner_email),
    createdAt: Number(r.created_at), state: reviewState(String(r.status)),
    automatic: r.slot_number != null && r.actor_email == null && String(r.status) === 'active',
    decidedBy: r.actor_email == null ? null : String(r.actor_email),
    decidedAt: r.decided_at == null ? null : Number(r.decided_at),
    notice: r.notification_id == null ? null : {
      notificationId: String(r.notification_id), status: String(r.notice_status) as NonNullable<ReviewOrganization['notice']>['status'],
      channel: String(r.notice_channel),
    },
  }));
  return { rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}

export type DecisionResult = 'decided' | 'changed' | 'unchanged' | 'not_found' | 'conflict';

/**
 * A waiting organization takes the original decision path, which also queues
 * the owner's email notice. An organization that already has an answer
 * (including the first 50 approved automatically) can be changed; the latest
 * decision applies and no second notice is sent.
 */
export async function decideAsOperator(db: D1Database, organizationId: string, decision: ApprovalDecision, actor: OperatorActor): Promise<DecisionResult> {
  const org = await db.prepare('SELECT status FROM dinkuskit_organization WHERE organization_id = ?')
    .bind(organizationId).first<{ status: string }>();
  if (!org) return 'not_found';
  const action = decision === 'approved' ? 'organization_approved' : 'organization_declined';
  if (org.status === 'pending_operator') {
    const result = await decideOrganization({ db, organizationId, decision, actorUserId: actor.userId, actorEmail: actor.email });
    if (result === 'decided') await logAction(db, actor, action, 'organization', organizationId).run();
    return result === 'decided' ? 'decided' : result === 'already_decided' ? 'unchanged' : result;
  }
  if (org.status !== 'active' && org.status !== 'denied') return 'conflict';
  const target = decision === 'approved' ? 'active' : 'denied';
  const decisionId = crypto.randomUUID();
  const t = now();
  const results = await db.batch([
    db.prepare(`UPDATE dinkuskit_organization SET status = ?, admission_status = ?, updated_at = ?
      WHERE organization_id = ? AND status IN ('active', 'denied') AND status <> ?`)
      .bind(target, decision === 'approved' ? 'admitted' : 'denied', t, organizationId, target),
    // Record the operator's answer even when it confirms the automatic approval.
    db.prepare(`INSERT INTO dinkuskit_organization_approval_audit
      (decision_id, organization_id, decision, actor_user_id, actor_email, decided_at)
      SELECT ?, o.organization_id, ?, ?, ?, ? FROM dinkuskit_organization o
      WHERE o.organization_id = ? AND o.status = ? AND NOT EXISTS (
        SELECT 1 FROM dinkuskit_organization_approval_audit a WHERE a.organization_id = o.organization_id AND a.decision = ?)
      ON CONFLICT (organization_id) DO UPDATE SET decision_id = excluded.decision_id, decision = excluded.decision,
        actor_user_id = excluded.actor_user_id, actor_email = excluded.actor_email, decided_at = excluded.decided_at`)
      .bind(decisionId, decision, actor.userId, actor.email, t, organizationId, target, decision),
    db.prepare(`INSERT INTO dinkuskit_operator_action
      (action_id, action, target_type, target_id, service, actor_user_id, actor_email, created_at)
      SELECT ?, ?, 'organization', ?, NULL, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM dinkuskit_organization_approval_audit WHERE organization_id = ? AND decision_id = ?)`)
      .bind(`op_${decisionId}`, action, organizationId, actor.userId, actor.email, t, organizationId, decisionId),
    // An unsent notice for the earlier answer must never go out after the answer changed.
    db.prepare(`UPDATE dinkuskit_organization_notification SET status = 'unavailable', unavailable_reason = 'decision_changed',
        claim_token = NULL, claimed_at = NULL
      WHERE organization_id = ? AND status IN ('pending', 'processing') AND decision <> ? AND EXISTS (
        SELECT 1 FROM dinkuskit_organization_approval_audit WHERE organization_id = ? AND decision_id = ?)`)
      .bind(organizationId, decision, organizationId, decisionId),
  ]) as unknown[];
  if (changed(results[0])) return 'changed';
  return changed(results[1]) ? 'changed' : 'unchanged';
}

export type OperatorPerson = {
  userId: string; name: string; email: string; phone: string; suspended: boolean;
  createdAt: number; organizations: number;
};

export async function listPeople(db: D1Database, search = '', page = 1): Promise<{ rows: OperatorPerson[]; hasNext: boolean }> {
  const term = like(search.trim());
  const where = search.trim() ? `WHERE lower(u.email) LIKE ? ESCAPE '\\' OR lower(u.name) LIKE ? ESCAPE '\\'` : '';
  const result = await db.prepare(`SELECT u.id, u.name, u.email, COALESCE(p.phone, '') AS phone, a.disabled, a.created_at,
      (SELECT COUNT(*) FROM dinkuskit_membership m WHERE m.user_id = u.id AND m.status = 'active') AS organizations
    FROM "user" u JOIN dinkuskit_account a ON a.user_id = u.id
    LEFT JOIN dinkuskit_signup_profile p ON p.user_id = u.id
    ${where} ORDER BY a.created_at DESC, u.id LIMIT ? OFFSET ?`)
    .bind(...(where ? [term, term] : []), PAGE_SIZE + 1, (page - 1) * PAGE_SIZE).all<Record<string, unknown>>();
  const rows = (result.results ?? []).map(r => ({
    userId: String(r.id), name: String(r.name ?? ''), email: String(r.email), phone: String(r.phone ?? ''),
    suspended: Number(r.disabled) === 1, createdAt: Number(r.created_at), organizations: Number(r.organizations),
  }));
  return { rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}

/** Suspend blocks sign-in at once and stops new passes for every store the person owns. */
export async function setPersonSuspended(db: D1Database, userId: string, suspended: boolean, actor: OperatorActor): Promise<'changed' | 'unchanged' | 'not_found'> {
  const exists = await db.prepare('SELECT disabled FROM dinkuskit_account WHERE user_id = ?').bind(userId).first<{ disabled: number }>();
  if (!exists) return 'not_found';
  const t = now();
  const marker = `op_${crypto.randomUUID()}`;
  const statements = [
    db.prepare('UPDATE dinkuskit_account SET disabled = ?, updated_at = ? WHERE user_id = ? AND disabled = ?')
      .bind(suspended ? 1 : 0, t, userId, suspended ? 0 : 1),
    db.prepare(`INSERT INTO dinkuskit_operator_action
      (action_id, action, target_type, target_id, service, actor_user_id, actor_email, created_at)
      SELECT ?, ?, 'person', ?, NULL, ?, ?, ? WHERE changes() > 0`)
      .bind(marker, suspended ? 'person_suspended' : 'person_restored', userId, actor.userId, actor.email, t),
  ];
  if (suspended) statements.push(db.prepare('DELETE FROM session WHERE userId = ?').bind(userId));
  const results = await db.batch(statements) as unknown[];
  return changed(results[0]) ? 'changed' : 'unchanged';
}

export type OperatorStore = {
  siteId: string; siteOrigin: string; organizationName: string | null; ownerEmail: string | null;
  createdAt: number; services: Record<OperatorService, 'connected' | 'cut_off' | 'none'>;
};

export async function listStores(db: D1Database, search = '', page = 1): Promise<{ rows: OperatorStore[]; hasNext: boolean }> {
  const term = like(search.trim());
  const where = search.trim() ? `WHERE lower(i.site_origin) LIKE ? ESCAPE '\\' OR lower(o.name) LIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\'` : '';
  const result = await db.prepare(`SELECT i.site_id, i.site_origin, i.created_at, o.name AS organization_name, u.email AS owner_email
    FROM dinkuskit_store_identity i
    LEFT JOIN dinkuskit_organization o ON o.authority_subject = i.account_subject
    LEFT JOIN "user" u ON u.id = o.owner_user_id
    ${where} ORDER BY i.created_at DESC, i.site_id LIMIT ? OFFSET ?`)
    .bind(...(where ? [term, term, term] : []), PAGE_SIZE + 1, (page - 1) * PAGE_SIZE).all<Record<string, unknown>>();
  const stores = (result.results ?? []).slice(0, PAGE_SIZE + 1);
  const rows: OperatorStore[] = [];
  for (const r of stores.slice(0, PAGE_SIZE)) {
    const grants = await db.prepare('SELECT service, revoked FROM dinkuskit_service_grant WHERE site_id = ?')
      .bind(String(r.site_id)).all<{ service: string; revoked: number }>();
    const services = Object.fromEntries(OPERATOR_SERVICES.map(s => [s.service, 'none'])) as OperatorStore['services'];
    for (const g of grants.results ?? []) {
      if (g.service in services) services[g.service as OperatorService] = g.revoked === 1 ? 'cut_off' : 'connected';
    }
    rows.push({
      siteId: String(r.site_id), siteOrigin: String(r.site_origin), createdAt: Number(r.created_at),
      organizationName: r.organization_name == null ? null : String(r.organization_name),
      ownerEmail: r.owner_email == null ? null : String(r.owner_email), services,
    });
  }
  return { rows, hasNext: stores.length > PAGE_SIZE };
}

/** Cut off one service, or every service when service is null. Like an owner's revoke, Connect then refuses that store and service (grant_revoked). */
export async function cutOffStore(db: D1Database, siteId: string, service: OperatorService | null, actor: OperatorActor): Promise<number> {
  const grants = await db.prepare(`SELECT service FROM dinkuskit_service_grant WHERE site_id = ? AND revoked = 0${service ? ' AND service = ?' : ''}`)
    .bind(...(service ? [siteId, service] : [siteId])).all<{ service: string }>();
  const t = now();
  let count = 0;
  for (const g of grants.results ?? []) {
    const results = await db.batch([
      db.prepare('UPDATE dinkuskit_service_grant SET revoked = 1, revoked_at = ? WHERE site_id = ? AND service = ? AND revoked = 0')
        .bind(t, siteId, g.service),
      db.prepare(`INSERT INTO dinkuskit_operator_action
        (action_id, action, target_type, target_id, service, actor_user_id, actor_email, created_at)
        SELECT ?, 'service_cut_off', 'store', ?, ?, ?, ?, ? WHERE changes() > 0`)
        .bind(`op_${crypto.randomUUID()}`, siteId, g.service, actor.userId, actor.email, t),
    ]) as unknown[];
    if (changed(results[0])) count++;
  }
  return count;
}

export type OperatorActionRow = { action: string; targetType: string; targetId: string; service: string | null; actorEmail: string; createdAt: number };

export async function recentActions(db: D1Database, limit = 20): Promise<OperatorActionRow[]> {
  const result = await db.prepare(`SELECT action, target_type, target_id, service, actor_email, created_at
    FROM dinkuskit_operator_action ORDER BY created_at DESC, action_id LIMIT ?`).bind(limit).all<Record<string, unknown>>();
  return (result.results ?? []).map(r => ({
    action: String(r.action), targetType: String(r.target_type), targetId: String(r.target_id),
    service: r.service == null ? null : String(r.service), actorEmail: String(r.actor_email), createdAt: Number(r.created_at),
  }));
}
