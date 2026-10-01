import { defineMiddleware } from 'astro:middleware';
import { isProtectedAccountPath, MerchantUnavailableError, seeOther, unavailableResponse } from './account/config.ts';
import { getMerchantEnv } from './account/bindings.ts';
import { createMerchantRuntime } from './account/auth.ts';
import { resolveMerchant } from './account/session.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.merchant = null;
  if (!context.url.pathname.startsWith('/account') && !context.url.pathname.startsWith('/api/auth')) {
    return next();
  }
  try {
    const env = await getMerchantEnv();
    const runtime = createMerchantRuntime(env);
    context.locals.merchant = await resolveMerchant(runtime.auth, env.MERCHANT_DB, context.request);
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
  if (isProtectedAccountPath(context.url.pathname) && !context.locals.merchant) {
    return seeOther('/account/sign-in');
  }
  return next();
});
