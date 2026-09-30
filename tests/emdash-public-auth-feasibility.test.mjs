import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Role,
  VALID_SCOPES,
  TOKEN_PREFIXES,
  canSignup,
  requestSignup,
  completeSignup,
  sendMagicLink,
  generateToken,
  validateScopes,
  hasPermission,
} from '@emdash-cms/auth';
import { createMemoryAuthAdapter } from './helpers/memory-emdash-adapter.mjs';
import { createGeneralSubscriberAdapter } from './helpers/general-subscriber-adapter.mjs';

const MERCHANT = 'alice@unconfigured-merchant.example';
const OTHER = 'bob@other-merchant.example';

function extractToken(text) {
  const match = String(text).match(/[?&]token=([^&\s]+)/);
  assert.ok(match, 'exported helper should include a token query');
  return decodeURIComponent(match[1]);
}

test('native-style adapter: CMS configured allowlist still denies unconfigured domains', async () => {
  const adapter = createMemoryAuthAdapter();
  assert.equal(await canSignup(adapter, MERCHANT), null);
  assert.equal(await canSignup(adapter, OTHER), null);
  await adapter.createAllowedDomain('preconfigured.example', Role.SUBSCRIBER);
  assert.deepEqual(await canSignup(adapter, 'owner@preconfigured.example'), { allowed: true, role: Role.SUBSCRIBER });
  assert.equal(await canSignup(adapter, MERCHANT), null);
});

test('custom AuthAdapter getAllowedDomain allows general SUBSCRIBER signup without domain rows', async () => {
  const adapter = createGeneralSubscriberAdapter();
  assert.deepEqual(await canSignup(adapter, MERCHANT), { allowed: true, role: Role.SUBSCRIBER });
  assert.deepEqual(await canSignup(adapter, OTHER), { allowed: true, role: Role.SUBSCRIBER });
  assert.deepEqual(await adapter.getAllowedDomains(), []);
  assert.equal(adapter.allowedDomainRowCount(), 0);
  await assert.rejects(() => adapter.createAllowedDomain('unconfigured-merchant.example', Role.SUBSCRIBER), /domain_rows_not_used/);
});

test('native-style requestSignup does not email an unconfigured merchant domain', async () => {
  const adapter = createMemoryAuthAdapter();
  const sent = [];
  await requestSignup({ baseUrl: 'http://127.0.0.1', siteName: 'DinkusKit', email: message => { sent.push(message); } }, adapter, MERCHANT);
  assert.equal(sent.length, 0);
});

test('exported requestSignup/completeSignup work through the custom adapter for two merchants', async () => {
  const adapter = createGeneralSubscriberAdapter();
  const sent = [];
  const config = { baseUrl: 'http://127.0.0.1', siteName: 'DinkusKit', email: message => { sent.push(message); } };
  await requestSignup(config, adapter, MERCHANT);
  await requestSignup(config, adapter, OTHER);
  assert.equal(sent.length, 2);
  assert.match(sent[0].text, /\/admin\/signup\?token=/);
  assert.match(sent[1].text, /\/admin\/signup\?token=/);
  const alice = await completeSignup(adapter, extractToken(sent[0].text), {});
  const bob = await completeSignup(adapter, extractToken(sent[1].text), {});
  assert.equal(alice.role, Role.SUBSCRIBER);
  assert.equal(bob.role, Role.SUBSCRIBER);
  assert.notEqual(alice.id, bob.id);
  assert.deepEqual(await adapter.getAllowedDomains(), []);
  sent.length = 0;
});

test('exported SignupConfig cannot change the native CMS signup URL', async () => {
  const adapter = createGeneralSubscriberAdapter();
  const sent = [];
  await requestSignup({ baseUrl: 'http://127.0.0.1', siteName: 'DinkusKit', email: message => { sent.push(message); } }, adapter, MERCHANT);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /http:\/\/127\.0\.0\.1\/admin\/signup\?token=/);
  sent[0].text = '[redacted]';
});

test('exported sendMagicLink is coupled to the native CMS verify URL', async () => {
  const adapter = createGeneralSubscriberAdapter();
  const sent = [];
  const config = { baseUrl: 'http://127.0.0.1', siteName: 'DinkusKit', email: message => { sent.push(message); } };
  await requestSignup(config, adapter, MERCHANT);
  await completeSignup(adapter, extractToken(sent[0].text), {});
  sent.length = 0;
  await sendMagicLink(config, adapter, MERCHANT);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /\/_emdash\/api\/auth\/magic-link\/verify\?token=/);
  sent[0].text = '[redacted]';
});

test('public token helpers are opaque CMS credentials and reject service scopes', () => {
  assert.deepEqual(validateScopes(['inventory:admin', 'payments:admin', 'payments:checkout']), [
    'inventory:admin',
    'payments:admin',
    'payments:checkout',
  ]);
  assert.ok(!VALID_SCOPES.includes('inventory:admin'));
  assert.ok(!VALID_SCOPES.includes('payments:admin'));
  const opaque = generateToken();
  assert.equal(opaque.includes('.'), false);
  assert.equal(TOKEN_PREFIXES.PAT.startsWith('ec_'), true);
});

test('subscriber merchants are not website editors', () => {
  const subscriber = { role: Role.SUBSCRIBER };
  assert.equal(hasPermission(subscriber, 'content:read'), true);
  assert.equal(hasPermission(subscriber, 'content:edit_any'), false);
  assert.equal(hasPermission(subscriber, 'settings:manage'), false);
  assert.equal(hasPermission(subscriber, 'users:manage'), false);
  assert.equal(hasPermission(subscriber, 'plugins:manage'), false);
});
