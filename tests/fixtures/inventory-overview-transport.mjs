import { createSignedInventoryReader, INVENTORY_OVERVIEW_AUDIENCE, INVENTORY_OVERVIEW_SCOPE } from './inventory-overview-proof.mjs';
import { overviewPayload } from './inventory-overview-payload.mjs';

const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const jsonPart = value => encode(new TextEncoder().encode(JSON.stringify(value)));
const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
export function inventoryOverviewRuntime(env) {
  const kv = env.MERCHANT_INVENTORY_OVERVIEW;
  if (!kv) return undefined;
  const config = async () => JSON.parse(await kv.get('fixture') ?? '{}');
  let publicKey;
  const reader = createSignedInventoryReader({
    endpoint: 'https://inventory.example.test/v1/account-overview',
    signer: async claims => {
      const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      publicKey = keys.publicKey;
      const unsigned = `${jsonPart({ alg: 'ES256' })}.${jsonPart(claims)}`;
      return `${unsigned}.${encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(unsigned))))}`;
    },
    fetchImpl: async (_url, init) => {
      const token = init.headers.authorization.slice(7), parts = token.split('.');
      const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(parts[2]), new TextEncoder().encode(parts.slice(0, 2).join('.')));
      const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
      if (!verified || claims.iss !== 'https://dinkuskit.com/account' || claims.aud !== INVENTORY_OVERVIEW_AUDIENCE || claims.scope !== INVENTORY_OVERVIEW_SCOPE || claims.exp - claims.iat !== 300 || claims.sub === claims.organization_subject) throw new Error('invalid_test_signature');
      const fixture = await config();
      await kv.put('observed', JSON.stringify({ syntheticOnly: true, signatureVerified: true, dedicatedClaimsVerified: true, independentCallerVerified: true }));
      if (fixture.delay_ms) await new Promise(resolve => setTimeout(resolve, Number(fixture.delay_ms)));
      if (fixture.change_during_read === 'revoke_grant') await kv.put('fixture', JSON.stringify({ ...fixture, grants: [] }));
      if (fixture.change_during_read === 'remove_member') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_membership SET status = ? WHERE organization_id = ? AND user_id = ?').bind('removed', claims.organization_id, fixture.userId).run();
      if (fixture.change_during_read === 'disable_login') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = ?').bind(fixture.userId).run();
      if (fixture.change_during_read === 'switch_selection') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_user_selection SET organization_id = ? WHERE user_id = ?').bind(fixture.otherOrganizationId, fixture.userId).run();
      if (fixture.change_during_read === 'change_subject') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_organization SET authority_subject = ? WHERE organization_id = ?').bind('synthetic-moved-authority', claims.organization_id).run();
      const body = fixture.body ?? overviewPayload(claims.organization_id, fixture);
      return Response.json(body, { status: fixture.status ?? (fixture.unavailable ? 503 : 200), headers: { 'cache-control': 'no-store' } });
    },
  });
  return {
    reader,
    authorize: async input => (await config()).grants?.some(grant => grant.userId === input.userId && grant.organizationId === input.organizationId && grant.mode === input.mode && input.scope === INVENTORY_OVERVIEW_SCOPE) === true,
  };
}
