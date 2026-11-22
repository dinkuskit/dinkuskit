import {
  ACCOUNT_ISSUER, CONNECTION_MAX_LIFETIME_MS, STORE_CONNECTION_PROTOCOL_VERSION,
  TOKEN_TTL_MAX_SECONDS, TOKEN_TTL_SECONDS, isRegisteredClient, registeredInstallation,
} from './config.ts';
import {
  approveConnectionAndBind, commerceConnected, denyOwnedStoreConnection, insertStoreConnection, loadActiveBinding,
  loadMerchantAccountBySubject, loadStoreConnection, persistPublicJwk, redeemStoreConnection,
  type StoreConnection,
} from './store.ts';
import { compareProofReceipt, parseCanonicalSiteOrigin, type ProofFetchFn, type StoreProofReceipt } from './proof-fetch.ts';
import { prepareServiceAccess } from './jwt.ts';
import { hashKey, newStoreKey } from './store-passes.ts';
import type { ResolvedMerchant } from './session.ts';
import { authorizeOrganization } from './organizations.ts';
import type { MerchantEmailBinding } from './config.ts';

const S256 = 'S256';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
});
const randomId = () => crypto.randomUUID();
const isChallenge = (value: string) => /^[A-Za-z0-9_-]{43,128}$/.test(value);
async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function verificationUri(baseUrl: string, connectionId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/account/connect?connection_id=${encodeURIComponent(connectionId)}`;
}

export async function startStoreConnection(db: D1Database, body: unknown, baseUrl: string, options: { allowExactOrigin?: string } = {}): Promise<Response> {
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_request' });
  const input = body as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(input, 'site_id')) return json(400, { error: 'site_id_not_allowed' });
  if (input.protocol_version !== STORE_CONNECTION_PROTOCOL_VERSION) return json(400, { error: 'unsupported_protocol' });
  if (!isRegisteredClient(input.client_id, input.service)) return json(400, { error: 'invalid_client' });
  if (input.code_challenge_method !== S256 || typeof input.code_challenge !== 'string' || !isChallenge(input.code_challenge)) return json(400, { error: 'invalid_pkce' });
  if (typeof input.site_origin !== 'string' || typeof input.callback_uri !== 'string') return json(400, { error: 'invalid_request' });
  const origin = parseCanonicalSiteOrigin(input.site_origin, options);
  if (!origin.ok) return json(400, { error: origin.reason });
  if (options.allowExactOrigin && origin.origin !== options.allowExactOrigin) return json(400, { error: 'test_origin_not_admitted' });
  const registered = registeredInstallation(input.client_id, input.service, origin.origin, input.callback_uri);
  if (!registered) return json(400, { error: 'invalid_callback' });
  const expectedCallback = `${origin.origin}${registered.callbackPath}`;
  const existing = await db.prepare('SELECT site_id FROM dinkuskit_store_identity WHERE site_origin = ?').bind(origin.origin).first<{ site_id: string }>();
  // Commerce registers the store; the others connect only once Commerce has.
  if (!registered.registersStore && (!existing || !await commerceConnected(db, existing.site_id))) return json(409, { error: 'connect_commerce_first' });
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
  const registered = registeredInstallation(connection.clientId, connection.service, connection.siteOrigin, connection.callbackUri);
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
  // Commerce and Ship only get their key; Inventory and Payments also need their grant on.
  if (registered.grants) {
    const grant = await loadActiveBinding(input.db, connection.siteId, connection.service);
    if (!grant || grant.revoked || grant.accountSubject !== connection.accountSubject || grant.siteOrigin !== connection.siteOrigin) return json(400, { error: 'grant_revoked' });
  }
  const prepared = registered.grants
    ? await prepareServiceAccess({ subject: connection.accountSubject, siteId: connection.siteId, service: registered.service, privateJwkJson: input.jwtPrivateJwk, ttlSeconds: TOKEN_TTL_SECONDS })
    : null;
  if (prepared && !prepared.ok) return json(503, { error: prepared.reason === 'missing' ? 'signing_key_unavailable' : 'invalid_signing_key' });
  // The plugin's own store key goes back once, in this answer, and is never shown to anyone.
  const storeKey = registered.plugin ? newStoreKey() : null;
  const redeemed = await redeemStoreConnection(input.db, {
    connectionId: connection.connectionId, subject: connection.accountSubject, siteId: connection.siteId, siteOrigin: connection.siteOrigin,
    service: connection.service, grant: registered.grants,
    ...(storeKey && registered.plugin ? { key: { plugin: registered.plugin, hash: await hashKey(storeKey), createdByUserId: account.userId } } : {}),
  });
  if (redeemed === 'already_redeemed') return json(400, { error: 'already_redeemed' });
  if (redeemed !== 'ok') return json(400, { error: 'invalid_grant' });
  const key = storeKey ? { store_key: storeKey } : {};
  if (!prepared) return json(200, { ...key, site_id: connection.siteId });
  await persistPublicJwk(input.db, prepared.kid, prepared.publicJwk);
  return json(200, { access_token: prepared.token, token_type: 'Bearer', expires_in: prepared.expiresIn, site_id: connection.siteId, ...key });
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
  const proof = await input.proofFetch({ siteOrigin: connection.siteOrigin, connectionId: connection.connectionId, clientId: connection.clientId, service: connection.service, callbackUri: connection.callbackUri });
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
  const registered = registeredInstallation(connection.clientId, connection.service, connection.siteOrigin, connection.callbackUri);
  if (!registered) return { ok: false, reason: 'invalid_client', status: 400 };
  const approved = await approveConnectionAndBind(input.db, {
    connectionId: connection.connectionId, subject: membership.authoritySubject, organizationId: input.organizationId,
    actorUserId: input.merchant.userId, siteId: connection.siteId, siteOrigin: connection.siteOrigin, service: connection.service,
    grant: registered.grants, registersStore: registered.registersStore, turnsOn: registered.turnsOn,
  });
  if (!approved.ok) return { ok: false, reason: approved.reason, status: 409 };
  return { ok: true, redirect: connection.callbackUri };
}
/** The store's business, when a plugin's Finish setup may join it without the owner's Approve. */
type JoinableStore = { siteId: string; organizationId: string; subject: string; ownerUserId: string; ownerEmail: string | null; businessName: string };
type Joinable = { ok: true; store: JoinableStore } | { ok: false; reason: 'owner_approval_required' | 'grant_revoked' | 'connect_commerce_first' };

/**
 * Finish setup (store-connect-approve-once-125): once the owner has approved one plugin, the
 * store's other DinkusKit plugins join with their own key and no second Approve. Refused, so
 * the plugin shows the usual Approve link, when DinkusKit.com does not know the store, no
 * plugin of the store is connected, the business is not active and approved, the owner
 * disconnected this plugin or turned its service off (connect-finish-setup-disconnect-137),
 * or an operator cut the service off.
 */
export async function joinableStore(db: D1Database, siteOrigin: string, registered: { service: string; plugin: string | null; registersStore: boolean }): Promise<Joinable> {
  if (!registered.plugin) return { ok: false, reason: 'owner_approval_required' };
  const store = await db.prepare(`SELECT i.site_id, o.organization_id, o.authority_subject, o.owner_user_id, o.name, u.email, u.emailVerified AS verified
    FROM dinkuskit_store_identity i
    JOIN dinkuskit_organization o ON o.authority_subject = i.account_subject
    JOIN dinkuskit_membership m ON m.organization_id = o.organization_id AND m.user_id = o.owner_user_id
    JOIN dinkuskit_account a ON a.user_id = o.owner_user_id
    LEFT JOIN "user" u ON u.id = o.owner_user_id
    WHERE i.site_origin = ? AND o.status = 'active' AND o.admission_status <> 'pending_operator'
      AND m.role = 'owner' AND m.status = 'active' AND a.disabled = 0
      AND EXISTS (SELECT 1 FROM dinkuskit_plugin_key k WHERE k.site_id = i.site_id)`)
    .bind(siteOrigin).first<{ site_id: string; organization_id: string; authority_subject: string; owner_user_id: string; name: string; email: string | null; verified: number | null }>();
  if (!store) return { ok: false, reason: 'owner_approval_required' };
  if (!registered.registersStore && !await commerceConnected(db, store.site_id)) return { ok: false, reason: 'connect_commerce_first' };
  const [disconnected, grant] = await Promise.all([
    db.prepare('SELECT 1 AS yes FROM dinkuskit_plugin_disconnect WHERE site_id = ? AND plugin = ?').bind(store.site_id, registered.plugin).first(),
    db.prepare('SELECT revoked, revoked_by FROM dinkuskit_service_grant WHERE site_id = ? AND service = ?').bind(store.site_id, registered.service)
      .first<{ revoked: number; revoked_by: string | null }>(),
  ]);
  if (grant?.revoked === 1 && grant.revoked_by === 'operator') return { ok: false, reason: 'grant_revoked' };
  if (disconnected || grant?.revoked === 1) return { ok: false, reason: 'owner_approval_required' };
  return { ok: true, store: {
    siteId: store.site_id, organizationId: store.organization_id, subject: store.authority_subject, ownerUserId: store.owner_user_id,
    ownerEmail: store.email && Number(store.verified) === 1 ? store.email : null, businessName: store.name,
  } };
}

/**
 * POST /api/store-connections/lookup: whether this plugin's page shows Finish setup or Connect.
 * Body: protocol_version 2, client_id, service, site_origin, callback_uri. It names nothing
 * about the business; the plugin learns that only after it has its own key.
 */
export async function lookupStoreConnection(db: D1Database, body: unknown, options: { allowExactOrigin?: string } = {}): Promise<Response> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid_request' });
  const input = body as Record<string, unknown>;
  if (input.protocol_version !== STORE_CONNECTION_PROTOCOL_VERSION) return json(400, { error: 'unsupported_protocol' });
  if (!isRegisteredClient(input.client_id, input.service)) return json(400, { error: 'invalid_client' });
  if (typeof input.site_origin !== 'string' || typeof input.callback_uri !== 'string') return json(400, { error: 'invalid_request' });
  const origin = parseCanonicalSiteOrigin(input.site_origin, options);
  if (!origin.ok) return json(400, { error: origin.reason });
  if (options.allowExactOrigin && origin.origin !== options.allowExactOrigin) return json(400, { error: 'test_origin_not_admitted' });
  const registered = registeredInstallation(input.client_id, input.service, origin.origin, input.callback_uri);
  if (!registered) return json(400, { error: 'invalid_callback' });
  const joinable = await joinableStore(db, origin.origin, registered);
  return json(200, { finish_setup: joinable.ok });
}

const PLUGIN_NAMES: Record<string, string> = { commerce: 'Dinkus Commerce', payments: 'Dinkus Payments', ship: 'Dinkus Ship' };

/**
 * POST /api/store-connections/finish: Finish setup. Body is the token exchange's:
 * client_id, connection_id, code_verifier, for a connection this plugin just started.
 * DinkusKit.com runs the same store check as Approve, approves for the business that owns
 * the store, and answers exactly as /api/store-connections/token does. The owner gets an
 * email naming the plugin. 409 owner_approval_required means use the Approve link instead.
 */
export async function finishStoreSetup(input: {
  db: D1Database; body: unknown; jwtPrivateJwk?: string; proofFetch?: ProofFetchFn; noticeEmail?: MerchantEmailBinding; baseUrl: string;
}): Promise<Response> {
  if (!input.proofFetch) return json(503, { error: 'integration_unavailable' });
  if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) return json(400, { error: 'invalid_request' });
  const body = input.body as Record<string, unknown>;
  if (typeof body.client_id !== 'string' || typeof body.connection_id !== 'string' || typeof body.code_verifier !== 'string') return json(400, { error: 'invalid_request' });
  const connection = await loadStoreConnection(input.db, body.connection_id);
  if (!connection) return json(400, { error: 'invalid_grant' });
  if (connection.protocolVersion !== STORE_CONNECTION_PROTOCOL_VERSION) return json(400, { error: 'unsupported_protocol' });
  const registered = registeredInstallation(connection.clientId, connection.service, connection.siteOrigin, connection.callbackUri);
  if (!registered || body.client_id !== connection.clientId) return json(400, { error: 'invalid_client' });
  if (Date.now() > connection.expiresAt) return json(400, { error: 'expired_token' });
  // The verifier first: only the plugin that started this connection may finish it.
  if (await sha256Base64Url(body.code_verifier) !== connection.codeChallenge) return json(400, { error: 'invalid_grant' });
  if (connection.status !== 'pending') return json(400, { error: 'not_pending' });
  const joinable = await joinableStore(input.db, connection.siteOrigin, registered);
  if (!joinable.ok) return json(409, { error: joinable.reason });
  const store = joinable.store;
  if (store.siteId !== connection.siteId) return json(409, { error: 'owner_approval_required' });
  const proof = await input.proofFetch({ siteOrigin: connection.siteOrigin, connectionId: connection.connectionId, clientId: connection.clientId, service: connection.service, callbackUri: connection.callbackUri });
  if (!proof.ok) return json(403, { error: proof.reason });
  const mismatch = compareProofReceipt(proof.receipt, {
    version: 2, connection_id: connection.connectionId, challenge: connection.challenge,
    client_id: connection.clientId, service: connection.service, site_id: connection.siteId, site_origin: connection.siteOrigin,
    callback_uri: connection.callbackUri, code_challenge: connection.codeChallenge, expires_at: connection.expiresAt,
  });
  if (mismatch) return json(403, { error: mismatch });
  if (proof.receipt.expires_at > Date.now() + CONNECTION_MAX_LIFETIME_MS) return json(403, { error: 'proof_expires_too_far' });
  const approved = await approveConnectionAndBind(input.db, {
    connectionId: connection.connectionId, subject: store.subject, organizationId: store.organizationId, actorUserId: store.ownerUserId,
    siteId: connection.siteId, siteOrigin: connection.siteOrigin, service: connection.service,
    grant: registered.grants, registersStore: registered.registersStore, turnsOn: registered.turnsOn, ownerPresent: false,
  });
  if (!approved.ok) {
    // The owner's Disconnect or Revoke won inside the approval write: a connection still waiting
    // can only be approved by the owner now; one the Disconnect denied is over.
    const after = await loadStoreConnection(input.db, connection.connectionId);
    return json(409, { error: after?.status === 'pending' ? 'owner_approval_required' : approved.reason });
  }
  const answer = await exchangeStoreConnectionToken({ db: input.db, body, jwtPrivateJwk: input.jwtPrivateJwk, proofFetch: input.proofFetch });
  if (answer.ok && store.ownerEmail && input.noticeEmail) {
    const name = PLUGIN_NAMES[registered.plugin!] ?? registered.plugin!;
    const stores = `${input.baseUrl.replace(/\/$/, '')}/account/sites`;
    // Best effort: the plugin already has its key, and Your stores lists it either way.
    await input.noticeEmail.send({
      to: store.ownerEmail,
      from: { email: 'accounts@dinkuskit.com', name: 'DinkusKit' },
      subject: `${name} joined your store on DinkusKit`,
      text: `${name} joined ${connection.siteOrigin}, which ${store.businessName} already connected to DinkusKit.\n`
        + `If you didn't expect this, open Your stores and press Disconnect for ${name}:\n${stores}\n`,
    }).catch(() => undefined);
  }
  return answer;
}

export function connectionPreview(connection: StoreConnection) {
  return { protocolVersion: connection.protocolVersion, connectionId: connection.connectionId, service: connection.service, siteId: connection.siteId, siteOrigin: connection.siteOrigin, expiresAt: connection.expiresAt, status: connection.status, issuer: ACCOUNT_ISSUER, identityNote: 'This canonical site identity is shared across independently consented services.' };
}
export { TOKEN_TTL_MAX_SECONDS };
