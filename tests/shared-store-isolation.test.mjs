import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { startStoreConnection, consentStoreConnection, exchangeStoreConnectionToken } from '../src/account/connect.ts';
import { createLocalTestKeys } from '../src/account/jwt.ts';
import { revokeServiceGrant } from '../src/account/store.ts';
import { cutOffStore, restoreStore } from '../src/account/operator-admin.ts';
import { issueStorePass, listStoreSetup, replaceStoreKey, setOwnerService } from '../src/account/store-passes.ts';
import { checkoutSettingsJson, dollarsToMinor, loadCommerceSettings, readPaymentsBinding, saveCommerceSettings } from '../src/account/commerce-settings.ts';
import {
  PAYMENTS_BETA_CALLBACK_PATH, PAYMENTS_BETA_PROOF_PATH, PAYMENTS_BETA_REGISTRY_IDENTITY,
  PAYMENTS_CALLBACK_PATH, PAYMENTS_PROOF_PATH, PAYMENTS_REGISTRY_IDENTITY,
} from '../src/account/config.ts';
import { stripTypeScriptTypes } from 'node:module';

test('Payments registration matches pinned EmDash Registry publisher identity and rejects unregistered paths', async () => {
  const source = await readFile(new URL('../node_modules/emdash/src/registry/plugin-id.ts', import.meta.url), 'utf8');
  const { makeRegistryPluginId } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  const id = await makeRegistryPluginId('did:plc:ekk4pjmkh3k3ql2kfoex3qt4', 'dinkus-payments');
  assert.equal(id, 'r_3brsc2on3bu673rn');
  assert.deepEqual(PAYMENTS_REGISTRY_IDENTITY, { publisherDid: 'did:plc:ekk4pjmkh3k3ql2kfoex3qt4', slug: 'dinkus-payments', installedPluginId: id });
  assert.equal(PAYMENTS_CALLBACK_PATH, `/_emdash/admin/plugins/${id}/status`);
  assert.equal(PAYMENTS_PROOF_PATH, `/_emdash/api/plugins/${id}/store-proof`);
  const betaId = await makeRegistryPluginId('did:plc:ekk4pjmkh3k3ql2kfoex3qt4', 'dinkus-payments-beta');
  assert.equal(betaId, 'r_sffx6l4z6mpqliki');
  assert.deepEqual(PAYMENTS_BETA_REGISTRY_IDENTITY, { publisherDid: 'did:plc:ekk4pjmkh3k3ql2kfoex3qt4', slug: 'dinkus-payments-beta', installedPluginId: betaId });
  assert.equal(PAYMENTS_BETA_CALLBACK_PATH, `/_emdash/admin/plugins/${betaId}/status`);
  assert.equal(PAYMENTS_BETA_PROOF_PATH, `/_emdash/api/plugins/${betaId}/store-proof`);
  const otherId = await makeRegistryPluginId('did:plc:otherpublisher', 'dinkus-payments');
  const otherBetaId = await makeRegistryPluginId('did:plc:otherpublisher', 'dinkus-payments-beta');
  const f = await fixture(); try {
    for (const path of [
      '/_emdash/admin/plugins/dinkus-payments/status',
      '/_emdash/admin/plugins/dinkus-payments-beta/status',
      `/_emdash/admin/plugins/${otherId}/status`,
      `/_emdash/admin/plugins/${otherBetaId}/status`,
      `/_emdash/admin/plugins/${betaId}/store-proof`,
      `/_emdash/admin/plugins/${id}/status?next=elsewhere`,
      `/_emdash/admin/plugins/${id}/other`,
    ]) {
      const result = await start(f, 'payments', 'https://store.example.test', { callback_uri: `https://store.example.test${path}` });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error, 'invalid_callback');
    }
  } finally { f.close(); }
});

const registrations = {
  inventory: { client: 'dinkus-inventory-emdash', callback: '/_emdash/admin/plugins/dinkus-inventory/inventory', audience: 'inventory', scope: 'inventory:admin' },
  payments: { client: 'dinkus-payments-emdash', callback: '/_emdash/admin/plugins/r_3brsc2on3bu673rn/status', audience: 'dinkus-payments', scope: 'payments:admin' },
  'payments-beta': { client: 'dinkus-payments-emdash', service: 'payments', callback: '/_emdash/admin/plugins/r_sffx6l4z6mpqliki/status', audience: 'dinkus-payments', scope: 'payments:admin' },
};
async function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const files = (await readdir('migrations/merchant')).filter(n => n.endsWith('.sql')).sort();
  for (const file of files.filter(n => n < '0007')) sqlite.exec(await readFile(`migrations/merchant/${file}`, 'utf8'));
  sqlite.prepare("INSERT INTO dinkuskit_site_binding VALUES ('old-dev-id', 'https://old-dev.example.test', 'old-dev-owner', 'inventory', 1, 123, 456)").run();
  const legacyBefore = sqlite.prepare('SELECT * FROM dinkuskit_site_binding').all();
  for (const file of files.filter(n => n >= '0007')) sqlite.exec(await readFile(`migrations/merchant/${file}`, 'utf8'));
  let beforeBatch = null;
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let args = [];
    const q = { bind(...values) { args = values; return q; }, async first() { return stmt.get(...args) ?? null; }, async all() { return { success: true, results: stmt.all(...args) }; }, async run() { return { success: true, meta: { changes: stmt.run(...args).changes } }; }, execute() { return { success: true, meta: { changes: stmt.run(...args).changes } }; } };
    return q;
  }, async batch(queries) { const hook = beforeBatch; beforeBatch = null; hook?.(); return sqlite.transaction(() => queries.map(q => q.execute()))(); } };
  for (const user of ['alice','bob','staff']) {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(user, user, `${user}@example.test`);
    sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES (?, ?, 1, 1)').run(user, `personal-${user}`);
  }
  for (const [org, owner] of [['a','alice'],['b','bob']]) {
    sqlite.prepare("INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at) VALUES (?, ?, 'active', ?, ?, 'admitted', ?, 1, 1)").run(org, org, owner, `org-${org}`, owner);
    sqlite.prepare("INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active', '[]', 1, 1)").run(org, owner);
    sqlite.prepare('INSERT INTO dinkuskit_user_selection VALUES (?, ?, 1)').run(owner, org);
  }
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'staff', 'member', 'active', '[\"site:view\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_user_selection VALUES ('staff', 'a', 1)").run();
  const keys = await createLocalTestKeys();
  const merchant = (user = 'alice') => ({ userId: user, email: `${user}@example.test`, subject: user === 'bob' ? 'org-b' : 'org-a', organizationId: user === 'bob' ? 'b' : 'a', accountId: JSON.stringify(['https://dinkuskit.com/account', user === 'bob' ? 'org-b' : 'org-a']) });
  return { sqlite, db, legacyBefore, keys, merchant, beforeBatch(hook) { beforeBatch = hook; }, close() { sqlite.close(); } };
}
async function start(f, installation = 'inventory', origin = 'https://store.example.test', extra = {}) {
  const reg = registrations[installation]; const service = reg.service ?? installation; const verifier = randomBytes(32).toString('base64url');
  const request = { protocol_version: 2, client_id: reg.client, service, site_origin: origin, callback_uri: origin + reg.callback, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...extra };
  const response = await startStoreConnection(f.db, request, 'https://dinkuskit.com');
  const body = await response.json();
  return { request, response, body, verifier, receipt: { version: 2, connection_id: body.connection_id, challenge: body.challenge, client_id: reg.client, service, site_id: body.site_id, site_origin: origin, callback_uri: origin + reg.callback, code_challenge: request.code_challenge, expires_at: body.expires_at } };
}
async function consent(f, c, user = 'alice', overrides = {}) {
  const merchant = f.merchant(user);
  return consentStoreConnection({ db: f.db, merchant, organizationId: merchant.organizationId, connectionId: c.body.connection_id, action: 'approve', proofFetch: async () => ({ ok: true, transport: 'simulation', receipt: c.receipt }), ...overrides });
}
async function exchange(f, c, extra = {}) {
  return exchangeStoreConnectionToken({ db: f.db, jwtPrivateJwk: JSON.stringify(f.keys.privateJwk), proofFetch: async () => ({ ok: true, transport: 'simulation', receipt: c.receipt }), body: { client_id: c.request.client_id, connection_id: c.body.connection_id, code_verifier: c.verifier, ...extra } });
}
const count = (f, table) => f.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;

for (const order of [['inventory','payments'],['payments','inventory']]) test(`independent contract: ${order.join(' then ')} shares identity, never grants the second service implicitly`, async () => {
  const f = await fixture(); try {
    const first = await start(f, order[0]); assert.equal(first.response.status, 200); assert.equal(first.body.protocol_version, 2);
    assert.equal(count(f,'dinkuskit_store_identity'), 0); assert.equal(count(f,'dinkuskit_service_grant'), 0);
    assert.equal((await consent(f, first)).ok, true); assert.equal(count(f,'dinkuskit_service_grant'), 1);
    const second = await start(f, order[1]); assert.equal(second.body.site_id, first.body.site_id);
    assert.equal((await exchange(f, second)).status, 400, 'an existing other-service grant does not approve this transaction');
    assert.equal((await consent(f, second)).ok, true); assert.equal(count(f,'dinkuskit_store_identity'), 1); assert.equal(count(f,'dinkuskit_service_grant'), 2);
    for (const c of [first, second]) {
      const response = await exchange(f,c); assert.equal(response.status, 200); const issued = await response.json();
      assert.equal(issued.site_id, first.body.site_id);
      const jwks = createLocalJWKSet({ keys: [f.keys.publicJwk] });
      const { payload } = await jwtVerify(issued.access_token, jwks, { issuer: 'https://dinkuskit.com/account', audience: registrations[c.request.service].audience });
      assert.equal(payload.sub, 'org-a'); assert.equal(payload.site_id, issued.site_id); assert.equal(payload.scope, registrations[c.request.service].scope); assert.equal(payload.exp - payload.iat, 300);
      const other = c.request.service === 'inventory' ? 'payments' : 'inventory';
      await assert.rejects(jwtVerify(issued.access_token, jwks, { audience: registrations[other].audience }));
    }
  } finally { f.close(); }
});

test('independent contract: legacy records remain unchanged and confer no v2 authority', async () => {
  const f = await fixture(); try {
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM dinkuskit_site_binding').all(), f.legacyBefore);
    assert.equal(count(f,'dinkuskit_store_identity'),0); assert.equal(count(f,'dinkuskit_service_grant'),0);
    for (const version of [undefined,1,3,'2']) { const c = await start(f,'inventory',undefined,{ protocol_version: version }); assert.equal(c.response.status,400); }
    const postedId = await start(f,'payments',undefined,{ site_id:'forged' }); assert.equal(postedId.response.status,400);
    assert.equal(count(f,'dinkuskit_store_connection'),0);
  } finally { f.close(); }
});

test('independent contract: owner, organization and store boundaries hold despite matching origin receipt', async () => {
  const f = await fixture(); try {
    const first = await start(f); assert.equal((await consent(f,first)).ok,true);
    const otherService = await start(f,'payments');
    assert.equal((await consent(f,otherService,'bob')).ok,false); assert.equal((await consent(f,otherService,'staff')).ok,false);
    assert.equal(count(f,'dinkuskit_service_grant'),1);
    const otherStore = await start(f,'payments','https://different.example.test'); assert.notEqual(otherStore.body.site_id,first.body.site_id);
    assert.equal((await consent(f,otherStore,'alice',{proofFetch:async()=>({ok:true,transport:'simulation',receipt:otherService.receipt})})).ok,false);
    assert.equal(count(f,'dinkuskit_store_identity'),1);
  } finally { f.close(); }
});

test('independent contract: wrong client and swapped proof cannot redeem or widen a grant', async () => {
  const f = await fixture(); try {
    const c = await start(f); assert.equal((await consent(f,c)).ok,true);
    const wrong = await exchange(f,c,{client_id:registrations.payments.client}); assert.equal(wrong.status,400);
    assert.equal((await exchange(f,c)).status,200,'wrong client did not consume legitimate transaction');
    const p = await start(f,'payments');
    for (const field of ['version','client_id','service','site_id','callback_uri','code_challenge','challenge','connection_id','expires_at']) {
      const receipt = {...p.receipt,[field]:typeof p.receipt[field] === 'number' ? p.receipt[field]+1 : 'wrong'};
      assert.equal((await consent(f,p,'alice',{proofFetch:async()=>({ok:true,transport:'simulation',receipt})})).ok,false,field);
    }
    assert.equal(count(f,'dinkuskit_service_grant'),1);
  } finally { f.close(); }
});

test('independent contract: concurrent provisional identities cannot split one origin', async () => {
  const f = await fixture(); try {
    const a = await start(f,'inventory'); const b = await start(f,'payments'); assert.notEqual(a.body.site_id,b.body.site_id);
    const results = await Promise.all([consent(f,a),consent(f,b)]); assert.equal(results.filter(r=>r.ok).length,1);
    assert.equal(count(f,'dinkuskit_store_identity'),1); assert.equal(count(f,'dinkuskit_service_grant'),1);
    const retry = await start(f,results[0].ok?'payments':'inventory'); assert.equal((await consent(f,retry)).ok,true); assert.equal(count(f,'dinkuskit_service_grant'),2);
  } finally { f.close(); }
});

test('independent contract: revocation is service-specific; an owner revoke needs fresh consent and an operator cut-off refuses until restored', async () => {
  const f = await fixture(); try {
    const i = await start(f); assert.equal((await consent(f,i)).ok,true);
    const p = await start(f,'payments'); assert.equal((await consent(f,p)).ok,true);
    const siteId = i.body.site_id;
    assert.equal(await revokeServiceGrant(f.db,'org-a',siteId,'inventory','alice','a'),true);
    assert.equal((await exchange(f,i)).status,400); assert.equal((await exchange(f,p)).status,200);
    const again = await start(f); assert.equal((await consent(f,again)).ok,true);
    assert.equal((await exchange(f,i)).status,400,'a connection approved before the revoke stays dead after reconnecting');
    assert.equal((await exchange(f,again)).status,200);
    const operator = { userId: 'cms-admin', email: 'operator@example.test' };
    const unredeemed = await start(f,'payments'); assert.equal((await consent(f,unredeemed)).ok,true);
    assert.equal(await cutOffStore(f.db,siteId,'payments',operator),1);
    const refused = await start(f,'payments'); assert.equal((await consent(f,refused)).ok,false);
    assert.equal(await restoreStore(f.db,siteId,'payments',operator),1);
    const restored = await start(f,'payments'); assert.equal((await consent(f,restored)).ok,true);
    assert.equal((await exchange(f,unredeemed)).status,400,'a connection approved before the cut-off stays dead after restore');
    assert.equal((await exchange(f,restored)).status,200);
    assert.equal(count(f,'dinkuskit_store_identity'),1);
  } finally { f.close(); }
});

test('independent contract: ownership loss at atomic write denies grant creation', async () => {
  const f = await fixture(); try {
    const c = await start(f);
    f.beforeBatch(()=>f.sqlite.prepare("UPDATE dinkuskit_membership SET status='removed' WHERE user_id='alice'").run());
    assert.equal((await consent(f,c)).ok,false);
    assert.equal(count(f,'dinkuskit_store_identity'),0); assert.equal(count(f,'dinkuskit_service_grant'),0);
  } finally { f.close(); }
});

test('independent contract: an expired or denied transaction cannot reserve canonical identity during proof', async () => {
  for (const change of ["status='denied'", 'expires_at=1', "account_subject='org-b'"]) {
    const f = await fixture(); try {
      const c = await start(f);
      const result = await consent(f,c,'alice',{proofFetch:async()=>{
        f.sqlite.prepare(`UPDATE dinkuskit_store_connection SET ${change} WHERE connection_id=?`).run(c.body.connection_id);
        return {ok:true,transport:'simulation',receipt:c.receipt};
      }});
      assert.equal(result.ok,false,change);
      assert.equal(count(f,'dinkuskit_store_identity'),0,`${change}: denied operation must not reserve origin`);
      assert.equal(count(f,'dinkuskit_service_grant'),0);
    } finally { f.close(); }
  }
});

test('independent contract: registrations reject callback swapping, unknown services and caller-selected identity', async () => {
  const f = await fixture(); try {
    for (const extra of [
      {callback_uri:'https://store.example.test/_emdash/admin/plugins/dinkus-inventory/inventory'},
      {client_id:'dinkus-inventory-emdash'}, {service:'ship'}, {site_id:'caller-chosen'},
    ]) { assert.equal((await start(f,'payments',undefined,extra)).response.status,400,JSON.stringify(extra)); }
    assert.equal(count(f,'dinkuskit_store_connection'),0);
  } finally { f.close(); }
});

test('independent contract: proof transport selects only the registered service path', async () => {
  const {fetchStoreProofReceipt} = await import('../src/account/proof-fetch.ts');
  const original = globalThis.fetch; const requested=[];
  globalThis.fetch = async (url, options) => {
    requested.push({url:String(url),options});
    return new Response(JSON.stringify({version:2,connection_id:'proof-id',challenge:'challenge',client_id:'registered',service:'registered',site_id:'canonical-id',site_origin:'https://store.example.test',callback_uri:'https://store.example.test/callback',code_challenge:'pkce',expires_at:Date.now()+1000}), {status:200});
  };
  try {
    for (const [installation, installedId] of [['inventory','dinkus-inventory'],['payments','r_3brsc2on3bu673rn'],['payments-beta','r_sffx6l4z6mpqliki']]) {
      const reg=registrations[installation];
      const result=await fetchStoreProofReceipt({siteOrigin:'https://store.example.test',connectionId:'proof-id',clientId:reg.client,service:reg.service ?? installation,callbackUri:`https://store.example.test${reg.callback}`});
      assert.equal(result.ok,true);
      assert.equal(requested.at(-1).url,`https://store.example.test/_emdash/api/plugins/${installedId}/store-proof?connection_id=proof-id`);
      assert.equal(requested.at(-1).options.redirect,'manual');
    }
    for (const [label, input] of [
      ['client of another service', {clientId:registrations.inventory.client,service:'payments',callbackUri:`https://store.example.test${registrations.payments.callback}`}],
      ['callback of another service', {clientId:registrations.payments.client,service:'payments',callbackUri:`https://store.example.test${registrations.inventory.callback}`}],
      ['callback on another origin', {clientId:registrations.payments.client,service:'payments',callbackUri:`https://other.example.test${registrations['payments-beta'].callback}`}],
      ['unregistered installation', {clientId:registrations.payments.client,service:'payments',callbackUri:'https://store.example.test/_emdash/admin/plugins/dinkus-payments-beta/status'}],
      ['no callback', {clientId:registrations.payments.client,service:'payments',callbackUri:''}],
    ]) {
      const result=await fetchStoreProofReceipt({siteOrigin:'https://store.example.test',connectionId:'proof-id',...input});
      assert.deepEqual([result.ok,result.reason],[false,'unregistered_service'],label);
    }
    assert.equal(requested.length,3);
  } finally { globalThis.fetch=original; }
});

test('independent contract: production consent checks the store through the network transport', async () => {
  const {fetchStoreProofReceipt} = await import('../src/account/proof-fetch.ts');
  const original = globalThis.fetch;
  for (const [label, reply, ok] of [
    ['matching receipt', c => new Response(JSON.stringify(c.receipt), {status:200}), true],
    ['store says no', () => new Response('not found', {status:404}), false],
    ['redirect', () => new Response(null, {status:302, headers:{location:'https://elsewhere.example.test/'}}), false],
  ]) {
    const f = await fixture(); try {
      const c = await start(f, 'payments'); const requested = [];
      globalThis.fetch = async url => { requested.push(String(url)); return reply(c); };
      const result = await consent(f, c, 'alice', { proofFetch: fetchStoreProofReceipt });
      assert.equal(result.ok, ok, label);
      assert.deepEqual(requested, [`https://store.example.test/_emdash/api/plugins/r_3brsc2on3bu673rn/store-proof?connection_id=${c.body.connection_id}`], label);
      assert.equal(count(f,'dinkuskit_service_grant'), ok ? 1 : 0, label);
    } finally { globalThis.fetch = original; f.close(); }
  }
});

test('independent contract: the Payments beta connects with its own callback and store check', async () => {
  const {fetchStoreProofReceipt} = await import('../src/account/proof-fetch.ts');
  const original = globalThis.fetch;
  const betaProof = id => `https://store.example.test/_emdash/api/plugins/r_sffx6l4z6mpqliki/store-proof?connection_id=${id}`;
  const f = await fixture(); try {
    const c = await start(f, 'payments-beta'); assert.equal(c.response.status, 200);
    assert.equal(f.sqlite.prepare('SELECT callback_uri FROM dinkuskit_store_connection WHERE connection_id = ?').get(c.body.connection_id).callback_uri, 'https://store.example.test/_emdash/admin/plugins/r_sffx6l4z6mpqliki/status');
    const stableShaped = { ...c.receipt, callback_uri: `https://store.example.test${registrations.payments.callback}` };
    assert.deepEqual(await consent(f, c, 'alice', { proofFetch: async () => ({ ok: true, transport: 'simulation', receipt: stableShaped }) }), { ok: false, reason: 'proof_mismatch_callback_uri', status: 403 }, 'a stable-shaped receipt does not prove a beta connection');
    const requested = [];
    globalThis.fetch = async url => { requested.push(String(url)); return String(url) === betaProof(c.body.connection_id) ? new Response(JSON.stringify(c.receipt), { status: 200 }) : new Response('not found', { status: 404 }); };
    assert.deepEqual(await consent(f, c, 'alice', { proofFetch: fetchStoreProofReceipt }), { ok: true, redirect: 'https://store.example.test/_emdash/admin/plugins/r_sffx6l4z6mpqliki/status' });
    assert.deepEqual(requested, [betaProof(c.body.connection_id)], 'the beta connection reads only the beta proof path');
    const response = await exchange(f, c); assert.equal(response.status, 200); const issued = await response.json();
    const { payload } = await jwtVerify(issued.access_token, createLocalJWKSet({ keys: [f.keys.publicJwk] }), { issuer: 'https://dinkuskit.com/account', audience: 'dinkus-payments' });
    assert.equal(payload.scope, 'payments:admin'); assert.equal(payload.site_id, c.body.site_id);
    const stable = await start(f, 'payments', 'https://stable.example.test'); requested.length = 0;
    globalThis.fetch = async url => { requested.push(String(url)); return new Response('not found', { status: 404 }); };
    assert.equal((await consent(f, stable, 'alice', { proofFetch: fetchStoreProofReceipt })).ok, false);
    assert.deepEqual(requested, [`https://stable.example.test/_emdash/api/plugins/r_3brsc2on3bu673rn/store-proof?connection_id=${stable.body.connection_id}`], 'a stable connection never reads the beta path');
  } finally { globalThis.fetch = original; f.close(); }
});

test('independent contract: proof transport refuses redirects without following them', async () => {
  const {fetchStoreProofReceipt} = await import('../src/account/proof-fetch.ts');
  const original = globalThis.fetch; let calls=0;
  globalThis.fetch = async () => { calls++; return new Response(null, {status:302, headers:{location:'https://elsewhere.example.test/'}}); };
  try {
    const result=await fetchStoreProofReceipt({siteOrigin:'https://store.example.test',connectionId:'proof-id',clientId:registrations.payments.client,service:'payments',callbackUri:`https://store.example.test${registrations.payments.callback}`});
    assert.deepEqual([result.ok,result.reason],[false,'proof_redirect_rejected']);
    assert.equal(calls,1);
  } finally { globalThis.fetch=original; }
});

test('independent contract: redemption rechecks authority after token preparation', async () => {
  for (const mutate of [
    f => f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked=1 WHERE service='payments'").run(),
    f => f.sqlite.prepare("UPDATE dinkuskit_account SET disabled=1 WHERE user_id='alice'").run(),
  ]) {
    const f=await fixture(); try {
      const c=await start(f,'payments'); assert.equal((await consent(f,c)).ok,true);
      const prepare=f.db.prepare.bind(f.db);
      f.db.prepare=sql=>{const q=prepare(sql);if(sql.includes("SET status = 'redeemed'")){const run=q.run;q.run=async()=>{mutate(f);return run();};}return q;};
      const response=await exchange(f,c);assert.equal(response.status,400);
      assert.equal(count(f,'dinkuskit_jwks'),0,'no public-key publication for denied issuance');
    } finally {f.close();}
  }
});

async function storeWithKey(f) {
  const c = await start(f, 'payments'); assert.equal((await consent(f, c)).ok, true);
  const siteId = c.body.site_id;
  const owner = { subject: 'org-a', siteId, organizationId: 'a', actorUserId: 'alice' };
  const key = await replaceStoreKey(f.db, owner); assert.match(key, /^dk_store_[A-Za-z0-9_-]{43}$/);
  const pass = async (scope, audience, overrides = {}) => {
    const response = await issueStorePass({ db: f.db, authorization: `Bearer ${overrides.key ?? key}`, body: overrides.body ?? { site_id: siteId, scope, audience }, privateJwkJson: JSON.stringify(f.keys.privateJwk) });
    return { status: response.status, body: await response.json() };
  };
  return { siteId, owner, key, pass };
}

test('store passes: one key, a 5-minute pass for each service that is on, nothing for the rest', async () => {
  const f = await fixture(); try {
    const { siteId, owner, key, pass } = await storeWithKey(f);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM dinkuskit_store_key WHERE key_hash = ?').get(createHash('sha256').update(key).digest('hex')).n, 1, 'only the hash is kept');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM dinkuskit_store_key WHERE key_hash = ?').get(key).n, 0);
    const payments = await pass('payments:checkout', 'dinkus-payments'); assert.equal(payments.status, 200);
    const jwks = createLocalJWKSet({ keys: [f.keys.publicJwk] });
    const { payload } = await jwtVerify(payments.body.access_token, jwks, { issuer: 'https://dinkuskit.com/account', audience: 'dinkus-payments' });
    assert.deepEqual([payload.sub, payload.site_id, payload.scope, payload.exp - payload.iat], ['org-a', siteId, 'payments:checkout', 300]);
    assert.ok(payload.iat <= Math.floor(Date.now() / 1000) - 2, 'iat is dated back so no verifier sees it in the future');
    assert.deepEqual(payments.body.expires_in, 300);
    assert.deepEqual(await pass('coupons:checkout', 'dinkus-coupons'), { status: 403, body: { error: 'service_not_enabled' } });
    assert.deepEqual(await pass('ship:orders', 'dinkus-ship'), { status: 403, body: { error: 'service_not_enabled' } });
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'ship', on: true }), 'on');
    const ship = await pass('ship:orders', 'dinkus-ship'); assert.equal(ship.status, 200);
    await jwtVerify(ship.body.access_token, jwks, { audience: 'dinkus-ship' });
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'ship', on: false }), 'off');
    assert.deepEqual(await pass('ship:orders', 'dinkus-ship'), { status: 403, body: { error: 'service_not_enabled' } });
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'payments', on: true }), 'forbidden', 'Payments is turned on only by its own Connect');
    const listed = (await listStoreSetup(f.db, 'org-a'))[0];
    assert.deepEqual(listed.services, { payments: 'on', coupons: 'off', ship: 'off' }); assert.ok(listed.key.lastUsedAt);
  } finally { f.close(); }
});

test('store passes: replaced, malformed and mismatched keys and requests are refused', async () => {
  const f = await fixture(); try {
    const { siteId, owner, key, pass } = await storeWithKey(f);
    const replaced = await replaceStoreKey(f.db, owner); assert.notEqual(replaced, key);
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments'), { status: 401, body: { error: 'invalid_store_key' } });
    assert.equal((await pass('payments:checkout', 'dinkus-payments', { key: replaced })).status, 200);
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments', { key: 'dk_store_' + 'A'.repeat(43) }), { status: 401, body: { error: 'invalid_store_key' } });
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments', { key: 'not-a-store-key' }), { status: 401, body: { error: 'invalid_store_key' } });
    for (const body of [null, [], { site_id: siteId, scope: 'payments:admin', audience: 'dinkus-payments' }, { site_id: siteId, scope: 'payments:checkout', audience: 'dinkus-coupons' },
      { site_id: siteId, scope: 'payments:checkout', audience: 'dinkus-payments', extra: 1 }, { scope: 'payments:checkout', audience: 'dinkus-payments' }]) {
      assert.deepEqual(await pass(null, null, { key: replaced, body }), { status: 400, body: { error: 'invalid_request' } }, JSON.stringify(body));
    }
    assert.deepEqual(await pass(null, null, { key: replaced, body: { site_id: 'some-other-store', scope: 'payments:checkout', audience: 'dinkus-payments' } }), { status: 403, body: { error: 'site_mismatch' } });
    const response = await issueStorePass({ db: f.db, authorization: null, body: { site_id: siteId, scope: 'payments:checkout', audience: 'dinkus-payments' } });
    assert.equal(response.status, 401);
    assert.equal(await replaceStoreKey(f.db, { ...owner, organizationId: 'b', actorUserId: 'bob', subject: 'org-b' }), null, 'another business cannot make a key for this store');
    assert.equal(await replaceStoreKey(f.db, { ...owner, actorUserId: 'staff' }), null, 'only the owner makes keys');
    assert.equal(await setOwnerService(f.db, { ...owner, actorUserId: 'staff', service: 'coupons', on: true }), 'forbidden');
    f.sqlite.prepare('UPDATE dinkuskit_store_key SET window_start = ?, window_count = 1200').run(Math.floor(Date.now() / 60_000));
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments', { key: replaced }), { status: 429, body: { error: 'rate_limited' } });
    assert.deepEqual(await issueStorePass({ db: f.db, authorization: `Bearer ${replaced}`, body: { site_id: siteId, scope: 'payments:checkout', audience: 'dinkus-payments' } }).then(r => r.status), 429);
  } finally { f.close(); }
});

test('store passes: suspension, operator cut-off and restore are enforced at every trade', async () => {
  const f = await fixture(); try {
    const { siteId, owner, pass } = await storeWithKey(f);
    const operator = { userId: 'cms-admin', email: 'operator@example.test' };
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'coupons', on: true }), 'on');
    assert.equal(await cutOffStore(f.db, siteId, 'coupons', operator), 1);
    assert.deepEqual(await pass('coupons:checkout', 'dinkus-coupons'), { status: 403, body: { error: 'service_cut_off' } });
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'coupons', on: true }), 'cut_off', 'the owner cannot undo a cut-off');
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'coupons', on: false }), 'cut_off');
    assert.equal((await pass('payments:checkout', 'dinkus-payments')).status, 200, 'a cut-off is per service');
    assert.equal(await restoreStore(f.db, siteId, 'coupons', operator), 1);
    assert.deepEqual(await pass('coupons:checkout', 'dinkus-coupons'), { status: 403, body: { error: 'service_not_enabled' } }, 'after restore the owner turns it on again');
    assert.equal(await setOwnerService(f.db, { ...owner, service: 'coupons', on: true }), 'on');
    assert.equal((await pass('coupons:checkout', 'dinkus-coupons')).status, 200);
    f.sqlite.prepare("UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'alice'").run();
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments'), { status: 403, body: { error: 'store_suspended' } });
    f.sqlite.prepare("UPDATE dinkuskit_account SET disabled = 0 WHERE user_id = 'alice'").run();
    f.sqlite.prepare("UPDATE dinkuskit_organization SET status = 'suspended' WHERE organization_id = 'a'").run();
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments'), { status: 403, body: { error: 'store_suspended' } });
    f.sqlite.prepare("UPDATE dinkuskit_organization SET status = 'active', admission_status = 'pending_operator' WHERE organization_id = 'a'").run();
    assert.deepEqual(await pass('payments:checkout', 'dinkus-payments'), { status: 403, body: { error: 'store_suspended' } });
  } finally { f.close(); }
});

const stripeStatus = { state: 'ready', bindingRef: 'bind_test_1', connectionEvidence: { provider: 'stripe', accountRef: 'acct_1TestAccount' } };
function statusFrom(f, answer) {
  const calls = [];
  const fetchStatus = async (call) => { calls.push(call); if (answer instanceof Error) throw answer; return answer; };
  return { calls, fetchStatus };
}

test('checkout settings: the exact JSON Commerce takes, with Coupons and Ship only while on', async () => {
  const f = await fixture(); try {
    const { siteId, owner } = await storeWithKey(f);
    const settings = await saveCommerceSettings(f.db, { ...owner, choices: { shippingMode: 'flat', shippingMinor: 500, live: false } });
    assert.deepEqual(settings, { shippingMode: 'flat', shippingMinor: 500, shippingRevision: 1, live: false });
    const status = statusFrom(f, { status: 200, body: stripeStatus });
    const payments = await readPaymentsBinding({ db: f.db, subject: 'org-a', siteId, privateJwkJson: JSON.stringify(f.keys.privateJwk), fetchStatus: status.fetchStatus });
    assert.deepEqual(payments, { ok: true, binding: { providerId: 'stripe', bindingRef: 'bind_test_1', stripeAccountId: 'acct_1TestAccount', ready: true } });
    assert.equal(status.calls.length, 1);
    assert.equal(status.calls[0].url, 'https://payments.dinkuskit.com/v1/status'); assert.equal(status.calls[0].siteId, siteId);
    const { payload } = await jwtVerify(status.calls[0].token, createLocalJWKSet({ keys: [f.keys.publicJwk] }), { issuer: 'https://dinkuskit.com/account', audience: 'dinkus-payments' });
    assert.deepEqual([payload.sub, payload.site_id, payload.scope], ['org-a', siteId, 'payments:admin'], 'the status call carries an admin pass for this store only');
    const base = {
      schema: 'dinkuskit.commerce.registry-checkout/v1', enabled: true, commerceOrigin: 'https://store.example.test', siteId,
      issuer: 'https://dinkuskit.com/account', paymentsOrigin: 'https://payments.dinkuskit.com', audience: 'dinkus-payments',
      bindingRef: 'bind_test_1', providerId: 'stripe', stripeAccountId: 'acct_1TestAccount', mode: 'test',
      pricingSchema: 'dinkuskit.commerce.checkout-pricing/v1',
      shipping: { configurationId: `shipping-${siteId}`, revision: 1, mode: 'flat', amount: { currency: 'USD', minor: '500' } },
    };
    const text = checkoutSettingsJson({ siteId, siteOrigin: 'https://store.example.test', binding: payments.binding, settings, coupons: false, ship: false });
    assert.deepEqual(JSON.parse(text), base);
    assert.deepEqual(Object.keys(JSON.parse(text)), Object.keys(base), 'keys come in the order Commerce documents');
    const both = JSON.parse(checkoutSettingsJson({ siteId, siteOrigin: 'https://store.example.test', binding: payments.binding, settings, coupons: true, ship: true }));
    assert.deepEqual(both, { ...base, coupons: { origin: 'https://coupons.dinkuskit.com', audience: 'dinkus-coupons' }, ship: { origin: 'https://ship.dinkuskit.com', audience: 'dinkus-ship' } });
    const shipOnly = JSON.parse(checkoutSettingsJson({ siteId, siteOrigin: 'https://store.example.test', binding: payments.binding, settings, coupons: false, ship: true }));
    assert.equal('coupons' in shipOnly, false); assert.deepEqual(shipOnly.ship, { origin: 'https://ship.dinkuskit.com', audience: 'dinkus-ship' });

    // The shipping revision goes up only when the charge changes.
    const save = choices => saveCommerceSettings(f.db, { ...owner, choices });
    assert.equal((await save({ shippingMode: 'flat', shippingMinor: 500, live: false })).shippingRevision, 1);
    assert.deepEqual(await save({ shippingMode: 'flat', shippingMinor: 500, live: true }), { shippingMode: 'flat', shippingMinor: 500, shippingRevision: 1, live: true });
    assert.equal((await save({ shippingMode: 'flat', shippingMinor: 650, live: true })).shippingRevision, 2);
    const free = await save({ shippingMode: 'free', shippingMinor: 650, live: true });
    assert.deepEqual(free, { shippingMode: 'free', shippingMinor: 0, shippingRevision: 3, live: true }, 'free shipping keeps no amount');
    const live = JSON.parse(checkoutSettingsJson({ siteId, siteOrigin: 'https://store.example.test', binding: payments.binding, settings: free, coupons: false, ship: false }));
    assert.equal(live.mode, 'live'); assert.deepEqual(live.shipping, { configurationId: `shipping-${siteId}`, revision: 3, mode: 'free' });
    assert.deepEqual(await loadCommerceSettings(f.db, siteId), free);

    const authorizeNet = await readPaymentsBinding({ db: f.db, subject: 'org-a', siteId, privateJwkJson: JSON.stringify(f.keys.privateJwk),
      fetchStatus: statusFrom(f, { status: 200, body: { state: 'pending', bindingRef: 'bind_test_2', connectionEvidence: { provider: 'authorize_net', accountRef: 'ignored' } } }).fetchStatus });
    assert.deepEqual(authorizeNet, { ok: true, binding: { providerId: 'authorize_net', bindingRef: 'bind_test_2', ready: false } });
    const anet = JSON.parse(checkoutSettingsJson({ siteId, siteOrigin: 'https://store.example.test', binding: authorizeNet.binding, settings: free, coupons: false, ship: false }));
    assert.equal(anet.providerId, 'authorize_net'); assert.equal('stripeAccountId' in anet, false);
  } finally { f.close(); }
});

test('checkout settings: only the owner saves them, and Payments problems are named', async () => {
  const f = await fixture(); try {
    const { siteId, owner } = await storeWithKey(f);
    const choices = { shippingMode: 'flat', shippingMinor: 500, live: false };
    assert.equal(await saveCommerceSettings(f.db, { ...owner, actorUserId: 'staff', choices }), null, 'a member who is not the owner');
    assert.equal(await saveCommerceSettings(f.db, { ...owner, subject: 'org-b', organizationId: 'b', actorUserId: 'bob', choices }), null, 'another business');
    for (const bad of [{ ...choices, shippingMinor: -1 }, { ...choices, shippingMinor: 1.5 }, { ...choices, shippingMinor: 100_000_01 }, { ...choices, shippingMode: 'weight' }]) {
      assert.equal(await saveCommerceSettings(f.db, { ...owner, choices: bad }), null, JSON.stringify(bad));
    }
    assert.equal(await loadCommerceSettings(f.db, siteId), null);

    const read = (answer, extra = {}) => readPaymentsBinding({ db: f.db, subject: 'org-a', siteId, privateJwkJson: JSON.stringify(f.keys.privateJwk), fetchStatus: statusFrom(f, answer).fetchStatus, ...extra });
    assert.deepEqual(await read(new Error('offline')), { ok: false, reason: 'payments_unreachable' });
    assert.deepEqual(await read({ status: 401, body: { error: 'unauthorized' } }), { ok: false, reason: 'payments_unreachable' });
    assert.deepEqual(await read({ status: 200, body: { state: 'not_connected' } }), { ok: false, reason: 'payments_not_set_up' });
    assert.deepEqual(await read({ status: 200, body: { ...stripeStatus, connectionEvidence: { provider: 'stripe', accountRef: 'not-an-account' } } }), { ok: false, reason: 'payments_not_set_up' });
    assert.deepEqual(await read({ status: 200, body: { ...stripeStatus, bindingRef: 'has spaces' } }), { ok: false, reason: 'payments_not_set_up' });
    assert.deepEqual(await read({ status: 200, body: stripeStatus }, { privateJwkJson: undefined }), { ok: false, reason: 'signing_unavailable' });
    assert.deepEqual(await read({ status: 200, body: stripeStatus }, { subject: 'org-b' }), { ok: false, reason: 'payments_not_connected' }, 'another business cannot read this store');
    await revokeServiceGrant(f.db, 'org-a', siteId, 'payments', 'alice', 'a');
    const status = statusFrom(f, { status: 200, body: stripeStatus });
    assert.deepEqual(await read(null, { fetchStatus: status.fetchStatus }), { ok: false, reason: 'payments_not_connected' });
    assert.equal(status.calls.length, 0, 'no pass is made for a store whose Payments is off');

    assert.equal(dollarsToMinor('5'), 500); assert.equal(dollarsToMinor('5.5'), 550); assert.equal(dollarsToMinor(' $5.05 '), 505); assert.equal(dollarsToMinor('0'), 0);
    for (const bad of ['', '5.123', '-1', '1,000', 'five', '1e3']) assert.equal(dollarsToMinor(bad), null, bad);
  } finally { f.close(); }
});

test('checkout settings: every state in Payments\' status answer maps to settings or a named reason', async () => {
  const f = await fixture(); try {
    const { siteId } = await storeWithKey(f);
    const read = body => readPaymentsBinding({ db: f.db, subject: 'org-a', siteId, privateJwkJson: JSON.stringify(f.keys.privateJwk), fetchStatus: async () => ({ status: 200, body }) });
    const stripe = (result, extra = {}) => ({ provider: 'stripe', mode: 'test', result, accountRef: 'acct_1StateTest', ...extra });
    // Payments' hosted Status: state, mode, bindingRef (once connecting), connectionEvidence (once an account exists).
    assert.deepEqual(await read({ state: 'disconnected', mode: 'test' }), { ok: false, reason: 'payments_not_set_up' });
    for (const state of ['connecting', 'recovery_required']) {
      assert.deepEqual(await read({ state, mode: 'test', bindingRef: 'bind_state' }), { ok: false, reason: 'payments_not_set_up' }, state);
    }
    for (const [state, result] of [['setup_required', 'unknown'], ['checking', 'unknown'], ['action_required', 'action_required']]) {
      assert.deepEqual(await read({ state, mode: 'test', bindingRef: 'bind_state', connectionEvidence: stripe(result) }),
        { ok: true, binding: { providerId: 'stripe', bindingRef: 'bind_state', stripeAccountId: 'acct_1StateTest', ready: false } }, state);
    }
    assert.deepEqual(await read({ state: 'ready', mode: 'live', bindingRef: 'bind_state', connectionEvidence: stripe('verified', { mode: 'live' }) }),
      { ok: true, binding: { providerId: 'stripe', bindingRef: 'bind_state', stripeAccountId: 'acct_1StateTest', ready: true } });
    assert.deepEqual(await read({ state: 'ready', mode: 'test', bindingRef: 'bind_state', connectionEvidence: { provider: 'authorize_net', mode: 'test', result: 'unsupported' } }),
      { ok: true, binding: { providerId: 'authorize_net', bindingRef: 'bind_state', ready: true } });
  } finally { f.close(); }
});
