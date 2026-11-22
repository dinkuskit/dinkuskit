import { defineMiddleware } from 'astro:middleware';
import { isProtectedAccountPath, MerchantUnavailableError, safeAccountPath, seeOther, unavailableResponse } from './account/config.ts';
import { getMerchantEnv } from './account/bindings.ts';
import { createMerchantRuntime } from './account/auth.ts';
import { resolveLogin, resolveMerchant } from './account/session.ts';
import { canonicalRedirect } from './seo.ts';

function setHeaderSafe(response: Response, name: string, value: string): Response {
  try {
    response.headers.set(name, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function applySeoHeaders(url: URL, response: Response): Response {
  let out = response;
  if (
    url.hostname.toLowerCase() === 'dinkuskit.com'
    && url.protocol === 'https:'
    && !out.headers.has('strict-transport-security')
  ) {
    out = setHeaderSafe(out, 'Strict-Transport-Security', 'max-age=31536000');
  }
  if (
    (url.pathname === '/account' || url.pathname.startsWith('/account/'))
    && !out.headers.has('x-robots-tag')
  ) {
    out = setHeaderSafe(out, 'X-Robots-Tag', 'noindex, nofollow');
  }
  return out;
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.merchant = null;
  context.locals.login = null;
  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const redirect = canonicalRedirect(context.url, context.request);
    if (redirect) return Response.redirect(redirect.toString(), 308);
  }
  const finish = async (promise: Promise<Response> | Response) => applySeoHeaders(context.url, await promise);
  // This narrow surface authenticates the site's CMS user in its own handlers.
  if (context.url.pathname === '/account/organization-approvals' || context.url.pathname.startsWith('/account/organization-approvals/')) return finish(next());
  if (!context.url.pathname.startsWith('/account') && !context.url.pathname.startsWith('/api/auth')) {
    return finish(next());
  }
  try {
    const env = await getMerchantEnv();
    const runtime = createMerchantRuntime(env);
    context.locals.login = await resolveLogin(runtime.auth, env.MERCHANT_DB, context.request);
    context.locals.merchant = await resolveMerchant(runtime.auth, env.MERCHANT_DB, context.request);
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return finish(unavailableResponse('merchant_unavailable', context.request));
    throw error;
  }
  // Ship's sign-in answers Ship itself, signed in or not, and needs no selected business.
  if (context.url.pathname === '/account/ship-sign-in') return finish(next());
  if (isProtectedAccountPath(context.url.pathname) && !context.locals.merchant) {
    if (context.locals.login) {
      if (context.url.pathname === '/account' || context.url.pathname === '/account/logout' || context.url.pathname === '/account/operator/inventory') return finish(next());
      return finish(seeOther('/account?error=organization_required'));
    }
    const candidate = context.url.pathname + context.url.search;
    const continuation = safeAccountPath(candidate, '');
    if (continuation && continuation !== '/account') {
      return finish(seeOther(`/account/sign-in?callbackURL=${encodeURIComponent(continuation)}`));
    }
    return finish(seeOther('/account/sign-in'));
  }
  return finish(next());
});
