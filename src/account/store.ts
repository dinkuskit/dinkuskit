import { ACCOUNT_ISSUER } from './config.ts';
import { canonicalAccountId } from './identity.ts';

export type MerchantAccountRow = { userId: string; subject: string; disabled: boolean; accountId: string };
export type SiteBinding = {
  siteId: string; siteOrigin: string; accountSubject: string; service: string;
  revoked: boolean; grantedAt: number; revokedAt: number | null;
};
export type StoreConnection = {
  connectionId: string; protocolVersion: number; clientId: string; service: string;
  siteId: string; siteOrigin: string; callbackUri: string; codeChallenge: string;
  challenge: string; expiresAt: number; intervalSeconds: number; status: string;
  accountSubject: string | null; consentedAt: number | null; redeemedAt: number | null;
  createdAt: number; organizationId?: string | null;
};
const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function ensureMerchantSubject(db: D1Database, userId: string): Promise<MerchantAccountRow> {
  const existing = await loadMerchantAccountByUserId(db, userId);
  if (existing) return existing;
  const subject = crypto.randomUUID(), now = nowSeconds();
  await db.prepare('INSERT INTO dinkuskit_account (user_id, subject, disabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?)')
    .bind(userId, subject, now, now).run();
  return { userId, subject, disabled: false, accountId: canonicalAccountId(ACCOUNT_ISSUER, subject) };
}
export async function loadMerchantAccountByUserId(db: D1Database, userId: string): Promise<MerchantAccountRow | null> {
  const row = await db.prepare('SELECT user_id, subject, disabled FROM dinkuskit_account WHERE user_id = ?')
    .bind(userId).first<{ user_id: string; subject: string; disabled: number }>();
  return row ? { userId: row.user_id, subject: row.subject, disabled: row.disabled === 1, accountId: canonicalAccountId(ACCOUNT_ISSUER, row.subject) } : null;
}
export async function loadMerchantAccountBySubject(db: D1Database, subject: string): Promise<MerchantAccountRow | null> {
  const row = await db.prepare(`SELECT o.owner_user_id AS user_id, o.authority_subject AS subject, a.disabled
    FROM dinkuskit_organization o JOIN dinkuskit_account a ON a.user_id = o.owner_user_id
    JOIN dinkuskit_membership m ON m.organization_id = o.organization_id AND m.user_id = o.owner_user_id
    WHERE o.authority_subject = ? AND o.status = 'active' AND o.admission_status <> 'pending_operator'
      AND m.role = 'owner' AND m.status = 'active'`).bind(subject)
    .first<{ user_id: string; subject: string; disabled: number }>();
  return row ? { userId: row.user_id, subject: row.subject, disabled: row.disabled === 1, accountId: canonicalAccountId(ACCOUNT_ISSUER, row.subject) } : null;
}
export async function isMerchantDisabled(db: D1Database, userId: string): Promise<boolean> {
  const row = await loadMerchantAccountByUserId(db, userId); return !row || row.disabled;
}
export async function disableMerchantAccount(db: D1Database, userId: string): Promise<void> {
  const now = nowSeconds();
  await db.batch([
    db.prepare('UPDATE dinkuskit_account SET disabled = 1, updated_at = ? WHERE user_id = ?').bind(now, userId),
    db.prepare('DELETE FROM session WHERE userId = ?').bind(userId),
  ]);
}

const bindingSelect = `SELECT i.site_id, i.site_origin, i.account_subject, g.service, g.revoked, g.granted_at, g.revoked_at
  FROM dinkuskit_store_identity i JOIN dinkuskit_service_grant g ON g.site_id = i.site_id`;
type BindingRow = { site_id: string; site_origin: string; account_subject: string; service: string; revoked: number; granted_at: number; revoked_at: number | null };
function mapBinding(row: BindingRow): SiteBinding {
  return { siteId: row.site_id, siteOrigin: row.site_origin, accountSubject: row.account_subject, service: row.service, revoked: row.revoked === 1, grantedAt: row.granted_at, revokedAt: row.revoked_at };
}
export async function listActiveBindings(db: D1Database, subject: string): Promise<SiteBinding[]> {
  const result = await db.prepare(`${bindingSelect} WHERE i.account_subject = ?`).bind(subject).all<BindingRow>();
  return (result.results ?? []).map(mapBinding);
}
export async function loadActiveBinding(db: D1Database, siteId: string, service: string): Promise<SiteBinding | null> {
  const row = await db.prepare(`${bindingSelect} WHERE i.site_id = ? AND g.service = ?`).bind(siteId, service).first<BindingRow>();
  return row ? mapBinding(row) : null;
}
export async function revokeBinding(db: D1Database, subject: string, siteId: string, actorUserId: string, organizationId: string): Promise<boolean> {
  return revokeServiceGrant(db, subject, siteId, 'inventory', actorUserId, organizationId);
}
export async function revokeServiceGrant(db: D1Database, subject: string, siteId: string, service: string, actorUserId: string, organizationId: string): Promise<boolean> {
  const result = await db.prepare(`UPDATE dinkuskit_service_grant SET revoked = 1, revoked_at = ?
    WHERE site_id = ? AND service = ? AND revoked = 0
      AND EXISTS (SELECT 1 FROM dinkuskit_store_identity i WHERE i.site_id = dinkuskit_service_grant.site_id AND i.account_subject = ?)
      AND EXISTS (SELECT 1 FROM dinkuskit_membership m JOIN dinkuskit_account a ON a.user_id = m.user_id
        JOIN dinkuskit_organization o ON o.organization_id = m.organization_id
        JOIN dinkuskit_user_selection s ON s.user_id = m.user_id AND s.organization_id = m.organization_id
        WHERE m.organization_id = ? AND m.user_id = ? AND m.role = 'owner' AND m.status = 'active'
          AND a.disabled = 0 AND o.status IN ('active', 'pending_operator') AND o.authority_subject = ?)`)
    .bind(nowSeconds(), siteId, service, subject, organizationId, actorUserId, subject).run() as { meta?: { changes?: number } };
  return (result.meta?.changes ?? 0) > 0;
}

export async function insertStoreConnection(db: D1Database, row: StoreConnection): Promise<void> {
  await db.prepare(`INSERT INTO dinkuskit_store_connection
    (connection_id, client_id, service, site_id, site_origin, callback_uri, code_challenge, challenge, protocol_version,
     expires_at, interval_seconds, status, account_subject, consented_at, redeemed_at, created_at, organization_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(row.connectionId, row.clientId, row.service, row.siteId, row.siteOrigin, row.callbackUri, row.codeChallenge,
      row.challenge, row.protocolVersion, row.expiresAt, row.intervalSeconds, row.status, row.accountSubject,
      row.consentedAt, row.redeemedAt, row.createdAt, row.organizationId ?? null).run();
}
type ConnectionRow = {
  connection_id: string; protocol_version: number; client_id: string; service: string; site_id: string; site_origin: string;
  callback_uri: string; code_challenge: string; challenge: string; expires_at: number; interval_seconds: number;
  status: string; account_subject: string | null; consented_at: number | null; redeemed_at: number | null;
  created_at: number; organization_id?: string | null;
};
function mapConnection(row: ConnectionRow): StoreConnection {
  return {
    connectionId: row.connection_id, protocolVersion: row.protocol_version, clientId: row.client_id, service: row.service,
    siteId: row.site_id, siteOrigin: row.site_origin, callbackUri: row.callback_uri, codeChallenge: row.code_challenge,
    challenge: row.challenge, expiresAt: row.expires_at, intervalSeconds: row.interval_seconds, status: row.status,
    accountSubject: row.account_subject, consentedAt: row.consented_at, redeemedAt: row.redeemed_at,
    createdAt: row.created_at, organizationId: row.organization_id ?? null,
  };
}
const connectionColumns = `connection_id, protocol_version, client_id, service, site_id, site_origin, callback_uri,
  code_challenge, challenge, expires_at, interval_seconds, status, account_subject, consented_at, redeemed_at, created_at, organization_id`;
export async function loadStoreConnection(db: D1Database, connectionId: string): Promise<StoreConnection | null> {
  const row = await db.prepare(`SELECT ${connectionColumns} FROM dinkuskit_store_connection WHERE connection_id = ?`)
    .bind(connectionId).first<ConnectionRow>();
  return row ? mapConnection(row) : null;
}
export async function claimPendingConnection(db: D1Database, connectionId: string, subject: string): Promise<StoreConnection | null> {
  await db.prepare(`UPDATE dinkuskit_store_connection SET account_subject = ? WHERE connection_id = ? AND status = 'pending'
    AND expires_at > ? AND protocol_version = 2 AND (account_subject IS NULL OR account_subject = ?)`)
    .bind(subject, connectionId, Date.now(), subject).run();
  const row = await loadStoreConnection(db, connectionId);
  return row?.accountSubject === subject ? row : null;
}
export async function denyOwnedStoreConnection(db: D1Database, connectionId: string, subject: string): Promise<boolean> {
  const result = await db.prepare(`UPDATE dinkuskit_store_connection SET status = 'denied', account_subject = COALESCE(account_subject, ?)
    WHERE connection_id = ? AND status = 'pending' AND protocol_version = 2 AND expires_at > ?
      AND (account_subject IS NULL OR account_subject = ?)`).bind(subject, connectionId, Date.now(), subject).run() as { meta?: { changes?: number } };
  return (result.meta?.changes ?? 0) > 0;
}

export async function approveConnectionAndBind(db: D1Database, input: {
  connectionId: string; subject: string; organizationId: string; actorUserId: string; siteId: string; siteOrigin: string; service: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const now = nowSeconds();
  const connection = await loadStoreConnection(db, input.connectionId);
  if (!connection || connection.protocolVersion !== 2 || connection.siteId !== input.siteId || connection.siteOrigin !== input.siteOrigin || connection.service !== input.service) {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  const identity = await db.prepare('SELECT site_id, site_origin, account_subject FROM dinkuskit_store_identity WHERE site_id = ? OR site_origin = ?')
    .bind(input.siteId, input.siteOrigin).first<{ site_id: string; site_origin: string; account_subject: string }>();
  if (identity && (identity.site_id !== input.siteId || identity.site_origin !== input.siteOrigin)) return { ok: false, reason: 'origin_id_conflict' };
  if (identity && identity.account_subject !== input.subject) return { ok: false, reason: 'ownership_conflict' };
  const existingGrant = await loadActiveBinding(db, input.siteId, input.service);
  if (existingGrant?.revoked) return { ok: false, reason: 'grant_revoked' };
  const expiresAt = Date.now();
  try {
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO dinkuskit_store_identity (site_id, site_origin, account_subject, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM dinkuskit_organization o JOIN dinkuskit_membership m ON m.organization_id = o.organization_id
          JOIN dinkuskit_account a ON a.user_id = m.user_id JOIN dinkuskit_user_selection s ON s.user_id = m.user_id AND s.organization_id = m.organization_id
          WHERE o.organization_id = ? AND o.authority_subject = ? AND o.owner_user_id = ? AND m.user_id = o.owner_user_id
            AND m.role = 'owner' AND m.status = 'active' AND o.status = 'active' AND o.admission_status <> 'pending_operator' AND a.disabled = 0
        ) AND EXISTS (
          SELECT 1 FROM dinkuskit_store_connection c
          WHERE c.connection_id = ? AND c.status = 'pending' AND c.protocol_version = 2 AND c.expires_at > ?
            AND (c.account_subject IS NULL OR c.account_subject = ?) AND c.site_id = ? AND c.site_origin = ? AND c.service = ?
        ) AND NOT EXISTS (
          SELECT 1 FROM dinkuskit_service_grant g WHERE g.site_id = ? AND g.service = ? AND g.revoked = 1
        )`).bind(input.siteId, input.siteOrigin, input.subject, now, input.organizationId, input.subject, input.actorUserId,
          input.connectionId, expiresAt, input.subject, input.siteId, input.siteOrigin, input.service, input.siteId, input.service),
      db.prepare(`UPDATE dinkuskit_store_connection SET status = 'approved', account_subject = ?, organization_id = ?, consented_at = ?
        WHERE connection_id = ? AND status = 'pending' AND protocol_version = 2 AND expires_at > ?
          AND (account_subject IS NULL OR account_subject = ?) AND site_id = ? AND site_origin = ? AND service = ?
          AND EXISTS (SELECT 1 FROM dinkuskit_store_identity WHERE site_id = ? AND site_origin = ? AND account_subject = ?)
          AND NOT EXISTS (SELECT 1 FROM dinkuskit_service_grant WHERE site_id = ? AND service = ? AND revoked = 1)
          AND EXISTS (SELECT 1 FROM dinkuskit_organization o JOIN dinkuskit_membership m ON m.organization_id = o.organization_id
            JOIN dinkuskit_account a ON a.user_id = m.user_id JOIN dinkuskit_user_selection s ON s.user_id = m.user_id AND s.organization_id = m.organization_id
            WHERE o.organization_id = ? AND o.authority_subject = ? AND o.owner_user_id = ? AND m.user_id = o.owner_user_id
              AND m.role = 'owner' AND m.status = 'active' AND o.status = 'active' AND o.admission_status <> 'pending_operator' AND a.disabled = 0)`)
        .bind(input.subject, input.organizationId, now, input.connectionId, expiresAt, input.subject, input.siteId, input.siteOrigin, input.service,
          input.siteId, input.siteOrigin, input.subject, input.siteId, input.service, input.organizationId, input.subject, input.actorUserId),
      db.prepare(`INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at, revoked_at)
        SELECT ?, ?, 0, ?, NULL WHERE EXISTS (
          SELECT 1 FROM dinkuskit_store_connection WHERE connection_id = ? AND status = 'approved' AND protocol_version = 2
            AND account_subject = ? AND organization_id = ? AND site_id = ? AND site_origin = ? AND service = ?
        ) ON CONFLICT(site_id, service) DO UPDATE SET revoked = 0, granted_at = excluded.granted_at, revoked_at = NULL
          WHERE dinkuskit_service_grant.revoked = 0`)
        .bind(input.siteId, input.service, now, input.connectionId, input.subject, input.organizationId, input.siteId, input.siteOrigin, input.service),
    ]);
  } catch {
    return { ok: false, reason: 'ownership_conflict' };
  }
  const approved = await loadStoreConnection(db, input.connectionId);
  const grant = await loadActiveBinding(db, input.siteId, input.service);
  if (approved?.status !== 'approved' || approved.accountSubject !== input.subject || !grant || grant.accountSubject !== input.subject || grant.siteOrigin !== input.siteOrigin || grant.revoked) {
    return { ok: false, reason: 'approval_failed' };
  }
  return { ok: true };
}
export async function redeemStoreConnection(db: D1Database, input: { connectionId: string; subject: string; siteId: string; siteOrigin: string; service: string }): Promise<'ok' | 'already_redeemed' | 'not_approved'> {
  const result = await db.prepare(`UPDATE dinkuskit_store_connection SET status = 'redeemed', redeemed_at = ?
    WHERE connection_id = ? AND status = 'approved' AND protocol_version = 2 AND account_subject = ? AND service = ? AND site_id = ? AND site_origin = ? AND expires_at > ?
      AND EXISTS (SELECT 1 FROM dinkuskit_organization o JOIN dinkuskit_account a ON a.user_id = o.owner_user_id
        JOIN dinkuskit_membership m ON m.organization_id = o.organization_id AND m.user_id = o.owner_user_id
        WHERE o.authority_subject = ? AND o.status = 'active' AND o.admission_status <> 'pending_operator' AND a.disabled = 0 AND m.role = 'owner' AND m.status = 'active')
      AND EXISTS (SELECT 1 FROM dinkuskit_store_identity i JOIN dinkuskit_service_grant g ON g.site_id = i.site_id
        WHERE i.site_id = ? AND i.site_origin = ? AND i.account_subject = ? AND g.service = ? AND g.revoked = 0)`)
    .bind(nowSeconds(), input.connectionId, input.subject, input.service, input.siteId, input.siteOrigin, Date.now(), input.subject,
      input.siteId, input.siteOrigin, input.subject, input.service).run() as { meta?: { changes?: number } };
  if ((result.meta?.changes ?? 0) > 0) return 'ok';
  const row = await loadStoreConnection(db, input.connectionId);
  if (row?.status === 'redeemed') return 'already_redeemed';
  return 'not_approved';
}
export async function listPublicJwks(db: D1Database): Promise<{ keys: JsonWebKey[] }> {
  const result = await db.prepare('SELECT public_jwk FROM dinkuskit_jwks').all<{ public_jwk: string }>();
  return { keys: (result.results ?? []).map(row => JSON.parse(row.public_jwk) as JsonWebKey) };
}
export async function persistPublicJwk(db: D1Database, kid: string, publicJwk: JsonWebKey): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO dinkuskit_jwks (kid, public_jwk, created_at) VALUES (?, ?, ?)')
    .bind(kid, JSON.stringify(publicJwk), nowSeconds()).run();
}
