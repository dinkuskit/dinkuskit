import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { rejectCrossOriginMutation } from '../../../account/origin.ts';
import { resolveMerchant } from '../../../account/session.ts';
import { createMerchantRuntime } from '../../../account/auth.ts';
import { authorizeOrganization, canManageMembership, memberUserIdByEmail, addMemberByEmail, grantAdministrator, setEmployeePermissions } from '../../../account/organizations.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const blocked = rejectCrossOriginMutation(context.request, env.MERCHANT_BASE_URL);
    if (blocked) return blocked;
    const merchant = await resolveMerchant(createMerchantRuntime(env).auth, env.MERCHANT_DB, context.request);
    if (!merchant) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const form = await context.request.formData();
    const organizationId = String(form.get('organization_id') ?? '');
    if (organizationId !== merchant.organizationId) return new Response(JSON.stringify({ error: 'stale_organization' }), { status: 409 });
    const selected = await authorizeOrganization(env.MERCHANT_DB, merchant.userId, organizationId);
    if (!selected) return new Response(JSON.stringify({ error: 'organization_forbidden' }), { status: 403 });
    if (!await canManageMembership(env.MERCHANT_DB, merchant.userId, organizationId)) return new Response(null, { status: 403 });
    const email = String(form.get('email') ?? '');
    const action = form.get('action');
    let result;
    if (action === 'add_member') {
      result = await addMemberByEmail(env.MERCHANT_DB, merchant.userId, organizationId, email);
    } else {
      const target = await memberUserIdByEmail(env.MERCHANT_DB, email);
      if (!target) return new Response(null, { status: 404 });
      const permissions = form.getAll('permission').map(String);
      if (action === 'set_permissions') result = await setEmployeePermissions(env.MERCHANT_DB, merchant.userId, organizationId, target, permissions);
      else if (action === 'grant_admin') result = await grantAdministrator(env.MERCHANT_DB, merchant.userId, organizationId, target, permissions);
      else return new Response(null, { status: 400 });
    }
    if (result !== 'ok') return new Response(JSON.stringify({ error: result }), { status: result === 'not_found' ? 404 : 403 });
    return new Response(null, { status: 303, headers: { location: '/account' } });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};

export const GET: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const merchant = await resolveMerchant(createMerchantRuntime(env).auth, env.MERCHANT_DB, context.request);
    if (!merchant) return new Response(null, { status: 401 });
    const membership = await authorizeOrganization(env.MERCHANT_DB, merchant.userId, merchant.organizationId);
    if (!membership || (membership.role !== 'owner' && !membership.permissions.includes('membership:view'))) return new Response(null, { status: 403 });
    const rows = await env.MERCHANT_DB.prepare(`SELECT u.email, m.role, m.status, m.permissions
      FROM dinkuskit_membership m JOIN "user" u ON u.id = m.user_id WHERE m.organization_id = ?`)
      .bind(merchant.organizationId).all();
    return new Response(JSON.stringify({ members: rows.results ?? [] }), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
