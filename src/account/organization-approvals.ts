import type { MerchantEmailBinding } from './config.ts';
import { getInjectedTransports } from './transports.ts';

export type ApprovalDecision = 'approved' | 'denied';
type Channel = 'email' | 'sms' | 'none';
export type ApprovalRow = {
  organizationId: string; name: string; ownerUserId: string; ownerEmail: string;
  createdAt: number; admissionStatus: string;
};
export type ApprovalAudit = { decision: ApprovalDecision; actorUserId: string; actorEmail: string; decidedAt: number };
export type NotificationRow = {
  notificationId: string; organizationId: string; decision: ApprovalDecision; channel: Channel;
  recipient: string; status: 'pending' | 'processing' | 'delivered' | 'unavailable';
  unavailableReason: string | null; lastError: string | null; attemptCount: number; claimToken: string | null;
};
export type ApprovalDetail = ApprovalRow & {
  status: string; serviceChannel: 'email' | 'phone' | 'none'; email: string; emailVerified: boolean;
  phone: string; phoneVerified: boolean; audit: ApprovalAudit | null; notification: NotificationRow | null;
};

const now = () => Math.floor(Date.now() / 1000);
const changed = (result: unknown) => Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0;
const toRow = (r: Record<string, unknown>): ApprovalRow => ({
  organizationId: String(r.organization_id), name: String(r.name), ownerUserId: String(r.owner_user_id),
  ownerEmail: String(r.owner_email), createdAt: Number(r.created_at), admissionStatus: String(r.admission_status),
});

export async function listPendingApprovals(db: D1Database, limit = 50): Promise<ApprovalRow[]> {
  const result = await db.prepare(`SELECT o.organization_id,o.name,o.owner_user_id,u.email owner_email,o.created_at,o.admission_status
    FROM dinkuskit_organization o JOIN "user" u ON u.id=o.owner_user_id
    WHERE o.status='pending_operator' AND o.admission_status='pending_operator'
    ORDER BY o.created_at,o.organization_id LIMIT ?`).bind(Math.min(Math.max(limit, 1), 50)).all<Record<string, unknown>>();
  if (!Array.isArray(result.results)) throw new Error('approval_read_unavailable');
  return result.results.map(toRow);
}

export async function getApprovalDetail(db: D1Database, organizationId: string): Promise<ApprovalDetail | null> {
  const r = await db.prepare(`SELECT o.organization_id,o.name,o.owner_user_id,u.email owner_email,o.created_at,
    o.admission_status,o.status,p.service_channel,p.email,p.email_verified,p.phone,p.phone_verified
    FROM dinkuskit_organization o JOIN "user" u ON u.id=o.owner_user_id
    LEFT JOIN dinkuskit_signup_profile p ON p.user_id=o.owner_user_id WHERE o.organization_id=? AND ((o.status='pending_operator' AND o.admission_status='pending_operator') OR EXISTS (SELECT 1 FROM dinkuskit_organization_approval_audit a WHERE a.organization_id=o.organization_id))`).bind(organizationId).first<Record<string, unknown>>();
  if (!r) return null;
  const audit = await db.prepare('SELECT decision,actor_user_id,actor_email,decided_at FROM dinkuskit_organization_approval_audit WHERE organization_id=?')
    .bind(organizationId).first<Record<string, unknown>>();
  const notice = await db.prepare('SELECT * FROM dinkuskit_organization_notification WHERE organization_id=? ORDER BY created_at DESC LIMIT 1')
    .bind(organizationId).first<Record<string, unknown>>();
  return {
    ...toRow(r), status: String(r.status), serviceChannel: String(r.service_channel ?? 'none') as ApprovalDetail['serviceChannel'],
    email: String(r.email ?? ''), emailVerified: Number(r.email_verified) === 1,
    phone: String(r.phone ?? ''), phoneVerified: Number(r.phone_verified) === 1,
    audit: audit ? { decision: String(audit.decision) as ApprovalDecision, actorUserId: String(audit.actor_user_id), actorEmail: String(audit.actor_email), decidedAt: Number(audit.decided_at) } : null,
    notification: notice ? notificationRow(notice) : null,
  };
}

function notificationRow(r: Record<string, unknown>): NotificationRow {
  return {
    notificationId: String(r.notification_id), organizationId: String(r.organization_id),
    decision: String(r.decision) as ApprovalDecision, channel: String(r.channel) as Channel,
    recipient: String(r.recipient), status: String(r.status) as NotificationRow['status'],
    unavailableReason: r.unavailable_reason == null ? null : String(r.unavailable_reason),
    lastError: r.last_error == null ? null : String(r.last_error), attemptCount: Number(r.attempt_count),
    claimToken: r.claim_token == null ? null : String(r.claim_token),
  };
}

/** D1 batch serializes the winning pending decision, audit and durable dispatch intent. */
export async function decideOrganization(input: {
  db: D1Database; organizationId: string; decision: ApprovalDecision;
  actorUserId: string; actorEmail: string;
}): Promise<'decided' | 'already_decided' | 'conflict' | 'not_found'> {
  const t = now();
  const decisionId = crypto.randomUUID();
  const approved = input.decision === 'approved';
  const result = await input.db.batch([
    input.db.prepare(`INSERT OR IGNORE INTO dinkuskit_organization_approval_audit
      (decision_id,organization_id,decision,actor_user_id,actor_email,decided_at)
      SELECT ?,organization_id,?,?,?,? FROM dinkuskit_organization
      WHERE organization_id=? AND status='pending_operator' AND admission_status='pending_operator'`)
      .bind(decisionId, input.decision, input.actorUserId, input.actorEmail, t, input.organizationId),
    input.db.prepare(`UPDATE dinkuskit_organization SET status=?,admission_status=?,updated_at=?
      WHERE organization_id=? AND status='pending_operator' AND admission_status='pending_operator'
      AND EXISTS (SELECT 1 FROM dinkuskit_organization_approval_audit WHERE organization_id=? AND decision_id=?)`)
      .bind(approved ? 'active' : 'denied', approved ? 'admitted' : 'denied', t, input.organizationId, input.organizationId, decisionId),
    input.db.prepare(`INSERT INTO dinkuskit_organization_notification
      (notification_id,decision_id,organization_id,decision,channel,recipient,status,unavailable_reason,attempt_count,created_at)
      SELECT ?,a.decision_id,o.organization_id,a.decision,
        CASE WHEN p.service_channel='phone' THEN 'sms' WHEN p.service_channel='email' THEN 'email' ELSE 'none' END,
        CASE WHEN p.service_channel='phone' THEN p.phone WHEN p.service_channel='email' THEN p.email ELSE '' END,
        CASE WHEN p.service_channel='email' AND p.email=u.email AND p.email_verified=1 AND u.emailVerified=1 THEN 'pending' ELSE 'unavailable' END,
        CASE WHEN p.user_id IS NULL THEN 'selected_contact_missing'
          WHEN p.service_channel='phone' AND p.phone_verified<>1 THEN 'selected_phone_unverified_sms_unavailable'
          WHEN p.service_channel='phone' THEN 'sms_unavailable'
          WHEN p.email<>u.email OR u.id IS NULL THEN 'selected_email_changed'
          WHEN p.email_verified<>1 OR u.emailVerified<>1 THEN 'selected_email_unverified'
          ELSE NULL END,0,?
      FROM dinkuskit_organization_approval_audit a
      JOIN dinkuskit_organization o ON o.organization_id=a.organization_id
      LEFT JOIN "user" u ON u.id=o.owner_user_id
      LEFT JOIN dinkuskit_signup_profile p ON p.user_id=u.id
      WHERE a.decision_id=?`)
      .bind(`org_notice_${decisionId}`, t, decisionId),
  ]);
  if (changed((result as unknown[])[0])) return 'decided';
  const audit = await input.db.prepare('SELECT decision FROM dinkuskit_organization_approval_audit WHERE organization_id=?')
    .bind(input.organizationId).first<{ decision: ApprovalDecision }>();
  if (audit) return audit.decision === input.decision ? 'already_decided' : 'conflict';
  const exists = await input.db.prepare('SELECT 1 FROM dinkuskit_organization WHERE organization_id=?').bind(input.organizationId).first();
  return exists ? 'conflict' : 'not_found';
}

export async function claimNotification(db: D1Database, notificationId: string, leaseSeconds = 300): Promise<NotificationRow | null> {
  const token = crypto.randomUUID(), t = now();
  const result = await db.prepare(`UPDATE dinkuskit_organization_notification SET status='processing',claim_token=?,
    claimed_at=?,attempt_count=attempt_count+1 WHERE notification_id=? AND channel='email' AND status IN ('pending','processing')
    AND (status='pending' OR claimed_at IS NULL OR claimed_at<?)`).bind(token, t, notificationId, t - leaseSeconds).run();
  if (!changed(result)) return null;
  const row = await db.prepare('SELECT * FROM dinkuskit_organization_notification WHERE notification_id=? AND claim_token=?')
    .bind(notificationId, token).first<Record<string, unknown>>();
  return row ? notificationRow(row) : null;
}

export async function finishNotification(db: D1Database, notificationId: string, claimToken: string, delivered: boolean, error?: string): Promise<boolean> {
  const result = await db.prepare(`UPDATE dinkuskit_organization_notification SET status=?,last_error=?,delivered_at=?,
    claim_token=NULL,claimed_at=NULL WHERE notification_id=? AND status='processing' AND claim_token=?`)
    .bind(delivered ? 'delivered' : 'pending', delivered ? null : (error ?? 'delivery_failed'), delivered ? now() : null, notificationId, claimToken).run();
  return changed(result);
}

/** Claims fence local retries; external delivery can repeat after an ambiguous failure or expired lease. */
export async function dispatchNotification(db: D1Database, notificationId: string, binding?: MerchantEmailBinding): Promise<void> {
  const claimed = await claimNotification(db, notificationId);
  if (!claimed) return;
  const current = await db.prepare(`SELECT 1 FROM dinkuskit_organization o
    JOIN "user" u ON u.id=o.owner_user_id JOIN dinkuskit_signup_profile p ON p.user_id=u.id
    WHERE o.organization_id=? AND p.service_channel='email' AND p.email=?
      AND p.email=u.email AND p.email_verified=1 AND u.emailVerified=1`)
    .bind(claimed.organizationId, claimed.recipient).first();
  if (!current) {
    await db.prepare(`UPDATE dinkuskit_organization_notification SET status='unavailable',
      unavailable_reason='selected_contact_changed',claim_token=NULL,claimed_at=NULL
      WHERE notification_id=? AND claim_token=?`).bind(notificationId, claimed.claimToken).run();
    return;
  }
  const delivery = getInjectedTransports().admissionEmail;
  if (!delivery && !binding) {
    await finishNotification(db, notificationId, claimed.claimToken!, false, 'email_unavailable');
    return;
  }
  const message = {
    to: claimed.recipient,
    from: { email: 'accounts@dinkuskit.com', name: 'DinkusKit' },
    subject: `DinkusKit organization admission ${claimed.decision}`,
    text: `Your organization (${claimed.organizationId}) admission was ${claimed.decision}.\nView your organizations at https://dinkuskit.com/account.\nThis decision does not connect stores or activate services.`,
  };
  try {
    await (delivery ?? binding)!.send(message);
  } catch {
    await finishNotification(db, notificationId, claimed.claimToken!, false, 'delivery_failed');
    return;
  }
  await finishNotification(db, notificationId, claimed.claimToken!, true);
}

export async function getNotification(db: D1Database, id: string): Promise<NotificationRow | null> {
  const row = await db.prepare('SELECT * FROM dinkuskit_organization_notification WHERE notification_id=?').bind(id).first<Record<string, unknown>>();
  return row ? notificationRow(row) : null;
}
