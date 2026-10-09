import { hasPermission, Role, type User } from '@emdash-cms/auth';
import { createKyselyAdapter } from '@emdash-cms/auth/adapters/kysely';
import { getInjectedTransports } from './transports.ts';

export type CmsApprovalActor = Pick<User, 'id' | 'email' | 'role' | 'disabled'>;

export function canonicalCmsOrigin(request: Request, configured: string, allowLocalDevelopment = false): string | null {
  let expected: URL;
  let actual: URL;
  try {
    expected = new URL(configured);
    actual = new URL(request.url);
  } catch {
    return null;
  }
  if (expected.pathname !== '/' && expected.pathname !== '') return null;
  if (actual.origin === expected.origin) return expected.origin;
  if (allowLocalDevelopment && (actual.hostname === '127.0.0.1' || actual.hostname === 'localhost')) {
    return actual.origin;
  }
  return null;
}

export function rejectNonCanonicalCmsMutation(request: Request, configured: string, allowLocalDevelopment = false): Response | null {
  const origin = canonicalCmsOrigin(request, configured, allowLocalDevelopment);
  if (!origin || request.headers.get('origin') !== origin) {
    return new Response(JSON.stringify({ error: 'invalid_cms_provenance' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  }
  return null;
}

/** Re-read the CMS identity through EmDash's public auth adapter, never CMS SQL. */
export async function currentCmsAdmin(sessionUser: User | undefined, db: Parameters<typeof createKyselyAdapter>[0]): Promise<CmsApprovalActor | null> {
  if (!sessionUser) return null;
  const current = await createKyselyAdapter(db).getUserById(sessionUser.id);
  if (!current || current.disabled || current.role !== Role.ADMIN || !hasPermission(current, 'users:manage')) return null;
  return { id: current.id, email: current.email, role: current.role, disabled: current.disabled };
}

/** Production admits only this site; a separate local test entry can admit its loopback origin. */
export function approvalOrigin(request: Request, dev = false): string | null {
  const origin = canonicalCmsOrigin(request, 'https://dinkuskit.com', dev);
  if (origin) return origin;
  const proofOrigin = getInjectedTransports().testSiteOrigin;
  if (!proofOrigin) return null;
  const proof = new URL(proofOrigin);
  if (!['localhost', '127.0.0.1'].includes(proof.hostname)) return null;
  return canonicalCmsOrigin(request, proofOrigin);
}
