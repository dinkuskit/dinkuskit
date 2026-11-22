// Worker trace for Finish setup, a Disconnect during Finish setup, and a stale key cancel.
//
// Drives the built Worker (npm run build) under tests/helpers/merchant-harness.mjs with
// local D1 and KV, records each request and response with keys, passes and secrets
// redacted, and reads the persisted rows straight from the Worker's local D1 file after
// each step. The only simulation is the store receipt: the harness's proof-receipt store
// stands in for the plugin's store-proof route (see the plugin repositories'
// authority-chain runs for the real route).
//
//   node --experimental-strip-types .grilltrack/proof/finish-setup-20261122/worker-trace.mjs > worker-trace.md
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { accountForm, request, signup, startMerchantTestRuntime, stopRuntime } from '../../../tests/helpers/merchant-harness.mjs';

const out = [];
const say = line => out.push(line);
let runtime, sqlite;
const ids = new Map();
const label = (value, kind) => { if (!ids.has(value)) ids.set(value, `${kind}-${[...ids.values()].filter(v => v.startsWith(kind)).length + 1}`); return ids.get(value); };
const redact = text => String(text)
  .replaceAll(runtime.origin, 'https://dinkuskit.com')
  .replace(/dk_store_[A-Za-z0-9_-]{43}/g, 'dk_store_[redacted]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[pass redacted]')
  .replace(/"code_verifier":"[^"]+"/g, '"code_verifier":"[redacted]"')
  .replace(/"(challenge|code_challenge)":"[^"]+"/g, '"$1":"[redacted]"')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, id => label(id, 'id'));

async function d1() {
  if (sqlite) return sqlite;
  const dir = join(runtime.persistTo, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const files = (await readdir(dir)).filter(name => name.endsWith('.sqlite'));
  for (const file of files) {
    const db = new Database(join(dir, file), { readonly: true, fileMustExist: true });
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'dinkuskit_plugin_key'").get()) return (sqlite = db);
    db.close();
  }
  throw new Error('merchant D1 not found');
}
async function state(siteId, title) {
  const db = await d1();
  const keys = db.prepare('SELECT plugin, count(*) AS keys FROM dinkuskit_plugin_key WHERE site_id = ? GROUP BY plugin ORDER BY plugin').all(siteId);
  const grants = db.prepare('SELECT service, revoked FROM dinkuskit_service_grant WHERE site_id = ? ORDER BY service').all(siteId);
  const connections = db.prepare('SELECT service, status, count(*) AS n FROM dinkuskit_store_connection WHERE site_id = ? GROUP BY service, status ORDER BY service, status').all(siteId);
  const disconnects = db.prepare('SELECT plugin FROM dinkuskit_plugin_disconnect WHERE site_id = ? ORDER BY plugin').all(siteId);
  say(`  - D1 after ${title}:`);
  say(`    - plugin keys: ${keys.map(r => `${r.plugin} ${r.keys}`).join(', ') || 'none'}`);
  say(`    - service grants: ${grants.map(r => `${r.service} ${r.revoked ? 'revoked' : 'on'}`).join(', ') || 'none'}`);
  say(`    - connections: ${connections.map(r => `${r.service} ${r.status} ×${r.n}`).join(', ')}`);
  say(`    - Disconnect recorded: ${disconnects.map(r => r.plugin).join(', ') || 'none'}`);
  return { keys: Object.fromEntries(keys.map(r => [r.plugin, r.keys])), grants: Object.fromEntries(grants.map(r => [r.service, r.revoked])),
    connections, disconnects: disconnects.map(r => r.plugin) };
}
async function call(name, path, init = {}, jar = new Map()) {
  const response = await request(runtime, jar, path, init);
  const text = response.status === 303 ? '' : await response.text();
  const shown = init.body && typeof init.body === 'string' && init.body.startsWith('{') ? ` ${redact(init.body)}` : '';
  say(`  - ${init.method ?? 'GET'} ${redact(path)}${shown} → ${response.status}${response.headers.get('location') ? ` (location ${redact(response.headers.get('location'))})` : ''}${text ? ` ${redact(text).slice(0, 300)}` : ''}`);
  return { response, body: text && text.startsWith('{') ? JSON.parse(text) : null };
}

const ORIGIN = 'https://acme-goods.example';
const plugins = { commerce: ['dinkus-commerce-emdash', 'r_gshdrqaldna3r7sn/settings'], payments: ['dinkus-payments-emdash', 'r_3brsc2on3bu673rn/status'], ship: ['dinkus-ship-emdash', 'r_ehdlg5cxkb3ffqvr/shipping'] };
try {
  runtime = await startMerchantTestRuntime();
  const owner = new Map();
  await signup(runtime, 'acme-owner@example.test', owner);
  const form = async fields => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: await accountForm(runtime, owner, new URLSearchParams(fields).toString()) });
  async function start(service, delay = 0) {
    const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url');
    const [client, page] = plugins[service]; const callback = `${ORIGIN}/_emdash/admin/plugins/${page}`;
    const { body } = await call(`start ${service}`, '/api/store-connections', { method: 'POST', body: JSON.stringify({ protocol_version: 2, client_id: client, service,
      site_origin: ORIGIN, callback_uri: callback, code_challenge: challenge, code_challenge_method: 'S256' }) });
    await request(runtime, new Map(), '/__proof/receipt', { method: 'POST', body: JSON.stringify({ version: 2, connection_id: body.connection_id, challenge: body.challenge,
      client_id: client, service, site_id: body.site_id, site_origin: ORIGIN, callback_uri: callback, code_challenge: challenge, expires_at: body.expires_at, ...(delay ? { delay_ms: delay } : {}) }) });
    say(`  - (store receipt for ${redact(body.connection_id)} placed in the proof-receipt store${delay ? `, answered after ${delay} ms` : ''})`);
    return { client, verifier, id: body.connection_id, siteId: body.site_id, path: `/account/connect?connection_id=${body.connection_id}` };
  }
  const finish = c => call('finish', '/api/store-connections/finish', { method: 'POST', body: JSON.stringify({ client_id: c.client, connection_id: c.id, code_verifier: c.verifier }) });
  const token = c => call('token', '/api/store-connections/token', { method: 'POST', body: JSON.stringify({ client_id: c.client, connection_id: c.id, code_verifier: c.verifier }) });
  const approve = async c => call('approve', c.path, await form({ action: 'approve' }), owner);
  const pass = (key, siteId, scope, audience) => call('pass', '/api/store-passes', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ site_id: siteId, scope, audience }) });

  say('# DinkusKit.com Worker trace: Finish setup, Disconnect during Finish setup, stale key cancel');
  say('');
  say(`Built Worker from this branch, local D1 and KV, run ${new Date().toISOString().slice(0, 10)}. Keys, passes, PKCE values and secrets are redacted; ids are relabelled.`);
  say('');
  say('## 1. Allowed Finish setup');
  const commerceStart = await start('commerce');
  await approve(commerceStart);
  const commerce = (await token(commerceStart)).body;
  const siteId = commerce.site_id;
  const payments = await start('payments');
  const joined = await finish(payments);
  assert.equal(joined.response.status, 200);
  await pass(joined.body.store_key, siteId, 'payments:checkout', 'dinkus-payments');
  let s = await state(siteId, 'Finish setup');
  assert.deepEqual(s.keys, { commerce: 1, payments: 1 });
  say('');
  say('## 2. The owner presses Disconnect while Finish setup is reading the store receipt');
  const inFlight = await start('payments', 5000);
  let settled = false;
  const racing = request(runtime, new Map(), '/api/store-connections/finish', { method: 'POST', body: JSON.stringify({ client_id: inFlight.client, connection_id: inFlight.id, code_verifier: inFlight.verifier }) }).finally(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 300));
  say('  - (300 ms into the Finish setup below, the owner presses Disconnect Payments)');
  await call('disconnect', '/account/sites', await form({ action: 'disconnect_plugin', site_id: siteId, plugin: 'payments' }), owner);
  assert.equal(settled, false, 'the Disconnect landed while Finish setup was still reading the receipt');
  say('  - (the Disconnect finished while the Finish setup was still waiting on the receipt)');
  const lost = await racing; const lostText = await lost.text();
  say(`  - POST /api/store-connections/finish {"client_id":"dinkus-payments-emdash","connection_id":"${redact(inFlight.id)}","code_verifier":"[redacted]"} (sent before the Disconnect) → ${lost.status} ${redact(lostText)}`);
  assert.equal(lost.status, 409); assert.equal(JSON.parse(lostText).store_key, undefined);
  await pass(joined.body.store_key, siteId, 'payments:checkout', 'dinkus-payments');
  s = await state(siteId, 'the Disconnect and the refused Finish setup');
  assert.equal(s.keys.payments, undefined); assert.deepEqual(s.disconnects, ['payments']);
  say('');
  say('## 3. An uninstall cancel with a key the owner already disconnected');
  const fresh = await start('payments');
  await approve(fresh);
  s = await state(siteId, 'the owner approved a new Payments Connect (not picked up yet)');
  say('  - (the uninstall below presents the Payments key from step 1, which the Disconnect in step 2 removed)');
  const stale = await call('cancel', '/api/store-keys/cancel', { method: 'POST', headers: { authorization: `Bearer ${joined.body.store_key}` }, body: JSON.stringify({ site_id: siteId }) });
  assert.equal(stale.response.status, 401);
  s = await state(siteId, 'the stale cancel');
  assert.ok(s.connections.some(r => r.service === 'payments' && r.status === 'approved'), 'the approved Connect is untouched');
  const picked = await token(fresh);
  assert.equal(picked.response.status, 200);
  await pass(picked.body.store_key, siteId, 'payments:checkout', 'dinkus-payments');
  const current = await call('cancel', '/api/store-keys/cancel', { method: 'POST', headers: { authorization: `Bearer ${picked.body.store_key}` }, body: JSON.stringify({ site_id: siteId }) });
  assert.equal(current.response.status, 200);
  await pass(commerce.store_key, siteId, 'commerce:settings', 'dinkuskit');
  s = await state(siteId, 'the current key cancelled itself');
  assert.deepEqual(s.keys, { commerce: 1 });
  say('');
  say('All assertions passed.');
} finally {
  sqlite?.close();
  if (runtime) await stopRuntime(runtime);
  process.stdout.write(`${out.join('\n')}\n`);
}
