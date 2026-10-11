import assert from 'node:assert/strict';
import test from 'node:test';
import { access } from 'node:fs/promises';
import { AGENT_REQUEST_LIMIT, AGENT_RUN_MS, createAgentTestEntry, isLocalOrigin } from './fixtures/agent-test-policy.mjs';
import { agentAuth, startAgentTestRuntime } from './helpers/agent-test-harness.mjs';
import { runAgentTestScenario } from './helpers/agent-test-scenario.mjs';
import { request, startProductionWorker, stopRuntime, testSecret } from './helpers/merchant-harness.mjs';

const origin = 'http://127.0.0.1:8765';
const key = 'k'.repeat(43);
const currentTime = 1_800_000_000_000;
const env = { MERCHANT_BASE_URL: origin, AGENT_TEST_KEY: key, AGENT_TEST_EXPIRES_AT: String(currentTime + AGENT_RUN_MS) };
function req(path = '/__agent/auth/complete', overrides = {}) {
  return new Request(origin + path, { method: 'POST', headers: { origin, 'x-agent-test-key': key }, body: JSON.stringify({ identity: 'owner' }), ...overrides });
}

test('agent guard refuses keys, origins, remote configuration, arbitrary identities and proof routes before delegation', async () => {
  let calls = 0;
  const entry = createAgentTestEntry({ fetch() { calls++; return new Response(null, { status: 303 }); } }, () => currentTime);
  for (const value of ['https://127.0.0.1:8765', 'http://localhost.evil.test', 'http://127.1', 'http://127.0.0.1:8765/', 'http://user@localhost:8765', 'https://dinkuskit.com']) assert.equal(isLocalOrigin(value), false);
  assert.equal(isLocalOrigin('http://localhost:8765'), true);
  for (const headers of [{ origin }, { origin, 'x-agent-test-key': 'wrong' }]) assert.equal((await entry.fetch(req(undefined, { headers }), env)).status, 401);
  for (const candidate of [undefined, 'null', 'http://localhost:8765', 'https://evil.example.test', origin + '/']) {
    const headers = { 'x-agent-test-key': key }; if (candidate) headers.origin = candidate;
    assert.equal((await entry.fetch(req(undefined, { headers }), env)).status, 403);
  }
  assert.equal((await entry.fetch(new Request('http://localhost:8765/__agent/auth/complete', req()), env)).status, 403);
  for (const replacement of [
    { MERCHANT_BASE_URL: 'https://dinkuskit.com' }, { AGENT_TEST_KEY: '' },
    { AGENT_TEST_EXPIRES_AT: 'NaN' }, { AGENT_TEST_EXPIRES_AT: String(currentTime + AGENT_RUN_MS + 1) },
  ]) assert.equal((await entry.fetch(req(), { ...env, ...replacement })).status, 503);
  assert.equal((await entry.fetch(req(), { ...env, AGENT_TEST_EXPIRES_AT: String(currentTime) })).status, 410);
  for (const identity of ['unknown', 'owner@example.com', '__proto__', 'toString']) assert.equal((await entry.fetch(req(undefined, { body: JSON.stringify({ identity }) }), env)).status, 403);
  for (const path of ['/__proof/browser/complete', '/__proof/receipt', '/api/auth/sign-in/magic-link', '/account/signup', '/account/sign-in', '/__agent/unknown']) assert.equal((await entry.fetch(req(path), env)).status, 404);
  assert.equal((await entry.fetch(req(undefined, { body: 'x'.repeat(8193) }), env)).status, 413);
  assert.equal((await entry.fetch(req(undefined, { body: '{' }), env)).status, 400);
  assert.equal((await entry.fetch(req('/__agent/receipt', { body: JSON.stringify({ site_origin: 'https://external.example' }) }), env)).status, 403);
  assert.equal((await entry.fetch(req('/api/store-connections', { body: JSON.stringify({ site_origin: 'https://external.example' }) }), env)).status, 403);
  for (const path of ['/__agent/auth/start', '/__agent/auth/complete', '/__agent/expire-auth']) {
    assert.equal((await entry.fetch(req(path, { body: JSON.stringify({ identity: 'owner', intent: 'signup', email: 'other@example.test' }) }), env)).status, 400);
  }
  assert.equal(calls, 0, 'rejected requests never reach the application');
});

test('agent guard has fixed request budget and strips its key before delegation', async () => {
  let calls = 0;
  const entry = createAgentTestEntry({ fetch(request) {
    assert.equal(request.headers.has('x-agent-test-key'), false);
    calls++; return new Response(null, { status: 200 });
  } }, () => currentTime);
  for (let index = 0; index < AGENT_REQUEST_LIMIT; index++) assert.equal((await entry.fetch(req('/account', { method: 'GET', body: undefined }), env)).status, 200);
  assert.equal((await entry.fetch(req('/account'), env)).status, 429);
  assert.equal(calls, AGENT_REQUEST_LIMIT);
});

test('local agent E2E uses real sessions and permissions with synthetic transports and destroys its DB', async () => {
  for (const options of [{ origin: 'https://dinkuskit.com' }, { persistTo: '/tmp/existing' }, { secret: 'provided' }]) await assert.rejects(startAgentTestRuntime(options), /no external configuration/);
  const runtime = await startAgentTestRuntime();
  const jar = new Map();
  try {
    await assert.rejects(runtime.request(jar, 'https://external.example.test'), /local runtime/);
    await assert.rejects(runtime.request(jar, '/account', { redirect: 'follow' }), /must not follow/);
    for (const headers of [{ origin: runtime.origin }, { origin: runtime.origin, 'x-agent-test-key': 'wrong' }]) {
      assert.equal((await fetch(runtime.origin + '/__agent/auth/complete', { method: 'POST', headers, body: '{}' })).status, 401);
    }
    const result = await runAgentTestScenario(runtime);
    assert.equal(result.result, 'passed');
    await runtime.request(jar, '/account');
  } finally { await runtime.close(); }
  await assert.rejects(access(runtime.persistTo), { code: 'ENOENT' });
  assert.equal(jar.size, 0);
  await assert.rejects(runtime.request(jar, '/account'), /closed/);
});

test('production entry exposes no agent routes even with rogue test bindings and flags', async () => {
  const runtime = await startProductionWorker({ secret: testSecret(), rogueTestBindings: true, vars: {
    AGENT_TEST_KEY: key, AGENT_TEST_EXPIRES_AT: String(Date.now() + AGENT_RUN_MS), AGENT_TEST: '1',
  } });
  try {
    for (const path of ['/__agent/auth/start', '/__agent/auth/complete', '/__agent/expire-auth', '/__agent/receipt', '/__proof/browser/complete']) {
      const response = await request(runtime, new Map(), path, { method: 'POST', headers: { 'x-agent-test-key': key }, body: '{}' });
      assert.equal(response.status, 404, path);
    }
  } finally { await stopRuntime(runtime); }
});

test('a failed run clears its session jar and removes disposable storage', async () => {
  const runtime = await startAgentTestRuntime();
  const jar = new Map();
  await assert.rejects(async () => {
    try {
      await agentAuth(runtime, jar, 'owner');
      assert.ok(jar.size > 0);
      throw new Error('synthetic_run_failure');
    } finally { await runtime.close(); }
  }, /synthetic_run_failure/);
  assert.equal(jar.size, 0);
  await assert.rejects(access(runtime.persistTo), { code: 'ENOENT' });
});
