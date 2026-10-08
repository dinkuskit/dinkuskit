import { ACCOUNT_ISSUER } from './config.ts';
import { canonicalAccountId } from './identity.ts';
import { loadMerchantAccountByUserId } from './store.ts';

export const OPERATOR_DIRECTORY_SCOPE = 'operator:directory:read' as const;
export type OperatorResource =
  | { type: 'directory'; id: 'directory' }
  | { type: 'person' | 'organization' | 'store'; id: string };
/** The provider resolves current authorization, not a cached pre-await decision. */
export type OperatorDirectoryRuntime = {
  authorize(input: { userId: string; callerId: string; resource: OperatorResource; scope: typeof OPERATOR_DIRECTORY_SCOPE }): Promise<boolean>;
};
export type DirectoryPage = { page: number; pageSize: number; hasNext: boolean };
export type DirectoryPerson = { userId: string; name: string; email: string; status: 'enabled' | 'disabled' };
export type DirectoryOrganization = { organizationId: string; name: string; status: string; admissionStatus: string; ownerUserId: string };
export type DirectoryMembership = { userId: string; organizationId: string; organizationName: string; role: string; status: string; permissions: string[] };
export type DirectoryStore = {
  siteId: string; siteOrigin: string; organizationId: string | null; service: string; revoked: boolean; grantedAt: number; revokedAt: number | null;
  connection: { service: string; status: string; createdAt: number; consentedAt: number | null; redeemedAt: number | null } | null;
};
export type DirectoryResult<T> = { state: 'ok'; value: T } | { state: 'forbidden' | 'unavailable' | 'not_found' };
type Input = { db: D1Database; userId: string; runtime?: OperatorDirectoryRuntime };
type Paging = { page: number; pageSize: number };
type Search = Paging & { search: string };
type Context = { callerId: string; subject: string };
class Denied extends Error {}
class NotFound extends Error {}

export function parseDirectoryPage(url: URL, searchAllowed = true): Search | null {
  const allowed = new Set(searchAllowed ? ['q', 'page', 'page_size'] : ['page', 'page_size']);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key))) return null;
  if ([...allowed].some(key => url.searchParams.getAll(key).length > 1)) return null;
  const search = (url.searchParams.get('q') ?? '').trim();
  if (search.length > 100 || /[\u0000-\u001f]/.test(search)) return null;
  const positive = (key: string, fallback: number, max: number) => {
    const value = url.searchParams.get(key);
    if (value === null) return fallback;
    return /^[1-9]\d*$/.test(value) && Number(value) <= max ? Number(value) : null;
  };
  const page = positive('page', 1, 10000), pageSize = positive('page_size', 20, 50);
  return page === null || pageSize === null ? null : { search, page, pageSize };
}
function validPaging(input: Paging): boolean {
  return Number.isInteger(input.page) && input.page >= 1 && input.page <= 10000
    && Number.isInteger(input.pageSize) && input.pageSize >= 1 && input.pageSize <= 50;
}
function like(value: string): string { return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`; }
function paged<T>(rows: T[], input: Paging): { rows: T[]; page: DirectoryPage } {
  return { rows: rows.slice(0, input.pageSize), page: { page: input.page, pageSize: input.pageSize, hasNext: rows.length > input.pageSize } };
}
async function rows<T>(statement: ReturnType<D1Database['prepare']>): Promise<T[]> {
  const result = await statement.all<T>() as { success?: boolean; results?: T[] };
  if (result.success === false || !Array.isArray(result.results)) throw new Error('directory_read_unavailable');
  return result.results;
}
async function context(input: Input): Promise<Context> {
  const account = await loadMerchantAccountByUserId(input.db, input.userId);
  if (!account || account.disabled) throw new Denied();
  return { callerId: canonicalAccountId(ACCOUNT_ISSUER, account.subject), subject: account.subject };
}
function unchanged(a: Context, b: Context): boolean { return a.callerId === b.callerId && a.subject === b.subject; }

/** Every authorization is bracketed by current account reads, including async authorizers. */
async function authorize(input: Input, initial: Context, resource: OperatorResource): Promise<void> {
  if (!input.runtime || !unchanged(initial, await context(input))) throw new Denied();
  let permitted = false;
  try { permitted = await input.runtime.authorize({ userId: input.userId, callerId: initial.callerId, resource, scope: OPERATOR_DIRECTORY_SCOPE }); }
  catch { throw new Denied(); }
  if (permitted !== true || !unchanged(initial, await context(input))) throw new Denied();
}
async function read<T>(input: Input, resource: OperatorResource, operation: (require: (r: OperatorResource) => Promise<void>, fence: (check: () => Promise<boolean>) => void) => Promise<T>): Promise<DirectoryResult<T>> {
  try {
    if (!input.runtime) throw new Denied();
    const initial = await context(input);
    const resources = new Map<string, OperatorResource>();
    const fences: Array<() => Promise<boolean>> = [];
    const require = async (r: OperatorResource) => {
      await authorize(input, initial, r);
      resources.set(JSON.stringify(r), r);
    };
    await require(resource);
    const value = await operation(require, check => fences.push(check));
    // Recheck every relation after all data reads, not just after its own query.
    for (const check of fences) if (!await check()) throw new Denied();
    for (const r of resources.values()) await authorize(input, initial, r);
    if (!unchanged(initial, await context(input))) throw new Denied();
    return { state: 'ok', value };
  } catch (error) {
    return { state: error instanceof Denied ? 'forbidden' : error instanceof NotFound ? 'not_found' : 'unavailable' };
  }
}
type PersonRow = { id: string; name: string; email: string; disabled: number };
const person = (r: PersonRow): DirectoryPerson => ({ userId: r.id, name: r.name, email: r.email, status: r.disabled ? 'disabled' : 'enabled' });
type OrgRow = { organization_id: string; name: string; status: string; admission_status: string; owner_user_id: string };
const organization = (r: OrgRow): DirectoryOrganization => ({ organizationId: r.organization_id, name: r.name, status: r.status, admissionStatus: r.admission_status, ownerUserId: r.owner_user_id });
type MemberRow = { user_id: string; organization_id: string; name: string; role: string; status: string; permissions: string };
function membership(r: MemberRow): DirectoryMembership {
  const permissions: unknown = JSON.parse(r.permissions);
  if (!Array.isArray(permissions) || permissions.some(p => typeof p !== 'string')) throw new Error('invalid_permissions');
  return { userId: r.user_id, organizationId: r.organization_id, organizationName: r.name, role: r.role, status: r.status, permissions };
}
const memberSelect = 'SELECT m.user_id, m.organization_id, o.name, m.role, m.status, m.permissions FROM dinkuskit_membership m JOIN dinkuskit_organization o ON o.organization_id = m.organization_id';

/** One authorization boundary covers both lists, including their final check. */
export async function readDirectory(input: Input & Search) {
  if (!validPaging(input) || input.search.length > 100) return { state: 'unavailable' } as const;
  return read(input, { type: 'directory', id: 'directory' }, async () => {
    const term = like(input.search.toLowerCase()), offset = (input.page - 1) * input.pageSize;
    const peopleWhere = input.search ? `WHERE lower(u.email) LIKE ? ESCAPE '\\' OR lower(u.name) LIKE ? ESCAPE '\\' OR lower(u.id) LIKE ? ESCAPE '\\'` : '';
    const orgWhere = input.search ? `WHERE lower(name) LIKE ? ESCAPE '\\' OR lower(organization_id) LIKE ? ESCAPE '\\'` : '';
    const people = await rows<PersonRow>(input.db.prepare(`SELECT u.id, u.name, u.email, a.disabled FROM "user" u JOIN dinkuskit_account a ON a.user_id = u.id ${peopleWhere} ORDER BY lower(u.email), u.id LIMIT ? OFFSET ?`).bind(...(input.search ? [term, term, term] : []), input.pageSize + 1, offset));
    const orgs = await rows<OrgRow>(input.db.prepare(`SELECT organization_id, name, status, admission_status, owner_user_id FROM dinkuskit_organization ${orgWhere} ORDER BY lower(name), organization_id LIMIT ? OFFSET ?`).bind(...(input.search ? [term, term] : []), input.pageSize + 1, offset));
    return { people: paged(people.map(person), input), organizations: paged(orgs.map(organization), input) };
  });
}
export async function getPerson(input: Input & Paging & { personId: string }) {
  if (!validPaging(input)) return { state: 'unavailable' } as const;
  return read(input, { type: 'person', id: input.personId }, async require => {
    const row = await input.db.prepare('SELECT u.id, u.name, u.email, a.disabled FROM "user" u JOIN dinkuskit_account a ON a.user_id = u.id WHERE u.id = ?').bind(input.personId).first<PersonRow>();
    if (!row) throw new NotFound();
    const membershipRows = await rows<MemberRow>(input.db.prepare(`${memberSelect} WHERE m.user_id = ? ORDER BY lower(o.name), o.organization_id LIMIT ? OFFSET ?`).bind(input.personId, input.pageSize + 1, (input.page - 1) * input.pageSize));
    const result = paged(membershipRows, input);
    // Authorize the lookahead too: even hasNext must not reveal an ungranted relation.
    const lookahead = membershipRows;
    for (const m of lookahead) await require({ type: 'organization', id: m.organization_id });
    return { person: person(row), memberships: result.rows.map(membership), page: result.page };
  });
}
type BindingRow = { site_id: string; site_origin: string; service: string; revoked: number; granted_at: number; revoked_at: number | null; account_subject: string; organization_id: string | null };
const bindingSelect = 'SELECT b.site_id, b.site_origin, b.service, b.revoked, b.granted_at, b.revoked_at, b.account_subject, o.organization_id FROM dinkuskit_site_binding b LEFT JOIN dinkuskit_organization o ON o.authority_subject = b.account_subject';
async function store(input: Input, binding: BindingRow): Promise<DirectoryStore> {
  const connection = binding.organization_id === null ? null : await input.db.prepare(`SELECT service, status, created_at, consented_at, redeemed_at FROM dinkuskit_store_connection WHERE site_id = ? AND account_subject = ? AND organization_id = ? AND service = ? ORDER BY created_at DESC, connection_id DESC LIMIT 1`).bind(binding.site_id, binding.account_subject, binding.organization_id, binding.service).first<{ service: string; status: string; created_at: number; consented_at: number | null; redeemed_at: number | null }>();
  return { siteId: binding.site_id, siteOrigin: binding.site_origin, organizationId: binding.organization_id, service: binding.service, revoked: binding.revoked === 1, grantedAt: binding.granted_at, revokedAt: binding.revoked_at, connection: connection ? { service: connection.service, status: connection.status, createdAt: connection.created_at, consentedAt: connection.consented_at, redeemedAt: connection.redeemed_at } : null };
}
function bindingFence(input: Input, binding: BindingRow): () => Promise<boolean> {
  return async () => {
    const current = await input.db.prepare(`${bindingSelect} WHERE b.site_id = ?`).bind(binding.site_id).first<BindingRow>();
    return JSON.stringify(current) === JSON.stringify(binding);
  };
}
export async function getOrganization(input: Input & Paging & { organizationId: string }) {
  if (!validPaging(input)) return { state: 'unavailable' } as const;
  return read(input, { type: 'organization', id: input.organizationId }, async (require, fence) => {
    const row = await input.db.prepare('SELECT organization_id, name, status, admission_status, owner_user_id FROM dinkuskit_organization WHERE organization_id = ?').bind(input.organizationId).first<OrgRow>();
    if (!row) throw new NotFound();
    const offset = (input.page - 1) * input.pageSize;
    const members = paged(await rows<MemberRow>(input.db.prepare(`${memberSelect} WHERE m.organization_id = ? ORDER BY m.user_id LIMIT ? OFFSET ?`).bind(input.organizationId, input.pageSize + 1, offset)), input);
    const bindingRows = await rows<BindingRow>(input.db.prepare(`${bindingSelect} WHERE o.organization_id = ? ORDER BY b.site_id LIMIT ? OFFSET ?`).bind(input.organizationId, input.pageSize + 1, offset));
    const bindings = paged(bindingRows, input);
    for (const b of bindingRows) await require({ type: 'store', id: b.site_id });
    const stores: DirectoryStore[] = [];
    for (const b of bindings.rows) {
      fence(bindingFence(input, b));
      stores.push(await store(input, b));
    }
    return { organization: organization(row), memberships: members.rows.map(membership), membershipPage: members.page, stores, storePage: bindings.page };
  });
}
export async function getStore(input: Input & { siteId: string }) {
  return read(input, { type: 'store', id: input.siteId }, async (require, fence) => {
    const b = await input.db.prepare(`${bindingSelect} WHERE b.site_id = ?`).bind(input.siteId).first<BindingRow>();
    if (!b) throw new NotFound();
    if (b.organization_id) await require({ type: 'organization', id: b.organization_id });
    fence(bindingFence(input, b));
    return store(input, b);
  });
}
