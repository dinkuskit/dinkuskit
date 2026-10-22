import assert from 'node:assert/strict';
import test from 'node:test';
import { request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

const visibleText = html => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ');

test('start page: four steps, account buttons that follow sign-in, never cached', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    let response = await request(runtime, new Map(), '/start');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    let html = await response.text();
    let text = visibleText(html);
    assert.match(text, /Now run your own/);
    for (const step of ['Have an EmDash site', 'Add Commerce, Payments and Ship', 'Press Connect to DinkusKit', 'Add a product and place a test order']) {
      assert.ok(text.includes(step), step);
    }
    assert.match(html, /href="\/account\/signup"/);
    assert.match(html, /href="\/account\/sign-in"/);
    assert.doesNotMatch(text, /Signed in as/);
    assert.match(html, /href="\/start" aria-current="page"/);

    const owner = await signup(runtime, 'start-owner@example.com');
    response = await request(runtime, owner.jar, '/start');
    assert.equal(response.status, 200);
    html = await response.text();
    text = visibleText(html);
    assert.match(text, /Signed in as\s+start-owner@example\.com/);
    assert.match(html, /href="\/account\/sites"/);
    assert.doesNotMatch(html, /href="\/account\/signup"/);

    // A cookie that names no session is the signed-out page, not an error.
    response = await request(runtime, new Map([['better-auth.session_token', 'better-auth.session_token=not-a-session']]), '/start');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /href="\/account\/signup"/);
  } finally {
    await stopRuntime(runtime);
  }
});
