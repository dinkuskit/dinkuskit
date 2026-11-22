import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { startStoreConnection, consentStoreConnection, exchangeStoreConnectionToken, finishStoreSetup } from '../src/account/connect.ts';
import { createLocalTestKeys } from '../src/account/jwt.ts';
import { cancelPluginKey, disconnectPlugin, hashKey, issueStorePass, listStoreSetup, newStoreKey, setOwnerService } from '../src/account/store-passes.ts';
import { saveCommerceSettings, serveCommerceSettings } from '../src/account/commerce-settings.ts';
import { REGISTERED_STORE_SERVICES } from '../src/account/config.ts';

// Connect to DinkusKit (store-connect-080 to 084): each plugin's Connect hands it its own
// store key; Commerce connects first and registers the store.
const STORE = 'https://store.example.test';
const installs = {
  commerce: { client: 'dinkus-commerce-emdash', service: 'commerce', callback: '/_emdash/admin/plugins/r_gshdrqaldna3r7sn/settings' },
  'commerce-beta': { client: 'dinkus-commerce-emdash', service: 'commerce', callback: '/_emdash/admin/plugins/r_fjzjvld3ssb4j63o/settings' },
  payments: { client: 'dinkus-payments-emdash', service: 'payments', callback: '/_emdash/admin/plugins/r_3brsc2on3bu673rn/status' },
  ship: { client: 'dinkus-ship-emdash', service: 'ship', callback: '/_emdash/admin/plugins/r_ehdlg5cxkb3ffqvr/shipping' },
  'ship-beta': { client: 'dinkus-ship-emdash', service: 'ship', callback: '/_emdash/admin/plugins/r_nhb4yqdnowdmkxyu/shipping' },
};

async function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const file of (await readdir('migrations/merchant')).filter(n => n.endsWith('.sql')).sort()) sqlite.exec(await readFile(`migrations/merchant/${file}`, 'utf8'));
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let args = [];
    const q = { bind(...values) { args = values; return q; }, async first() { return stmt.get(...args) ?? null; }, async all() { return { success: true, results: stmt.all(...args) }; }, async run() { return { success: true, meta: { changes: stmt.run(...args).changes } }; }, execute() { return { success: true, meta: { changes: stmt.run(...args).changes } }; } };
    return q;
  }, async batch(queries) { return sqlite.transaction(() => queries.map(q => q.execute()))(); } };
  for (const user of ['alice', 'bob']) {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(user, user, `${user}@example.test`);
    sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES (?, ?, 1, 1)').run(user, `personal-${user}`);
  }
  for (const [org, owner] of [['a', 'alice'], ['b', 'bob']]) {
    sqlite.prepare("INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at) VALUES (?, ?, 'active', ?, ?, 'admitted', ?, 1, 1)").run(org, org, owner, `org-${org}`, owner);
    sqlite.prepare("INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active', '[]', 1, 1)").run(org, owner);
    sqlite.prepare('INSERT INTO dinkuskit_user_selection VALUES (?, ?, 1)').run(owner, org);
  }
  const keys = await createLocalTestKeys();
  const merchant = user => ({ userId: user, email: `${user}@example.test`, subject: `org-${user === 'bob' ? 'b' : 'a'}`, organizationId: user === 'bob' ? 'b' : 'a' });
  return { sqlite, db, keys, merchant, close: () => sqlite.close() };
}

async function start(f, install, origin = STORE) {
  const reg = installs[install]; const verifier = randomBytes(32).toString('base64url');
  const request = { protocol_version: 2, client_id: reg.client, service: reg.service, site_origin: origin, callback_uri: origin + reg.callback, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' };
  const response = await startStoreConnection(f.db, request, 'https://dinkuskit.com');
  const body = await response.json();
  return { request, response, body, verifier, receipt: { version: 2, connection_id: body.connection_id, challenge: body.challenge, client_id: reg.client, service: reg.service, site_id: body.site_id, site_origin: origin, callback_uri: origin + reg.callback, code_challenge: request.code_challenge, expires_at: body.expires_at } };
}
async function consent(f, c, user = 'alice') {
  const merchant = f.merchant(user);
  return consentStoreConnection({ db: f.db, merchant, organizationId: merchant.organizationId, connectionId: c.body.connection_id, action: 'approve', proofFetch: async () => ({ ok: true, transport: 'simulation', receipt: c.receipt }) });
}
async function exchange(f, c) {
  const response = await exchangeStoreConnectionToken({ db: f.db, jwtPrivateJwk: JSON.stringify(f.keys.privateJwk), proofFetch: async () => ({ ok: true, transport: 'simulation', receipt: c.receipt }), body: { client_id: c.request.client_id, connection_id: c.body.connection_id, code_verifier: c.verifier } });
  return { status: response.status, body: await response.json() };
}
async function connect(f, install, origin = STORE) {
  const c = await start(f, install, origin); assert.equal(c.response.status, 200, `${install} starts`);
  assert.equal((await consent(f, c)).ok, true, `${install} is approved`);
  const issued = await exchange(f, c); assert.equal(issued.status, 200, `${install} picks up its key`);
  return { ...c, issued };
}
function trader(f, siteId) {
  return async (key, scope, audience) => {
    const response = await issueStorePass({ db: f.db, authorization: `Bearer ${key}`, body: { site_id: siteId, scope, audience }, privateJwkJson: JSON.stringify(f.keys.privateJwk) });
    return { status: response.status, body: await response.json() };
  };
}
const count = (f, sql, ...args) => f.sqlite.prepare(`SELECT count(*) n FROM ${sql}`).get(...args).n;

test('Commerce and Ship registrations match their EmDash Registry IDs, stable and beta', async () => {
  const source = await readFile(new URL('../node_modules/emdash/src/registry/plugin-id.ts', import.meta.url), 'utf8');
  const { makeRegistryPluginId } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  for (const [slug, client, page] of [
    ['dinkus-commerce', 'dinkus-commerce-emdash', 'settings'], ['dinkus-commerce-beta', 'dinkus-commerce-emdash', 'settings'],
    ['dinkus-ship', 'dinkus-ship-emdash', 'shipping'], ['dinkus-ship-beta', 'dinkus-ship-emdash', 'shipping'],
  ]) {
    const id = await makeRegistryPluginId('did:plc:ekk4pjmkh3k3ql2kfoex3qt4', slug);
    const reg = REGISTERED_STORE_SERVICES.find(item => item.callbackPath === `/_emdash/admin/plugins/${id}/${page}`);
    assert.ok(reg, slug);
    assert.deepEqual([reg.clientId, reg.proofPath, reg.grants, reg.registersStore], [client, `/_emdash/api/plugins/${id}/store-proof`, false, slug.startsWith('dinkus-commerce')]);
  }
});

test('Commerce connects first: it registers the store and gets its own key, with no grant and no pass', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    assert.deepEqual(Object.keys(commerce.issued.body).sort(), ['site_id', 'store_key'], 'Commerce gets a key, never an admin pass');
    assert.match(commerce.issued.body.store_key, /^dk_store_[A-Za-z0-9_-]{43}$/);
    assert.equal(commerce.issued.body.site_id, commerce.body.site_id);
    assert.equal(count(f, 'dinkuskit_store_identity WHERE site_origin = ? AND account_subject = ?', STORE, 'org-a'), 1, 'the store is registered to the business');
    assert.equal(count(f, 'dinkuskit_service_grant'), 0, 'connecting Commerce turns no service on');
    assert.equal(count(f, 'dinkuskit_jwks'), 0);
    assert.equal(count(f, "dinkuskit_plugin_key WHERE plugin = 'commerce' AND key_hash = ?", createHash('sha256').update(commerce.issued.body.store_key).digest('hex')), 1, 'only the hash is kept');
    assert.deepEqual(await exchange(f, commerce), { status: 400, body: { error: 'already_redeemed' } }, 'the key is handed over once');
    const listed = (await listStoreSetup(f.db, 'org-a'))[0];
    assert.ok(listed.plugins.commerce); assert.equal(listed.plugins.payments, null); assert.equal(listed.plugins.ship, null);
  } finally { f.close(); }
});

test('Payments and Ship wait for Commerce, then each plugin and beta gets its own key', async () => {
  const f = await fixture(); try {
    for (const install of ['ship', 'payments']) {
      const early = await start(f, install);
      assert.deepEqual([early.response.status, early.body], [409, { error: 'connect_commerce_first' }], `${install} waits for Commerce`);
    }
    const commerce = await connect(f, 'commerce-beta');
    const payments = await connect(f, 'payments');
    assert.equal(payments.issued.body.site_id, commerce.body.site_id, 'Payments joins the store Commerce registered');
    assert.equal(payments.issued.body.token_type, 'Bearer', 'Payments still gets its 5-minute admin pass');
    assert.match(payments.issued.body.store_key, /^dk_store_/, 'and its own store key for its status page');
    const ship = await connect(f, 'ship-beta');
    assert.deepEqual(Object.keys(ship.issued.body).sort(), ['site_id', 'store_key']);
    assert.equal(count(f, "dinkuskit_service_grant WHERE service = 'ship' AND revoked = 0"), 1, 'connecting the Ship plugin turns Ship on (store-connect-ship-on-at-setup-126)');
    const keys = [payments, commerce, ship].map(c => c.issued.body.store_key);
    assert.equal(new Set(keys).size, 3);
    assert.equal(count(f, 'dinkuskit_plugin_key WHERE site_id = ?', commerce.body.site_id), 3);
  } finally { f.close(); }
});

test('Ship approval refuses a store whose Commerce was disconnected after Connect started', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const ship = await start(f, 'ship'); assert.equal(ship.response.status, 200);
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-a', siteId: commerce.body.site_id, organizationId: 'a', actorUserId: 'alice', plugin: 'commerce' }), true);
    assert.deepEqual(await consent(f, ship), { ok: false, reason: 'connect_commerce_first', status: 409 });
  } finally { f.close(); }
});

test('each plugin key gets only its own plugin\'s passes', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const payments = await connect(f, 'payments');
    const siteId = commerce.body.site_id;
    const owner = { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice' };
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'ship', on: true }), 'on');
    const ship = await connect(f, 'ship');
    const pass = trader(f, siteId);
    const [commerceKey, paymentsKey, shipKey] = [commerce, payments, ship].map(c => c.issued.body.store_key);
    const ok = { status: 200 };
    const refused = { status: 403, body: { error: 'scope_not_allowed' } };
    const check = async (key, scope, audience, expected) => {
      const result = await pass(key, scope, audience);
      if (expected.status === 200) assert.equal(result.status, 200, `${scope} for ${audience}`);
      else assert.deepEqual(result, expected, `${scope} for ${audience}`);
    };
    await check(commerceKey, 'payments:checkout', 'dinkus-payments', ok);
    await check(commerceKey, 'ship:orders', 'dinkus-ship', ok);
    await check(commerceKey, 'commerce:settings', 'dinkuskit', ok);
    await check(commerceKey, 'ship:admin', 'dinkus-ship', refused);
    await check(commerceKey, 'coupons:checkout', 'dinkus-coupons', refused);
    await check(paymentsKey, 'payments:checkout', 'dinkus-payments', ok);
    await check(paymentsKey, 'commerce:settings', 'dinkuskit', refused);
    await check(paymentsKey, 'ship:orders', 'dinkus-ship', refused);
    await check(shipKey, 'ship:admin', 'dinkus-ship', ok);
    await check(shipKey, 'payments:checkout', 'dinkus-payments', refused);
    await check(shipKey, 'ship:orders', 'dinkus-ship', refused);
    // A key pasted before Connect still has its row, but gets nothing (store-connect-no-paste-082).
    const legacy = newStoreKey();
    f.sqlite.prepare('INSERT INTO dinkuskit_store_key (site_id,key_hash,created_by_user_id,created_at,last_used_at,window_start,window_count) VALUES (?, ?, ?, 1, NULL, 0, 0)').run(siteId, await hashKey(legacy), 'alice');
    const gone = { status: 401, body: { error: 'invalid_store_key' } };
    for (const [scope, audience] of [['payments:checkout', 'dinkus-payments'], ['ship:orders', 'dinkus-ship'], ['ship:admin', 'dinkus-ship'], ['commerce:settings', 'dinkuskit']]) await check(legacy, scope, audience, gone);
    assert.equal(f.sqlite.prepare('SELECT last_used_at FROM dinkuskit_store_key WHERE site_id = ?').get(siteId).last_used_at, null, 'an old key is never marked used');
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'ship', on: false }), 'off');
    assert.deepEqual(await pass(shipKey, 'ship:admin', 'dinkus-ship'), { status: 403, body: { error: 'service_not_enabled' } }, 'the owner\'s Ship switch still decides');
    assert.deepEqual(await pass(commerceKey, 'payments:checkout', 'dinkus-other'), { status: 400, body: { error: 'invalid_request' } });
    assert.deepEqual(await trader(f, 'another-site')(commerceKey, 'payments:checkout', 'dinkus-payments'), { status: 403, body: { error: 'site_mismatch' } });
  } finally { f.close(); }
});

test('Connect again replaces only that plugin\'s key, and Disconnect stops it at once', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const payments = await connect(f, 'payments');
    const siteId = commerce.body.site_id;
    const pass = trader(f, siteId);
    const again = await connect(f, 'commerce');
    assert.notEqual(again.issued.body.store_key, commerce.issued.body.store_key);
    assert.deepEqual(await pass(commerce.issued.body.store_key, 'payments:checkout', 'dinkus-payments'), { status: 401, body: { error: 'invalid_store_key' } });
    assert.equal((await pass(again.issued.body.store_key, 'payments:checkout', 'dinkus-payments')).status, 200);
    assert.equal((await pass(payments.issued.body.store_key, 'payments:checkout', 'dinkus-payments')).status, 200, 'the Payments key is untouched');
    const owner = { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice' };
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-b', siteId, organizationId: 'b', actorUserId: 'bob', plugin: 'payments' }), false, 'another business cannot disconnect it');
    assert.equal(await disconnectPlugin(f.db, { ...owner, plugin: 'other' }), false);
    assert.equal(await disconnectPlugin(f.db, { ...owner, plugin: 'payments' }), true);
    assert.deepEqual(await pass(payments.issued.body.store_key, 'payments:checkout', 'dinkus-payments'), { status: 401, body: { error: 'invalid_store_key' } });
    assert.equal((await pass(again.issued.body.store_key, 'payments:checkout', 'dinkus-payments')).status, 200, 'Commerce keeps working');
    const listed = (await listStoreSetup(f.db, 'org-a'))[0];
    assert.equal(listed.plugins.payments, null); assert.ok(listed.plugins.commerce.lastUsedAt);
  } finally { f.close(); }
});

test('an approved Connect not yet picked up dies with Disconnect, so it cannot bring the key back', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const siteId = commerce.body.site_id;
    const late = await start(f, 'commerce');
    assert.equal((await consent(f, late)).ok, true, 'approved, but the plugin has not checked back yet');
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', plugin: 'commerce' }), true);
    assert.deepEqual(await exchange(f, late), { status: 400, body: { error: 'access_denied' } });
    assert.equal(count(f, "dinkuskit_plugin_key WHERE site_id = ? AND plugin = 'commerce'", siteId), 0);
    assert.equal((await connect(f, 'commerce')).issued.status, 200, 'Connect again with fresh consent still works');
  } finally { f.close(); }
});

test('Disconnect cancels an approved first-time or reconnect Connect even before any plugin key exists', async () => {
  const f = await fixture(); try {
    const firstCommerce = await start(f, 'commerce');
    assert.equal((await consent(f, firstCommerce)).ok, true);
    const siteId = firstCommerce.body.site_id;
    assert.equal(count(f, "dinkuskit_plugin_key WHERE site_id = ? AND plugin = 'commerce'", siteId), 0);
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-b', siteId, organizationId: 'b', actorUserId: 'bob', plugin: 'commerce' }), false, 'another business cannot cancel an approved Connect');
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', plugin: 'commerce' }), true);
    assert.deepEqual(await exchange(f, firstCommerce), { status: 400, body: { error: 'access_denied' } });
    assert.equal(count(f, "dinkuskit_plugin_key WHERE site_id = ? AND plugin = 'commerce'", siteId), 0);
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', plugin: 'commerce' }), false, 'nothing left to disconnect');

    const connectedCommerce = await connect(f, 'commerce');
    assert.equal(connectedCommerce.issued.status, 200);
    const firstShip = await start(f, 'ship');
    assert.equal((await consent(f, firstShip)).ok, true);
    assert.equal(count(f, "dinkuskit_plugin_key WHERE site_id = ? AND plugin = 'ship'", siteId), 0);
    assert.equal(await disconnectPlugin(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', plugin: 'ship' }), true);
    assert.deepEqual(await exchange(f, firstShip), { status: 400, body: { error: 'access_denied' } });
    assert.equal(count(f, "dinkuskit_plugin_key WHERE site_id = ? AND plugin = 'ship'", siteId), 0);
  } finally { f.close(); }
});

test('an uninstall whose key the owner disconnected meanwhile cancels nothing, and cannot deny the Connect approved since', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const payments = await connect(f, 'payments');
    const siteId = commerce.body.site_id;
    let fresh;
    // The uninstall has read its key; before it writes, the owner disconnects Payments and approves a new Connect.
    const paused = { ...f.db, prepare(sql) {
      const q = f.db.prepare(sql);
      if (!sql.startsWith('SELECT site_id, plugin FROM dinkuskit_plugin_key')) return q;
      return { bind(...args) { q.bind(...args); return { async first() {
        const row = await q.first();
        assert.equal(await disconnectPlugin(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', plugin: 'payments' }), true);
        fresh = await start(f, 'payments'); assert.equal((await consent(f, fresh)).ok, true);
        return row;
      } }; } };
    }, batch: queries => f.db.batch(queries) };
    const cancelled = await cancelPluginKey({ db: paused, authorization: `Bearer ${payments.issued.body.store_key}`, body: { site_id: siteId } });
    assert.deepEqual([cancelled.status, await cancelled.json()], [401, { error: 'invalid_store_key' }], 'the key was no longer current');
    const issued = await exchange(f, fresh);
    assert.equal(issued.status, 200, 'the Connect the owner approved still picks up its key');
    assert.match(issued.body.store_key, /^dk_store_/);
    const plain = await cancelPluginKey({ db: f.db, authorization: `Bearer ${issued.body.store_key}`, body: { site_id: siteId } });
    assert.deepEqual([plain.status, await plain.json()], [200, { cancelled: true }], 'a current key still cancels itself');
    assert.equal(count(f, "dinkuskit_plugin_key WHERE site_id = ? AND plugin = 'commerce'", siteId), 1, 'Commerce keeps its key');
  } finally { f.close(); }
});

test('another business cannot connect a plugin to a store it does not own', async () => {
  const f = await fixture(); try {
    await connect(f, 'commerce');
    const ship = await start(f, 'ship'); assert.equal(ship.response.status, 200);
    assert.equal((await consent(f, ship, 'bob')).ok, false);
    const commerce = await start(f, 'commerce');
    assert.equal((await consent(f, commerce, 'bob')).ok, false, 'Commerce Connect again needs the same owner');
    assert.deepEqual(await exchange(f, commerce), { status: 400, body: { error: 'authorization_pending', interval: 5 } });
  } finally { f.close(); }
});

test('Commerce reads its checkout settings with its own pass, and nothing else can', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const payments = await connect(f, 'payments');
    const siteId = commerce.body.site_id;
    const pass = trader(f, siteId);
    const privateJwkJson = JSON.stringify(f.keys.privateJwk);
    const calls = [];
    const fetchStatus = async input => { calls.push(input); return { status: 200, body: { state: 'ready', bindingRef: 'bind_1', connectionEvidence: { provider: 'stripe', accountRef: 'acct_1Test' } } }; };
    const read = async token => {
      const response = await serveCommerceSettings({ db: f.db, authorization: token ? `Bearer ${token}` : null, privateJwkJson, fetchStatus });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
    };
    const settingsPass = (await pass(commerce.issued.body.store_key, 'commerce:settings', 'dinkuskit')).body.access_token;
    assert.deepEqual((await read(settingsPass)).body, { error: 'commerce_not_set_up' }, 'the owner has not chosen shipping and test or live yet');
    assert.ok(await saveCommerceSettings(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', choices: { shippingMode: 'flat', shippingMinor: 500, live: false } }));
    const read1 = await read(settingsPass);
    assert.equal(read1.status, 200); assert.equal(read1.cache, 'no-store');
    assert.equal(read1.body.schema, 'dinkuskit.commerce.registry-checkout/v1');
    assert.deepEqual([read1.body.siteId, read1.body.commerceOrigin, read1.body.bindingRef, read1.body.stripeAccountId, read1.body.mode], [siteId, STORE, 'bind_1', 'acct_1Test', 'test']);
    assert.deepEqual(read1.body.shipping, { configurationId: `shipping-${siteId}`, revision: 1, mode: 'flat', amount: { currency: 'USD', minor: '500' } });
    assert.equal('ship' in read1.body, false);
    assert.equal(calls.at(-1).siteId, siteId);
    assert.ok(await saveCommerceSettings(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', choices: { shippingMode: 'free', shippingMinor: 0, live: true } }));
    assert.equal(await setOwnerService(f.db, { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice', service: 'ship', on: true }), 'on');
    const read2 = (await read(settingsPass)).body;
    assert.deepEqual([read2.mode, read2.shipping.mode, read2.shipping.revision], ['live', 'free', 2], 'a change on DinkusKit.com reaches Commerce with no paste');
    assert.deepEqual(read2.ship, { origin: 'https://ship.dinkuskit.com', audience: 'dinkus-ship' });
    const paymentsPass = (await pass(commerce.issued.body.store_key, 'payments:checkout', 'dinkus-payments')).body.access_token;
    for (const token of [null, 'not-a-pass', paymentsPass, (await pass(payments.issued.body.store_key, 'payments:checkout', 'dinkus-payments')).body.access_token]) {
      assert.deepEqual(await read(token), { status: 401, cache: 'no-store', body: { error: 'invalid_pass' } });
    }
    // A pass is good for five minutes: a business suspended or an owner disabled inside them
    // gets no settings, and DinkusKit.com makes no Payments call for it.
    for (const [suspend, restore] of [
      ["UPDATE dinkuskit_organization SET status = 'suspended' WHERE organization_id = 'a'", "UPDATE dinkuskit_organization SET status = 'active' WHERE organization_id = 'a'"],
      ["UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'alice'", "UPDATE dinkuskit_account SET disabled = 0 WHERE user_id = 'alice'"],
      ["UPDATE dinkuskit_membership SET status = 'suspended' WHERE user_id = 'alice'", "UPDATE dinkuskit_membership SET status = 'active' WHERE user_id = 'alice'"],
    ]) {
      f.sqlite.prepare(suspend).run();
      const before = calls.length;
      assert.deepEqual(await read(settingsPass), { status: 403, cache: 'no-store', body: { error: 'store_suspended' } });
      assert.equal(calls.length, before, 'no Payments call for a suspended store');
      f.sqlite.prepare(restore).run();
    }
    assert.equal((await read(settingsPass)).status, 200);
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked = 1, revoked_by = 'owner' WHERE service = 'payments'").run();
    assert.deepEqual((await read(settingsPass)).body, { error: 'payments_not_connected' });
  } finally { f.close(); }
});


// connect-finish-setup-disconnect-137: the owner's Disconnect or Revoke wins over a Finish setup
// already past its checks, because the approval write itself checks it.
async function finishWhile(f, c, during) {
  const response = await finishStoreSetup({ db: f.db, jwtPrivateJwk: JSON.stringify(f.keys.privateJwk), baseUrl: 'https://dinkuskit.com',
    proofFetch: async () => { await during(); return { ok: true, transport: 'simulation', receipt: c.receipt }; },
    body: { client_id: c.request.client_id, connection_id: c.body.connection_id, code_verifier: c.verifier } });
  return { status: response.status, body: await response.json() };
}

test('a Disconnect pressed while Finish setup reads the store receipt stops it before any key or grant', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const siteId = commerce.body.site_id;
    const owner = { ...f.merchant('alice'), actorUserId: 'alice', siteId };
    const payments = await connect(f, 'payments');
    for (const plugin of ['payments', 'ship']) {
      if (plugin === 'ship') await connect(f, 'ship');
      const c = await start(f, plugin);
      const raced = await finishWhile(f, c, () => disconnectPlugin(f.db, { ...owner, plugin }));
      assert.equal(raced.status, 409, `${plugin}: refused`);
      assert.equal(raced.body.store_key, undefined);
      assert.equal(count(f, 'dinkuskit_plugin_key WHERE site_id = ? AND plugin = ?', siteId, plugin), 0, `${plugin}: no key is issued`);
      assert.equal(count(f, "dinkuskit_store_connection WHERE connection_id = ? AND status = 'denied'", c.body.connection_id), 1, `${plugin}: the in-flight connection died with the Disconnect`);
    }
    assert.equal(count(f, "dinkuskit_service_grant WHERE site_id = ? AND service = 'ship' AND revoked = 0", siteId), 0, 'Ship stays off');
    assert.ok(payments.issued.body.store_key);
  } finally { f.close(); }
});

test('the approval write itself refuses Finish setup once the owner disconnected or revoked, even for a connection still waiting', async () => {
  const f = await fixture(); try {
    const commerce = await connect(f, 'commerce');
    const siteId = commerce.body.site_id;
    // The owner's word lands between the checks and the approval, without touching the waiting connection.
    const cases = [
      ['payments', () => f.sqlite.prepare('INSERT INTO dinkuskit_plugin_disconnect (site_id, plugin, disconnected_at) VALUES (?, ?, 1)').run(siteId, 'payments')],
      ['ship', () => f.sqlite.prepare("INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at, revoked_at, revoked_by) VALUES (?, 'ship', 1, 1, 2, 'owner')").run(siteId)],
    ];
    for (const [plugin, during] of cases) {
      const c = await start(f, plugin);
      const raced = await finishWhile(f, c, async () => during());
      assert.deepEqual([raced.status, raced.body], [409, { error: 'owner_approval_required' }], `${plugin}: only the owner's Approve now`);
      assert.equal(count(f, 'dinkuskit_plugin_key WHERE site_id = ? AND plugin = ?', siteId, plugin), 0);
      assert.equal(count(f, "dinkuskit_store_connection WHERE connection_id = ? AND status = 'pending'", c.body.connection_id), 1, 'the owner can still approve it');
      assert.equal(count(f, "dinkuskit_service_grant WHERE site_id = ? AND service = ? AND revoked = 0", siteId, plugin), 0);
      // The owner's own Approve brings it back.
      assert.equal((await consent(f, c)).ok, true);
      assert.equal((await exchange(f, c)).status, 200);
    }
  } finally { f.close(); }
});
