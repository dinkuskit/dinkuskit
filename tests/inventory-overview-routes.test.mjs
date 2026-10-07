import assert from 'node:assert/strict';
import test from 'node:test';
import { request, signup, startMerchantTestRuntime, startProductionWorker, stopRuntime } from './helpers/merchant-harness.mjs';
import { overviewPayload } from './fixtures/inventory-overview-payload.mjs';
const form = (runtime, jar, path, values) => request(runtime, jar, path, { method: 'POST', body: new URLSearchParams(values).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
async function identity(runtime, email) {
  const { jar } = await signup(runtime, email);
  const state = await (await request(runtime, new Map(), '/__proof/foundation?email=' + encodeURIComponent(email))).json();
  const orgs = await (await request(runtime, jar, '/api/account/organizations')).json();
  return { jar, userId: state.userId, organizationId: orgs.organizations[0].organizationId };
}
const fixture = (runtime, input) => request(runtime, new Map(), '/__proof/inventory-overview', { method: 'POST', body: JSON.stringify(input) });
const grant = (actor, mode = 'merchant') => ({ userId: actor.userId, organizationId: actor.organizationId, mode });

test('built routes require current selected-organization authority and independent grants; synthetic signed reads render truthful metadata states', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    assert.equal((await request(runtime, new Map(), '/account/inventory')).status, 303);
    assert.equal((await request(runtime, new Map(), '/account/operator/inventory?organization_id=untrusted', { headers: { 'cf-access-authenticated-user-email': 'cms-editor@example.com' } })).status, 303);
    const owner = await identity(runtime, 'overview-owner@example.com'), other = await identity(runtime, 'overview-other@example.com');
    assert.equal((await request(runtime, owner.jar, '/account/inventory')).status, 403); // purpose-specific grant is absent
    assert.equal((await request(runtime, owner.jar, '/account/operator/inventory?organization_id=' + owner.organizationId)).status, 403);
    await fixture(runtime, { organizationId: owner.organizationId, grants: [grant(owner)], seed_bindings: true });
    let response = await request(runtime, owner.jar, '/account/inventory');
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    let html = await response.text();
    assert.match(html, /north\.example\.test/); assert.match(html, /Website access: revoked/); assert.match(html, /Website access: unknown/);
    assert.match(html, /Allocated pools/); assert.match(html, /Observed at/); assert.match(html, /Sampled at/); assert.match(html, /Live pool health is unavailable/);
    assert.match(html, /Provisioning: pending/); assert.match(html, /Provisioning: failed/); assert.match(html, /pool-main/);
    assert.equal((await request(runtime, owner.jar, '/account/inventory?organization_id=' + other.organizationId)).status, 409);
    assert.equal((await request(runtime, owner.jar, '/account/operator/inventory?organization_id=' + owner.organizationId)).status, 403); // owner is not an operator grant
    assert.equal((await request(runtime, other.jar, '/account/inventory')).status, 403);
    assert.equal((await request(runtime, owner.jar, '/account/inventory', { method: 'POST' })).status, 405);
    const observed = await (await request(runtime, new Map(), '/__proof/inventory-overview')).json();
    assert.deepEqual(observed, { syntheticOnly: true, signatureVerified: true, dedicatedClaimsVerified: true, independentCallerVerified: true });

    // Independent operator read of another organization's metadata without merchant membership.
    await fixture(runtime, { grants: [{ userId: other.userId, organizationId: owner.organizationId, mode: 'operator' }] });
    assert.equal((await request(runtime, other.jar, '/account/operator/inventory?organization_id=' + owner.organizationId)).status, 200);
    assert.equal((await request(runtime, other.jar, '/account/operator/inventory?organization_id=' + other.organizationId)).status, 403);
    await fixture(runtime, { grants: [{ userId: other.userId, organizationId: owner.organizationId, mode: 'operator' }], change_during_read: 'revoke_grant' });
    assert.equal((await request(runtime, other.jar, '/account/operator/inventory?organization_id=' + owner.organizationId)).status, 403);
    // Existing employee membership and site-view permission still confer no overview permission.
    assert.equal((await form(runtime, owner.jar, '/api/account/memberships', { organization_id: owner.organizationId, email: 'overview-other@example.com', action: 'add_member' })).status, 303);
    assert.equal((await form(runtime, owner.jar, '/api/account/memberships', { organization_id: owner.organizationId, email: 'overview-other@example.com', action: 'set_permissions', permission: 'site:view' })).status, 303);
    assert.equal((await form(runtime, other.jar, '/api/account/organizations', { action: 'select', organization_id: owner.organizationId })).status, 303);
    await fixture(runtime, { grants: [grant(owner)] });
    assert.equal((await request(runtime, other.jar, '/account/sites')).status, 200);
    assert.equal((await request(runtime, other.jar, '/account/inventory')).status, 403);
    assert.equal((await request(runtime, other.jar, '/account/operator/inventory?organization_id=' + owner.organizationId)).status, 403);
    for (const settings of [{ empty: true }, { unavailable: 'read_unavailable' }, { stale: true }]) {
      await fixture(runtime, { grants: [grant(owner)], ...settings });
      response = await request(runtime, owner.jar, '/account/inventory'); html = await response.text();
      assert.equal(response.status, settings.unavailable ? 503 : 200);
      if (settings.empty) assert.match(html, /No Inventory pools or sites were recorded/);
      if (settings.unavailable) { assert.match(html, /counts are unavailable/); assert.doesNotMatch(html, /<dd>0<\/dd>/); }
      if (settings.stale) assert.match(html, /more than 15 minutes old/);
    }
    const invalid = overviewPayload('wrong-org'); invalid.overview.sites[0].products = ['NEVER_RENDER'];
    await fixture(runtime, { grants: [grant(owner)], body: invalid });
    response = await request(runtime, owner.jar, '/account/inventory'); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /NEVER_RENDER|pool-main/);
    const future = overviewPayload(owner.organizationId);
    future.overview.snapshot.sampledAt = new Date(Date.now() + 120_000).toISOString();
    future.overview.snapshot.asOf = future.overview.snapshot.sampledAt;
    await fixture(runtime, { grants: [grant(owner)], body: future });
    response = await request(runtime, owner.jar, '/account/inventory');
    assert.equal(response.status, 503); assert.match(await response.text(), /incomplete snapshot/);

    // The production entry ignores test bindings even with a valid persisted test login.
    const production = await startProductionWorker({ persistTo: runtime.persistTo, secret: runtime.secret, origin: runtime.origin, jwt: runtime.jwt, rogueTestBindings: true });
    try {
      await fixture(runtime, { grants: [grant(owner)], seed_bindings: true });
      response = await request(production, owner.jar, '/account/inventory');
      assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /pool-main/);
      assert.equal((await request(production, owner.jar, '/account/operator/inventory?organization_id=' + owner.organizationId)).status, 403);
    } finally { await stopRuntime(production); }
  } finally { await stopRuntime(runtime); }
});

test('built reads refuse revocation, disabled login, subject drift, removed membership and changed selection during async transport', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    for (const change of ['revoke_grant', 'remove_member', 'disable_login', 'switch_selection', 'change_subject']) {
      const actor = await identity(runtime, change + '@example.com');
      const other = await identity(runtime, change + '-other@example.com');
      await fixture(runtime, { grants: [grant(actor)], change_during_read: change, userId: actor.userId, otherOrganizationId: other.organizationId, delay_ms: 10 });
      const response = await request(runtime, actor.jar, '/account/inventory');
      assert.equal(response.status, 403, change); assert.doesNotMatch(await response.text(), /pool-main|north\.example/);
    }
  } finally { await stopRuntime(runtime); }
});
