import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { request, startMerchantTestRuntime, stopRuntime, testSecret } from './helpers/merchant-harness.mjs';

const wrangler = 'node_modules/.bin/wrangler';
const expectedLedger = [
  { version: 1, name: '0001_better_auth.sql' },
  { version: 2, name: '0002_dinkuskit.sql' },
  { version: 3, name: '0003_store_connect.sql' },
  { version: 4, name: '0004_account_foundation.sql' },
  { version: 5, name: '0005_operator_authorization.sql' },
  { version: 6, name: '0006_organization_approvals.sql' },
  { version: 7, name: '0007_shared_store_service_grants.sql' },
  { version: 8, name: '0008_operator_actions.sql' },
  { version: 9, name: '0009_service_grant_revoked_by.sql' },
  { version: 10, name: '0010_store_keys.sql' },
  { version: 11, name: '0011_commerce_settings.sql' },
  { version: 12, name: '0012_ship_sign_in.sql' },
  { version: 13, name: '0013_ship_recipient.sql' },
  { version: 14, name: '0014_plugin_keys.sql' },
  { version: 15, name: '0015_free_shipping_over.sql' },
];

function wranglerD1(persistTo, args) {
  return spawnSync(wrangler, [
    'd1', ...args, 'dinkuskit-merchant-local', '--local', '--persist-to', persistTo, '--config', 'wrangler.jsonc',
  ], { encoding: 'utf8' });
}

function applySql(persistTo, file) {
  const result = wranglerD1(persistTo, ['execute', '--file', file, '--yes']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function applyAllMigrations(persistTo) {
  const result = wranglerD1(persistTo, ['migrations', 'apply']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function ledgerRows(persistTo) {
  const result = wranglerD1(persistTo, [
    'execute', '--yes', '--json',
    '--command', 'SELECT version, name FROM dinkuskit_schema_migrations ORDER BY version',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const batch = Array.isArray(payload) ? payload[0] : payload;
  return (batch?.results ?? []).map(row => ({ version: Number(row.version), name: String(row.name) }));
}

async function assertAccountAndConnect(runtime, siteId) {
  const page = await request(runtime, new Map(), '/account/signup');
  assert.equal(page.status, 200);
  const start = await request(runtime, new Map(), '/api/store-connections', {
    method: 'POST',
    body: JSON.stringify({
      protocol_version: 2,
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_origin: `https://${siteId}.stores.example`,
      callback_uri: `https://${siteId}.stores.example/_emdash/admin/plugins/dinkus-inventory/inventory`,
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    }),
  });
  assert.equal(start.status, 200);
}

async function assertRepeatAndRestart(persistTo, sitePrefix, secret) {
  let runtime = await startMerchantTestRuntime({ persistTo, secret });
  try {
    await assertAccountAndConnect(runtime, `${sitePrefix}-first`);
    await assertAccountAndConnect(runtime, `${sitePrefix}-repeat`);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
  } finally {
    await stopRuntime({ ...runtime, ownedPersist: false });
  }

  runtime = await startMerchantTestRuntime({ persistTo, secret });
  try {
    await assertAccountAndConnect(runtime, `${sitePrefix}-restart`);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
  } finally {
    await stopRuntime({ ...runtime, ownedPersist: false });
  }
}

test('merchant D1 migrations: runtime-fresh records 1-7 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-runtime-fresh-'));
  try {
    await assertRepeatAndRestart(persistTo, 'runtime-fresh', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: wrangler apply all 7 records 1-7 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-cli-all3-'));
  try {
    applyAllMigrations(persistTo);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'CLI migrations must record their ledger before runtime reconciliation');
    await assertRepeatAndRestart(persistTo, 'cli-all3', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: upgrade from 0002 records 1-7 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-upgrade-'));
  try {
    applySql(persistTo, 'migrations/merchant/0001_better_auth.sql');
    applySql(persistTo, 'migrations/merchant/0002_dinkuskit.sql');
    await assertRepeatAndRestart(persistTo, 'upgrade', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migration 0006 preserves populated v5 organization references', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-v5-populated-'));
  const seed = join(persistTo, 'seed.sql');
  try {
    for (const file of ['0001_better_auth.sql', '0002_dinkuskit.sql', '0003_store_connect.sql', '0004_account_foundation.sql', '0005_operator_authorization.sql']) {
      applySql(persistTo, `migrations/merchant/${file}`);
    }
    await writeFile(seed, `INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('v5-user','V5 User','v5@example.test',1,'2026-01-01','2026-01-01');
      INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at)
      VALUES ('v5-org','V5 Org','active','v5-user','v5-subject','admitted','v5-user',1,1);
      INSERT INTO dinkuskit_membership (organization_id,user_id,role,status,permissions,created_at,updated_at) VALUES ('v5-org','v5-user','owner','active','[]',1,1);
      INSERT INTO dinkuskit_admission (user_id,first_organization_id,slot_number,created_at) VALUES ('v5-user','v5-org',1,1);
      INSERT INTO dinkuskit_user_selection (user_id,organization_id,updated_at) VALUES ('v5-user','v5-org',1);`);
    applySql(persistTo, seed);
    const runtime = await startMerchantTestRuntime({ persistTo, secret: testSecret() });
    await assertAccountAndConnect(runtime, 'v5-populated');
    await stopRuntime({ ...runtime, ownedPersist: false });
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
    const check = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command', 'PRAGMA foreign_key_check']);
    assert.equal(check.status, 0, check.stderr || check.stdout);
    const payload = JSON.parse(check.stdout);
    const batch = Array.isArray(payload) ? payload[0] : payload;
    assert.deepEqual(batch?.results ?? [], []);
    const rows = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command',
      `SELECT (SELECT count(*) FROM dinkuskit_membership WHERE organization_id='v5-org') memberships,
        (SELECT count(*) FROM dinkuskit_admission WHERE first_organization_id='v5-org') admissions,
        (SELECT count(*) FROM dinkuskit_user_selection WHERE organization_id='v5-org') selections`]);
    assert.equal(rows.status, 0, rows.stderr || rows.stdout);
    const rowPayload = JSON.parse(rows.stdout);
    const rowBatch = Array.isArray(rowPayload) ? rowPayload[0] : rowPayload;
    assert.deepEqual(rowBatch.results, [{ memberships: 1, admissions: 1, selections: 1 }]);
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migration 0009 marks earlier cut-offs and keeps the operator history', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-v8-populated-'));
  const seed = join(persistTo, 'seed.sql');
  try {
    for (const migration of expectedLedger.filter(m => m.version <= 8)) {
      applySql(persistTo, `migrations/merchant/${migration.name}`);
    }
    await writeFile(seed, `INSERT INTO dinkuskit_store_identity (site_id,site_origin,account_subject,created_at) VALUES ('v8-site','https://v8.stores.example','v8-subject',1);
      INSERT INTO dinkuskit_service_grant (site_id,service,revoked,granted_at,revoked_at) VALUES ('v8-site','payments',1,1,2);
      INSERT INTO dinkuskit_service_grant (site_id,service,revoked,granted_at,revoked_at) VALUES ('v8-site','inventory',1,1,3);
      INSERT INTO dinkuskit_service_grant (site_id,service,revoked,granted_at,revoked_at) VALUES ('v8-site','coupons',0,1,NULL);
      INSERT INTO dinkuskit_operator_action (action_id,action,target_type,target_id,service,actor_user_id,actor_email,created_at)
      VALUES ('op_v8','service_cut_off','store','v8-site','payments','cms-admin','operator@example.test',2);`);
    applySql(persistTo, seed);
    const runtime = await startMerchantTestRuntime({ persistTo, secret: testSecret() });
    await assertAccountAndConnect(runtime, 'v8-populated');
    await stopRuntime({ ...runtime, ownedPersist: false });
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
    const rows = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command',
      `SELECT service, revoked_by FROM dinkuskit_service_grant WHERE site_id='v8-site' ORDER BY service`]);
    assert.equal(rows.status, 0, rows.stderr || rows.stdout);
    const payload = JSON.parse(rows.stdout);
    const batch = Array.isArray(payload) ? payload[0] : payload;
    assert.deepEqual(batch.results, [
      { service: 'coupons', revoked_by: null },
      { service: 'inventory', revoked_by: 'owner' },
      { service: 'payments', revoked_by: 'operator' },
    ]);
    const history = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command',
      `INSERT INTO dinkuskit_operator_action (action_id,action,target_type,target_id,service,actor_user_id,actor_email,created_at)
        VALUES ('op_v9','service_restored','store','v8-site','payments','cms-admin','operator@example.test',4);
       SELECT action_id, action FROM dinkuskit_operator_action ORDER BY created_at`]);
    assert.equal(history.status, 0, history.stderr || history.stdout);
    const historyPayload = JSON.parse(history.stdout);
    assert.deepEqual(historyPayload.at(-1).results, [
      { action_id: 'op_v8', action: 'service_cut_off' },
      { action_id: 'op_v9', action: 'service_restored' },
    ]);
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});


test('merchant D1 migration 0013 preserves populated schema-12 Ship authority without sandbox upgrade', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-v12-ship-'));
  let runtime;
  const hash = value => createHash('sha256').update(value).digest('hex');
  const secret = () => randomBytes(32).toString('base64url');
  const codes = [secret(), secret()];
  const refreshes = [secret(), secret()];
  const verifier = secret();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const sessionExpiry = new Date(Date.now() + 86400000).toISOString();
  const query = sql => {
    const answer = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command', sql]);
    assert.equal(answer.status, 0, 'local D1 query succeeds');
    return JSON.parse(answer.stdout).at(-1).results;
  };
  try {
    const schema = (await Promise.all(expectedLedger.filter(m => m.version <= 12).map(m => readFile(`migrations/merchant/${m.name}`, 'utf8')))).join('\n');
    const seed = join(persistTo, 'schema12.sql');
    await writeFile(seed, schema + `
      INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('ship-v12-user','Synthetic','ship-v12@example.test',1,1,1);
      INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES ('ship-v12-user','ship-v12-person',1,1);
      INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at)
      VALUES ('ship-v12-org','Synthetic','active','ship-v12-user','ship-v12-subject','admitted','ship-v12-user',1,1);
      INSERT INTO dinkuskit_membership VALUES ('ship-v12-org','ship-v12-user','owner','active','[]',1,1);
      INSERT INTO dinkuskit_store_identity VALUES ('ship-v12-site','https://ship-v12.example.test','ship-v12-subject',1);
      INSERT INTO dinkuskit_service_grant (site_id,service,revoked,granted_at) VALUES ('ship-v12-site','ship',0,1);
      INSERT INTO dinkuskit_commerce_settings VALUES ('ship-v12-site','free',0,1,0,'ship-v12-user',1);
      INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES ('ship-v12-session','${sessionExpiry}','${secret()}',1,1,'ship-v12-user');
      ${codes.map(code => `INSERT INTO dinkuskit_ship_sign_in_code (code_hash,site_id,user_id,session_id,code_challenge,expires_at,used_at) VALUES ('${hash(code)}','ship-v12-site','ship-v12-user','ship-v12-session','${challenge}',${expires},NULL);`).join('\n')}
      ${refreshes.map((refresh, i) => `INSERT INTO dinkuskit_ship_sign_in (sign_in_id,site_id,user_id,session_id,email,token_hash,previous_hash,created_at,refreshed_at,ended_at) VALUES ('ship-v12-family-${i}','ship-v12-site','ship-v12-user','ship-v12-session','ship-v12@example.test','${hash(refresh)}',NULL,1,1,NULL);`).join('\n')}
    `, { mode: 0o600 });
    applySql(persistTo, seed);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger.filter(m => m.version <= 12));
    assert.equal(query("PRAGMA table_info('dinkuskit_ship_sign_in')").some(c => c.name === 'ship_recipient'), false);
    assert.deepEqual(query('SELECT count(*) n FROM dinkuskit_ship_sign_in_code'), [{ n: 2 }]);
    assert.deepEqual(query('SELECT count(*) n FROM dinkuskit_ship_sign_in'), [{ n: 2 }]);

    runtime = await startMerchantTestRuntime({ persistTo });
    assert.equal((await request(runtime, new Map(), '/account/.well-known/jwks.json')).status, 200, 'compiled runtime applies 0013');
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
    for (const table of ['dinkuskit_ship_sign_in_code', 'dinkuskit_ship_sign_in']) {
      assert.deepEqual(query(`SELECT ship_recipient,ship_generation,ship_mode FROM ${table}`), Array.from({ length: 2 }, () => ({ ship_recipient: null, ship_generation: null, ship_mode: null })));
    }
    const exchange = body => request(runtime, new Map(), '/api/ship-sign-in/token', { method: 'POST', body: JSON.stringify(body) });
    const redeemed = await exchange({ code: codes[0], code_verifier: verifier });
    assert.equal(redeemed.status, 200);
    const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: refreshes[0] });
    assert.equal(refreshed.status, 200);
    const publicKeys = await (await request(runtime, new Map(), '/account/.well-known/jwks.json')).json();
    for (const response of [redeemed, refreshed]) {
      const { access_token } = await response.json();
      const { payload } = await jwtVerify(access_token, createLocalJWKSet(publicKeys), { issuer: 'https://dinkuskit.com/account', audience: 'dinkus-ship' });
      assert.equal(payload.site_id, 'ship-v12-site');
      assert.equal(payload.scope, 'ship:labels');
      assert.equal(payload.ship_recipient, undefined);
      assert.equal(payload.ship_generation, undefined);
      assert.equal(payload.ship_mode, undefined);
    }
    const prior = runtime;
    await stopRuntime(prior); runtime = undefined;
    runtime = await startMerchantTestRuntime({ persistTo, secret: prior.secret, jwt: prior.jwt, shipSandboxRegistration: { siteId: 'ship-v12-site', generation: 'test-generation-1' } });
    for (const body of [{ code: codes[1], code_verifier: verifier }, { grant_type: 'refresh_token', refresh_token: refreshes[1] }]) {
      const denied = await exchange(body);
      assert.equal(denied.status, 400);
      assert.deepEqual(await denied.json(), { error: 'invalid_grant' });
    }
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'restart leaves additive migration idempotent');
    assert.deepEqual(query('PRAGMA foreign_key_check'), []);
  } finally {
    if (runtime) await stopRuntime(runtime);
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migration 0014 keeps a populated schema-13 store, grants and checkout choices, and its pasted key gets nothing', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-v13-keys-'));
  let runtime;
  const legacyKey = `dk_store_${randomBytes(32).toString('base64url')}`;
  const keyHash = createHash('sha256').update(legacyKey).digest('hex');
  const query = sql => {
    const answer = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command', sql]);
    assert.equal(answer.status, 0, 'local D1 query succeeds');
    return JSON.parse(answer.stdout).at(-1).results;
  };
  try {
    const schema = (await Promise.all(expectedLedger.filter(m => m.version <= 13).map(m => readFile(`migrations/merchant/${m.name}`, 'utf8')))).join('\n');
    const seed = join(persistTo, 'schema13.sql');
    await writeFile(seed, schema + `
      INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('keys-v13-user','Synthetic','keys-v13@example.test',1,1,1);
      INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES ('keys-v13-user','keys-v13-person',1,1);
      INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at)
      VALUES ('keys-v13-org','Synthetic','active','keys-v13-user','keys-v13-subject','admitted','keys-v13-user',1,1);
      INSERT INTO dinkuskit_membership VALUES ('keys-v13-org','keys-v13-user','owner','active','[]',1,1);
      INSERT INTO dinkuskit_store_identity VALUES ('keys-v13-site','https://keys-v13.example.test','keys-v13-subject',1);
      INSERT INTO dinkuskit_service_grant (site_id,service,revoked,granted_at) VALUES ('keys-v13-site','payments',0,1), ('keys-v13-site','ship',0,1);
      INSERT INTO dinkuskit_commerce_settings VALUES ('keys-v13-site','flat',450,3,0,'keys-v13-user',1);
      INSERT INTO dinkuskit_store_key (site_id,key_hash,created_by_user_id,created_at,last_used_at,window_start,window_count) VALUES ('keys-v13-site','${keyHash}','keys-v13-user',1,NULL,0,0);
    `, { mode: 0o600 });
    applySql(persistTo, seed);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger.filter(m => m.version <= 13));
    assert.deepEqual(query("SELECT name FROM sqlite_master WHERE name = 'dinkuskit_plugin_key'"), []);

    runtime = await startMerchantTestRuntime({ persistTo });
    assert.equal((await request(runtime, new Map(), '/account/.well-known/jwks.json')).status, 200, 'compiled runtime applies 0014');
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
    assert.deepEqual(query('SELECT count(*) n FROM dinkuskit_plugin_key'), [{ n: 0 }], 'nothing is made up for old stores');
    // The pasted key's row stays, but it trades for nothing (store-connect-no-paste-082): the store presses Connect.
    const trade = async (scope, audience) => {
      const response = await request(runtime, new Map(), '/api/store-passes', { method: 'POST', headers: { authorization: `Bearer ${legacyKey}` }, body: JSON.stringify({ site_id: 'keys-v13-site', scope, audience }) });
      return { status: response.status, body: await response.json() };
    };
    const gone = { status: 401, body: { error: 'invalid_store_key' } };
    for (const [scope, audience] of [['payments:checkout', 'dinkus-payments'], ['ship:orders', 'dinkus-ship'], ['ship:admin', 'dinkus-ship'], ['commerce:settings', 'dinkuskit']]) {
      assert.deepEqual(await trade(scope, audience), gone, scope);
    }
    assert.deepEqual(query("SELECT shipping_mode, shipping_minor, shipping_revision, live FROM dinkuskit_commerce_settings WHERE site_id = 'keys-v13-site'"),
      [{ shipping_mode: 'flat', shipping_minor: 450, shipping_revision: 3, live: 0 }]);
    assert.deepEqual(query("SELECT service, revoked FROM dinkuskit_service_grant WHERE site_id = 'keys-v13-site' ORDER BY service"),
      [{ service: 'payments', revoked: 0 }, { service: 'ship', revoked: 0 }]);
    assert.deepEqual(query("SELECT key_hash, last_used_at FROM dinkuskit_store_key WHERE site_id = 'keys-v13-site'"), [{ key_hash: keyHash, last_used_at: null }], 'the old row is kept, never used');
    const prior = runtime;
    await stopRuntime({ ...prior, ownedPersist: false }); runtime = undefined;
    runtime = await startMerchantTestRuntime({ persistTo, secret: prior.secret, jwt: prior.jwt });
    assert.deepEqual(await trade('payments:checkout', 'dinkus-payments'), gone, 'still refused after a restart');
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'restart leaves additive migration idempotent');
    assert.deepEqual(query('PRAGMA foreign_key_check'), []);
  } finally {
    if (runtime) await stopRuntime(runtime);
    await rm(persistTo, { recursive: true, force: true });
  }
});

// checkout-free-shipping-over-20261027
test('merchant D1 migration 0015 keeps a schema-14 store\'s checkout choices and gives it no free-shipping amount', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-v14-free-over-'));
  let runtime;
  const query = sql => {
    const answer = wranglerD1(persistTo, ['execute', '--yes', '--json', '--command', sql]);
    assert.equal(answer.status, 0, 'local D1 query succeeds');
    return JSON.parse(answer.stdout).at(-1).results;
  };
  try {
    const schema = (await Promise.all(expectedLedger.filter(m => m.version <= 14).map(m => readFile(`migrations/merchant/${m.name}`, 'utf8')))).join('\n');
    const seed = join(persistTo, 'schema14.sql');
    await writeFile(seed, schema + `
      INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('free-v14-user','Synthetic','free-v14@example.test',1,1,1);
      INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES ('free-v14-user','free-v14-person',1,1);
      INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at)
      VALUES ('free-v14-org','Synthetic','active','free-v14-user','free-v14-subject','admitted','free-v14-user',1,1);
      INSERT INTO dinkuskit_store_identity VALUES ('free-v14-site','https://free-v14.example.test','free-v14-subject',1);
      INSERT INTO dinkuskit_commerce_settings VALUES ('free-v14-site','flat',450,3,0,'free-v14-user',1);
    `, { mode: 0o600 });
    applySql(persistTo, seed);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger.filter(m => m.version <= 14));

    runtime = await startMerchantTestRuntime({ persistTo });
    assert.equal((await request(runtime, new Map(), '/account/.well-known/jwks.json')).status, 200, 'compiled runtime applies 0015');
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
    assert.deepEqual(query("SELECT shipping_mode, shipping_minor, shipping_revision, live, shipping_free_over_minor FROM dinkuskit_commerce_settings WHERE site_id = 'free-v14-site'"),
      [{ shipping_mode: 'flat', shipping_minor: 450, shipping_revision: 3, live: 0, shipping_free_over_minor: null }]);
    const refused = wranglerD1(persistTo, ['execute', '--yes', '--command', "UPDATE dinkuskit_commerce_settings SET shipping_free_over_minor = 0"]);
    assert.notEqual(refused.status, 0, 'a zero amount is refused by the table itself');
    const prior = runtime;
    await stopRuntime({ ...prior, ownedPersist: false }); runtime = undefined;
    runtime = await startMerchantTestRuntime({ persistTo, secret: prior.secret, jwt: prior.jwt });
    assert.equal((await request(runtime, new Map(), '/account/.well-known/jwks.json')).status, 200);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'restart leaves additive migration idempotent');
  } finally {
    if (runtime) await stopRuntime(runtime);
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: a runtime checks the schema once and the next start repairs the ledger', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-check-once-'));
  const jwks = runtime => request(runtime, new Map(), '/account/.well-known/jwks.json');
  let runtime;
  try {
    runtime = await startMerchantTestRuntime({ persistTo });
    assert.equal((await jwks(runtime)).status, 200);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger);
    const removed = wranglerD1(persistTo, ['execute', '--yes', '--command', 'DELETE FROM dinkuskit_schema_migrations WHERE version = 15']);
    assert.equal(removed.status, 0, removed.stderr || removed.stdout);
    assert.equal((await jwks(runtime)).status, 200);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger.slice(0, -1), 'later requests in the same runtime skip the schema check');
    await stopRuntime(runtime); runtime = undefined;

    runtime = await startMerchantTestRuntime({ persistTo });
    assert.equal((await jwks(runtime)).status, 200);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'a new runtime finds the missing ledger row and records it again');
  } finally {
    if (runtime) await stopRuntime(runtime);
    await rm(persistTo, { recursive: true, force: true });
  }
});
