import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBuildSource, productionBuildEnv } from '../scripts/workers-builds.mjs';

const account = 'a'.repeat(32);

async function checkout() {
  const dir = await mkdtemp(join(tmpdir(), 'workers-builds-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  await writeFile(join(dir, 'file.txt'), 'one\n');
  git('add', 'file.txt');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'one');
  return { dir, head: git('rev-parse', 'HEAD') };
}

function buildEnv(head, overrides = {}) {
  return {
    WORKERS_CI: '1',
    WORKERS_CI_BRANCH: 'deploy/dinkuskit-com',
    CLOUDFLARE_ACCOUNT_ID: account,
    DINKUS_EXPECTED_BRANCH: 'deploy/dinkuskit-com',
    DINKUS_EXPECTED_COMMIT: head,
    DINKUS_EXPECTED_ACCOUNT_ID: account,
    EMDASH_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
    ...overrides,
  };
}

test('accepts only the named branch, commit and account', async () => {
  const { dir, head } = await checkout();
  try {
    assert.deepEqual(assertBuildSource(buildEnv(head), dir), { branch: 'deploy/dinkuskit-com', commit: head, account });
    const refusals = [
      [{ WORKERS_CI: '' }, /only in Cloudflare Workers Builds/],
      [{ WORKERS_CI_BRANCH: 'main' }, /branch does not match/],
      [{ CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32) }, /account does not match/],
      [{ DINKUS_EXPECTED_COMMIT: 'c'.repeat(40) }, /HEAD does not match/],
      [{ DINKUS_EXPECTED_COMMIT: '' }, /Missing or invalid DINKUS_EXPECTED_COMMIT/],
      [{ DINKUS_EXPECTED_BRANCH: '' }, /Missing or invalid DINKUS_EXPECTED_BRANCH/],
      [{ DINKUS_EXPECTED_ACCOUNT_ID: 'nope' }, /Missing or invalid DINKUS_EXPECTED_ACCOUNT_ID/],
      [{ EMDASH_ACCESS_TEAM_DOMAIN: '' }, /Missing or invalid EMDASH_ACCESS_TEAM_DOMAIN/],
      [{ EMDASH_ACCESS_TEAM_DOMAIN: 'example.com' }, /Missing or invalid EMDASH_ACCESS_TEAM_DOMAIN/],
    ];
    for (const [overrides, message] of refusals) {
      assert.throws(() => assertBuildSource(buildEnv(head, overrides), dir), message);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('refuses a checkout with changed tracked files', async () => {
  const { dir, head } = await checkout();
  try {
    await writeFile(join(dir, 'file.txt'), 'two\n');
    assert.throws(() => assertBuildSource(buildEnv(head), dir), /tracked source is not clean/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('production builds always carry the DinkusGuide pilot', () => {
  assert.deepEqual({ ...productionBuildEnv }, { DINKUS_GUIDE_PILOT: 'true', DINKUS_GUIDE_PLUGIN_ID: 'dinkusguide-chat' });
});
