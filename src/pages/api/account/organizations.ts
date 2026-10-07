import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { rejectCrossOriginMutation } from '../../../account/origin.ts';
import { resolveLogin, resolveMerchant } from '../../../account/session.ts';
import { createAdditionalOrganization, listMemberships, selectOrganization } from '../../../account/organizations.ts';
import { createMerchantRuntime } from '../../../account/auth.ts';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const runtime = createMerchantRuntime(env);
    const login = await resolveLogin(runtime.auth, env.MERCHANT_DB, context.request);
    const merchant = await resolveMerchant(runtime.auth, env.MERCHANT_DB, context.request);
    if (!login) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    return new Response(JSON.stringify({ organizations: await listMemberships(env.MERCHANT_DB, login.userId), selectedOrganizationId: merchant?.organizationId ?? null, accountId: merchant?.accountId ?? null, subject: merchant?.subject ?? null }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const blocked = rejectCrossOriginMutation(context.request, env.MERCHANT_BASE_URL);
    if (blocked) return blocked;
    const runtime = createMerchantRuntime(env);
    const login = await resolveLogin(runtime.auth, env.MERCHANT_DB, context.request);
    const merchant = await resolveMerchant(runtime.auth, env.MERCHANT_DB, context.request);
    if (!login) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const form = await context.request.formData();
    if (form.get('action') === 'select') {
      const organizationId = String(form.get('organization_id') ?? '');
      if (organizationId !== merchant?.organizationId) {
        const selected = await selectOrganization(env.MERCHANT_DB, login.userId, organizationId);
        if (!selected) return new Response(JSON.stringify({ error: 'organization_forbidden' }), { status: 403 });
      }
      return new Response(null, { status: 303, headers: { location: '/account' } });
    }
    const organization = await createAdditionalOrganization(env.MERCHANT_DB, login.userId, String(form.get('name') ?? ''));
    return new Response(null, { status: 303, headers: { location: `/account?organization_id=${encodeURIComponent(organization.organizationId)}` } });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    if (error instanceof Error && error.message === 'signup_incomplete') return new Response(JSON.stringify({ error: 'signup_incomplete' }), { status: 403 });
    if (error instanceof Error && error.message === 'invalid_organization_name') return new Response(null, { status: 303, headers: { location: '/account?error=invalid_organization_name' } });
    throw error;
  }
};
