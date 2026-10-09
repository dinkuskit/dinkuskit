import type { APIRoute } from 'astro';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { approvalOrigin, currentCmsAdmin } from '../../../account/cms-approval-authorization.ts';
import { decideOrganization, dispatchNotification, getApprovalDetail, getNotification } from '../../../account/organization-approvals.ts';

export const prerender = false;
const headers = { 'cache-control': 'private, no-store', 'content-type': 'application/json' };
const error = (status: number, code: string) => new Response(JSON.stringify({ error: code }), { status, headers });
const detailRedirect = (id: string) => new Response(null, { status: 303, headers: {
  ...headers, location: `/account/organization-approvals/${encodeURIComponent(id)}`,
} });

export const POST: APIRoute = async ({ request, locals }) => {
  const origin = approvalOrigin(request, import.meta.env.DEV);
  if (!origin || request.headers.get('origin') !== origin) return error(403, 'invalid_cms_provenance');
  try {
    if (!locals.user) return error(403, 'cms_admin_required');
    const cmsDb = locals.emdash?.db;
    if (!cmsDb) return error(503, 'cms_unavailable');
    const actor = await currentCmsAdmin(locals.user, cmsDb);
    if (!actor) return error(403, 'cms_admin_required');
    let form: FormData;
    try { form = await request.formData(); } catch { return error(400, 'invalid_approval_request'); }
    const retry = form.get('retry') === '1';
    const allowed = retry ? ['notification_id', 'retry'] : ['organization_id', 'decision'];
    if ([...form.keys()].some(key => !allowed.includes(key) || form.getAll(key).length !== 1)) return error(400, 'invalid_approval_request');
    const merchant = await getMerchantEnv();
    if (retry) {
      const notificationId = form.get('notification_id');
      if (typeof notificationId !== 'string' || !/^org_notice_[a-zA-Z0-9_-]{1,100}$/.test(notificationId)) return error(400, 'invalid_notification');
      const notice = await getNotification(merchant.MERCHANT_DB, notificationId);
      if (!notice || !['pending', 'processing'].includes(notice.status)) return error(409, 'notification_not_retryable');
      const current = await currentCmsAdmin(locals.user, cmsDb);
      if (!current || current.id !== actor.id) return error(403, 'cms_admin_required');
      // A failed dispatch leaves durable intent for another attempt. Never undo admission.
      try { await dispatchNotification(merchant.MERCHANT_DB, notificationId, merchant.EMAIL); } catch { /* persisted intent remains */ }
      return detailRedirect(notice.organizationId);
    }
    const organizationId = form.get('organization_id');
    const decision = form.get('decision');
    if (typeof organizationId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(organizationId)
      || (decision !== 'approved' && decision !== 'denied')) return error(400, 'invalid_approval_request');
    const current = await currentCmsAdmin(locals.user, cmsDb);
    if (!current || current.id !== actor.id) return error(403, 'cms_admin_required');
    const result = await decideOrganization({ db: merchant.MERCHANT_DB, organizationId, decision,
      actorUserId: current.id, actorEmail: current.email });
    if (result === 'not_found') return error(404, result);
    if (result === 'conflict') return error(409, result);
    if (result === 'decided') {
      try {
        const detail = await getApprovalDetail(merchant.MERCHANT_DB, organizationId);
        if (detail?.notification?.status === 'pending') await dispatchNotification(merchant.MERCHANT_DB, detail.notification.notificationId, merchant.EMAIL);
      } catch { /* The committed decision and outbox survive a dispatch/database outage. */ }
    }
    return detailRedirect(organizationId);
  } catch { return error(503, 'approvals_unavailable'); }
};
