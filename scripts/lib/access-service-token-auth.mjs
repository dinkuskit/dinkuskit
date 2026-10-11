/**
 * Cloudflare Access authenticate for the `/_emdash` gate and EmDash runtime.
 *
 * Users: delegates to official `authenticate` from
 * `@emdash-cms/cloudflare/auth` unchanged (JWT verification plus the Access
 * get-identity lookup).
 *
 * Service tokens: their JWT carries `common_name` (`<client_id>.access`) and
 * no email, and the get-identity lookup fails for them. The JWT is verified
 * here exactly as the official provider does (team JWKS signature, `aud`,
 * `iss`, 60 s clock tolerance). Only then, and only when the common name is
 * listed in `EMDASH_OPERATOR_SERVICE_TOKENS`, does it return a stable
 * placeholder identity `service+<client_id>@tokens.invalid` with the EmDash
 * Editor role. EmDash's external-auth middleware looks that email up and
 * provisions the user only when missing. Everything else throws, which the
 * gate turns into the generic 404.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  ACCESS_AUDIENCE_ENV,
  INSTALLED_EDITOR_ROLE,
  OPERATOR_SERVICE_TOKENS_ENV,
  parseServiceTokenList,
  serviceTokenEmail,
  trimEnv,
} from './access-namespace-gate.mjs';

const CF_AUTHORIZATION_COOKIE_REGEX = /(?:^|;\s*)CF_Authorization=([^;]+)/;
const jwksCache = new Map();

function defaultGetKey(teamDomain) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/** Same locations and precedence as official `extractAccessJwt`. */
export function extractAccessJwt(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  return (request.headers.get('Cookie') || '').match(CF_AUTHORIZATION_COOKIE_REGEX)?.[1] || null;
}

function resolveAudience(config, env) {
  if (config?.audience) return config.audience;
  const value = trimEnv(env[config?.audienceEnvVar ?? ACCESS_AUDIENCE_ENV]);
  if (value) return value;
  throw new Error('Access audience not configured');
}

function resolveServiceTokens(config, env) {
  if (Array.isArray(config?.serviceTokens)) {
    return config.serviceTokens.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
  }
  return parseServiceTokenList(env[OPERATOR_SERVICE_TOKENS_ENV]);
}

/** A verified Access payload is a service token when it has a common name and no email. */
export function isServiceTokenPayload(payload) {
  const commonName = typeof payload?.common_name === 'string' ? payload.common_name.trim() : '';
  const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
  return Boolean(commonName) && !email;
}

/**
 * @param {object} [options]
 * @param {(request: Request, config: unknown) => Promise<any>} options.officialAuthenticate
 * @param {(teamDomain: string) => any} [options.getKey] JWKS resolver (tests inject a local key set)
 * @param {Record<string, string | undefined>} [options.env] defaults to process.env
 */
export function createAccessAuthenticate({ officialAuthenticate, getKey = defaultGetKey, env } = {}) {
  if (typeof officialAuthenticate !== 'function') {
    throw new Error('officialAuthenticate is required');
  }
  return async function authenticate(request, config) {
    const teamDomain = typeof config?.teamDomain === 'string' ? config.teamDomain.trim() : '';
    if (!teamDomain) throw new Error('Invalid Cloudflare Access config: teamDomain is required');
    const jwt = extractAccessJwt(request);
    if (!jwt) throw new Error('No Access JWT present');
    const runtimeEnv = env ?? (typeof process !== 'undefined' ? process.env : {});
    const { payload } = await jwtVerify(jwt, getKey(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: resolveAudience(config, runtimeEnv),
      clockTolerance: 60,
    });
    if (!isServiceTokenPayload(payload)) {
      return officialAuthenticate(request, config);
    }
    const commonName = payload.common_name.trim().toLowerCase();
    if (!resolveServiceTokens(config, runtimeEnv).includes(commonName)) {
      throw new Error('Service token not allowed');
    }
    const email = serviceTokenEmail(commonName);
    return {
      email,
      name: `Service token ${commonName.replace(/\.access$/, '')}`,
      role: INSTALLED_EDITOR_ROLE,
      subject: payload.sub || commonName,
      serviceToken: commonName,
      metadata: { serviceToken: true },
    };
  };
}
