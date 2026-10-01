import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedEditor } from './helpers/emdash-editor.mjs';
import { request, signup, startCmsMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

test('CMS admin and merchant sessions stay isolated on workerd', async () => {
  const runtime = await startCmsMerchantTestRuntime();
  const merchantJar = new Map();
  const cmsJar = new Map();
  try {
    const editor = await createAuthenticatedEditor(runtime, cmsJar);
    assert.equal(editor.ok, true, `editor fixture failed at ${editor.stage}: ${JSON.stringify(editor.body ?? editor).slice(0, 400)}`);

    const home = await request(runtime, cmsJar, '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /DinkusKit|Commerce|Getting started/i);

    const settings = await request(runtime, cmsJar, '/_emdash/api/settings', {
      headers: { 'x-emdash-request': '1' },
    });
    assert.equal(settings.status, 200, 'authenticated editor must reach protected CMS settings');
    const settingsBody = await settings.json();
    assert.ok(settingsBody && typeof settingsBody === 'object');

    const admin = await request(runtime, cmsJar, '/_emdash/admin', { redirect: 'manual' });
    assert.equal(admin.status, 200);
    const adminHtml = await admin.text();
    assert.doesNotMatch(adminHtml, /\/_emdash\/admin\/setup/i);
    assert.ok([...cmsJar.keys()].some(name => /astro-session|session/i.test(name)), 'editor session cookie must exist');

    const editorOnMerchant = await request(runtime, cmsJar, '/account', { redirect: 'manual' });
    assert.equal(editorOnMerchant.status, 303);
    assert.equal(editorOnMerchant.headers.get('location'), '/account/sign-in');

    await signup(runtime, 'merchant-iso@merchant.example', merchantJar);
    const account = await request(runtime, merchantJar, '/account');
    assert.equal(account.status, 200);
    assert.ok([...merchantJar.keys()].some(name => name.includes('dk-merchant')));
    assert.ok([...cmsJar.keys()].every(name => !name.includes('dk-merchant')));
    assert.ok([...merchantJar.keys()].every(name => !/astro-session/i.test(name)));

    const merchantSettings = await request(runtime, merchantJar, '/_emdash/api/settings', {
      headers: { 'x-emdash-request': '1' },
    });
    assert.ok(merchantSettings.status === 401 || merchantSettings.status === 403, 'merchant must not read private CMS settings');

    const merchantAdmin = await request(runtime, merchantJar, '/_emdash/admin', { redirect: 'manual' });
    const merchantAdminLocation = merchantAdmin.headers.get('location') ?? '';
    assert.ok(
      merchantAdmin.status !== 200 || /login|sign-in|signin|setup/i.test(await merchantAdmin.text()),
      'merchant cookies must not grant CMS admin',
    );
    if (merchantAdmin.status !== 200) {
      assert.match(merchantAdminLocation, /_emdash|login|sign-in|signin/i);
    }
  } finally {
    await stopRuntime(runtime);
  }
});
