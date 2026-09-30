import { MerchantUnavailableError, safeAccountPath, seeOther, unavailableResponse, type MerchantMailIntent } from './config.ts';
import { getMerchantEnv } from './bindings.ts';
import { createMerchantRuntime } from './auth.ts';
import { disableMerchantAccount } from './store.ts';
import { resolveMerchant } from './session.ts';
import { rejectCrossOriginMutation } from './origin.ts';

type AstroLike = { request: Request; locals?: unknown; url: URL };

export async function submitMagicLinkForm(context: AstroLike, intent: MerchantMailIntent): Promise<Response> {
  let env;
  try {
    env = await getMerchantEnv();
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
  const blocked = rejectCrossOriginMutation(context.request, env.MERCHANT_BASE_URL);
  if (blocked) return blocked;
  const runtime = createMerchantRuntime(env);
  const form = await context.request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email || email.length > 200 || !email.includes('@')) {
    return seeOther(`/${intent === 'signup' ? 'account/signup' : intent === 'recovery' ? 'account/recover' : 'account/sign-in'}?error=invalid_email`);
  }
  const callbackURL = safeAccountPath(String(form.get('callbackURL') ?? '/account'));
  try {
    await runtime.auth.api.signInMagicLink({
      body: {
        email,
        callbackURL,
        errorCallbackURL: intent === 'signup' ? '/account/signup' : intent === 'recovery' ? '/account/recover' : '/account/sign-in',
        metadata: { intent },
      },
      headers: context.request.headers,
    });
  } catch {
    return unavailableResponse('email_unavailable');
  }
  return seeOther('/account/check-email');
}

export async function submitLogout(context: AstroLike): Promise<Response> {
  let env;
  try {
    env = await getMerchantEnv();
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
  const blocked = rejectCrossOriginMutation(context.request, env.MERCHANT_BASE_URL);
  if (blocked) return blocked;
  const runtime = createMerchantRuntime(env);
  const response = await runtime.auth.api.signOut({ headers: context.request.headers, asResponse: true });
  const headers = new Headers(response.headers);
  headers.set('location', '/account/sign-in');
  return new Response(null, { status: 303, headers });
}

export async function submitAccountPost(context: AstroLike): Promise<Response> {
  let env;
  try {
    env = await getMerchantEnv();
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
  const blocked = rejectCrossOriginMutation(context.request, env.MERCHANT_BASE_URL);
  if (blocked) return blocked;
  const form = await context.request.formData();
  if (form.get('action') !== 'disable') return seeOther('/account');
  const runtime = createMerchantRuntime(env);
  const merchant = await resolveMerchant(runtime.auth, env.MERCHANT_DB, context.request);
  if (!merchant) return seeOther('/account/sign-in');
  await disableMerchantAccount(env.MERCHANT_DB, merchant.userId);
  return submitLogout(context);
}
