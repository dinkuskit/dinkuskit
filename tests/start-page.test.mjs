import assert from 'node:assert/strict';
import test from 'node:test';
import { request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

// The page's words come from the CMS (pages entry "start"), which this Worker
// harness does not load; scripts/test-pages-import.mjs draws them. Here: the
// Worker's own part, the signed-in check, never breaks the page or its caching.
test('start page: the signed-in check never breaks the page and nothing is cached', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const anonymous = await request(runtime, new Map(), '/start');
    assert.equal(anonymous.headers.get('cache-control'), 'private, no-store');
    const owner = await signup(runtime, 'start-owner@example.com');
    const bogus = new Map([['better-auth.session_token', 'better-auth.session_token=not-a-session']]);
    for (const jar of [owner.jar, bogus]) {
      const response = await request(runtime, jar, '/start');
      assert.equal(response.status, anonymous.status, 'same answer signed in, signed out or with a stale cookie');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(await response.text(), /href="\/start" aria-current="page"/);
    }
  } finally {
    await stopRuntime(runtime);
  }
});
