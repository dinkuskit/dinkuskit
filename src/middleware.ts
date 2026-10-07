import { defineMiddleware } from 'astro:middleware';
import { isProtectedAccountPath, MerchantUnavailableError, safeAccountPath, seeOther, unavailableResponse } from './account/config.ts';
import { getMerchantEnv } from './account/bindings.ts';
import { createMerchantRuntime } from './account/auth.ts';
import { resolveLogin, resolveMerchant } from './account/session.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.merchant = null;
  context.locals.login = null;
  if (!context.url.pathname.startsWith('/account') && !context.url.pathname.startsWith('/api/auth')) {
    return next();
  }
  try {
    const env = await getMerchantEnv();
    const runtime = createMerchantRuntime(env);
    context.locals.login = await resolveLogin(runtime.auth, env.MERCHANT_DB, context.request);
    context.locals.merchant = await resolveMerchant(runtime.auth, env.MERCHANT_DB, context.request);
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
  if (isProtectedAccountPath(context.url.pathname) && !context.locals.merchant) {
    if (context.locals.login) {
      if (context.url.pathname === '/account' || context.url.pathname === '/account/logout') return next();
      return seeOther('/account?error=organization_required');
    }
    const candidate = context.url.pathname + context.url.search;
    const continuation = safeAccountPath(candidate, '');
    if (continuation && continuation !== '/account') {
      return seeOther(`/account/sign-in?callbackURL=${encodeURIComponent(continuation)}`);
    }
    return seeOther('/account/sign-in');
  }
  return next();
});
