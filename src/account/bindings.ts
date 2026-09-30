import { env } from 'cloudflare:workers';
import { applyPendingMerchantMigrations } from './migrate.ts';
import { MerchantUnavailableError, type MerchantEmailBinding, type MerchantEnv } from './config.ts';

function cf(): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

/** Production bindings only. Test KV names are never read here. */
export function readMerchantEnv(): MerchantEnv {
  const raw = cf();
  const db = raw.MERCHANT_DB as D1Database | undefined;
  const secret = typeof raw.MERCHANT_AUTH_SECRET === 'string' ? raw.MERCHANT_AUTH_SECRET : '';
  const baseURL = typeof raw.MERCHANT_BASE_URL === 'string' ? raw.MERCHANT_BASE_URL : '';
  if (!db || !secret.trim() || !baseURL.trim()) throw new MerchantUnavailableError();
  try {
    const parsed = new URL(baseURL);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new MerchantUnavailableError();
  } catch {
    throw new MerchantUnavailableError();
  }
  return {
    MERCHANT_DB: db,
    MERCHANT_AUTH_SECRET: secret,
    MERCHANT_BASE_URL: baseURL,
    EMAIL: raw.EMAIL as MerchantEmailBinding | undefined,
    MERCHANT_JWT_PRIVATE_JWK: typeof raw.MERCHANT_JWT_PRIVATE_JWK === 'string' ? raw.MERCHANT_JWT_PRIVATE_JWK : undefined,
  };
}

export async function getMerchantEnv(): Promise<MerchantEnv> {
  const resolved = readMerchantEnv();
  await applyPendingMerchantMigrations(resolved.MERCHANT_DB);
  return resolved;
}
