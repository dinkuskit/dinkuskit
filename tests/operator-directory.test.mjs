import assert from 'node:assert/strict';
import test from 'node:test';
import { request, signup, startMerchantTestRuntime, startProductionWorker, stopRuntime } from './helpers/merchant-harness.mjs';

async function identity(runtime, email) {
  const { jar } = await signup(runtime, email);
  const foundation = await (await request(runtime, new Map(), '/__proof/foundation?email=' + encodeURIComponent(email))).json();
  const organizations = await (await request(runtime, jar, '/api/account/organizations')).json();
  return { jar, userId: foundation.userId, organizationId: organizations.organizations[0].organizationId };
}

const grant = (userId, resourceType, resourceId) => ({ userId, resourceType, resourceId });
const configure = (runtime, body) => request(runtime, new Map(), '/__proof/operator-directory', { method: 'POST', body: JSON.stringify(body) });

test('operator directory is independent, bounded, resource-scoped, and truthful about recorded stores', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const caller = await identity(runtime, 'operator-directory-caller@example.com');
    const other = await identity(runtime, 'operator-directory-other@example.com');
    assert.equal((await request(runtime, caller.jar, '/account/operator')).status, 403);
    assert.equal((await request(runtime, caller.jar, '/account/operator/organizations/' + caller.organizationId)).status, 403);
    assert.equal((await request(runtime, caller.jar, '/account/operator', { method: 'POST' })).status, 405);
    assert.equal((await request(runtime, new Map(), '/account/operator', { headers: { 'cf-access-authenticated-user-email': 'cms@example.com' } })).status, 303);

    await configure(runtime, {
      grants: [grant(caller.userId, 'directory', 'directory')],
    });
    let response = await request(runtime, caller.jar, '/account/operator?q=operator-directory&page_size=1');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(await response.text(), /operator-directory-caller/);

    await configure(runtime, {
      grants: [
        grant(caller.userId, 'directory', 'directory'),
        grant(caller.userId, 'person', caller.userId),
        grant(caller.userId, 'organization', caller.organizationId),
      ],
    });
    response = await request(runtime, caller.jar, `/account/operator/people/${caller.userId}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Memberships|Organization memberships/);

    await configure(runtime, {
      grants: [
        grant(caller.userId, 'organization', caller.organizationId),
        grant(caller.userId, 'store', 'site-north'),
        grant(caller.userId, 'store', 'site-south'),
      ],
    });
    await request(runtime, new Map(), '/__proof/inventory-overview', {
      method: 'POST',
      body: JSON.stringify({ organizationId: caller.organizationId, seed_bindings: true }),
    });
    response = await request(runtime, caller.jar, `/account/operator/organizations/${caller.organizationId}`);
    assert.equal(response.status, 200);
    const organizationHtml = await response.text();
    assert.match(organizationHtml, /north\.example\.test/);
    assert.match(organizationHtml, /separately authorized/);
    assert.doesNotMatch(organizationHtml, /Payments.*healthy|Ship.*healthy/);
    response = await request(runtime, caller.jar, '/account/operator/stores/site-north');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Website authorization|Granted at/);

    await configure(runtime, { grants: [grant(caller.userId, 'organization', caller.organizationId)] });
    assert.equal((await request(runtime, caller.jar, `/account/operator/organizations/${other.organizationId}`)).status, 403);
    assert.equal((await request(runtime, caller.jar, '/account/operator/stores/unknown-site')).status, 403);

    await configure(runtime, {
      grants: [grant(caller.userId, 'directory', 'directory'), grant(caller.userId, 'person', 'missing-person')],
    });
    assert.equal((await request(runtime, caller.jar, '/account/operator/people/missing-person')).status, 404);

    const production = await startProductionWorker({ persistTo: runtime.persistTo, secret: runtime.secret, origin: runtime.origin, jwt: runtime.jwt, rogueTestBindings: true });
    try { assert.equal((await request(production, caller.jar, '/account/operator')).status, 403); } finally { await stopRuntime(production); }
    await configure(runtime, { grants: [grant(caller.userId, 'directory', 'directory')], detach_user: caller.userId });
    assert.equal((await request(runtime, caller.jar, '/account/operator')).status, 200, 'operator does not require merchant membership');
    for (const path of ['/account/operator?page=0', '/account/operator?page_size=51', '/account/operator/people/' + caller.userId + '?extra=1']) assert.equal((await request(runtime, caller.jar, path)).status, 400);

    await configure(runtime, {
      grants: [grant(caller.userId, 'directory', 'directory')],
      change_during_read: 'disable_login',
      delay_ms: 10,
    });
    response = await request(runtime, caller.jar, '/account/operator');
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /operator-directory-caller/);
  } finally {
    await stopRuntime(runtime);
  }
});


test('built directory rejects grant revocation and account changes after asynchronous authorization', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    for (const change of ['revoke_grant', 'disable_login', 'change_subject']) {
      const actor = await identity(runtime, `operator-${change}@example.com`);
      await configure(runtime, { grants: [grant(actor.userId, 'directory', 'directory')], change_during_read: change, change_at_call: 2 });
      const response = await request(runtime, actor.jar, '/account/operator');
      assert.equal(response.status, 403, change);
      assert.doesNotMatch(await response.text(), /operator-revoke_grant|operator-disable_login|operator-change_subject/);
    }
  } finally { await stopRuntime(runtime); }
});
