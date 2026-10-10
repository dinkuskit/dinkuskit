import {
  ACCOUNT_ISSUER, CONNECTION_MAX_LIFETIME_MS, REGISTERED_STORE_SERVICES,
  STORE_CONNECTION_PROTOCOL_VERSION, TOKEN_TTL_MAX_SECONDS, TOKEN_TTL_SECONDS,
  type RegisteredStoreService,
} from './config.ts';
import {
  approveConnectionAndBind, denyOwnedStoreConnection, insertStoreConnection, loadActiveBinding,
  loadMerchantAccountBySubject, loadStoreConnection, persistPublicJwk, redeemStoreConnection,
  type StoreConnection,
} from './store.ts';
import { compareProofReceipt, parseCanonicalSiteOrigin, type ProofFetchFn, type StoreProofReceipt } from './proof-fetch.ts';
import { prepareServiceAccess } from './jwt.ts';
import type { ResolvedMerchant } from './session.ts';
import { authorizeOrganization } from './organizations.ts';

const S256 = 'S256';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
});
const serviceFor = (clientId: unknown, service: unknown): RegisteredStoreService | null =>
  REGISTERED_STORE_SERVICES.find(item => item.clientId === clientId && item.service === service) ?? null;
const randomId = () => crypto.randomUUID();
const isChallenge = (value: string) => /^[A-Za-z0-9_-]{43,128}$/.test(value);
async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function callbackFor(origin: string, service: RegisteredStoreService): string { return `${origin}${service.callbackPath}`; }
export function verificationUri(baseUrl: string, connectionId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/account/connect?connection_id=${encodeURIComponent(connectionId)}`;
}

export async function startStoreConnection(db: D1Database, body: unknown, baseUrl: string, options: { allowExactOrigin?: string } = {}): Promise<Response> {
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_request' });
  const input = body as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(input, 'site_id')) return json(400, { error: 'site_id_not_allowed' });
  if (input.protocol_version !== STORE_CONNECTION_PROTOCOL_VERSION) return json(400, { error: 'unsupported_protocol' });
  const registered = serviceFor(input.client_id, input.service);
  if (!registered) return json(400, { error: 'invalid_client' });
  if (input.code_challenge_method !== S256 || typeof input.code_challenge !== 'string' || !isChallenge(input.code_challenge)) return json(400, { error: 'invalid_pkce' });
  if (typeof input.site_origin !== 'string' || typeof input.callback_uri !== 'string') return json(400, { error: 'invalid_request' });
  const origin = parseCanonicalSiteOrigin(input.site_origin, options);
  if (!origin.ok) return json(400, { error: origin.reason });
  if (options.allowExactOrigin && origin.origin !== options.allowExactOrigin) return json(400, { error: 'test_origin_not_admitted' });
  const expectedCallback = callbackFor(origin.origin, registered);
  if (input.callback_uri !== expectedCallback) return json(400, { error: 'invalid_callback' });
  const existing = await db.prepare('SELECT site_id FROM dinkuskit_store_identity WHERE site_origin = ?').bind(origin.origin).first<{ site_id: string }>();
  const siteId = existing?.site_id ?? randomId();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(siteId)) return json(400, { error: 'invalid_site_id' });
  const now = Date.now(), connectionId = randomId(), challenge = randomId();
  await insertStoreConnection(db, {
    connectionId, protocolVersion: STORE_CONNECTION_PROTOCOL_VERSION, clientId: registered.clientId, service: registered.service,
    siteId, siteOrigin: origin.origin, callbackUri: expectedCallback, codeChallenge: input.code_challenge, challenge,
    expiresAt: now + CONNECTION_MAX_LIFETIME_MS, intervalSeconds: 5, status: 'pending', accountSubject: null,
    consentedAt: null, redeemedAt: null, createdAt: Math.floor(now / 1000),
  });
  return json(200, {
    protocol_version: STORE_CONNECTION_PROTOCOL_VERSION, site_id: siteId, connection_id: connectionId, challenge,
    verification_uri: verificationUri(baseUrl, connectionId), expires_in: Math.floor(CONNECTION_MAX_LIFETIME_MS / 1000),
    expires_at: now + CONNECTION_MAX_LIFETIME_MS, interval: 5,
  });
}

export async function exchangeStoreConnectionToken(input: {
  db: D1Database; body: unknown; jwtPrivateJwk?: string; proofFetch?: ProofFetchFn;
}): Promise<Response> {
  if (!input.proofFetch) return json(503, { error: 'integration_unavailable' });
  if (!input.body || typeof input.body !== 'object') return json(400, { error: 'invalid_request' });
  const body = input.body as Record<string, unknown>;
  if (typeof body.client_id !== 'string' || typeof body.connection_id !== 'string' || typeof body.code_verifier !== 'string') return json(400, { error: 'invalid_request' });
  const connection = await loadStoreConnection(input.db, body.connection_id);
  if (!connection) return json(400, { error: 'invalid_grant' });
  const registered = serviceFor(body.client_id, connection.service);
  if (connection.protocolVersion !== STORE_CONNECTION_PROTOCOL_VERSION) return json(400, { error: 'unsupported_protocol' });
  if (!registered || body.client_id !== connection.clientId) return json(400, { error: 'invalid_client' });
  if (Date.now() > connection.expiresAt) return json(400, { error: 'expired_token' });
  if (await sha256Base64Url(body.code_verifier) !== connection.codeChallenge) return json(400, { error: 'invalid_grant' });
  if (connection.status === 'pending') return json(400, { error: 'authorization_pending', interval: connection.intervalSeconds });
  if (connection.status === 'denied') return json(400, { error: 'access_denied' });
  if (connection.status === 'redeemed') return json(400, { error: 'already_redeemed' });
  if (connection.status !== 'approved' || !connection.accountSubject) return json(400, { error: 'invalid_grant' });
  const account = await loadMerchantAccountBySubject(input.db, connection.accountSubject);
  if (!account || account.disabled) return json(400, { error: 'account_disabled' });
  if (connection.organizationId) {
    const membership = await authorizeOrganization(input.db, account.userId, connection.organizationId);
    if (!membership || membership.role !== 'owner' || membership.admissionStatus === 'pending_operator' || membership.authoritySubject !== connection.accountSubject) return json(403, { error: 'organization_forbidden' });
  }
  const grant = await loadActiveBinding(input.db, connection.siteId, connection.service);
  if (!grant || grant.revoked || grant.accountSubject !== connection.accountSubject || grant.siteOrigin !== connection.siteOrigin) return json(400, { error: 'grant_revoked' });
  const prepared = await prepareServiceAccess({ subject: connection.accountSubject, siteId: connection.siteId, service: registered.service, privateJwkJson: input.jwtPrivateJwk, ttlSeconds: TOKEN_TTL_SECONDS });
  if (!prepared.ok) return json(503, { error: prepared.reason === 'missing' ? 'signing_key_unavailable' : 'invalid_signing_key' });
  const redeemed = await redeemStoreConnection(input.db, { connectionId: connection.connectionId, subject: connection.accountSubject, siteId: connection.siteId, siteOrigin: connection.siteOrigin, service: connection.service });
  if (redeemed === 'already_redeemed') return json(400, { error: 'already_redeemed' });
  if (redeemed !== 'ok') return json(400, { error: 'invalid_grant' });
  await persistPublicJwk(input.db, prepared.kid, prepared.publicJwk);
  return json(200, { access_token: prepared.token, token_type: 'Bearer', expires_in: prepared.expiresIn, site_id: connection.siteId });
}

export async function consentStoreConnection(input: {
  db: D1Database; merchant: ResolvedMerchant; organizationId: string; connectionId: string;
  action: 'approve' | 'deny'; proofFetch?: ProofFetchFn;
}): Promise<{ ok: true; redirect: string } | { ok: false; reason: string; status: number }> {
  const membership = await authorizeOrganization(input.db, input.merchant.userId, input.organizationId);
  if (!membership || membership.role !== 'owner' || membership.admissionStatus === 'pending_operator') return { ok: false, reason: 'organization_forbidden', status: 403 };
  const connection = await loadStoreConnection(input.db, input.connectionId);
  if (!connection) return { ok: false, reason: 'unknown_connection', status: 404 };
  if (connection.protocolVersion !== STORE_CONNECTION_PROTOCOL_VERSION) return { ok: false, reason: 'unsupported_protocol', status: 400 };
  if (connection.accountSubject && connection.accountSubject !== membership.authoritySubject) return { ok: false, reason: 'not_owner', status: 403 };
  if (Date.now() > connection.expiresAt) return { ok: false, reason: 'expired_token', status: 400 };
  if (connection.status !== 'pending') return { ok: false, reason: 'not_pending', status: 400 };
  if (input.action === 'deny') {
    if (!await denyOwnedStoreConnection(input.db, connection.connectionId, membership.authoritySubject)) return { ok: false, reason: 'not_owner', status: 403 };
    return { ok: true, redirect: connection.callbackUri };
  }
  if (!input.proofFetch) return { ok: false, reason: 'integration_unavailable', status: 503 };
  const proof = await input.proofFetch({ siteOrigin: connection.siteOrigin, connectionId: connection.connectionId, clientId: connection.clientId, service: connection.service });
  if (!proof.ok) return { ok: false, reason: proof.reason, status: 403 };
  const expected: StoreProofReceipt = {
    version: 2, connection_id: connection.connectionId, challenge: connection.challenge,
    client_id: connection.clientId, service: connection.service, site_id: connection.siteId, site_origin: connection.siteOrigin,
    callback_uri: connection.callbackUri, code_challenge: connection.codeChallenge, expires_at: connection.expiresAt,
  };
  const mismatch = compareProofReceipt(proof.receipt, expected);
  if (mismatch) return { ok: false, reason: mismatch, status: 403 };
  if (proof.receipt.expires_at > Date.now() + CONNECTION_MAX_LIFETIME_MS) return { ok: false, reason: 'proof_expires_too_far', status: 403 };
  if (Date.now() > connection.expiresAt) return { ok: false, reason: 'expired_token', status: 400 };
  const approved = await approveConnectionAndBind(input.db, {
    connectionId: connection.connectionId, subject: membership.authoritySubject, organizationId: input.organizationId,
    actorUserId: input.merchant.userId, siteId: connection.siteId, siteOrigin: connection.siteOrigin, service: connection.service,
  });
  if (!approved.ok) return { ok: false, reason: approved.reason, status: 409 };
  return { ok: true, redirect: connection.callbackUri };
}
export function connectionPreview(connection: StoreConnection) {
  return { protocolVersion: connection.protocolVersion, connectionId: connection.connectionId, service: connection.service, siteId: connection.siteId, siteOrigin: connection.siteOrigin, expiresAt: connection.expiresAt, status: connection.status, issuer: ACCOUNT_ISSUER, identityNote: 'This canonical site identity is shared across independently consented services.' };
}
export { TOKEN_TTL_MAX_SECONDS };
