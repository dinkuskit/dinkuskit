import { ACCOUNT_ISSUER } from './config.ts';
import { canonicalAccountId } from './identity.ts';

export type MerchantAccountRow = {
  userId: string;
  subject: string;
  disabled: boolean;
  accountId: string;
};

export type SiteBinding = {
  siteId: string;
  siteOrigin: string;
  accountSubject: string;
  service: string;
  revoked: boolean;
  grantedAt: number;
};

export type StoreConnection = {
  connectionId: string;
  clientId: string;
  service: string;
  siteId: string;
  siteOrigin: string;
  callbackUri: string;
  codeChallenge: string;
  challenge: string;
  expiresAt: number;
  intervalSeconds: number;
  status: string;
  accountSubject: string | null;
  consentedAt: number | null;
  redeemedAt: number | null;
  createdAt: number;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function ensureMerchantSubject(db: D1Database, userId: string): Promise<MerchantAccountRow> {
  const existing = await loadMerchantAccountByUserId(db, userId);
  if (existing) return existing;
  const subject = crypto.randomUUID();
  const now = nowSeconds();
  await db.prepare(
    'INSERT INTO dinkuskit_account (user_id, subject, disabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
  ).bind(userId, subject, now, now).run();
  return { userId, subject, disabled: false, accountId: canonicalAccountId(ACCOUNT_ISSUER, subject) };
}

export async function loadMerchantAccountByUserId(db: D1Database, userId: string): Promise<MerchantAccountRow | null> {
  const row = await db.prepare(
    'SELECT user_id, subject, disabled FROM dinkuskit_account WHERE user_id = ?',
  ).bind(userId).first<{ user_id: string; subject: string; disabled: number }>();
  if (!row) return null;
  return {
    userId: row.user_id,
    subject: row.subject,
    disabled: row.disabled === 1,
    accountId: canonicalAccountId(ACCOUNT_ISSUER, row.subject),
  };
}

export async function loadMerchantAccountBySubject(db: D1Database, subject: string): Promise<MerchantAccountRow | null> {
  const row = await db.prepare(
    'SELECT user_id, subject, disabled FROM dinkuskit_account WHERE subject = ?',
  ).bind(subject).first<{ user_id: string; subject: string; disabled: number }>();
  if (!row) return null;
  return {
    userId: row.user_id,
    subject: row.subject,
    disabled: row.disabled === 1,
    accountId: canonicalAccountId(ACCOUNT_ISSUER, row.subject),
  };
}

/** Always reads current D1 state. Cookie/session cache is not consulted. */
export async function isMerchantDisabled(db: D1Database, userId: string): Promise<boolean> {
  const row = await loadMerchantAccountByUserId(db, userId);
  return !row || row.disabled;
}

export async function disableMerchantAccount(db: D1Database, userId: string): Promise<void> {
  const now = nowSeconds();
  await db.batch([
    db.prepare('UPDATE dinkuskit_account SET disabled = 1, updated_at = ? WHERE user_id = ?').bind(now, userId),
    db.prepare('DELETE FROM session WHERE userId = ?').bind(userId),
  ]);
}

export async function listActiveBindings(db: D1Database, subject: string): Promise<SiteBinding[]> {
  const result = await db.prepare(
    'SELECT site_id, site_origin, account_subject, service, revoked, granted_at FROM dinkuskit_site_binding WHERE account_subject = ?',
  ).bind(subject).all<{ site_id: string; site_origin: string; account_subject: string; service: string; revoked: number; granted_at: number }>();
  return (result.results ?? []).map(row => ({
    siteId: row.site_id,
    siteOrigin: row.site_origin,
    accountSubject: row.account_subject,
    service: row.service,
    revoked: row.revoked === 1,
    grantedAt: row.granted_at,
  }));
}

export async function loadActiveBinding(db: D1Database, siteId: string): Promise<SiteBinding | null> {
  const row = await db.prepare(
    'SELECT site_id, site_origin, account_subject, service, revoked, granted_at FROM dinkuskit_site_binding WHERE site_id = ?',
  ).bind(siteId).first<{ site_id: string; site_origin: string; account_subject: string; service: string; revoked: number; granted_at: number }>();
  if (!row) return null;
  return {
    siteId: row.site_id,
    siteOrigin: row.site_origin,
    accountSubject: row.account_subject,
    service: row.service,
    revoked: row.revoked === 1,
    grantedAt: row.granted_at,
  };
}

export async function revokeBinding(db: D1Database, subject: string, siteId: string): Promise<boolean> {
  const now = nowSeconds();
  const result = await db.prepare(
    'UPDATE dinkuskit_site_binding SET revoked = 1, revoked_at = ? WHERE account_subject = ? AND site_id = ? AND revoked = 0',
  ).bind(now, subject, siteId).run() as { success?: boolean; meta?: { changes?: number } };
  return (result.meta?.changes ?? 0) > 0;
}

export async function insertStoreConnection(db: D1Database, row: StoreConnection): Promise<void> {
  await db.prepare(`
    INSERT INTO dinkuskit_store_connection (
      connection_id, client_id, service, site_id, site_origin, callback_uri, code_challenge, challenge,
      expires_at, interval_seconds, status, account_subject, consented_at, redeemed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.connectionId, row.clientId, row.service, row.siteId, row.siteOrigin, row.callbackUri,
    row.codeChallenge, row.challenge, row.expiresAt, row.intervalSeconds, row.status,
    row.accountSubject, row.consentedAt, row.redeemedAt, row.createdAt,
  ).run();
}

function mapConnection(row: {
  connection_id: string; client_id: string; service: string; site_id: string; site_origin: string;
  callback_uri: string; code_challenge: string; challenge: string; expires_at: number; interval_seconds: number;
  status: string; account_subject: string | null; consented_at: number | null; redeemed_at: number | null; created_at: number;
}): StoreConnection {
  return {
    connectionId: row.connection_id,
    clientId: row.client_id,
    service: row.service,
    siteId: row.site_id,
    siteOrigin: row.site_origin,
    callbackUri: row.callback_uri,
    codeChallenge: row.code_challenge,
    challenge: row.challenge,
    expiresAt: row.expires_at,
    intervalSeconds: row.interval_seconds,
    status: row.status,
    accountSubject: row.account_subject,
    consentedAt: row.consented_at,
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
  };
}

export async function loadStoreConnection(db: D1Database, connectionId: string): Promise<StoreConnection | null> {
  const row = await db.prepare(
    `SELECT connection_id, client_id, service, site_id, site_origin, callback_uri, code_challenge, challenge,
            expires_at, interval_seconds, status, account_subject, consented_at, redeemed_at, created_at
     FROM dinkuskit_store_connection WHERE connection_id = ?`,
  ).bind(connectionId).first<Parameters<typeof mapConnection>[0]>();
  return row ? mapConnection(row) : null;
}

/** Atomic pending claim. Returns the row only when this subject may see it. */
export async function claimPendingConnection(db: D1Database, connectionId: string, subject: string): Promise<StoreConnection | null> {
  const now = Date.now();
  await db.prepare(`
    UPDATE dinkuskit_store_connection
    SET account_subject = ?
    WHERE connection_id = ?
      AND status = 'pending'
      AND expires_at > ?
      AND (account_subject IS NULL OR account_subject = ?)
  `).bind(subject, connectionId, now, subject).run();
  const row = await loadStoreConnection(db, connectionId);
  if (!row || row.accountSubject !== subject) return null;
  return row;
}

export async function denyOwnedStoreConnection(db: D1Database, connectionId: string, subject: string): Promise<boolean> {
  const now = Date.now();
  const result = await db.prepare(`
    UPDATE dinkuskit_store_connection
    SET status = 'denied', account_subject = COALESCE(account_subject, ?)
    WHERE connection_id = ?
      AND status = 'pending'
      AND expires_at > ?
      AND (account_subject IS NULL OR account_subject = ?)
  `).bind(subject, connectionId, now, subject).run() as { meta?: { changes?: number } };
  return (result.meta?.changes ?? 0) > 0;
}

export async function approveConnectionAndBind(db: D1Database, input: {
  connectionId: string;
  subject: string;
  siteId: string;
  siteOrigin: string;
  service: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const now = nowSeconds();
  const expiresAt = Date.now();
  const existing = await db.prepare(
    'SELECT site_id, site_origin, account_subject, revoked FROM dinkuskit_site_binding WHERE site_id = ? OR site_origin = ?',
  ).bind(input.siteId, input.siteOrigin).all<{ site_id: string; site_origin: string; account_subject: string; revoked: number }>();
  for (const row of existing.results ?? []) {
    if (row.account_subject !== input.subject) return { ok: false, reason: 'ownership_conflict' };
    if (row.revoked === 1) return { ok: false, reason: 'reinstall_requires_manual_migration' };
    if (row.site_id === input.siteId && row.site_origin !== input.siteOrigin) return { ok: false, reason: 'origin_id_conflict' };
    if (row.site_origin === input.siteOrigin && row.site_id !== input.siteId) return { ok: false, reason: 'origin_id_conflict' };
  }
  try {
    await db.batch([
      db.prepare(`
        UPDATE dinkuskit_store_connection
        SET status = 'approved', account_subject = ?, consented_at = ?
        WHERE connection_id = ?
          AND status = 'pending'
          AND expires_at > ?
          AND (account_subject IS NULL OR account_subject = ?)
          AND site_id = ?
          AND site_origin = ?
          AND EXISTS (SELECT 1 FROM dinkuskit_account WHERE subject = ? AND disabled = 0)
          AND NOT EXISTS (
            SELECT 1 FROM dinkuskit_site_binding
            WHERE (site_id = ? OR site_origin = ?)
              AND NOT (account_subject = ? AND site_id = ? AND site_origin = ? AND revoked = 0)
          )
      `).bind(
        input.subject, now, input.connectionId, expiresAt, input.subject,
        input.siteId, input.siteOrigin, input.subject,
        input.siteId, input.siteOrigin, input.subject, input.siteId, input.siteOrigin,
      ),
      db.prepare(`
        UPDATE dinkuskit_site_binding
        SET granted_at = ?
        WHERE site_id = ?
          AND site_origin = ?
          AND account_subject = ?
          AND revoked = 0
          AND EXISTS (
            SELECT 1 FROM dinkuskit_store_connection
            WHERE connection_id = ?
              AND status = 'approved'
              AND account_subject = ?
              AND expires_at > ?
              AND site_id = ?
              AND site_origin = ?
          )
      `).bind(
        now, input.siteId, input.siteOrigin, input.subject,
        input.connectionId, input.subject, expiresAt, input.siteId, input.siteOrigin,
      ),
      db.prepare(`
        INSERT INTO dinkuskit_site_binding (site_id, site_origin, account_subject, service, revoked, granted_at, revoked_at)
        SELECT site_id, site_origin, account_subject, service, 0, ?, NULL
        FROM dinkuskit_store_connection
        WHERE connection_id = ?
          AND status = 'approved'
          AND account_subject = ?
          AND expires_at > ?
          AND site_id = ?
          AND site_origin = ?
          AND EXISTS (SELECT 1 FROM dinkuskit_account WHERE subject = ? AND disabled = 0)
          AND NOT EXISTS (
            SELECT 1 FROM dinkuskit_site_binding
            WHERE site_id = ? OR site_origin = ?
          )
      `).bind(
        now, input.connectionId, input.subject, expiresAt, input.siteId, input.siteOrigin,
        input.subject, input.siteId, input.siteOrigin,
      ),
      db.prepare(`
        UPDATE dinkuskit_store_connection
        SET status = 'pending', consented_at = NULL
        WHERE connection_id = ?
          AND status = 'approved'
          AND account_subject = ?
          AND redeemed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM dinkuskit_site_binding
            WHERE site_id = ? AND site_origin = ? AND account_subject = ? AND revoked = 0
          )
      `).bind(input.connectionId, input.subject, input.siteId, input.siteOrigin, input.subject),
    ]);
  } catch {
    return { ok: false, reason: 'ownership_conflict' };
  }
  const approved = await loadStoreConnection(db, input.connectionId);
  if (approved?.status !== 'approved' || approved.accountSubject !== input.subject) {
    return { ok: false, reason: 'approval_failed' };
  }
  const bound = await loadActiveBinding(db, input.siteId);
  if (!bound || bound.accountSubject !== input.subject || bound.revoked || bound.siteOrigin !== input.siteOrigin) {
    return { ok: false, reason: 'ownership_conflict' };
  }
  return { ok: true };
}

export async function redeemStoreConnection(db: D1Database, input: {
  connectionId: string;
  subject: string;
  siteId: string;
  siteOrigin: string;
}): Promise<'ok' | 'already_redeemed' | 'not_approved'> {
  const now = nowSeconds();
  const result = await db.prepare(`
    UPDATE dinkuskit_store_connection
    SET status = 'redeemed', redeemed_at = ?
    WHERE connection_id = ?
      AND status = 'approved'
      AND account_subject = ?
      AND expires_at > ?
      AND EXISTS (SELECT 1 FROM dinkuskit_account WHERE subject = ? AND disabled = 0)
      AND EXISTS (
        SELECT 1 FROM dinkuskit_site_binding
        WHERE site_id = ? AND site_origin = ? AND account_subject = ? AND revoked = 0
      )
  `).bind(
    now, input.connectionId, input.subject, Date.now(), input.subject,
    input.siteId, input.siteOrigin, input.subject,
  ).run() as { meta?: { changes?: number } };
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
  await db.prepare(
    'INSERT OR REPLACE INTO dinkuskit_jwks (kid, public_jwk, created_at) VALUES (?, ?, ?)',
  ).bind(kid, JSON.stringify(publicJwk), nowSeconds()).run();
}
