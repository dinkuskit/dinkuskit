import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { startStoreConnection, consentStoreConnection, exchangeStoreConnectionToken } from '../src/account/connect.ts';
import { createLocalTestKeys } from '../src/account/jwt.ts';
import { PAYMENTS_CALLBACK_PATH, PAYMENTS_PROOF_PATH, PAYMENTS_REGISTRY_IDENTITY } from '../src/account/config.ts';
import { stripTypeScriptTypes } from 'node:module';

test('Payments registration matches pinned EmDash Registry publisher identity and rejects unregistered paths', async () => {
  const source = await readFile(new URL('../node_modules/emdash/src/registry/plugin-id.ts', import.meta.url), 'utf8');
  const { makeRegistryPluginId } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  const id = await makeRegistryPluginId('did:plc:ekk4pjmkh3k3ql2kfoex3qt4', 'dinkus-payments');
  assert.equal(id, 'r_3brsc2on3bu673rn');
  assert.deepEqual(PAYMENTS_REGISTRY_IDENTITY, { publisherDid: 'did:plc:ekk4pjmkh3k3ql2kfoex3qt4', slug: 'dinkus-payments', installedPluginId: id });
  assert.equal(PAYMENTS_CALLBACK_PATH, `/_emdash/admin/plugins/${id}/status`);
  assert.equal(PAYMENTS_PROOF_PATH, `/_emdash/api/plugins/${id}/store-proof`);
  const otherId = await makeRegistryPluginId('did:plc:otherpublisher', 'dinkus-payments');
  const f = await fixture(); try {
    for (const path of [
      '/_emdash/admin/plugins/dinkus-payments/status',
      `/_emdash/admin/plugins/${otherId}/status`,
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
async function start(f, service = 'inventory', origin = 'https://store.example.test', extra = {}) {
  const reg = registrations[service]; const verifier = randomBytes(32).toString('base64url');
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

test('independent contract: revocation is service-specific and revoked grants cannot silently reconnect', async () => {
  const f = await fixture(); try {
    const i = await start(f); assert.equal((await consent(f,i)).ok,true);
    const p = await start(f,'payments'); assert.equal((await consent(f,p)).ok,true);
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked=1, revoked_at=2 WHERE service='inventory'").run();
    assert.equal((await exchange(f,i)).status,400); assert.equal((await exchange(f,p)).status,200);
    const again = await start(f); assert.equal((await consent(f,again)).ok,false);
    const payAgain = await start(f,'payments'); assert.equal((await consent(f,payAgain)).ok,true);
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
    for (const service of ['inventory','payments']) {
      const result=await fetchStoreProofReceipt({siteOrigin:'https://store.example.test',connectionId:'proof-id',clientId:registrations[service].client,service});
      assert.equal(result.ok,true);
      const installedId = service === 'payments' ? 'r_3brsc2on3bu673rn' : 'dinkus-inventory';
      assert.equal(requested.at(-1).url,`https://store.example.test/_emdash/api/plugins/${installedId}/store-proof?connection_id=proof-id`);
      assert.equal(requested.at(-1).options.redirect,'error');
    }
    assert.equal((await fetchStoreProofReceipt({siteOrigin:'https://store.example.test',connectionId:'proof-id',clientId:registrations.inventory.client,service:'payments'})).ok,false);
    assert.equal(requested.length,2);
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
