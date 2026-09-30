import { defineMiddleware } from 'astro:middleware';

const NAMESPACE = '/_emdash';
const CMS_PROOF_ALS = Symbol.for('dinkuskit.cms.proof.als');

function normalizePathname(pathname: string): string {
  let path = pathname.split('?')[0]?.split('#')[0] ?? pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the raw path when it is not valid percent-encoding
  }
  return path.replace(/\/{2,}/g, '/');
}

function isEmdashNamespace(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === NAMESPACE || path.startsWith(`${NAMESPACE}/`);
}

function cmsProofEntered(): boolean {
  const store = (globalThis as Record<symbol, { getStore?: () => unknown } | undefined>)[CMS_PROOF_ALS];
  if (!store || typeof store.getStore !== 'function') return false;
  try {
    return store.getStore() === true;
  } catch {
    return false;
  }
}

/**
 * Production builds deny the entire `/_emdash` namespace before EmDash
 * runtime, setup, or auth. Trusted unlocks are compile-time
 * `import.meta.env.DEV` and a request-scoped CMS proof ALS that only a
 * separate fixture entry may create and enter. Production never initializes
 * or enters that store. Host, forwarded headers, Origin, cookies, query,
 * env/proof bindings, and fake identities are ignored.
 */
export const onRequest = defineMiddleware((context, next) => {
  if (import.meta.env.DEV || cmsProofEntered()) {
    return next();
  }
  const pathnames = [context.url.pathname];
  try {
    pathnames.push(new URL(context.request.url).pathname);
  } catch {
    // request URL is already represented by context.url
  }
  if (!pathnames.some(isEmdashNamespace)) {
    return next();
  }
  return new Response('Not Found', {
    status: 404,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
});
