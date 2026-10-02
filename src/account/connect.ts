import {
  ACCOUNT_ISSUER,
  CONNECTION_MAX_LIFETIME_MS,
  INVENTORY_CALLBACK_PATH,
  INVENTORY_CLIENT_ID,
  INVENTORY_SERVICE,
  TOKEN_TTL_MAX_SECONDS,
  TOKEN_TTL_SECONDS,
} from './config.ts';
import {
  approveConnectionAndBind,
  denyOwnedStoreConnection,
  insertStoreConnection,
  loadActiveBinding,
  loadMerchantAccountBySubject,
  loadStoreConnection,
  persistPublicJwk,
  redeemStoreConnection,
  type StoreConnection,
} from './store.ts';
import { compareProofReceipt, parseCanonicalSiteOrigin, type ProofFetchFn, type StoreProofReceipt } from './proof-fetch.ts';
import { prepareInventoryAccess } from './jwt.ts';
import type { ResolvedMerchant } from './session.ts';

const S256 = 'S256';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

function randomId(): string {
  return crypto.randomUUID();
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function isChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function isSiteId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,200}$/.test(value);
}

function callbackFor(origin: string): string {
  return `${origin}${INVENTORY_CALLBACK_PATH}`;
}

export function verificationUri(baseUrl: string, connectionId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/account/connect?connection_id=${encodeURIComponent(connectionId)}`;
}

export async function startStoreConnection(
  db: D1Database,
  body: unknown,
  baseUrl: string,
  options: { allowExactOrigin?: string } = {},
): Promise<Response> {
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_request' });
  const input = body as Record<string, unknown>;
  if (input.client_id !== INVENTORY_CLIENT_ID || input.service !== INVENTORY_SERVICE) {
    return json(400, { error: 'invalid_client' });
  }
  if (input.code_challenge_method !== S256 || typeof input.code_challenge !== 'string' || !isChallenge(input.code_challenge)) {
    return json(400, { error: 'invalid_pkce' });
  }
  if (typeof input.site_id !== 'string' || !isSiteId(input.site_id)) return json(400, { error: 'invalid_site_id' });
  if (typeof input.site_origin !== 'string' || typeof input.callback_uri !== 'string') return json(400, { error: 'invalid_request' });
  const origin = parseCanonicalSiteOrigin(input.site_origin, options);
  if (!origin.ok) return json(400, { error: origin.reason });
  if (options.allowExactOrigin && origin.origin !== options.allowExactOrigin) {
    return json(400, { error: 'test_origin_not_admitted' });
  }
  const expectedCallback = callbackFor(origin.origin);
  if (input.callback_uri !== expectedCallback) return json(400, { error: 'invalid_callback' });
  const now = Date.now();
  const expiresAt = now + CONNECTION_MAX_LIFETIME_MS;
  const connectionId = randomId();
  const challenge = randomId();
  await insertStoreConnection(db, {
    connectionId,
    clientId: INVENTORY_CLIENT_ID,
    service: INVENTORY_SERVICE,
    siteId: input.site_id,
    siteOrigin: origin.origin,
    callbackUri: expectedCallback,
    codeChallenge: input.code_challenge,
    challenge,
    expiresAt,
    intervalSeconds: 5,
    status: 'pending',
    accountSubject: null,
    consentedAt: null,
    redeemedAt: null,
    createdAt: Math.floor(now / 1000),
  });
  return json(200, {
    connection_id: connectionId,
    challenge,
    verification_uri: verificationUri(baseUrl, connectionId),
    expires_in: Math.floor(CONNECTION_MAX_LIFETIME_MS / 1000),
    expires_at: expiresAt,
    interval: 5,
  });
}

export async function exchangeStoreConnectionToken(input: {
  db: D1Database;
  body: unknown;
  jwtPrivateJwk?: string;
  proofFetch?: ProofFetchFn;
}): Promise<Response> {
  if (!input.proofFetch) return json(503, { error: 'integration_unavailable' });
  if (!input.body || typeof input.body !== 'object') return json(400, { error: 'invalid_request' });
  const body = input.body as Record<string, unknown>;
  if (body.client_id !== INVENTORY_CLIENT_ID) return json(400, { error: 'invalid_client' });
  if (typeof body.connection_id !== 'string' || typeof body.code_verifier !== 'string') {
    return json(400, { error: 'invalid_request' });
  }
  const connection = await loadStoreConnection(input.db, body.connection_id);
  if (!connection) return json(400, { error: 'invalid_grant' });
  if (Date.now() > connection.expiresAt) return json(400, { error: 'expired_token' });
  const expected = await sha256Base64Url(body.code_verifier);
  if (expected !== connection.codeChallenge) return json(400, { error: 'invalid_grant' });
  if (connection.status === 'pending') return json(400, { error: 'authorization_pending', interval: connection.intervalSeconds });
  if (connection.status === 'denied') return json(400, { error: 'access_denied' });
  if (connection.status === 'redeemed') return json(400, { error: 'already_redeemed' });
  if (connection.status !== 'approved' || !connection.accountSubject) return json(400, { error: 'invalid_grant' });
  const account = await loadMerchantAccountBySubject(input.db, connection.accountSubject);
  if (!account || account.disabled) return json(400, { error: 'account_disabled' });
  const binding = await loadActiveBinding(input.db, connection.siteId);
  if (!binding || binding.revoked || binding.accountSubject !== connection.accountSubject || binding.siteOrigin !== connection.siteOrigin) {
    return json(400, { error: 'grant_revoked' });
  }
  const prepared = await prepareInventoryAccess({
    subject: connection.accountSubject,
    siteId: connection.siteId,
    privateJwkJson: input.jwtPrivateJwk,
    ttlSeconds: TOKEN_TTL_SECONDS,
  });
  if (!prepared.ok) {
    return json(503, { error: prepared.reason === 'missing' ? 'signing_key_unavailable' : 'invalid_signing_key' });
  }
  const redeemed = await redeemStoreConnection(input.db, {
    connectionId: connection.connectionId,
    subject: connection.accountSubject,
    siteId: connection.siteId,
    siteOrigin: connection.siteOrigin,
  });
  if (redeemed === 'already_redeemed') return json(400, { error: 'already_redeemed' });
  if (redeemed !== 'ok') return json(400, { error: 'invalid_grant' });
  await persistPublicJwk(input.db, prepared.kid, prepared.publicJwk);
  return json(200, {
    access_token: prepared.token,
    token_type: 'Bearer',
    expires_in: prepared.expiresIn,
    site_id: connection.siteId,
  });
}

export async function consentStoreConnection(input: {
  db: D1Database;
  merchant: ResolvedMerchant;
  connectionId: string;
  action: 'approve' | 'deny';
  proofFetch?: ProofFetchFn;
}): Promise<{ ok: true; redirect: string } | { ok: false; reason: string; status: number }> {
  const connection = await loadStoreConnection(input.db, input.connectionId);
  if (!connection) return { ok: false, reason: 'unknown_connection', status: 404 };
  if (connection.accountSubject && connection.accountSubject !== input.merchant.subject) {
    return { ok: false, reason: 'not_owner', status: 403 };
  }
  if (Date.now() > connection.expiresAt) return { ok: false, reason: 'expired_token', status: 400 };
  if (connection.status !== 'pending') return { ok: false, reason: 'not_pending', status: 400 };
  if (input.action === 'deny') {
    const denied = await denyOwnedStoreConnection(input.db, connection.connectionId, input.merchant.subject);
    if (!denied) return { ok: false, reason: 'not_owner', status: 403 };
    return { ok: true, redirect: connection.callbackUri };
  }
  const fetchProof = input.proofFetch;
  if (!fetchProof) {
    return { ok: false, reason: 'integration_unavailable', status: 503 };
  }
  const proof = await fetchProof({ siteOrigin: connection.siteOrigin, connectionId: connection.connectionId });
  if (!proof.ok) return { ok: false, reason: proof.reason, status: 403 };
  const expected: StoreProofReceipt = {
    version: 1,
    connection_id: connection.connectionId,
    challenge: connection.challenge,
    client_id: connection.clientId,
    service: connection.service,
    site_id: connection.siteId,
    site_origin: connection.siteOrigin,
    callback_uri: connection.callbackUri,
    code_challenge: connection.codeChallenge,
    expires_at: connection.expiresAt,
  };
  const mismatch = compareProofReceipt(proof.receipt, expected);
  if (mismatch) return { ok: false, reason: mismatch, status: 403 };
  if (proof.receipt.expires_at > Date.now() + CONNECTION_MAX_LIFETIME_MS) {
    return { ok: false, reason: 'proof_expires_too_far', status: 403 };
  }
  if (Date.now() > connection.expiresAt) return { ok: false, reason: 'expired_token', status: 400 };
  const approved = await approveConnectionAndBind(input.db, {
    connectionId: connection.connectionId,
    subject: input.merchant.subject,
    siteId: connection.siteId,
    siteOrigin: connection.siteOrigin,
    service: connection.service,
  });
  if (!approved.ok) return { ok: false, reason: approved.reason, status: approved.reason === 'approval_failed' ? 409 : 409 };
  return { ok: true, redirect: connection.callbackUri };
}

export function connectionPreview(connection: StoreConnection) {
  return {
    connectionId: connection.connectionId,
    service: connection.service,
    siteId: connection.siteId,
    siteOrigin: connection.siteOrigin,
    expiresAt: connection.expiresAt,
    status: connection.status,
    issuer: ACCOUNT_ISSUER,
    identityNote: 'This plugin site_id is origin control of a plugin-owned identifier, not a native EmDash installation id.',
  };
}

export { TOKEN_TTL_MAX_SECONDS };
