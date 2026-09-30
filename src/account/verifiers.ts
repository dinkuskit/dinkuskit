import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { canonicalAccountId, type ServiceAudience, type ServiceScope } from './identity.ts';

export type CompatibilityPrincipal = { accountId: string; siteId: string };

function bearer(request: Request): string {
  const match = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new Error('unauthorized');
  return match[1];
}

function requireSiteClaim(payload: { site_id?: unknown; sub?: unknown; scope?: unknown }, requiredScope: string): { sub: string; siteId: string } {
  if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 200) throw new Error('unauthorized');
  if (typeof payload.site_id !== 'string' || !payload.site_id.trim() || payload.site_id.length > 200) throw new Error('unauthorized');
  if (typeof payload.scope !== 'string' || !payload.scope.split(' ').includes(requiredScope)) throw new Error('unauthorized');
  return { sub: payload.sub, siteId: payload.site_id };
}

/** Proof-only compatibility check of the published Inventory verifier contract. Not that service's source. */
export function createInventoryCompatibilityVerifier(config: { issuer: string; audience: 'inventory'; jwks: JSONWebKeySet }) {
  if (new URL(config.issuer).protocol !== 'https:') throw new Error('Account issuer and JWKS must use HTTPS');
  const resolveKey = createLocalJWKSet(config.jwks);
  return async (request: Request): Promise<CompatibilityPrincipal> => {
    const { payload } = await jwtVerify(bearer(request), resolveKey, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['exp', 'sub', 'iat'],
    });
    const { sub, siteId } = requireSiteClaim(payload, 'inventory:admin');
    if (request.headers.get('x-inventory-site') !== siteId) throw new Error('unauthorized');
    return { accountId: canonicalAccountId(config.issuer, sub), siteId };
  };
}

/** Proof-only compatibility check of the published Payments verifier contract. Not that service's source. */
export function createPaymentsCompatibilityVerifier(config: { issuer: string; audience: 'dinkus-payments'; jwks: JSONWebKeySet }) {
  if (new URL(config.issuer).protocol !== 'https:' || !config.audience) throw new Error('invalid_identity_configuration');
  const resolveKey = createLocalJWKSet(config.jwks);
  return async (request: Request, scope: Extract<ServiceScope, 'payments:admin' | 'payments:checkout'>): Promise<CompatibilityPrincipal> => {
    const { payload } = await jwtVerify(bearer(request), resolveKey, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['exp', 'iat', 'sub'],
      maxTokenAge: '1h',
    });
    const { sub, siteId } = requireSiteClaim(payload, scope);
    if (request.headers.get('x-dinkus-site') !== siteId) throw new Error('unauthorized');
    return { accountId: canonicalAccountId(config.issuer, sub), siteId };
  };
}

export type { ServiceAudience };
