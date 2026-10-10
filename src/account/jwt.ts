import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import { ACCOUNT_ISSUER, REGISTERED_STORE_SERVICES, TOKEN_TTL_MAX_SECONDS, TOKEN_TTL_SECONDS, type StoreService } from './config.ts';
import { persistPublicJwk } from './store.ts';

export async function createEphemeralServiceKeys() {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const kid = `dinkuskit-account-es256-${crypto.randomUUID()}`;
  const publicJwk = { ...await exportJWK(publicKey), kid, alg: 'ES256', use: 'sig' } as JWK;
  const privateJwk = { ...await exportJWK(privateKey), kid, alg: 'ES256' } as JWK;
  return { kid, publicJwk, privateJwk };
}

function signingKeyFields(privateJwk: JWK): { kid: string; publicJwk: JsonWebKey } | null {
  if (
    privateJwk.kty !== 'EC'
    || privateJwk.crv !== 'P-256'
    || typeof privateJwk.d !== 'string'
    || typeof privateJwk.x !== 'string'
    || typeof privateJwk.y !== 'string'
    || typeof privateJwk.kid !== 'string'
    || !privateJwk.d
    || !privateJwk.x
    || !privateJwk.y
    || !privateJwk.kid
  ) {
    return null;
  }
  return {
    kid: privateJwk.kid,
    publicJwk: {
      kty: privateJwk.kty,
      crv: privateJwk.crv,
      x: privateJwk.x,
      y: privateJwk.y,
      kid: privateJwk.kid,
      alg: 'ES256',
      use: 'sig',
    } as JsonWebKey,
  };
}

export async function prepareInventoryAccess(input: {
  subject: string;
  siteId: string;
  privateJwkJson?: string;
  ttlSeconds?: number;
}): Promise<
  | { ok: true; token: string; expiresIn: number; kid: string; publicJwk: JsonWebKey }
  | { ok: false; reason: 'missing' | 'invalid' }
> {
  return prepareServiceAccess({ ...input, service: 'inventory' });
}

export async function prepareServiceAccess(input: {
  subject: string; siteId: string; service: StoreService; privateJwkJson?: string; ttlSeconds?: number;
}): Promise<
  | { ok: true; token: string; expiresIn: number; kid: string; publicJwk: JsonWebKey }
  | { ok: false; reason: 'missing' | 'invalid' }
> {
  if (!input.privateJwkJson) return { ok: false, reason: 'missing' };
  try {
    const privateJwk = JSON.parse(input.privateJwkJson) as JWK;
    const fields = signingKeyFields(privateJwk);
    if (!fields) return { ok: false, reason: 'invalid' };
    const privateKey = await importJWK(privateJwk, 'ES256');
    const ttlSeconds = Math.min(input.ttlSeconds ?? TOKEN_TTL_SECONDS, TOKEN_TTL_MAX_SECONDS);
    const issuedAt = Math.floor(Date.now() / 1000);
    const registered = REGISTERED_STORE_SERVICES.find(service => service.service === input.service);
    if (!registered) return { ok: false, reason: 'invalid' };
    const token = await new SignJWT({ site_id: input.siteId, scope: registered.scope })
      .setProtectedHeader({ alg: 'ES256', kid: fields.kid })
      .setIssuer(ACCOUNT_ISSUER)
      .setAudience(registered.audience)
      .setSubject(input.subject)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ttlSeconds)
      .sign(privateKey);
    return {
      ok: true,
      token,
      expiresIn: ttlSeconds,
      kid: fields.kid,
      publicJwk: fields.publicJwk,
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export async function issueInventoryAccess(input: {
  db: D1Database;
  subject: string;
  siteId: string;
  privateJwkJson: string;
  ttlSeconds?: number;
}) {
  const prepared = await prepareInventoryAccess(input);
  if (!prepared.ok) {
    throw new Error(prepared.reason === 'missing' ? 'signing_key_unavailable' : 'invalid_signing_key');
  }
  await persistPublicJwk(input.db, prepared.kid, prepared.publicJwk);
  return {
    token: prepared.token,
    expiresIn: prepared.expiresIn,
    claims: {
      iss: ACCOUNT_ISSUER,
      sub: input.subject,
      aud: 'inventory',
      site_id: input.siteId,
      scope: 'inventory:admin',
    },
  };
}

export { createEphemeralServiceKeys as createLocalTestKeys };
