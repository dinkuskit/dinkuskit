import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { accountForm, request, signup } from './merchant-harness.mjs';

// Normal local consent with the harness's explicit store-proof simulation.
// No hosted session, real processor or remote store is involved.
export async function connectSettingsStore(runtime, owner, label, service = 'inventory') {
  const origin = `https://${label}.stores.example`;
  const pluginPath = { inventory: 'dinkus-inventory/inventory', commerce: 'r_gshdrqaldna3r7sn/settings', payments: 'r_3brsc2on3bu673rn/status' }[service];
  const callback = `${origin}/_emdash/admin/plugins/${pluginPath}`;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const client = `dinkus-${service}-emdash`;
  const response = await request(runtime, new Map(), '/api/store-connections', {
    method: 'POST', body: JSON.stringify({ protocol_version: 2, client_id: client,
      service, site_origin: origin, callback_uri: callback,
      code_challenge: challenge, code_challenge_method: 'S256' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal((await request(runtime, new Map(), '/__proof/receipt', {
    method: 'POST', body: JSON.stringify({ version: 2, connection_id: body.connection_id,
      challenge: body.challenge, client_id: client, service,
      site_id: body.site_id, site_origin: origin, callback_uri: callback,
      code_challenge: challenge, expires_at: body.expires_at }),
  })).status, 200);
  const approved = await request(runtime, owner, `/account/connect?connection_id=${body.connection_id}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: await accountForm(runtime, owner, 'action=approve'),
  });
  assert.equal(approved.headers.get('location'), callback);
  assert.equal((await request(runtime, new Map(), '/api/store-connections/token', {
    method: 'POST', body: JSON.stringify({ client_id: client, connection_id: body.connection_id, code_verifier: verifier }),
  })).status, 200);
  return body.site_id;
}

export async function settingsPost(runtime, owner, siteId, fields, path = '/account/sites') {
  return request(runtime, owner, path, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: await accountForm(runtime, owner, new URLSearchParams({ site_id: siteId, ...fields }).toString()),
  });
}

export async function checkoutSettingsFixture(runtime) {
  const owner = new Map();
  await signup(runtime, 'settings-layout@example.com', owner);
  const first = await connectSettingsStore(runtime, owner, 'settings-one', 'commerce');
  await connectSettingsStore(runtime, owner, 'settings-one', 'payments');
  const second = await connectSettingsStore(runtime, owner, 'settings-two');
  assert.equal((await request(runtime, new Map(), '/__proof/payments-status', {
    method: 'POST', body: JSON.stringify({ site_id: first, body: { state: 'ready', bindingRef: 'bind_settings_example',
      connectionEvidence: { provider: 'stripe', accountRef: 'acct_SettingsExample' } } }),
  })).status, 200);
  const cookies = [...owner.values()].map(pair => {
    const eq = pair.indexOf('=');
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), url: runtime.origin };
  });
  return { owner, first, second, cookies };
}
