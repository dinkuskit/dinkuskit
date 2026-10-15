import {
  SESSION_EXPIRES_IN_SECONDS, SESSION_UPDATE_AGE_SECONDS, SHIP_LABELS_SCOPE,
  SHIP_SIGN_IN_CODE_SECONDS, type ShipSignInRequest,
} from './config.ts';
import { shipRecipient, shipDestination, shipClaims, shipTestMode, sameShipRecipient, type ShipRecipient, type StoredShipRecipient, type ShipSandboxRegistration } from './ship-recipient.ts';
import { signServicePass } from './jwt.ts';
import { persistPublicJwk } from './store.ts';

/**
 * Sign in with DinkusKit.com for Ship's label page. Ship sends the browser here with a
 * PKCE challenge; DinkusKit.com checks the signed-in person may print labels for the
 * store and sends the browser back to Ship's one fixed address with a one-time code.
 * Ship trades the code, server to server, for a 5-minute ship:labels pass and a refresh
 * token bound to this DinkusKit.com sign-in. Each refresh checks everything again, so
 * signing out, removal, suspension, a cut-off or Ship turned off end Ship's sign-in.
 */
const now = () => Math.floor(Date.now() / 1000);

export type ShipLabelRefusal = 'access_denied' | 'store_unavailable' | 'ship_not_enabled';
export type ShipLabelAccess = { ok: true; subject: string; email: string } | { ok: false; error: ShipLabelRefusal };

function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function hashSecret(secret: string): Promise<string> {
  return [...await sha256(secret)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Whether this person may print labels for this store now. The person must be an
 * active member of the business that owns the store (owner, administrator, or an
 * employee with Print shipping labels) and not suspended. The store counts as
 * unavailable on the same rule as /api/store-passes: its business is not active and
 * approved, or the operator cut Ship off. Non-members learn nothing about the store.
 */
export async function shipLabelAccess(db: D1Database, siteId: string, userId: string): Promise<ShipLabelAccess> {
  const row = await db.prepare(`SELECT i.account_subject, u.email, a.disabled, m.role, m.status AS member_status, m.permissions,
      g.revoked, g.revoked_by,
      EXISTS (SELECT 1 FROM dinkuskit_organization o2 JOIN dinkuskit_account oa ON oa.user_id = o2.owner_user_id
        JOIN dinkuskit_membership om ON om.organization_id = o2.organization_id AND om.user_id = o2.owner_user_id
        WHERE o2.authority_subject = i.account_subject AND o2.status = 'active' AND o2.admission_status <> 'pending_operator'
          AND oa.disabled = 0 AND om.role = 'owner' AND om.status = 'active') AS store_active
    FROM dinkuskit_store_identity i
    JOIN dinkuskit_organization o ON o.authority_subject = i.account_subject
    JOIN dinkuskit_membership m ON m.organization_id = o.organization_id AND m.user_id = ?
    JOIN dinkuskit_account a ON a.user_id = m.user_id
    JOIN "user" u ON u.id = m.user_id
    LEFT JOIN dinkuskit_service_grant g ON g.site_id = i.site_id AND g.service = 'ship'
    WHERE i.site_id = ?`).bind(userId, siteId)
    .first<{
      account_subject: string; email: string; disabled: number; role: string; member_status: string; permissions: string;
      revoked: number | null; revoked_by: string | null; store_active: number;
    }>();
  if (!row || Number(row.disabled) !== 0 || row.member_status !== 'active') return { ok: false, error: 'access_denied' };
  if (row.role === 'member') {
    let permissions: unknown = [];
    try { permissions = JSON.parse(row.permissions); } catch { permissions = []; }
    if (!Array.isArray(permissions) || !permissions.includes(SHIP_LABELS_SCOPE)) return { ok: false, error: 'access_denied' };
  } else if (row.role !== 'owner' && row.role !== 'administrator') {
    return { ok: false, error: 'access_denied' };
  }
  if (Number(row.store_active) !== 1) return { ok: false, error: 'store_unavailable' };
  if (row.revoked === 1 && row.revoked_by === 'operator') return { ok: false, error: 'store_unavailable' };
  if (row.revoked !== 0) return { ok: false, error: 'ship_not_enabled' };
  return { ok: true, subject: row.account_subject, email: row.email };
}

/** Where to send the browser back to Ship, with a code or an error. */
export function shipCallbackUrl(state: string, outcome: { code: string } | { error: ShipLabelRefusal | 'invalid_request' }, recipient: ShipRecipient | null = null): string {
  const query = new URLSearchParams('code' in outcome ? { code: outcome.code, state } : { error: outcome.error, state });
  return `${shipDestination(recipient).origin}/auth/callback?${query.toString()}`;
}

/** Checks the person and, if they may print labels, issues a one-time code for Ship. */
export async function startShipSignIn(db: D1Database, request: ShipSignInRequest, login: { userId: string; sessionId: string }, registration?: ShipSandboxRegistration): Promise<string> {
  const recipient = shipRecipient(request.siteId, registration);
  if (!await shipTestMode(db, request.siteId, recipient)) return shipCallbackUrl(request.state, { error: 'store_unavailable' }, recipient);
  const access = await shipLabelAccess(db, request.siteId, login.userId);
  if (!access.ok) return shipCallbackUrl(request.state, { error: access.error }, recipient);
  const code = randomSecret();
  const t = now();
  await db.batch([
    db.prepare('DELETE FROM dinkuskit_ship_sign_in_code WHERE expires_at < ?').bind(t - 3600),
    db.prepare(`INSERT INTO dinkuskit_ship_sign_in_code (code_hash, site_id, user_id, session_id, code_challenge, expires_at, used_at, ship_recipient, ship_generation, ship_mode)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .bind(await hashSecret(code), request.siteId, login.userId, login.sessionId, request.codeChallenge, t + SHIP_SIGN_IN_CODE_SECONDS, recipient?.recipient ?? null, recipient?.generation ?? null, recipient?.mode ?? null),
  ]);
  return shipCallbackUrl(request.state, { code }, recipient);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const invalidGrant = () => json(400, { error: 'invalid_grant' });

function parseDate(value: unknown): number {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  if (typeof value === 'string') return /^\d+$/.test(value) ? parseDate(Number(value)) : Date.parse(value);
  return Number.NaN;
}

/** The DinkusKit.com sign-in this Ship sign-in is bound to, if it is still live, with the person's current email. */
async function liveSession(db: D1Database, sessionId: string, userId: string): Promise<{ email: string; expiresAtMs: number } | null> {
  const row = await db.prepare(`SELECT s.expiresAt AS expires_at, u.email FROM session s JOIN "user" u ON u.id = s.userId
    WHERE s.id = ? AND s.userId = ?`).bind(sessionId, userId).first<{ expires_at: unknown; email: string }>();
  if (!row) return null;
  const expiresAtMs = parseDate(row.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return null;
  return { email: row.email, expiresAtMs };
}

/** A Ship refresh counts as using DinkusKit.com: it extends the sign-in by Better Auth's own rule, once a day to a week from now. */
async function extendSession(db: D1Database, sessionId: string, expiresAtMs: number): Promise<void> {
  const nowMs = Date.now();
  if (expiresAtMs - SESSION_EXPIRES_IN_SECONDS * 1000 + SESSION_UPDATE_AGE_SECONDS * 1000 > nowMs) return;
  await db.prepare('UPDATE session SET expiresAt = ?, updatedAt = ? WHERE id = ?')
    .bind(new Date(nowMs + SESSION_EXPIRES_IN_SECONDS * 1000).toISOString(), new Date(nowMs).toISOString(), sessionId).run();
}

async function issuePass(db: D1Database, input: { subject: string; siteId: string; userId: string; email: string; refreshToken: string; recipient: ShipRecipient | null; privateJwkJson?: string }): Promise<Response> {
  const signed = await signServicePass({
    subject: input.subject, siteId: input.siteId, audience: shipDestination(input.recipient).audience, scope: SHIP_LABELS_SCOPE, privateJwkJson: input.privateJwkJson,
    backdateSeconds: 2, claims: { uid: input.userId, email: input.email, ...shipClaims(input.recipient) },
  });
  if (!signed.ok) return json(503, { error: 'signing_unavailable' });
  await persistPublicJwk(db, signed.kid, signed.publicJwk);
  return json(200, { access_token: signed.token, token_type: 'Bearer', expires_in: signed.expiresIn, refresh_token: input.refreshToken });
}

const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * POST /api/ship-sign-in/token. Ship trades a one-time code and its PKCE verifier, or
 * a refresh token, for a fresh pass and a new refresh token. Every refusal is
 * invalid_grant, and Ship then signs in again from the start. Never redirects.
 */
export async function exchangeShipToken(input: { db: D1Database; body: unknown; privateJwkJson?: string; registration?: ShipSandboxRegistration }): Promise<Response> {
  const body = input.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid_request' });
  const fields = body as Record<string, unknown>;
  const keys = Object.keys(fields).sort().join(',');
  if (fields.grant_type === 'refresh_token' && keys === 'grant_type,refresh_token' && typeof fields.refresh_token === 'string') {
    return refresh(input.db, fields.refresh_token, input.privateJwkJson, input.registration);
  }
  const codeKeys = fields.grant_type === undefined ? 'code,code_verifier' : 'code,code_verifier,grant_type';
  if ((fields.grant_type === undefined || fields.grant_type === 'authorization_code') && keys === codeKeys
    && typeof fields.code === 'string' && typeof fields.code_verifier === 'string') {
    return redeemCode(input.db, fields.code, fields.code_verifier, input.privateJwkJson, input.registration);
  }
  return json(400, { error: 'invalid_request' });
}

async function redeemCode(db: D1Database, code: string, verifier: string, privateJwkJson?: string, registration?: ShipSandboxRegistration): Promise<Response> {
  if (!SECRET_PATTERN.test(code)) return invalidGrant();
  // Marking the code used first means it never works twice, even if this answer is lost.
  const used = await db.prepare(`UPDATE dinkuskit_ship_sign_in_code SET used_at = ? WHERE code_hash = ? AND used_at IS NULL
    RETURNING site_id, user_id, session_id, code_challenge, expires_at, ship_recipient, ship_generation, ship_mode`).bind(now(), await hashSecret(code))
    .first<StoredShipRecipient & { site_id: string; user_id: string; session_id: string; code_challenge: string; expires_at: number }>();
  if (!used || used.expires_at < now()) return invalidGrant();
  if (!VERIFIER_PATTERN.test(verifier) || base64url(await sha256(verifier)) !== used.code_challenge) return invalidGrant();
  const recipient = shipRecipient(used.site_id, registration);
  if (!sameShipRecipient(used, recipient) || !await shipTestMode(db, used.site_id, recipient)) return invalidGrant();
  const session = await liveSession(db, used.session_id, used.user_id);
  const access = await shipLabelAccess(db, used.site_id, used.user_id);
  if (!session || !access.ok) return invalidGrant();
  const refreshToken = randomSecret();
  const t = now();
  await db.prepare(`INSERT INTO dinkuskit_ship_sign_in
      (sign_in_id, site_id, user_id, session_id, email, token_hash, previous_hash, created_at, refreshed_at, ended_at, ship_recipient, ship_generation, ship_mode)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?)`)
    .bind(crypto.randomUUID(), used.site_id, used.user_id, used.session_id, access.email, await hashSecret(refreshToken), t, t, recipient?.recipient ?? null, recipient?.generation ?? null, recipient?.mode ?? null).run();
  return issuePass(db, { subject: access.subject, siteId: used.site_id, userId: used.user_id, email: access.email, refreshToken, recipient, privateJwkJson });
}

async function refresh(db: D1Database, presented: string, privateJwkJson?: string, registration?: ShipSandboxRegistration): Promise<Response> {
  if (!SECRET_PATTERN.test(presented)) return invalidGrant();
  const presentedHash = await hashSecret(presented);
  const next = randomSecret();
  const t = now();
  // Rotate first, in one statement, so two refreshes with the same token cannot both win.
  const signIn = await db.prepare(`UPDATE dinkuskit_ship_sign_in SET previous_hash = token_hash, token_hash = ?, refreshed_at = ?
    WHERE token_hash = ? AND ended_at IS NULL RETURNING sign_in_id, site_id, user_id, session_id, email, ship_recipient, ship_generation, ship_mode`)
    .bind(await hashSecret(next), t, presentedHash)
    .first<StoredShipRecipient & { sign_in_id: string; site_id: string; user_id: string; session_id: string; email: string }>();
  if (!signIn) {
    // The token before the current one came back: someone holds a copy, so end that sign-in.
    await db.prepare('UPDATE dinkuskit_ship_sign_in SET ended_at = ? WHERE previous_hash = ? AND ended_at IS NULL').bind(t, presentedHash).run();
    return invalidGrant();
  }
  const recipient = shipRecipient(signIn.site_id, registration);
  if (!sameShipRecipient(signIn, recipient) || !await shipTestMode(db, signIn.site_id, recipient)) {
    await db.prepare('UPDATE dinkuskit_ship_sign_in SET ended_at = ? WHERE sign_in_id = ?').bind(t, signIn.sign_in_id).run();
    return invalidGrant();
  }
  const session = await liveSession(db, signIn.session_id, signIn.user_id);
  const access = await shipLabelAccess(db, signIn.site_id, signIn.user_id);
  if (!session || !access.ok || session.email !== signIn.email || access.email !== signIn.email) {
    await db.prepare('UPDATE dinkuskit_ship_sign_in SET ended_at = ? WHERE sign_in_id = ?').bind(t, signIn.sign_in_id).run();
    return invalidGrant();
  }
  await extendSession(db, signIn.session_id, session.expiresAtMs);
  return issuePass(db, { subject: access.subject, siteId: signIn.site_id, userId: signIn.user_id, email: signIn.email, refreshToken: next, recipient, privateJwkJson });
}
