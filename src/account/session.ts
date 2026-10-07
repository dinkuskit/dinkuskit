import type { MerchantAuth } from './auth.ts';
import type { MerchantAccountRow } from './store.ts';
import { loadMerchantAccountByUserId } from './store.ts';
import { listMemberships, selectOrganization } from './organizations.ts';
import { authorizeOrganization } from './organizations.ts';
import { canonicalAccountId } from './identity.ts';
import { ACCOUNT_ISSUER } from './config.ts';

export type ResolvedMerchant = {
  userId: string;
  email: string;
  subject: string;
  accountId: string;
  organizationId: string;
};

export type AuthenticatedLogin = { userId: string; email: string };

export async function resolveLogin(auth: MerchantAuth, db: D1Database, request: Request): Promise<AuthenticatedLogin | null> {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user?.id) return null;
  const account = await loadMerchantAccountByUserId(db, result.user.id);
  if (!account || account.disabled) return null;
  return { userId: result.user.id, email: result.user.email };
}

/** Login authenticates the person; selected current membership authorizes the business. */
export async function resolveMerchant(auth: MerchantAuth, db: D1Database, request: Request): Promise<ResolvedMerchant | null> {
  const login = await resolveLogin(auth, db, request);
  if (!login) return null;
  const account = await loadCurrentMerchant(db, login.userId);
  return account ? { ...login, subject: account.subject, accountId: account.accountId, organizationId: account.organizationId } : null;
}

export async function loadCurrentMerchant(db: D1Database, userId: string): Promise<(MerchantAccountRow & { organizationId: string }) | null> {
  const account = await loadMerchantAccountByUserId(db, userId);
  if (!account || account.disabled) return null;
  const memberships = await listMemberships(db, userId);
  const selectedRow = await db.prepare(
    `SELECT o.organization_id, o.authority_subject
     FROM dinkuskit_user_selection s
     JOIN dinkuskit_organization o ON o.organization_id = s.organization_id
     WHERE s.user_id = ?`,
  ).bind(userId).first<{ organization_id: string; authority_subject: string }>();
  if (selectedRow) {
    const selected = await authorizeOrganization(db, userId, selectedRow.organization_id);
    if (!selected) return null;
    return {
      ...account,
      subject: selected.authoritySubject,
      accountId: canonicalAccountId(ACCOUNT_ISSUER, selected.authoritySubject),
      organizationId: selected.organizationId,
    };
  }
  const fallback = memberships.find(item => item.status === 'active' || item.status === 'pending_operator');
  if (!fallback) return null;
  const organizationId = fallback.organizationId;
  await selectOrganization(db, userId, organizationId);
  return {
    ...account,
    subject: fallback.authoritySubject,
    accountId: canonicalAccountId(ACCOUNT_ISSUER, fallback.authoritySubject),
    organizationId,
  };
}
