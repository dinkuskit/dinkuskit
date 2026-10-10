import assert from 'node:assert/strict';
import test from 'node:test';
import { startCmsMerchantTestRuntime, stopRuntime, signup, request } from './helpers/merchant-harness.mjs';
import { createAuthenticatedEditor } from './helpers/emdash-editor.mjs';

const route = '/_emdash/api/plugins/dinkuskit-operator/admin';
const call = (runtime, jar, body, extra = {}) => request(runtime, jar, route, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-emdash-request': '1', ...extra }, body: JSON.stringify(body),
});
const blocks = async response => {
  const body = await response.json();
  return body.data ?? body;
};

test('workerd: the operator pages live in the EmDash admin and only an Admin can use them', async () => {
  const runtime = await startCmsMerchantTestRuntime();
  try {
    const editor = await createAuthenticatedEditor(runtime);
    assert.equal(editor.ok, true, `CMS fixture stage: ${editor.stage}`);
    const merchant = await signup(runtime, 'operator-view-owner@example.test');
    assert.equal(merchant.completed.status, 303);

    const manifest = await (await request(runtime, editor.jar, '/_emdash/api/manifest')).json();
    const plugin = (manifest.data ?? manifest).plugins['dinkuskit-operator'];
    assert.equal(plugin.adminMode, 'blocks');
    assert.deepEqual(plugin.adminPages.map(p => p.path), ['/approvals', '/people', '/stores']);

    const page = await call(runtime, editor.jar, { type: 'page_load', page: '/approvals' });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('cache-control') ?? '', /no-store|private/);
    const approvals = await blocks(page);
    const text = JSON.stringify(approvals);
    assert.match(text, /Business approvals/);
    assert.match(text, /operator-view-owner@example.test/);
    assert.match(text, /Automatic \(first 50\)/);

    // Anonymous visitors, merchant logins and demoted editors are refused.
    assert.ok([401, 403].includes((await call(runtime, new Map(), { type: 'page_load', page: '/approvals' })).status));
    assert.ok([401, 403].includes((await call(runtime, merchant.jar, { type: 'page_load', page: '/approvals' })).status));
    assert.equal((await call(runtime, editor.jar, { type: 'page_load', page: '/approvals' }, { 'x-emdash-request': '' })).status, 403, 'CSRF header required');

    const orgs = await (await request(runtime, merchant.jar, '/api/account/organizations')).json();
    const organizationId = orgs.organizations[0].organizationId;
    const declined = await blocks(await call(runtime, editor.jar, { type: 'block_action', action_id: 'approvals:decline', value: organizationId }));
    assert.equal(declined.toast.message, 'Business declined.');
    const state = await (await request(runtime, new Map(), `/__proof/approvals?id=${encodeURIComponent(organizationId)}`)).json();
    assert.equal(state.org.status, 'denied');
    assert.equal(state.audit.decision, 'denied');
    assert.equal(state.audit.actor_email, editor.email);
    assert.equal(state.notices.length, 0, 'changing an automatic approval sends no second email');
    const approved = await blocks(await call(runtime, editor.jar, { type: 'block_action', action_id: 'approvals:approve', value: organizationId }));
    assert.equal(approved.toast.message, 'Business approved.');

    const people = await blocks(await call(runtime, editor.jar, { type: 'page_load', page: '/people' }));
    assert.match(JSON.stringify(people), /operator-view-owner@example.test/);
    const stores = await blocks(await call(runtime, editor.jar, { type: 'page_load', page: '/stores' }));
    assert.match(JSON.stringify(stores), /No store has connected yet/);

    // A store with Payments and Inventory; cut off only Payments after confirming.
    const origin = 'https://operator-view-shop.example.test';
    await request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify({
      store: { organizationId, siteId: 'synthetic-operator-site', origin, services: ['payments', 'inventory'] } }) });
    const storeRow = async () => (await blocks(await call(runtime, editor.jar, { type: 'page_load', page: '/stores' })))
      .blocks.find(b => b.type === 'table').rows.find(r => r.store === origin);
    const listed = await storeRow();
    assert.deepEqual([listed.payments, listed.inventory, listed.coupons, listed.ship], ['Connected', 'Connected', 'Cannot connect yet', 'Cannot connect yet']);
    assert.equal(listed.owner, 'operator-view-owner@example.test');
    assert.deepEqual(listed.action.items.map(i => i.label), ['Payments', 'Inventory', 'Everything']);
    const confirm = await blocks(await call(runtime, editor.jar, { type: 'block_action', action_id: 'stores:choose', value: listed.action.items[0].value }));
    const banner = confirm.blocks.find(b => b.type === 'banner');
    assert.equal(banner.title, `Cut off Payments for ${origin}?`);
    const yes = confirm.blocks.find(b => b.type === 'actions').elements.find(e => e.action_id === 'stores:cut');
    assert.equal((await blocks(await call(runtime, editor.jar, { type: 'block_action', action_id: 'stores:cut', value: yes.value }))).toast.message, 'Service cut off.');
    const cut = await storeRow();
    assert.deepEqual([cut.payments, cut.inventory], ['Cut off', 'Connected']);
    assert.deepEqual(cut.action.items.map(i => i.label), ['Inventory']);

    // Suspending signs the merchant out of the account pages at once.
    const row = people.blocks.find(b => b.type === 'table').rows.find(r => r.email === 'operator-view-owner@example.test');
    assert.equal(row.action.action_id, 'people:suspend');
    const suspended = await blocks(await call(runtime, editor.jar, { type: 'block_action', action_id: 'people:suspend', value: row.action.value }));
    assert.match(suspended.toast.message, /Suspended/);
    const after = await request(runtime, merchant.jar, '/account');
    assert.equal(after.status, 303);
    assert.match(after.headers.get('location'), /sign-in/);

    await request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify({ cms: { role: 40, disabled: 0 } }) });
    assert.equal((await call(runtime, editor.jar, { type: 'page_load', page: '/approvals' })).status, 403, 'an Editor is not an operator');
  } finally { await stopRuntime(runtime); }
});
