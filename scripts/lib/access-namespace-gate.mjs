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

export function readAccessGateConfig(env = {}) {
  return {
    teamDomain: trimEnv(env[ACCESS_TEAM_DOMAIN_ENV]),
    audience: trimEnv(env[ACCESS_AUDIENCE_ENV]),
    allowlist: parseOperatorAllowlist(env[OPERATOR_ALLOWLIST_ENV]),
  };
}

export function accessConfigMissing(config) {
  return !config.teamDomain || !config.audience || config.allowlist.length === 0;
}

export function officialAccessConfig(config) {
  return {
    teamDomain: config.teamDomain,
    audience: config.audience,
    audienceEnvVar: ACCESS_AUDIENCE_ENV,
    defaultRole: INSTALLED_EDITOR_ROLE,
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

/**
 * @param {object} input
 * @param {string} input.pathname
 * @param {Request} input.request
 * @param {Record<string, string | undefined>} [input.env]
 * @param {(request: Request, config: unknown) => Promise<{ email?: string }>} [input.authenticate]
 */
export async function evaluateAccessGate({ pathname, request, env = {}, authenticate }) {
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
  if (!email || !config.allowlist.includes(email)) {
    return { allow: false, status: 404, reason: 'unknown-identity' };
  }
  return { allow: true, reason: 'allowlisted', email };
}
