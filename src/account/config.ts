/** Production issuer is config, never the request Host. */
export const ACCOUNT_ISSUER = 'https://dinkuskit.com/account';
export const ACCOUNT_COOKIE_PREFIX = 'dk-merchant';
export const ACCOUNT_BASE_PATH = '/api/auth';
export const MERCHANT_DB_BINDING = 'MERCHANT_DB';

export const INVENTORY_CLIENT_ID = 'dinkus-inventory-emdash';
export const INVENTORY_SERVICE = 'inventory';
export const INVENTORY_SCOPE = 'inventory:admin';
export const INVENTORY_CALLBACK_PATH = '/_emdash/admin/plugins/dinkus-inventory/inventory';
export const INVENTORY_PROOF_PATH = '/_emdash/api/plugins/dinkus-inventory/store-proof';
export const CONNECTION_MAX_LIFETIME_MS = 600_000;
export const TOKEN_TTL_SECONDS = 300;
export const TOKEN_TTL_MAX_SECONDS = 600;
export const PROOF_FETCH_TIMEOUT_MS = 3_000;
export const PROOF_FETCH_MAX_BYTES = 8_192;
export const CURRENT_MERCHANT_SCHEMA_VERSION = 3;

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
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  if (candidate.includes('://')) return fallback;
  if (candidate.includes('\\')) return fallback;
  if (!candidate.startsWith('/account')) return fallback;
  return candidate;
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

export function unavailableResponse(reason = 'merchant_unavailable'): Response {
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
