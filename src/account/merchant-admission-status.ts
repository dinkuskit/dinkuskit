export type MerchantAdmissionStatus = {
  admission: 'pending' | 'admitted' | 'denied';
  notification: string | null;
};

function notificationSummary(channel: string, status: string): string {
  if (channel === 'sms') return 'SMS notifications are unavailable.';
  if (channel !== 'email') return 'Decision notification is unavailable.';
  if (status === 'delivered') return 'Email accepted for sending. This does not confirm delivery to the recipient.';
  if (status === 'unavailable') return 'Email notification is unavailable.';
  if (status === 'processing') return 'Email notification is being processed. This does not confirm delivery to the recipient.';
  return 'Email notification is pending. This does not confirm delivery to the recipient.';
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
