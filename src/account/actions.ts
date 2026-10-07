import { MerchantUnavailableError, safeAccountPath, seeOther, unavailableResponse, SIGNUP_ATTEMPT_COOKIE, type MerchantMailIntent } from './config.ts';
import { getMerchantEnv } from './bindings.ts';
import { createMerchantRuntime } from './auth.ts';
import { disableMerchantAccount } from './store.ts';
import { resolveLogin } from './session.ts';
import { rejectCrossOriginMutation } from './origin.ts';
import { deletionGuard } from './organizations.ts';

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
  const callbackURL = safeAccountPath(String(form.get('callbackURL') ?? ''), '');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email || email.length > 200 || !email.includes('@')) {
    const base = intent === 'signup' ? '/account/signup' : intent === 'recovery' ? '/account/recover' : '/account/sign-in';
    const query = new URLSearchParams({ error: 'invalid_email' });
    if (callbackURL) query.set('callbackURL', callbackURL);
    return seeOther(`${base}?${query.toString()}`);
  }
  if (intent === 'signup') {
    const phone = String(form.get('phone') ?? '').trim();
    const serviceChannel = String(form.get('service_channel') ?? '').trim();
    const agreement = form.get('agreement') === 'on';
    const promotionalEmail = form.get('promotional_email') === 'on' ? 1 : 0;
    const promotionalSms = form.get('promotional_sms') === 'on' ? 1 : 0;
    if (!/^\+[1-9][0-9]{6,14}$/.test(phone) || !['email', 'phone'].includes(serviceChannel) || !agreement) {
      return seeOther(`/account/signup?error=missing_intake${callbackURL ? `&callbackURL=${encodeURIComponent(callbackURL)}` : ''}`);
    }
    const attemptId = crypto.randomUUID();
    const t = Math.floor(Date.now() / 1000);
    await env.MERCHANT_DB.prepare(`
      INSERT INTO dinkuskit_signup_attempt
        (attempt_id, email, phone, service_channel, promotional_email, promotional_sms, agreement_accepted, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(attemptId, email, phone, serviceChannel, promotionalEmail, promotionalSms, t + 300, t).run();
    form.set('attempt_id', attemptId);
  }
  try {
    await runtime.auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: callbackURL || '/account',
        errorCallbackURL: intent === 'signup' ? '/account/signup' : intent === 'recovery' ? '/account/recover' : '/account/sign-in',
        metadata: { intent, ...(form.get('attempt_id') ? { attempt_id: String(form.get('attempt_id')) } : {}) },
      },
      headers: context.request.headers,
    });
  } catch {
    return unavailableResponse('email_unavailable');
  }
  const response = seeOther('/account/check-email');
  if (intent === 'signup') {
    response.headers.set(
      'set-cookie',
      `${SIGNUP_ATTEMPT_COOKIE}=${encodeURIComponent(String(form.get('attempt_id') ?? ''))}; Max-Age=300; Path=/; HttpOnly; SameSite=Lax${env.MERCHANT_BASE_URL.startsWith('https:') ? '; Secure' : ''}`,
    );
  }
  return response;
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
  const merchant = await resolveLogin(runtime.auth, env.MERCHANT_DB, context.request);
  if (!merchant) return seeOther('/account/sign-in');
  const deletion = await deletionGuard(env.MERCHANT_DB, merchant.userId);
  if (!deletion.allowed) return seeOther('/account?error=owned_organizations');
  await disableMerchantAccount(env.MERCHANT_DB, merchant.userId);
  return submitLogout(context);
}
