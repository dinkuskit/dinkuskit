import assert from 'node:assert/strict';
import test from 'node:test';
import { request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

// Browser forms send Accept: text/html and come back to the account page with a message.
const browserForm = (runtime, jar, path, values) => request(runtime, jar, path, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html,application/xhtml+xml' },
  body: new URLSearchParams(values).toString(),
});
const apiForm = (runtime, jar, path, values) => request(runtime, jar, path, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString(),
});
const visibleText = html => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, ' ');
const page = async (runtime, jar, path = '/account') => {
  const response = await request(runtime, jar, path);
  assert.equal(response.status, 200);
  return response.text();
};

test('account page: next step, business name, staff list and plain messages', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const owner = await signup(runtime, 'pages-owner@example.com');
    const employee = await signup(runtime, 'pages-staff@example.com');
    const orgId = (await (await request(runtime, owner.jar, '/api/account/organizations')).json()).organizations[0].organizationId;

    let html = await page(runtime, owner.jar);
    assert.match(html, /Signed in as pages-owner@example\.com/);
    assert.match(html, /Name your business/);
    assert.match(html, /Status: Approved/);
    assert.match(html, /Connect your store/);
    assert.match(html, /DinkusKit Payments plugin/);
    assert.doesNotMatch(visibleText(html), /admission|identity is separate|Inventory overview/i);

    for (const name of ['   ', 'x'.repeat(121)]) {
      const bad = await browserForm(runtime, owner.jar, '/api/account/organizations', { action: 'rename', organization_id: orgId, name });
      assert.equal(bad.status, 303);
      assert.equal(bad.headers.get('location'), '/account?error=invalid_organization_name');
    }
    const named = await browserForm(runtime, owner.jar, '/api/account/organizations', { action: 'rename', organization_id: orgId, name: '  Corner   Shop ' });
    assert.equal(named.headers.get('location'), '/account?named=1');
    html = await page(runtime, owner.jar, '/account?named=1');
    assert.match(html, /<h1[^>]*>Corner Shop<\/h1>/);
    assert.match(html, /Saved your business name/);
    assert.doesNotMatch(html, /Name your business/);

    const staffForm = (values, jar = owner.jar) => browserForm(runtime, jar, '/api/account/memberships', { organization_id: orgId, ...values });
    const nobody = await staffForm({ action: 'add_member', email: 'nobody@example.com' });
    assert.equal(nobody.headers.get('location'), '/account?staff_error=no_login');
    assert.match(await page(runtime, owner.jar, '/account?staff_error=no_login'), /no DinkusKit login for that email yet/);
    assert.equal((await apiForm(runtime, owner.jar, '/api/account/memberships', { organization_id: orgId, action: 'add_member', email: 'nobody@example.com' })).status, 404, 'non-form callers keep JSON statuses');

    assert.equal((await staffForm({ action: 'add_member', email: 'pages-staff@example.com' })).headers.get('location'), '/account?staff=added');
    html = await page(runtime, owner.jar, '/account?staff=added');
    assert.match(html, /Staff member added\./);
    assert.match(html, /pages-staff@example\.com<\/strong> · Staff/);
    assert.equal((await staffForm({ action: 'add_member', email: 'pages-staff@example.com' })).headers.get('location'), '/account?staff_error=already_staff');

    assert.equal((await staffForm({ action: 'set_permissions', email: 'pages-staff@example.com', permission: 'ship:labels' })).headers.get('location'), '/account?staff=saved');
    html = await page(runtime, owner.jar);
    assert.match(html, /pages-staff@example\.com<\/strong> · Staff<\/p>\s*<p class="staff-can"[^>]*>Print shipping labels in Ship<\/p>/);

    // The employee sees what they can do, and no staff tools.
    assert.equal((await apiForm(runtime, employee.jar, '/api/account/organizations', { action: 'select', organization_id: orgId })).status, 303);
    html = await page(runtime, employee.jar);
    assert.match(html, /on the staff of Corner Shop/);
    assert.match(html, /<li[^>]*>Print shipping labels in Ship<\/li>/);
    assert.doesNotMatch(html, /staff-heading|Name your business|Rename Corner Shop/);
    assert.equal((await browserForm(runtime, employee.jar, '/api/account/organizations', { action: 'rename', organization_id: orgId, name: 'Taken over' })).status, 403, 'only the owner renames');
    assert.equal((await staffForm({ action: 'add_member', email: 'pages-owner@example.com' }, employee.jar)).headers.get('location'), '/account?staff_error=not_allowed');

    assert.equal((await staffForm({ action: 'remove_member', email: 'pages-staff@example.com' })).headers.get('location'), '/account?staff=removed');
    html = await page(runtime, owner.jar, '/account?staff=removed');
    assert.match(html, /Removed\. They can no longer see this business\./);
    assert.doesNotMatch(html, /pages-staff@example\.com/);
    assert.equal((await staffForm({ action: 'remove_member', email: 'pages-staff@example.com' })).headers.get('location'), '/account?staff_error=not_staff');
    assert.doesNotMatch(await page(runtime, employee.jar), /Corner Shop/);

    const sites = await page(runtime, owner.jar, '/account/sites');
    assert.match(sites, /<h1[^>]*>Your stores<\/h1>/);
    assert.match(sites, /No store is connected yet\. Install the DinkusKit Payments plugin/);
    assert.ok(!sites.includes(orgId), 'Your stores never shows the business ID');
  } finally {
    await stopRuntime(runtime);
  }
});
