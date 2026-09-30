import { defineMiddleware } from 'astro:middleware';

const NAMESPACE = '/_emdash';

function isEmdashNamespace(pathname: string): boolean {
  return pathname === NAMESPACE || pathname.startsWith(`${NAMESPACE}/`);
}

/**
 * Fixture-only editor unlock. Allows `/_emdash` when the request URL host is
 * loopback. Host/forwarded headers are ignored. Production astro.config.mjs
 * does not import this file.
 */
export const onRequest = defineMiddleware((context, next) => {
  if (!isEmdashNamespace(context.url.pathname)) {
    return next();
  }
  if (context.url.hostname === '127.0.0.1' || context.url.hostname === '[::1]') {
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
