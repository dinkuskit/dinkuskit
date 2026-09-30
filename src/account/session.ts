import type { MerchantAuth } from './auth.ts';
import type { MerchantAccountRow } from './store.ts';
import { loadMerchantAccountByUserId } from './store.ts';

export type ResolvedMerchant = {
  userId: string;
  email: string;
  subject: string;
  accountId: string;
};

/** Session cookie is only a locator. Disabled/access always re-reads D1. */
export async function resolveMerchant(auth: MerchantAuth, db: D1Database, request: Request): Promise<ResolvedMerchant | null> {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user?.id) return null;
  const account = await loadCurrentMerchant(db, result.user.id);
  if (!account) return null;
  return {
    userId: result.user.id,
    email: result.user.email,
    subject: account.subject,
    accountId: account.accountId,
  };
}

export async function loadCurrentMerchant(db: D1Database, userId: string): Promise<MerchantAccountRow | null> {
  const account = await loadMerchantAccountByUserId(db, userId);
  if (!account || account.disabled) return null;
  return account;
}
