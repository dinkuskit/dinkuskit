import {
  COMMERCE_SETTINGS_PASS, KEYED_PLUGINS, OWNER_ENABLED_SERVICES, PLUGIN_KEY_SCOPES, STORE_KEY_PREFIX, STORE_PASS_LIMIT_PER_MINUTE,
  STORE_PASS_SERVICES, type KeyedPlugin, type OwnerEnabledService, type StorePassService,
} from './config.ts';
import { shipRecipient, shipClaims, shipTestMode, SHIP_SANDBOX_AUDIENCE, type ShipSandboxRegistration } from './ship-recipient.ts';
import { signServicePass } from './jwt.ts';
import { denyUnredeemedConnections, persistPublicJwk, revokeServiceGrant } from './store.ts';

/**
 * Store keys and the passes plugins trade them for. Each plugin gets its own key at
 * Connect, limited to the passes that plugin needs; the older pasted key, one per store,
 * still covers every service until the Connect releases ship. A pass is refused for a
 * suspended store, a service the owner has not turned on, and an operator cut-off.
 */
const KEY_PATTERN = /^dk_store_[A-Za-z0-9_-]{43}$/;
const now = () => Math.floor(Date.now() / 1000);

function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashKey(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The store's owner, signed in to the business that owns the store, with a usable login. */
const OWNER_OF_STORE = `EXISTS (SELECT 1 FROM dinkuskit_store_identity i WHERE i.site_id = ? AND i.account_subject = ?)
  AND EXISTS (SELECT 1 FROM dinkuskit_membership m JOIN dinkuskit_account a ON a.user_id = m.user_id
    JOIN dinkuskit_organization o ON o.organization_id = m.organization_id
    JOIN dinkuskit_user_selection s ON s.user_id = m.user_id AND s.organization_id = m.organization_id
    WHERE m.organization_id = ? AND m.user_id = ? AND m.role = 'owner' AND m.status = 'active'
      AND a.disabled = 0 AND o.status = 'active' AND o.authority_subject = ?)`;
/** The business that owns store i is admitted and active, and its owner can still sign in. */
export const STORE_ACTIVE = `EXISTS (SELECT 1 FROM dinkuskit_organization o JOIN dinkuskit_account a ON a.user_id = o.owner_user_id
  JOIN dinkuskit_membership m ON m.organization_id = o.organization_id AND m.user_id = o.owner_user_id
  WHERE o.authority_subject = i.account_subject AND o.status = 'active' AND o.admission_status <> 'pending_operator'
    AND a.disabled = 0 AND m.role = 'owner' AND m.status = 'active')`;
type OwnerInput = { subject: string; siteId: string; organizationId: string; actorUserId: string };
const ownerArgs = (input: OwnerInput) => [input.siteId, input.subject, input.organizationId, input.actorUserId, input.subject];

/** A fresh store key for a plugin's Connect; only its hash is ever stored. */
export function newStoreKey(): string {
  return `${STORE_KEY_PREFIX}${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/**
 * Disconnect on Your Stores: the plugin's key stops working at once, and an approved
 * Connect for that plugin not yet picked up dies with it, so it cannot hand over a new key.
 */
export async function disconnectPlugin(db: D1Database, input: OwnerInput & { plugin: KeyedPlugin }): Promise<boolean> {
  if (!KEYED_PLUGINS.includes(input.plugin)) return false;
  const [result] = await db.batch([
    db.prepare(`DELETE FROM dinkuskit_plugin_key WHERE site_id = ? AND plugin = ? AND ${OWNER_OF_STORE}`)
      .bind(input.siteId, input.plugin, ...ownerArgs(input)),
    denyUnredeemedConnections(db, input.siteId, input.plugin),
  ]) as { meta?: { changes?: number } }[];
  return (result?.meta?.changes ?? 0) > 0;
}

/** Makes a new store key, replacing any earlier one. Returns the key once, or null if not allowed. */
export async function replaceStoreKey(db: D1Database, input: OwnerInput): Promise<string | null> {
  const key = newStoreKey();
  const result = await db.prepare(`INSERT INTO dinkuskit_store_key
      (site_id, key_hash, created_by_user_id, created_at, last_used_at, window_start, window_count)
    SELECT ?, ?, ?, ?, NULL, 0, 0 WHERE ${OWNER_OF_STORE}
    ON CONFLICT(site_id) DO UPDATE SET key_hash = excluded.key_hash, created_by_user_id = excluded.created_by_user_id,
      created_at = excluded.created_at, last_used_at = NULL, window_start = 0, window_count = 0`)
    .bind(input.siteId, await hashKey(key), input.actorUserId, now(), ...ownerArgs(input)).run() as { meta?: { changes?: number } };
  return (result.meta?.changes ?? 0) > 0 ? key : null;
}

/**
 * Turns Coupons or Ship on or off for a store. Turning on is the owner's consent and
 * creates or revives that service's grant; an operator cut-off stays until restored.
 */
export async function setOwnerService(db: D1Database, input: OwnerInput & { service: OwnerEnabledService; on: boolean }): Promise<'on' | 'off' | 'cut_off' | 'forbidden'> {
  if (!OWNER_ENABLED_SERVICES.includes(input.service)) return 'forbidden';
  if (!input.on) {
    await revokeServiceGrant(db, input.subject, input.siteId, input.service, input.actorUserId, input.organizationId);
  } else {
    await db.prepare(`INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at, revoked_at)
      SELECT ?, ?, 0, ?, NULL WHERE ${OWNER_OF_STORE}
      ON CONFLICT(site_id, service) DO UPDATE SET revoked = 0, granted_at = excluded.granted_at, revoked_at = NULL, revoked_by = NULL
        WHERE dinkuskit_service_grant.revoked = 1 AND dinkuskit_service_grant.revoked_by IS NOT 'operator'`)
      .bind(input.siteId, input.service, now(), ...ownerArgs(input)).run();
  }
  const grant = await db.prepare(`SELECT g.revoked, g.revoked_by FROM dinkuskit_service_grant g
    JOIN dinkuskit_store_identity i ON i.site_id = g.site_id
    WHERE g.site_id = ? AND g.service = ? AND i.account_subject = ?`)
    .bind(input.siteId, input.service, input.subject).first<{ revoked: number; revoked_by: string | null }>();
  if (!grant) return input.on ? 'forbidden' : 'off';
  if (grant.revoked === 1 && grant.revoked_by === 'operator') return 'cut_off';
  return grant.revoked === 1 ? 'off' : 'on';
}

export type StoreServiceState = 'on' | 'off' | 'cut_off';
type KeyUse = { createdAt: number; lastUsedAt: number | null };
export type StoreSetup = {
  siteId: string; siteOrigin: string;
  services: Record<StorePassService, StoreServiceState>;
  key: KeyUse | null;
  /** Each plugin's own key from Connect, or null while that plugin is not connected. */
  plugins: Record<KeyedPlugin, KeyUse | null>;
};

/** Every store the business owns, with which Commerce services are on and whether it has a key. */
export async function listStoreSetup(db: D1Database, subject: string): Promise<StoreSetup[]> {
  const stores = await db.prepare(`SELECT i.site_id, i.site_origin, k.created_at, k.last_used_at
    FROM dinkuskit_store_identity i LEFT JOIN dinkuskit_store_key k ON k.site_id = i.site_id
    WHERE i.account_subject = ? ORDER BY i.created_at, i.site_id`).bind(subject)
    .all<{ site_id: string; site_origin: string; created_at: number | null; last_used_at: number | null }>();
  const rows: StoreSetup[] = [];
  for (const store of stores.results ?? []) {
    const grants = await db.prepare('SELECT service, revoked, revoked_by FROM dinkuskit_service_grant WHERE site_id = ?')
      .bind(store.site_id).all<{ service: string; revoked: number; revoked_by: string | null }>();
    const keys = await db.prepare('SELECT plugin, created_at, last_used_at FROM dinkuskit_plugin_key WHERE site_id = ?')
      .bind(store.site_id).all<{ plugin: KeyedPlugin; created_at: number; last_used_at: number | null }>();
    const plugins = Object.fromEntries(KEYED_PLUGINS.map(plugin => [plugin, null])) as StoreSetup['plugins'];
    for (const row of keys.results ?? []) plugins[row.plugin] = { createdAt: row.created_at, lastUsedAt: row.last_used_at };
    const services = Object.fromEntries(STORE_PASS_SERVICES.map(s => [s.service, 'off'])) as StoreSetup['services'];
    for (const grant of grants.results ?? []) {
      if (!(grant.service in services)) continue;
      services[grant.service as StorePassService] = grant.revoked !== 1 ? 'on' : grant.revoked_by === 'operator' ? 'cut_off' : 'off';
    }
    rows.push({
      siteId: store.site_id, siteOrigin: store.site_origin, services,
      key: store.created_at == null ? null : { createdAt: store.created_at, lastUsedAt: store.last_used_at },
      plugins,
    });
  }
  return rows;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** POST /api/store-passes: trades a store key for a 5-minute pass for one service, or for Commerce's settings read. */
export async function issueStorePass(input: {
  db: D1Database; authorization: string | null; body: unknown; privateJwkJson?: string; registration?: ShipSandboxRegistration;
}): Promise<Response> {
  const key = input.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!key || !KEY_PATTERN.test(key)) return json(401, { error: 'invalid_store_key' });
  const body = input.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid_request' });
  const fields = body as Record<string, unknown>;
  if (typeof fields.site_id !== 'string') return json(400, { error: 'invalid_request' });
  const isolated = fields.audience === SHIP_SANDBOX_AUDIENCE;
  const recipient = shipRecipient(fields.site_id, input.registration);
  const expectedKeys = isolated ? 'audience,generation,scope,site_id' : 'audience,scope,site_id';
  if (Object.keys(fields).sort().join(',') !== expectedKeys) return json(400, { error: 'invalid_request' });
  if (isolated && (!recipient || fields.generation !== recipient.generation || fields.scope !== 'ship:orders')) return json(403, { error: 'ship_recipient_mismatch' });
  const settingsPass = !isolated && fields.scope === COMMERCE_SETTINGS_PASS.scope && fields.audience === COMMERCE_SETTINGS_PASS.audience;
  const service = isolated ? { service: 'ship', scope: 'ship:orders', audience: SHIP_SANDBOX_AUDIENCE } as const
    : settingsPass ? null : STORE_PASS_SERVICES.find(s => s.scope === fields.scope && s.audience === fields.audience);
  if (service?.service === 'ship' && recipient && !isolated) return json(403, { error: 'ship_recipient_mismatch' });
  if (!service && !settingsPass) return json(400, { error: 'invalid_request' });

  const minute = Math.floor(Date.now() / 60_000), hash = await hashKey(key);
  const count = (table: string, plugin: string) => input.db.prepare(`UPDATE ${table} SET
      window_count = CASE WHEN window_start = ? THEN window_count + 1 ELSE 1 END,
      window_start = ?, last_used_at = ?
    WHERE key_hash = ? RETURNING site_id, ${plugin} AS plugin, window_count`)
    .bind(minute, minute, now(), hash).first<{ site_id: string; plugin: KeyedPlugin | null; window_count: number }>();
  const used = await count('dinkuskit_plugin_key', 'plugin') ?? await count('dinkuskit_store_key', 'NULL');
  if (!used) return json(401, { error: 'invalid_store_key' });
  if (used.window_count > STORE_PASS_LIMIT_PER_MINUTE) return json(429, { error: 'rate_limited' });
  if (used.site_id !== fields.site_id) return json(403, { error: 'site_mismatch' });
  // A plugin's own key gets only its plugin's passes; only Commerce's reads checkout settings.
  if (used.plugin ? !PLUGIN_KEY_SCOPES[used.plugin].includes(fields.scope as string) : settingsPass) return json(403, { error: 'scope_not_allowed' });

  const store = await input.db.prepare(`SELECT i.account_subject, i.site_origin, g.revoked, g.revoked_by,
      ${STORE_ACTIVE} AS store_active
    FROM dinkuskit_store_identity i
    LEFT JOIN dinkuskit_service_grant g ON g.site_id = i.site_id AND g.service = ?
    WHERE i.site_id = ?`).bind(service?.service ?? '', used.site_id)
    .first<{ account_subject: string; site_origin: string; revoked: number | null; revoked_by: string | null; store_active: number }>();
  if (!store || Number(store.store_active) !== 1) return json(403, { error: 'store_suspended' });
  if (service && store.revoked === 1 && store.revoked_by === 'operator') return json(403, { error: 'service_cut_off' });
  if (service && store.revoked !== 0) return json(403, { error: 'service_not_enabled' });

  if (isolated && !await shipTestMode(input.db, used.site_id, recipient)) return json(403, { error: 'ship_test_required' });
  const signed = await signServicePass({
    subject: store.account_subject, siteId: used.site_id, audience: service?.audience ?? COMMERCE_SETTINGS_PASS.audience,
    scope: service?.scope ?? COMMERCE_SETTINGS_PASS.scope, privateJwkJson: input.privateJwkJson,
    // The store's web address as Connect checked it, so Payments can send shoppers back to the store.
    claims: { site_origin: store.site_origin, ...(isolated ? shipClaims(recipient) : {}) }, backdateSeconds: 2,
  });
  if (!signed.ok) return json(503, { error: 'signing_unavailable' });
  await persistPublicJwk(input.db, signed.kid, signed.publicJwk);
  return json(200, { access_token: signed.token, token_type: 'Bearer', expires_in: signed.expiresIn });
}
