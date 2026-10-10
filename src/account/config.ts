/** Production issuer is config, never the request Host. */
export const ACCOUNT_ISSUER = 'https://dinkuskit.com/account';
export const ACCOUNT_COOKIE_PREFIX = 'dk-merchant';
export const SIGNUP_ATTEMPT_COOKIE = 'dk-signup-attempt';
export const ACCOUNT_BASE_PATH = '/api/auth';
export const MERCHANT_DB_BINDING = 'MERCHANT_DB';

export const INVENTORY_CLIENT_ID = 'dinkus-inventory-emdash';
export const INVENTORY_SERVICE = 'inventory';
export const INVENTORY_SCOPE = 'inventory:admin';
// Config-managed local installation only; no Registry publisher is assigned yet.
export const INVENTORY_CALLBACK_PATH = '/_emdash/admin/plugins/dinkus-inventory/inventory';
export const INVENTORY_PROOF_PATH = '/_emdash/api/plugins/dinkus-inventory/store-proof';
export const PAYMENTS_CLIENT_ID = 'dinkus-payments-emdash';
export const PAYMENTS_SERVICE = 'payments';
export const PAYMENTS_SCOPE = 'payments:admin';
// EmDash 1.2 Registry ID for the approved publisher DID + package slug.
// This fixed registration is not caller-supplied installation attestation.
export const PAYMENTS_REGISTRY_IDENTITY = {
  publisherDid: 'did:plc:ekk4pjmkh3k3ql2kfoex3qt4',
  slug: 'dinkus-payments',
  installedPluginId: 'r_3brsc2on3bu673rn',
} as const;
export const PAYMENTS_CALLBACK_PATH = '/_emdash/admin/plugins/r_3brsc2on3bu673rn/status';
export const PAYMENTS_PROOF_PATH = '/_emdash/api/plugins/r_3brsc2on3bu673rn/store-proof';
export const STORE_CONNECTION_PROTOCOL_VERSION = 2;
export type StoreService = 'inventory' | 'payments';
export type RegisteredStoreService = {
  clientId: string;
  service: StoreService;
  callbackPath: string;
  proofPath: string;
  audience: string;
  scope: string;
};
export const REGISTERED_STORE_SERVICES: readonly RegisteredStoreService[] = [
  { clientId: INVENTORY_CLIENT_ID, service: INVENTORY_SERVICE, callbackPath: INVENTORY_CALLBACK_PATH, proofPath: INVENTORY_PROOF_PATH, audience: 'inventory', scope: INVENTORY_SCOPE },
  { clientId: PAYMENTS_CLIENT_ID, service: PAYMENTS_SERVICE, callbackPath: PAYMENTS_CALLBACK_PATH, proofPath: PAYMENTS_PROOF_PATH, audience: 'dinkus-payments', scope: PAYMENTS_SCOPE },
];
export const CONNECTION_MAX_LIFETIME_MS = 600_000;
export const TOKEN_TTL_SECONDS = 300;
export const TOKEN_TTL_MAX_SECONDS = 600;
export const PROOF_FETCH_TIMEOUT_MS = 3_000;
export const PROOF_FETCH_MAX_BYTES = 8_192;
export const CURRENT_MERCHANT_SCHEMA_VERSION = 8;

export const PUBLIC_ACCOUNT_PATHS = [
  '/account/signup',
  '/account/sign-in',
  '/account/recover',
  '/account/check-email',
];

export function isPublicAccountPath(pathname: string): boolean {
  return PUBLIC_ACCOUNT_PATHS.includes(pathname);
}

export function isProtectedAccountPath(pathname: string): boolean {
  if (!pathname.startsWith('/account')) return false;
  if (pathname === '/account/.well-known/jwks.json') return false;
  if (isPublicAccountPath(pathname)) return false;
  return true;
}

export function safeAccountPath(candidate: string | null | undefined, fallback = '/account'): string {
  if (!candidate || typeof candidate !== 'string') return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  if (candidate.includes('://')) return fallback;
  if (candidate.includes('\\')) return fallback;
  if (candidate.includes('\0') || candidate.includes('\r') || candidate.includes('\n')) return fallback;

  try {
    const url = new URL(candidate, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    if (url.pathname !== '/account' && !url.pathname.startsWith('/account/')) return fallback;

    const decodedPath = decodeURIComponent(url.pathname).toLowerCase();
    if (decodedPath.includes('_emdash')) return fallback;

    if (url.pathname === '/account/connect') {
      const keys = Array.from(url.searchParams.keys());
      if (keys.length !== 1 || keys[0] !== 'connection_id') return fallback;
      const allValues = url.searchParams.getAll('connection_id');
      if (allValues.length !== 1) return fallback;
      const connId = allValues[0];
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(connId)) return fallback;
      return `/account/connect?connection_id=${encodeURIComponent(connId)}`;
    }

    if (url.search) return fallback;
    return url.pathname;
  } catch {
    return fallback;
  }
}

export type MerchantMailIntent = 'signup' | 'signin' | 'recovery';

export type MerchantEnv = {
  MERCHANT_DB: D1Database;
  MERCHANT_AUTH_SECRET: string;
  MERCHANT_BASE_URL: string;
  EMAIL?: MerchantEmailBinding;
  MERCHANT_JWT_PRIVATE_JWK?: string;
};

export type MerchantEmailBinding = {
  send: (message: {
    to: string | string[];
    from: { email: string; name?: string } | string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }) => Promise<{ messageId?: string }>;
};

export class MerchantUnavailableError extends Error {
  readonly status = 503;
  constructor(message = 'merchant_unavailable') {
    super(message);
    this.name = 'MerchantUnavailableError';
  }
}

const SETUP_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Accounts are being set up | DinkusKit</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:3rem 1rem;color:#18231c;background:#f7f8f4}main{max-width:32rem;margin:0 auto}a{color:#215d43}</style></head><body><main><p><a href="/">DinkusKit</a></p><h1>Accounts are being set up</h1><p>Sign-up and sign-in on DinkusKit.com are not switched on yet. Please try again soon.</p></main></body></html>`;

/** Browsers get a plain page; API and service callers keep the JSON error. */
function wantsPage(request?: Request): boolean {
  if (!request || (request.method !== 'GET' && request.method !== 'HEAD')) return false;
  return (request.headers.get('accept') ?? '').includes('text/html');
}

export function unavailableResponse(reason = 'merchant_unavailable', request?: Request): Response {
  if (reason === 'merchant_unavailable' && wantsPage(request)) {
    return new Response(SETUP_PAGE, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'retry-after': '3600' },
    });
  }
  return new Response(JSON.stringify({ error: reason }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

export function seeOther(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: path, 'cache-control': 'private, no-store' },
  });
}
