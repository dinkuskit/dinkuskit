import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { accountForm, request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

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

    assert.match(html, /<nav aria-label="Account"[^>]*>\s*<a href="\/account\/sites"[^>]*>Your stores<\/a>/, 'the account page links to Your stores');
    assert.match(html, /<nav aria-label="Main navigation">[\s\S]*<a href="\/account\/sites">Your stores<\/a>[\s\S]*<\/nav>/, 'the header links to Your stores when signed in');
    const sites = await page(runtime, owner.jar, '/account/sites');
    assert.match(sites, /<a href="\/account\/sites" aria-current="page">Your stores<\/a>/, 'the header marks Your stores as the current page');
    assert.match(sites, /<h1[^>]*>Your stores<\/h1>/);
    assert.match(sites, /No store is connected yet\. Install the DinkusKit Payments plugin/);
    assert.ok(!sites.includes(orgId), 'Your stores never shows the business ID');
  } finally {
    await stopRuntime(runtime);
  }
});

test('a store with nothing left on leaves Your stores for the archive', async () => {
  const runtime = await startMerchantTestRuntime();
  const owner = new Map();
  try {
    await signup(runtime, 'archive-owner@example.com', owner);
    const connect = async (label) => {
      const origin = `https://${label}.stores.example`;
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const callback = `${origin}/_emdash/admin/plugins/dinkus-inventory/inventory`;
      const started = await request(runtime, new Map(), '/api/store-connections', {
        method: 'POST',
        body: JSON.stringify({
          protocol_version: 2, client_id: 'dinkus-inventory-emdash', service: 'inventory', site_origin: origin,
          callback_uri: callback, code_challenge: challenge, code_challenge_method: 'S256',
        }),
      });
      assert.equal(started.status, 200);
      const body = await started.json();
      assert.equal((await request(runtime, new Map(), '/__proof/receipt', {
        method: 'POST',
        body: JSON.stringify({
          version: 2, connection_id: body.connection_id, challenge: body.challenge, client_id: 'dinkus-inventory-emdash',
          service: 'inventory', site_id: body.site_id, site_origin: origin, callback_uri: callback,
          code_challenge: challenge, expires_at: body.expires_at,
        }),
      })).status, 200);
      const approved = await request(runtime, owner, `/account/connect?connection_id=${body.connection_id}`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: await accountForm(runtime, owner, 'action=approve'),
      });
      assert.equal(approved.headers.get('location'), callback);
      return { origin, siteId: body.site_id };
    };
    const kept = await connect('kept');
    const retired = await connect('retired');
    const before = await page(runtime, owner, '/account/sites');
    assert.match(before, /kept\.stores\.example/);
    assert.match(before, /retired\.stores\.example/);
    assert.match(before, /Revoke inventory/);
    assert.doesNotMatch(before, /press Connect in the store to connect again/);
    const revoke = await request(runtime, owner, '/account/sites', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: await accountForm(runtime, owner, `action=revoke&site_id=${retired.siteId}&service=inventory`),
    });
    assert.equal(revoke.status, 303);
    assert.equal(revoke.headers.get('location'), '/account/sites/archive');
    const live = await page(runtime, owner, '/account/sites');
    assert.match(live, /kept\.stores\.example/);
    assert.match(live, /Revoke inventory/);
    assert.doesNotMatch(live, /retired\.stores\.example/);
    assert.doesNotMatch(live, /press Connect in the store to connect again/);
    assert.match(live, /href="\/account\/sites\/archive"/);
    const home = await page(runtime, owner, '/account');
    assert.match(home, /kept\.stores\.example/);
    assert.doesNotMatch(home, /retired\.stores\.example/);
    const archive = await page(runtime, owner, '/account/sites/archive');
    assert.match(archive, /<h1[^>]*>Archived stores<\/h1>/);
    assert.match(archive, /retired\.stores\.example/);
    assert.doesNotMatch(archive, /kept\.stores\.example/);
    assert.match(archive, /revoked; press Connect in the store to connect again/);
    assert.match(archive, /Set up Commerce/);
    assert.match(archive, new RegExp(retired.siteId));
    assert.doesNotMatch(archive, /<button[^>]*>\s*(Remove|Delete|Revoke)/);
    assert.equal((await request(runtime, owner, '/account/sites/nope')).status, 404);
  } finally {
    await stopRuntime(runtime);
  }
});
