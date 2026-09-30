import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet, type JWK } from 'jose';
import { assertServicePair, canonicalAccountId, PROOF_ISSUER, type ServiceAudience, type ServiceScope } from './identity.ts';

/**
 * Proof-only ES256 service JWT issuer for local compatibility checks.
 * This is not a production identity provider and is not an EmDash auth surface.
 */
export async function createProofServiceIssuer(options: {
  issuer?: string;
  tokenTtlSeconds?: number;
  now?: () => number;
} = {}) {
  const issuer = options.issuer ?? PROOF_ISSUER;
  const defaultTtlSeconds = options.tokenTtlSeconds ?? 300;
  const now = options.now ?? (() => Date.now());
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const kid = 'proof-es256';
  const jwk: JWK = { ...publicJwk, kid, alg: 'ES256', use: 'sig' };
  const jwks: JSONWebKeySet = { keys: [jwk] };

  return {
    issuer,
    jwks,
    kid,
    tokenTtlSeconds: defaultTtlSeconds,
    async issue(input: {
      subject: string;
      siteId: string;
      audience: ServiceAudience;
      scope: ServiceScope;
      ttlSeconds?: number;
    }) {
      assertServicePair(input.audience, input.scope);
      const ttlSeconds = input.ttlSeconds ?? defaultTtlSeconds;
      const issuedAt = Math.floor(now() / 1000);
      const jwt = await new SignJWT({ site_id: input.siteId, scope: input.scope })
        .setProtectedHeader({ alg: 'ES256', kid })
        .setIssuer(issuer)
        .setAudience(input.audience)
        .setSubject(input.subject)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ttlSeconds)
        .sign(privateKey);
      return {
        token: jwt,
        claims: {
          iss: issuer,
          sub: input.subject,
          aud: input.audience,
          site_id: input.siteId,
          scope: input.scope,
          iat: issuedAt,
          exp: issuedAt + ttlSeconds,
          accountId: canonicalAccountId(issuer, input.subject),
        },
      };
    },
  };
}

export type ProofServiceIssuer = Awaited<ReturnType<typeof createProofServiceIssuer>>;
