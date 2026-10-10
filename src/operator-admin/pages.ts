import {
  OPERATOR_SERVICES, cutOffStore, decideAsOperator, listPeople, listReviewOrganizations, listStores,
  recentActions, setPersonSuspended, type OperatorActor, type OperatorService, type ReviewOrganization,
} from '../account/operator-admin.ts';
import type { MerchantEmailBinding } from '../account/config.ts';
import { dispatchNotification, getApprovalDetail, getNotification } from '../account/organization-approvals.ts';

/**
 * Block Kit pages for the dinkuskit.com operator, rendered inside the EmDash
 * admin. Plain shop words only: businesses, people, stores.
 */
type Block = Record<string, unknown>;
export type PageResponse = { blocks: Block[]; toast?: { message: string; type: 'success' | 'error' | 'info' } };
export type Interaction =
  | { type: 'page_load'; page: string }
  | { type: 'block_action'; action_id: string; value?: unknown }
  | { type: 'form_submit'; action_id: string; values?: Record<string, unknown> };
export type PageContext = { db: D1Database; actor: OperatorActor; email?: MerchantEmailBinding };

const ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const toast = (message: string, type: 'success' | 'error' | 'info' = 'success') => ({ message, type });

type View = { page: number; q: string };
function view(raw: unknown): View {
  if (typeof raw !== 'string') return { page: 1, q: '' };
  try {
    const parsed = JSON.parse(raw) as { page?: unknown; q?: unknown };
    const page = Number.isSafeInteger(parsed.page) && Number(parsed.page) >= 1 && Number(parsed.page) <= 10_000 ? Number(parsed.page) : 1;
    const q = typeof parsed.q === 'string' ? parsed.q.slice(0, 100) : '';
    return { page, q };
  } catch { return { page: 1, q: '' }; }
}
const encodeView = (v: View) => JSON.stringify(v);

function pager(prefix: string, v: View, hasNext: boolean): Block[] {
  const elements: Block[] = [];
  if (v.page > 1) elements.push({ type: 'button', action_id: `${prefix}:page`, label: 'Previous page', value: encodeView({ ...v, page: v.page - 1 }) });
  if (hasNext) elements.push({ type: 'button', action_id: `${prefix}:page`, label: 'Next page', value: encodeView({ ...v, page: v.page + 1 }) });
  return elements.length ? [{ type: 'actions', elements }] : [];
}

function search(prefix: string, label: string, q: string): Block {
  return {
    type: 'form', block_id: `${prefix}-search`,
    fields: [{ type: 'text_input', action_id: 'q', label, ...(q ? { initial_value: q } : {}) }],
    submit: { label: 'Search', action_id: `${prefix}:search` },
  };
}

// ── Business approvals ─────────────────────────────────────────

const STATE_LABEL = { waiting: 'Waiting for you', approved: 'Approved', declined: 'Declined', suspended: 'Suspended' } as const;
const ACTION_LABEL: Record<string, string> = {
  organization_approved: 'Approved business', organization_declined: 'Declined business',
  person_suspended: 'Suspended person', person_restored: 'Restored person', service_cut_off: 'Cut off service',
};

function noticeLabel(notice: ReviewOrganization['notice']): string {
  if (!notice) return '';
  if (notice.status === 'delivered') return 'Email sent';
  if (notice.status === 'unavailable') return notice.channel === 'sms' ? 'No (texts not available yet)' : 'No (no verified email)';
  return 'Email not sent yet';
}

async function approvalsPage(ctx: PageContext, v: View, note?: PageResponse['toast']): Promise<PageResponse> {
  const { rows, hasNext } = await listReviewOrganizations(ctx.db, v.page);
  const history = await recentActions(ctx.db);
  const waiting = rows.filter(r => r.state === 'waiting').length;
  return {
    blocks: [
      { type: 'header', text: 'Business approvals' },
      { type: 'context', text: 'Every business that signs up appears here. The first 50 are approved automatically; you can still decline them. Later ones wait for you. You can change an answer at any time, and the owner is emailed only for the first answer on a waiting business.' },
      ...(waiting ? [{ type: 'banner', variant: 'alert', title: `${waiting} waiting for you on this page` }] : []),
      {
        type: 'table', page_action_id: 'approvals:sort', empty_text: 'Nobody has signed up yet.',
        columns: [
          { key: 'name', label: 'Business' },
          { key: 'owner', label: 'Owner email' },
          { key: 'signedUp', label: 'Signed up', format: 'relative_time' },
          { key: 'state', label: 'Status', format: 'badge' },
          { key: 'answeredBy', label: 'Answered by' },
          { key: 'notice', label: 'Owner told' },
          { key: 'retry', label: 'Email', format: 'element' },
          { key: 'approve', label: 'Approve', format: 'element' },
          { key: 'decline', label: 'Decline', format: 'element' },
        ],
        rows: rows.map(r => ({
          name: r.name, owner: r.ownerEmail, signedUp: iso(r.createdAt), state: STATE_LABEL[r.state],
          answeredBy: r.automatic ? 'Automatic (first 50)' : r.decidedBy ?? '',
          notice: noticeLabel(r.notice),
          ...(r.notice && (r.notice.status === 'pending' || r.notice.status === 'processing') ? { retry: {
            type: 'button', action_id: 'approvals:retry', label: 'Send again', value: r.notice.notificationId,
          } } : {}),
          ...(r.state === 'waiting' || r.state === 'declined' ? { approve: {
            type: 'button', action_id: 'approvals:approve', label: 'Approve', style: 'primary', value: r.organizationId,
          } } : {}),
          ...(r.state === 'waiting' || r.state === 'approved' ? { decline: {
            type: 'button', action_id: 'approvals:decline', label: 'Decline', style: 'danger', value: r.organizationId,
            confirm: { title: `Decline ${r.name}?`, text: 'Their stores stop getting new passes for Payments and Inventory. You can approve them again later.', confirm: 'Decline', deny: 'Cancel' },
          } } : {}),
        })),
      },
      ...pager('approvals', v, hasNext),
      { type: 'accordion', label: 'Recent operator actions', default_open: false, blocks: [{
        type: 'table', page_action_id: 'approvals:history', empty_text: 'No operator actions yet.',
        columns: [
          { key: 'when', label: 'When', format: 'relative_time' },
          { key: 'what', label: 'What' },
          { key: 'target', label: 'Who or which store', format: 'code' },
          { key: 'by', label: 'By' },
        ],
        rows: history.map(h => ({
          when: iso(h.createdAt), what: `${ACTION_LABEL[h.action] ?? h.action}${h.service ? ` (${h.service})` : ''}`,
          target: h.targetId, by: h.actorEmail,
        })),
      }] },
    ],
    ...(note ? { toast: note } : {}),
  };
}

async function decide(ctx: PageContext, organizationId: unknown, decision: 'approved' | 'denied'): Promise<PageResponse['toast']> {
  if (typeof organizationId !== 'string' || !ID.test(organizationId)) return toast('That business was not found.', 'error');
  const result = await decideAsOperator(ctx.db, organizationId, decision, ctx.actor);
  if (result === 'decided') {
    try {
      const detail = await getApprovalDetail(ctx.db, organizationId);
      if (detail?.notification?.status === 'pending') await dispatchNotification(ctx.db, detail.notification.notificationId, ctx.email);
    } catch { /* The decision and its queued notice are already saved. */ }
  }
  if (result === 'not_found') return toast('That business was not found.', 'error');
  if (result === 'conflict') return toast('That business is closed or suspended, so it cannot be changed here.', 'error');
  if (result === 'unchanged') return toast(decision === 'approved' ? 'Already approved.' : 'Already declined.', 'info');
  return toast(decision === 'approved' ? 'Business approved.' : 'Business declined.');
}

/** A failed send keeps its queued notice; another attempt shares the same delivery claim. */
async function retryNotice(ctx: PageContext, notificationId: unknown): Promise<PageResponse['toast']> {
  if (typeof notificationId !== 'string' || !/^org_notice_[A-Za-z0-9_-]{1,100}$/.test(notificationId)) return toast('That email was not found.', 'error');
  const notice = await getNotification(ctx.db, notificationId);
  if (!notice || !['pending', 'processing'].includes(notice.status)) return toast('That email does not need sending.', 'info');
  try { await dispatchNotification(ctx.db, notificationId, ctx.email); } catch { /* the queued notice remains */ }
  const after = await getNotification(ctx.db, notificationId);
  return after?.status === 'delivered' ? toast('Email sent.') : toast('The email could not be sent. Try again later.', 'error');
}

// ── People ─────────────────────────────────────────────────────

async function peoplePage(ctx: PageContext, v: View, note?: PageResponse['toast']): Promise<PageResponse> {
  const { rows, hasNext } = await listPeople(ctx.db, v.q, v.page);
  return {
    blocks: [
      { type: 'header', text: 'People' },
      { type: 'context', text: 'Everyone with a DinkusKit login. Suspending someone signs them out, stops them signing in, and stops new passes for every store they own. Restore puts everything back as it was.' },
      search('people', 'Search by email or name', v.q),
      {
        type: 'table', page_action_id: 'people:sort', empty_text: v.q ? 'Nobody matches that search.' : 'Nobody has signed up yet.',
        columns: [
          { key: 'email', label: 'Email' },
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'joined', label: 'Joined', format: 'relative_time' },
          { key: 'businesses', label: 'Businesses', format: 'number' },
          { key: 'status', label: 'Status', format: 'badge' },
          { key: 'action', label: 'Action', format: 'element' },
        ],
        rows: rows.map(p => ({
          email: p.email, name: p.name, phone: p.phone || 'None given', joined: iso(p.createdAt),
          businesses: p.organizations, status: p.suspended ? 'Suspended' : 'Active',
          action: p.suspended
            ? { type: 'button', action_id: 'people:restore', label: 'Restore', value: JSON.stringify({ id: p.userId, ...v }) }
            : { type: 'button', action_id: 'people:suspend', label: 'Suspend', style: 'danger', value: JSON.stringify({ id: p.userId, ...v }),
                confirm: { title: `Suspend ${p.email}?`, text: 'They are signed out now and cannot sign in. Their stores get no new passes until you restore them.', confirm: 'Suspend', deny: 'Cancel' } },
        })),
      },
      ...pager('people', v, hasNext),
    ],
    ...(note ? { toast: note } : {}),
  };
}

function target(raw: unknown): { id: string; v: View } | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown };
    if (typeof parsed.id !== 'string' || !ID.test(parsed.id)) return null;
    return { id: parsed.id, v: view(raw) };
  } catch { return null; }
}

// ── Stores and services ────────────────────────────────────────

const SERVICE_STATE = { connected: 'Connected', cut_off: 'Cut off', none: 'Not connected' } as const;

async function storesPage(ctx: PageContext, v: View, note?: PageResponse['toast'], confirm?: { siteId: string; origin: string; service: OperatorService | null }): Promise<PageResponse> {
  const { rows, hasNext } = await listStores(ctx.db, v.q, v.page);
  const confirmBlocks: Block[] = confirm ? [
    { type: 'banner', variant: 'alert', title: `Cut off ${confirm.service ? OPERATOR_SERVICES.find(s => s.service === confirm.service)!.label : 'every service'} for ${confirm.origin}?`,
      description: 'The store stops getting new passes right away; passes it already has run out within 10 minutes. Only the store owner can turn it back on, by pressing Connect again.' },
    { type: 'actions', elements: [
      { type: 'button', action_id: 'stores:cut', label: 'Yes, cut it off', style: 'danger',
        value: JSON.stringify({ id: confirm.siteId, service: confirm.service, ...v }) },
      { type: 'button', action_id: 'stores:page', label: 'Cancel', value: encodeView(v) },
    ] },
  ] : [];
  return {
    blocks: [
      { type: 'header', text: 'Stores and services' },
      { type: 'context', text: 'Every store that has pressed Connect, and which DinkusKit services it uses. Coupons and Ship cannot connect through DinkusKit.com yet, so their columns stay empty for now.' },
      ...confirmBlocks,
      search('stores', 'Search by store address, business or owner email', v.q),
      {
        type: 'table', page_action_id: 'stores:sort', empty_text: v.q ? 'No store matches that search.' : 'No store has connected yet.',
        columns: [
          { key: 'store', label: 'Store', format: 'code' },
          { key: 'business', label: 'Business' },
          { key: 'owner', label: 'Owner email' },
          ...OPERATOR_SERVICES.map(s => ({ key: s.service, label: s.label, format: 'badge' })),
          { key: 'action', label: 'Cut off', format: 'element' },
        ],
        rows: rows.map(s => {
          const live = OPERATOR_SERVICES.filter(x => s.services[x.service] === 'connected');
          return {
            store: s.siteOrigin, business: s.organizationName ?? 'Unknown', owner: s.ownerEmail ?? 'Unknown',
            ...Object.fromEntries(OPERATOR_SERVICES.map(x => [x.service,
              !x.connectable && s.services[x.service] === 'none' ? 'Cannot connect yet' : SERVICE_STATE[s.services[x.service]]])),
            ...(live.length ? { action: {
              type: 'menu', action_id: 'stores:choose', label: 'Cut off',
              items: [
                ...live.map(x => ({ label: x.label, value: JSON.stringify({ id: s.siteId, service: x.service, ...v }) })),
                ...(live.length > 1 ? [{ label: 'Everything', value: JSON.stringify({ id: s.siteId, service: null, ...v }) }] : []),
              ],
            } } : {}),
          };
        }),
      },
      ...pager('stores', v, hasNext),
    ],
    ...(note ? { toast: note } : {}),
  };
}

function storeTarget(raw: unknown): { id: string; service: OperatorService | null; v: View } | null {
  const base = target(raw);
  if (!base) return null;
  const service = (JSON.parse(raw as string) as { service?: unknown }).service;
  if (service === null) return { ...base, service: null };
  if (typeof service !== 'string' || !OPERATOR_SERVICES.some(s => s.service === service)) return null;
  return { ...base, service: service as OperatorService };
}

// ── Dispatch ───────────────────────────────────────────────────

export function parseInteraction(input: unknown): Interaction | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (raw.type === 'page_load' && typeof raw.page === 'string') return { type: 'page_load', page: raw.page };
  if (raw.type === 'block_action' && typeof raw.action_id === 'string') return { type: 'block_action', action_id: raw.action_id, value: raw.value };
  if (raw.type === 'form_submit' && typeof raw.action_id === 'string') {
    const values = raw.values && typeof raw.values === 'object' ? raw.values as Record<string, unknown> : {};
    return { type: 'form_submit', action_id: raw.action_id, values };
  }
  return null;
}

export async function handleInteraction(ctx: PageContext, interaction: Interaction): Promise<PageResponse> {
  if (interaction.type === 'page_load') {
    if (interaction.page === '/people') return peoplePage(ctx, view(null));
    if (interaction.page === '/stores') return storesPage(ctx, view(null));
    return approvalsPage(ctx, view(null));
  }
  const [prefix, action] = interaction.action_id.split(':');
  if (interaction.type === 'form_submit') {
    const q = typeof interaction.values?.q === 'string' ? interaction.values.q.trim().slice(0, 100) : '';
    if (prefix === 'people') return peoplePage(ctx, { page: 1, q });
    if (prefix === 'stores') return storesPage(ctx, { page: 1, q });
    return approvalsPage(ctx, view(null));
  }
  const value = interaction.value;
  if (prefix === 'approvals') {
    if (action === 'approve') return approvalsPage(ctx, view(null), await decide(ctx, value, 'approved'));
    if (action === 'decline') return approvalsPage(ctx, view(null), await decide(ctx, value, 'denied'));
    if (action === 'retry') return approvalsPage(ctx, view(null), await retryNotice(ctx, value));
    return approvalsPage(ctx, view(value));
  }
  if (prefix === 'people') {
    if (action === 'suspend' || action === 'restore') {
      const t = target(value);
      if (!t) return peoplePage(ctx, view(null), toast('That person was not found.', 'error'));
      const result = await setPersonSuspended(ctx.db, t.id, action === 'suspend', ctx.actor);
      const note = result === 'not_found' ? toast('That person was not found.', 'error')
        : result === 'unchanged' ? toast(action === 'suspend' ? 'Already suspended.' : 'Already active.', 'info')
        : toast(action === 'suspend' ? 'Suspended. They are signed out.' : 'Restored.');
      return peoplePage(ctx, t.v, note);
    }
    return peoplePage(ctx, view(value));
  }
  if (prefix === 'stores') {
    if (action === 'choose') {
      const t = storeTarget(value);
      if (!t) return storesPage(ctx, view(null), toast('That store was not found.', 'error'));
      const row = await ctx.db.prepare('SELECT site_origin FROM dinkuskit_store_identity WHERE site_id = ?').bind(t.id).first<{ site_origin: string }>();
      if (!row) return storesPage(ctx, t.v, toast('That store was not found.', 'error'));
      return storesPage(ctx, t.v, undefined, { siteId: t.id, origin: row.site_origin, service: t.service });
    }
    if (action === 'cut') {
      const t = storeTarget(value);
      if (!t) return storesPage(ctx, view(null), toast('That store was not found.', 'error'));
      const count = await cutOffStore(ctx.db, t.id, t.service, ctx.actor);
      return storesPage(ctx, t.v, count ? toast(count === 1 ? 'Service cut off.' : `${count} services cut off.`) : toast('Nothing left to cut off.', 'info'));
    }
    return storesPage(ctx, view(value));
  }
  return approvalsPage(ctx, view(null));
}
