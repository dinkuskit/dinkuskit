import { defineMiddleware } from 'astro:middleware';

const NAMESPACE = '/_emdash';

function isEmdashNamespace(pathname: string): boolean {
  return pathname === NAMESPACE || pathname.startsWith(`${NAMESPACE}/`);
}

/**
 * Production builds deny the entire `/_emdash` namespace before EmDash
 * runtime, setup, or auth. The only trusted unlock is Astro's compile-time
 * `import.meta.env.DEV`. Host, forwarded headers, Origin, cookies, query,
 * env/proof bindings, and fake identities are ignored.
 */
export const onRequest = defineMiddleware((context, next) => {
  if (import.meta.env.DEV) {
    return next();
  }
  if (!isEmdashNamespace(context.url.pathname)) {
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
