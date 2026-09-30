import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { request, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

const wrangler = 'node_modules/.bin/wrangler';

function applySql(persistTo, file) {
  const result = spawnSync(wrangler, [
    'd1', 'execute', 'dinkuskit-merchant-local', '--local', '--persist-to', persistTo,
    '--config', 'wrangler.jsonc', '--file', file, '--yes',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('merchant D1 migrations: fresh schema and upgrade from 0002', async () => {
  const fresh = await startMerchantTestRuntime();
  try {
    const signup = await request(fresh, new Map(), '/account/signup');
    assert.equal(signup.status, 200);
  } finally {
    await stopRuntime(fresh);
  }

  const persistTo = await mkdtemp(join(tmpdir(), 'dk-upgrade-'));
  try {
    applySql(persistTo, 'migrations/merchant/0001_better_auth.sql');
    applySql(persistTo, 'migrations/merchant/0002_dinkuskit.sql');
    const upgraded = await startMerchantTestRuntime({ persistTo });
    try {
      const page = await request(upgraded, new Map(), '/account/signup');
      assert.equal(page.status, 200);
      const start = await request(upgraded, new Map(), '/api/store-connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'dinkus-inventory-emdash',
          service: 'inventory',
          site_id: 'upgrade-site',
          site_origin: 'https://upgrade.stores.example',
          callback_uri: 'https://upgrade.stores.example/_emdash/admin/plugins/dinkus-inventory/inventory',
          code_challenge: 'a'.repeat(43),
          code_challenge_method: 'S256',
        }),
      });
      assert.equal(start.status, 200);
    } finally {
      await stopRuntime({ ...upgraded, ownedPersist: false });
    }
  } finally {
    await rm(persistTo, { recursive: true, force: true });
  }
});
