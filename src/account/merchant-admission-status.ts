export type MerchantAdmissionStatus = {
  admission: 'pending' | 'admitted' | 'denied';
  notification: string | null;
};

// Sent is not delivered: these never claim the email reached the inbox.
function notificationSummary(channel: string, status: string): string {
  if (channel === 'sms') return 'We do not send text messages yet, so we could not tell you about this decision by text.';
  if (channel !== 'email') return 'We could not tell you about this decision.';
  if (status === 'delivered') return 'We sent you an email about this decision.';
  if (status === 'unavailable') return 'We could not email you about this decision.';
  return 'We are sending you an email about this decision.';
}

/** Current membership-scoped read; only current owners can join notification state. */
export async function listMerchantAdmissionStatuses(
  db: D1Database,
  userId: string,
): Promise<Map<string, MerchantAdmissionStatus>> {
  const rows = await db.prepare(`SELECT o.organization_id,o.admission_status,
      n.channel notification_channel,n.status notification_status
    FROM dinkuskit_organization o
    JOIN dinkuskit_membership m ON m.organization_id=o.organization_id
    LEFT JOIN dinkuskit_organization_notification n ON n.organization_id=o.organization_id
      AND m.role='owner' AND o.owner_user_id=m.user_id
    WHERE m.user_id=? AND m.status='active' AND o.status IN ('active','pending_operator','denied')
      AND EXISTS (SELECT 1 FROM dinkuskit_account a WHERE a.user_id=m.user_id AND a.disabled=0)`)
    .bind(userId).all<{ organization_id: string; admission_status: string; notification_channel: string | null; notification_status: string | null }>();
  if (!Array.isArray(rows.results)) throw new Error('merchant_admission_status_unavailable');
  return new Map(rows.results.map(row => [row.organization_id, {
    admission: row.admission_status === 'denied' ? 'denied'
      : row.admission_status === 'pending_operator' ? 'pending' : 'admitted',
    notification: row.notification_status === null ? null : notificationSummary(row.notification_channel ?? 'none', row.notification_status),
  }]));
}
