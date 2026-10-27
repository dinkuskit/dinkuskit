/**
 * Fail-closed `/_emdash` Access gate used before EmDash runtime.
 *
 * Production middleware calls official `authenticate` from
 * `@emdash-cms/cloudflare/auth`. Tests may inject a controlled verifier;
 * those cases are labeled and are not hosted Access proof.
 *
 * Installed EmDash `@emdash-cms/auth` Role.EDITOR is 40.
 *
 * Pathname canonicalization matches installed Astro 7.3.2
 * `validateAndDecodePathname` (iterative `decodeURI`, max 10) used by
 * `safeDecodePathname` in `core/routing/match-request.js`. Encoded slashes
 * and malformed encodings are fail-closed only when they are relevant to
 * the protected namespace. Public routes are not rewritten.
 */

export const EMDASH_NAMESPACE = '/_emdash';
export const INSTALLED_EDITOR_ROLE = 40;
export const ACCESS_AUDIENCE_ENV = 'CF_ACCESS_AUDIENCE';
export const ACCESS_TEAM_DOMAIN_ENV = 'EMDASH_ACCESS_TEAM_DOMAIN';
export const OPERATOR_ALLOWLIST_ENV = 'EMDASH_OPERATOR_ALLOWLIST';
export const OPERATOR_SERVICE_TOKENS_ENV = 'EMDASH_OPERATOR_SERVICE_TOKENS';
export const SERVICE_TOKEN_EMAIL_DOMAIN = 'tokens.invalid';

const MAX_DECODE_ITERATIONS = 10;

export function decodeRoutingPathname(pathname) {
  let decoded;
  try {
    decoded = decodeURI(pathname);
  } catch {
    throw new Error('Invalid URL encoding');
  }
  let iterations = 0;
  let current = pathname;
  while (decoded !== current) {
    if (iterations >= MAX_DECODE_ITERATIONS) {
      throw new Error('URL encoding depth exceeded');
    }
    current = decoded;
    try {
      decoded = decodeURI(current);
    } catch {
      break;
    }
    iterations++;
  }
  return decoded;
}

function decodeValidPercentSequences(pathname) {
  return pathname.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function lenientIterativeDecode(pathname) {
  let current = pathname;
  for (let i = 0; i < MAX_DECODE_ITERATIONS; i += 1) {
    const next = decodeValidPercentSequences(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function pathForNamespaceDetection(pathname) {
  return pathname.replace(/%2f/gi, '/').replace(/\/{2,}/g, '/');
}

function firstPathSegment(pathname) {
  return pathname.replace(/^\/+/, '').split('/')[0] ?? '';
}

function stripMalformedPercentSuffix(segment) {
  return segment
    .replace(/%[0-9A-Fa-f]?$/i, '')
    .replace(/%(?![0-9A-Fa-f]{2}).*$/i, '');
}

function looksLikeEmdashNamespace(pathname) {
  const path = pathForNamespaceDetection(pathname);
  return path === EMDASH_NAMESPACE || path.startsWith(`${EMDASH_NAMESPACE}/`);
}

function isNamespaceRelevantMalformed(pathname) {
  const lenient = pathForNamespaceDetection(lenientIterativeDecode(pathname));
  if (looksLikeEmdashNamespace(lenient)) return true;
  return stripMalformedPercentSuffix(firstPathSegment(lenient)) === '_emdash';
}

/**
 * Resolve whether a raw request pathname is public, protected, or a
 * malformed encoding that must fail closed because it is namespace-relevant.
 * Does not rewrite public paths.
 */
export function resolveNamespacePathname(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    return { kind: 'public', pathname: pathname || '/' };
  }

  try {
    const decoded = decodeRoutingPathname(pathname);
    if (looksLikeEmdashNamespace(decoded) || looksLikeEmdashNamespace(pathname)) {
      return { kind: 'protected', pathname: decoded };
    }
    return { kind: 'public', pathname };
  } catch {
    if (isNamespaceRelevantMalformed(pathname)) {
      return { kind: 'malformed-protected', pathname };
    }
    return { kind: 'public', pathname };
  }
}

/** True when the complete `/_emdash` namespace gate must apply. */
export function isEmdashNamespace(pathname) {
  return resolveNamespacePathname(pathname).kind !== 'public';
}

/** Prefer the raw href path so percent-encoded unreserved bytes are visible. */
export function requestPathname(request) {
  const href = typeof request?.url === 'string' ? request.url : '';
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+(\/[^?#]*)/.exec(href);
  if (match) return match[1];
  try {
    return new URL(href).pathname;
  } catch {
    return '/';
  }
}

export function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseOperatorAllowlist(value) {
  const raw = trimEnv(value);
  if (!raw) return [];
  return [...new Set(raw.split(/[,\n]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Service token common names (`<client_id>.access`), comma or newline
 * separated. Unset or empty means no service token is admitted.
 */
export function parseServiceTokenList(value) {
  return parseOperatorAllowlist(value);
}

/** Stable placeholder EmDash identity for an allowlisted service token. */
export function serviceTokenEmail(commonName) {
  const clientId = String(commonName).trim().toLowerCase().replace(/\.access$/, '');
  return `service+${clientId}@${SERVICE_TOKEN_EMAIL_DOMAIN}`;
}

export function readAccessGateConfig(env = {}) {
  return {
    teamDomain: trimEnv(env[ACCESS_TEAM_DOMAIN_ENV]),
    audience: trimEnv(env[ACCESS_AUDIENCE_ENV]),
    allowlist: parseOperatorAllowlist(env[OPERATOR_ALLOWLIST_ENV]),
    serviceTokens: parseServiceTokenList(env[OPERATOR_SERVICE_TOKENS_ENV]),
  };
}

export function accessConfigMissing(config) {
  const serviceTokens = config.serviceTokens ?? [];
  return (
    !config.teamDomain
    || !config.audience
    || (config.allowlist.length === 0 && serviceTokens.length === 0)
  );
}

export function officialAccessConfig(config) {
  return {
    teamDomain: config.teamDomain,
    audience: config.audience,
    audienceEnvVar: ACCESS_AUDIENCE_ENV,
    defaultRole: INSTALLED_EDITOR_ROLE,
    serviceTokens: config.serviceTokens ?? [],
  };
}

/** Same locations as official `extractAccessJwt`; no verification here. */
export function hasAccessJwt(request) {
  if (request.headers.get('Cf-Access-Jwt-Assertion')) return true;
  const cookies = request.headers.get('Cookie') || '';
  return /(?:^|;\s*)CF_Authorization=/.test(cookies);
}

export function deniedNamespaceResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

/** Upstream EmDash token prefixes (`@emdash-cms/auth` TOKEN_PREFIXES): API and OAuth access tokens. */
export const EMDASH_TOKEN_PREFIXES = ['ec_pat_', 'ec_oat_'];
export const AGENT_API_PREFIX = `${EMDASH_NAMESPACE}/api/`;
/**
 * EmDash API families an agent token may reach. Each one is outside EmDash's
 * public-route list, so EmDash checks the Bearer token (or answers 401) and
 * its scope on every request there. Public routes (snapshot, search, comments,
 * media files) skip Bearer checks and read a saved session instead, and sign-in,
 * setup, users, token management and plugin routes stay with people.
 */
export const AGENT_API_FAMILIES = ['mcp', 'content', 'schema', 'menus', 'taxonomies', 'media', 'sections', 'widget-areas', 'revisions'];
export const AGENT_API_CLOSED_PREFIXES = [`${AGENT_API_PREFIX}media/file`];

/**
 * True when the request carries an EmDash API or OAuth access token and no
 * cookie, so EmDash can only act on the token, never on a saved browser session.
 */
export function hasEmdashToken(request) {
  if (request.headers.has('Cookie')) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  return EMDASH_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix) && token.length > prefix.length);
}

/**
 * Decoded paths where an EmDash token may stand in for an Access sign-in: the
 * agent families above, matched exactly (EmDash routes are case-sensitive).
 * Empty or dot segments, backslashes and any escape left after decoding are
 * refused rather than normalized.
 */
export function isAgentApiPath(decodedPathname) {
  if (typeof decodedPathname !== 'string' || !decodedPathname.startsWith(AGENT_API_PREFIX)) return false;
  if (/\/\/|\/\.\.?(?:\/|$)|\\|%/.test(decodedPathname)) return false;
  const under = (prefix) => decodedPathname === prefix || decodedPathname.startsWith(`${prefix}/`);
  if (AGENT_API_CLOSED_PREFIXES.some(under)) return false;
  return AGENT_API_FAMILIES.some((family) => under(`${AGENT_API_PREFIX}${family}`));
}

/**
 * @param {object} input
 * @param {string} input.pathname
 * @param {Request} input.request
 * @param {Record<string, string | undefined>} [input.env]
 * @param {(request: Request, config: unknown) => Promise<{ email?: string, serviceToken?: string }>} [input.authenticate]
 * @param {() => Promise<boolean>} [input.hasActiveAdmin] Must resolve true only
 *   when the EmDash CMS already has an enabled Admin. Service tokens and EmDash tokens are denied
 *   when this is missing, false, or throws, so a token can never be the first
 *   user EmDash provisions (which it would make Admin).
 */
export async function evaluateAccessGate({ pathname, request, env = {}, authenticate, hasActiveAdmin }) {
  const resolved = resolveNamespacePathname(pathname);
  if (resolved.kind === 'public') {
    return { allow: true, reason: 'public' };
  }
  if (resolved.kind === 'malformed-protected') {
    return { allow: false, status: 404, reason: 'malformed-namespace' };
  }
  const config = readAccessGateConfig(env);
  if (accessConfigMissing(config)) {
    return { allow: false, status: 404, reason: 'missing-config' };
  }
  if (typeof authenticate !== 'function') {
    return { allow: false, status: 404, reason: 'missing-verifier' };
  }
  if (hasEmdashToken(request) && isAgentApiPath(resolved.pathname)) {
    // EmDash checks the token, its user and its scopes next. Tokens exist
    // only after a human Admin made them; refuse any before that.
    if (!(await adminExists(hasActiveAdmin))) {
      return { allow: false, status: 404, reason: 'token-before-admin' };
    }
    return { allow: true, reason: 'emdash-token' };
  }
  if (!hasAccessJwt(request)) {
    return { allow: false, status: 404, reason: 'unauthenticated' };
  }
  let identity;
  try {
    identity = await authenticate(request, officialAccessConfig(config));
  } catch {
    return { allow: false, status: 404, reason: 'unauthenticated' };
  }
  const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (typeof identity?.serviceToken === 'string') {
    // Set only by the service-token branch of the Access authenticate,
    // after signature, audience and issuer verification.
    const commonName = identity.serviceToken.trim().toLowerCase();
    const serviceTokens = config.serviceTokens ?? [];
    if (
      !commonName
      || !serviceTokens.includes(commonName)
      || email !== serviceTokenEmail(commonName)
    ) {
      return { allow: false, status: 404, reason: 'unknown-identity' };
    }
    // EmDash provisions the first user on an empty site as Admin whatever
    // role is passed. Admit service tokens only after a human Admin exists.
    if (!(await adminExists(hasActiveAdmin))) {
      return { allow: false, status: 404, reason: 'service-token-before-admin' };
    }
    return { allow: true, reason: 'service-token', email };
  }
  if (!email || !config.allowlist.includes(email)) {
    return { allow: false, status: 404, reason: 'unknown-identity' };
  }
  return { allow: true, reason: 'allowlisted', email };
}

async function adminExists(hasActiveAdmin) {
  try {
    return typeof hasActiveAdmin === 'function' && (await hasActiveAdmin()) === true;
  } catch {
    return false;
  }
}

/** EmDash ROLE_ADMIN. */
export const EMDASH_ADMIN_ROLE = 50;

/**
 * True when the EmDash CMS D1 database already has an enabled Admin user.
 * Any error (missing binding, missing table) resolves false: fail closed.
 */
export async function cmsHasActiveAdmin(db) {
  if (!db || typeof db.prepare !== 'function') return false;
  try {
    const row = await db
      .prepare('SELECT 1 AS ok FROM users WHERE role >= ? AND (disabled IS NULL OR disabled = 0) LIMIT 1')
      .bind(EMDASH_ADMIN_ROLE)
      .first();
    return Boolean(row && row.ok === 1);
  } catch {
    return false;
  }
}
