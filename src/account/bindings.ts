import { readShipSandboxRegistration } from './ship-recipient.ts';
import { env } from 'cloudflare:workers';
import { applyPendingMerchantMigrations } from './migrate.ts';
import { MerchantUnavailableError, type MerchantEmailBinding, type MerchantEnv } from './config.ts';

function cf(): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

/** Accepted root http(s) config becomes URL.origin so CSRF and Better Auth share one origin. */
function canonicalMerchantBaseURL(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MerchantUnavailableError();
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new MerchantUnavailableError();
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new MerchantUnavailableError();
  if (parsed.pathname !== '/' && parsed.pathname !== '') throw new MerchantUnavailableError();
  return parsed.origin;
}

/** Production bindings only. Test KV names are never read here. */
export function readMerchantEnv(): MerchantEnv {
  const raw = cf();
  const db = raw.MERCHANT_DB as D1Database | undefined;
  const secret = typeof raw.MERCHANT_AUTH_SECRET === 'string' ? raw.MERCHANT_AUTH_SECRET : '';
  const baseURL = typeof raw.MERCHANT_BASE_URL === 'string' ? raw.MERCHANT_BASE_URL : '';
  if (!db || !secret.trim() || !baseURL.trim()) throw new MerchantUnavailableError();
  return {
    SHIP_SANDBOX_REGISTRATION: readShipSandboxRegistration(raw.SHIP_SANDBOX_REGISTRATION),
    MERCHANT_DB: db,
    MERCHANT_AUTH_SECRET: secret,
    MERCHANT_BASE_URL: canonicalMerchantBaseURL(baseURL),
    EMAIL: raw.EMAIL as MerchantEmailBinding | undefined,
    MERCHANT_JWT_PRIVATE_JWK: typeof raw.MERCHANT_JWT_PRIVATE_JWK === 'string' ? raw.MERCHANT_JWT_PRIVATE_JWK : undefined,
  };
}

// Each isolate checks the merchant schema once, and later requests skip its D1 round trips. A flag,
// not a shared promise, so no request waits on D1 calls another request started and may abandon.
let merchantSchemaChecked = false;

export async function getMerchantEnv(): Promise<MerchantEnv> {
  const resolved = readMerchantEnv();
  if (!merchantSchemaChecked) {
    await applyPendingMerchantMigrations(resolved.MERCHANT_DB);
    merchantSchemaChecked = true;
  }
  return resolved;
}
