import assert from 'node:assert/strict';
import test from 'node:test';
import { unavailableResponse } from '../src/account/config.ts';

test('a browser opening an account page before setup gets a plain page, not raw JSON', async () => {
  const page = unavailableResponse('merchant_unavailable', new Request('https://dinkuskit.com/account', { headers: { accept: 'text/html,application/xhtml+xml' } }));
  assert.equal(page.status, 503);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('cache-control'), 'private, no-store');
  assert.match(await page.text(), /Accounts are being set up/);
});

test('service callers, form posts and other errors keep the JSON error', async () => {
  const api = unavailableResponse('merchant_unavailable', new Request('https://dinkuskit.com/account/.well-known/jwks.json', { headers: { accept: 'application/json' } }));
  assert.deepEqual(await api.json(), { error: 'merchant_unavailable' });
  const post = unavailableResponse('merchant_unavailable', new Request('https://dinkuskit.com/account/signup', { method: 'POST', headers: { accept: 'text/html' } }));
  assert.deepEqual(await post.json(), { error: 'merchant_unavailable' });
  const email = unavailableResponse('email_unavailable', new Request('https://dinkuskit.com/account', { headers: { accept: 'text/html' } }));
  assert.deepEqual(await email.json(), { error: 'email_unavailable' });
  assert.deepEqual(await unavailableResponse().json(), { error: 'merchant_unavailable' });
});
