import { ACCOUNT_ISSUER } from './config.ts';
import { canonicalAccountId } from './identity.ts';
import { authoritySubjectForOrganization, authorizeOrganization, loadOrganization, selectedOrganizationId } from './organizations.ts';
import { listActiveBindings, loadMerchantAccountByUserId } from './store.ts';

export const INVENTORY_OVERVIEW_AUDIENCE = 'inventory-account-overview';
export const INVENTORY_OVERVIEW_SCOPE = 'inventory:account-overview:read';
const MAX_BYTES = 65_536;
const TIMEOUT_MS = 3_000;
const MAX_CLOCK_SKEW_MS = 60_000;
export const STALE_AFTER_MS = 15 * 60_000;
type Provisioning = 'pending' | 'ready' | 'failed';
type UnavailableReason = 'service_unconfigured' | 'read_unavailable' | 'invalid_metadata';
export type OverviewClaims = {
  iss: string; aud: typeof INVENTORY_OVERVIEW_AUDIENCE; scope: typeof INVENTORY_OVERVIEW_SCOPE;
  sub: string; organization_id: string; organization_subject: string; iat: number; exp: number;
};
export type InventorySigner = (claims: OverviewClaims) => Promise<string>;
export type InventoryReader = {
  read(input: { callerId: string; organizationId: string; organizationSubject: string }): Promise<{ status: number; body: unknown }>;
};
export type InventoryRuntime = {
  /** Separate exact-caller, exact-organization read grant. Not membership or CMS authority. */
  authorize: (input: { userId: string; callerId: string; organizationId: string; mode: 'merchant' | 'operator'; scope: typeof INVENTORY_OVERVIEW_SCOPE }) => Promise<boolean>;
  reader: InventoryReader;
};
export type InventoryOverview = {
  sampledAt: string; asOf: string; allocatedPoolCount: number; retainedSiteCount: number;
  pools: Array<{ poolId: string; siteCount: number; provisioning: Provisioning }>;
  rows: Array<{ siteId: string; poolId: string; provisioning: Provisioning; access: 'retained' | 'revoked' | 'unknown'; origin: string | null }>;
};
export type InventoryResult =
  | { state: 'available' | 'empty' | 'stale'; overview: InventoryOverview }
  | { state: 'unavailable'; reason: UnavailableReason; observation?: { sampledAt: string; asOf: string } }
  | { state: 'forbidden'; reason: 'forbidden' };

/** Source seam only: production supplies neither this signer nor an overview runtime. */
export function createSignedInventoryReader(input: {
  signer: InventorySigner; endpoint: string; fetchImpl?: typeof fetch; now?: () => number;
}): InventoryReader {
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/v1/account-overview') {
    throw new Error('invalid_inventory_endpoint');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async read(request) {
      const iat = input.now?.() ?? Math.floor(Date.now() / 1000);
      if (!Number.isSafeInteger(iat) || !identity(request.callerId) || !identity(request.organizationId) || !identity(request.organizationSubject)) throw new Error('invalid_claims');
      const token = await input.signer({
        iss: ACCOUNT_ISSUER, aud: INVENTORY_OVERVIEW_AUDIENCE, scope: INVENTORY_OVERVIEW_SCOPE,
        sub: request.callerId, organization_id: request.organizationId, organization_subject: request.organizationSubject, iat, exp: iat + 300,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetchImpl(endpoint.href, {
          method: 'GET', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        });
        if (response.redirected || (response.status !== 200 && response.status !== 503)) throw new Error('read_unavailable');
        reader = response.body?.getReader();
        if (!reader) throw new Error('read_unavailable');
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_BYTES) throw new Error('invalid_metadata');
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { status: response.status, body: JSON.parse(new TextDecoder().decode(bytes)) };
      } finally {
        clearTimeout(timer);
        await reader?.cancel().catch(() => {});
      }
    },
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_metadata');
  return value as Record<string, unknown>;
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value;
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function provisioning(value: unknown): Provisioning {
  if (value !== 'pending' && value !== 'ready' && value !== 'failed') throw new Error('invalid_metadata');
  return value;
}

/** Rewritten against the merged Inventory contract; only allowlisted fields leave this boundary. */
export function validateOverview(raw: unknown, organizationId: string, status = 200): InventoryResult {
  const body = record(raw), overview = record(body.overview), snapshot = record(overview.snapshot), health = record(snapshot.health), metadata = record(overview.metadata);
  if (overview.schema !== 'dinkuskit.inventory.account-overview/v1' || !date(snapshot.sampledAt) || !date(snapshot.asOf) || Date.parse(snapshot.asOf) > Date.parse(snapshot.sampledAt) || Date.parse(snapshot.sampledAt) > Date.now() + MAX_CLOCK_SKEW_MS || health.availability !== 'unavailable' || health.reason !== 'live_pool_health_not_read') throw new Error('invalid_metadata');
  const observation = { sampledAt: snapshot.sampledAt, asOf: snapshot.asOf };
  if (metadata.availability === 'unavailable') {
    if (status !== 503 || !['service_unconfigured', 'read_unavailable', 'invalid_metadata'].includes(String(metadata.reason)) || overview.counts !== null || overview.pools !== null || overview.sites !== null ||
      (body.organizationId !== organizationId && !(body.organizationId === undefined && metadata.reason === 'service_unconfigured'))) throw new Error('invalid_metadata');
    return { state: 'unavailable', reason: metadata.reason as UnavailableReason, observation };
  }
  if (status !== 200 || body.organizationId !== organizationId || metadata.availability !== 'available') throw new Error('invalid_metadata');
  const counts = record(overview.counts);
  if (!integer(counts.pools) || !integer(counts.sites) || !Array.isArray(overview.pools) || !Array.isArray(overview.sites)) throw new Error('invalid_metadata');
  const poolMap = new Map<string, { poolId: string; siteCount: number; provisioning: Provisioning }>();
  for (const value of overview.pools) {
    const pool = record(value);
    if (!identity(pool.poolId) || !integer(pool.siteCount) || poolMap.has(pool.poolId)) throw new Error('invalid_metadata');
    poolMap.set(pool.poolId, { poolId: pool.poolId, siteCount: pool.siteCount, provisioning: provisioning(pool.provisioning) });
  }
  const seen = new Set<string>(), actualCounts = new Map<string, number>();
  const rows: InventoryOverview['rows'] = overview.sites.map(value => {
    const site = record(value);
    if (!identity(site.siteId) || !identity(site.poolId) || seen.has(site.siteId)) throw new Error('invalid_metadata');
    const pool = poolMap.get(site.poolId);
    if (!pool || pool.provisioning !== provisioning(site.provisioning)) throw new Error('invalid_metadata');
    seen.add(site.siteId); actualCounts.set(site.poolId, (actualCounts.get(site.poolId) ?? 0) + 1);
    return { siteId: site.siteId, poolId: site.poolId, provisioning: pool.provisioning, access: 'unknown', origin: null };
  });
  if (poolMap.size !== counts.pools || rows.length !== counts.sites || [...poolMap.values()].some(pool => (actualCounts.get(pool.poolId) ?? 0) !== pool.siteCount)) throw new Error('invalid_metadata');
  return { state: rows.length === 0 && poolMap.size === 0 ? 'empty' : 'available', overview: { ...observation, allocatedPoolCount: counts.pools, retainedSiteCount: counts.sites, pools: [...poolMap.values()], rows } };
}

export async function readInventoryOverview(input: {
  db: D1Database; callerUserId: string; organizationId: string; mode: 'merchant' | 'operator'; runtime?: InventoryRuntime;
}): Promise<InventoryResult> {
  const forbidden: InventoryResult = { state: 'forbidden', reason: 'forbidden' };
  const context = async () => {
    const personal = await loadMerchantAccountByUserId(input.db, input.callerUserId);
    const subject = await authoritySubjectForOrganization(input.db, input.organizationId);
    if (!personal || personal.disabled || !subject || !identity(subject) || !identity(input.organizationId)) return null;
    if (input.mode === 'merchant') {
      const membership = await authorizeOrganization(input.db, input.callerUserId, input.organizationId);
      if (!membership || membership.admissionStatus === 'pending_operator' || await selectedOrganizationId(input.db, input.callerUserId) !== input.organizationId) return null;
    }
    return { callerId: canonicalAccountId(ACCOUNT_ISSUER, personal.subject), subject };
  };
  let initial = await context();
  if (!initial) return forbidden;
  // No real principal/grant provider is invented, even for Owners or CMS administrators.
  if (!input.runtime) return input.mode === 'operator' ? forbidden : { state: 'unavailable', reason: 'service_unconfigured' };
  const runtime = input.runtime;
  const permitted = () => runtime.authorize({ userId: input.callerUserId, callerId: initial!.callerId, organizationId: input.organizationId, mode: input.mode, scope: INVENTORY_OVERVIEW_SCOPE });
  const unchanged = async () => {
    const current = await context();
    return Boolean(current && current.subject === initial!.subject && current.callerId === initial!.callerId);
  };
  try {
    if (!await permitted() || !await unchanged()) return forbidden;
    const response = await runtime.reader.read({ callerId: initial.callerId, organizationId: input.organizationId, organizationSubject: initial.subject });
    if (!await permitted() || !await unchanged()) return forbidden;
    const result = validateOverview(response.body, input.organizationId, response.status);
    if (!('overview' in result)) return result;
    const bindings = await listActiveBindings(input.db, initial.subject);
    if (!await permitted() || !await unchanged()) return forbidden;
    const bySite = new Map(bindings.filter(binding => binding.service === 'inventory').map(binding => [binding.siteId, binding]));
    result.overview.rows = result.overview.rows.map(row => {
      const binding = bySite.get(row.siteId);
      if (!binding) return { ...row, access: 'unknown', origin: null };
      return { ...row, access: binding.revoked ? 'revoked' : 'retained', origin: binding.siteOrigin };
    });
    const stale = Date.now() - Date.parse(result.overview.asOf) > STALE_AFTER_MS;
    return { state: stale ? 'stale' : result.state, overview: result.overview } as InventoryResult;
  } catch (error) {
    return { state: 'unavailable', reason: error instanceof Error && error.message === 'invalid_metadata' ? 'invalid_metadata' : 'read_unavailable' };
  }
}

export async function inventoryOrganizationName(db: D1Database, organizationId: string): Promise<string | null> {
  return (await loadOrganization(db, organizationId))?.name ?? null;
}
