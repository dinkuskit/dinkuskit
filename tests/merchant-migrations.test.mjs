import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { request, startMerchantTestRuntime, stopRuntime, testSecret } from './helpers/merchant-harness.mjs';

const wrangler = 'node_modules/.bin/wrangler';
const expectedLedger = [
  { version: 1, name: '0001_better_auth.sql' },
  { version: 2, name: '0002_dinkuskit.sql' },
  { version: 3, name: '0003_store_connect.sql' },
  { version: 4, name: '0004_account_foundation.sql' },
  { version: 5, name: '0005_operator_authorization.sql' },
  { version: 6, name: '0006_organization_approvals.sql' },
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
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: siteId,
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

test('merchant D1 migrations: runtime-fresh records 1-6 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-runtime-fresh-'));
  try {
    await assertRepeatAndRestart(persistTo, 'runtime-fresh', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: wrangler apply all 6 records 1-6 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-cli-all3-'));
  try {
    applyAllMigrations(persistTo);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'CLI migrations must record their ledger before runtime reconciliation');
    await assertRepeatAndRestart(persistTo, 'cli-all3', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: upgrade from 0002 records 1-6 and survives repeat/restart', async () => {
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
