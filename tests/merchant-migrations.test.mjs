import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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

test('merchant D1 migrations: runtime-fresh records 1-4 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-runtime-fresh-'));
  try {
    await assertRepeatAndRestart(persistTo, 'runtime-fresh', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: wrangler apply all 4 records 1-4 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-cli-all3-'));
  try {
    applyAllMigrations(persistTo);
    assert.deepEqual(ledgerRows(persistTo), expectedLedger, 'CLI migrations must record their ledger before runtime reconciliation');
    await assertRepeatAndRestart(persistTo, 'cli-all3', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});

test('merchant D1 migrations: upgrade from 0002 records 1-4 and survives repeat/restart', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-upgrade-'));
  try {
    applySql(persistTo, 'migrations/merchant/0001_better_auth.sql');
    applySql(persistTo, 'migrations/merchant/0002_dinkuskit.sql');
    await assertRepeatAndRestart(persistTo, 'upgrade', testSecret());
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});
