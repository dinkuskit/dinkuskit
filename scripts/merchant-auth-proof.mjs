import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Role } from '@emdash-cms/auth';
import { createInventoryCompatibilityVerifier, createPaymentsCompatibilityVerifier } from '../src/account/verifiers.ts';
import { createMerchantAuthHarness, listenMerchantAuth } from '../tests/helpers/merchant-auth-harness.mjs';

const ALICE = 'alice@unconfigured-merchant.example';
const BOB = 'bob@other-merchant.example';
const checks = [];

const runtime = await createMerchantAuthHarness();
const { server, base } = await listenMerchantAuth(runtime);
const cookies = new Map();

async function request(merchant, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const cookie = cookies.get(merchant);
  if (cookie) headers.cookie = cookie;
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, { ...options, headers });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const value of setCookie) {
    if (value.includes('Max-Age=0')) cookies.delete(merchant);
    else if (value.startsWith('dk_session=')) cookies.set(merchant, value.split(';', 1)[0]);
  }
  return { status: response.status, body: await response.json() };
}

async function complete(merchant, kind, path) {
  return request(merchant, path, { method: 'POST', body: JSON.stringify({ token: runtime.takeToken(merchant, kind) }) });
}

async function prove(merchant, siteId) {
  const challenged = await request(merchant, '/sites/challenge', { method: 'POST', body: JSON.stringify({ siteId }) });
  const proof = createHmac('sha256', runtime.controlSecretFor(siteId)).update(challenged.body.challenge).digest('hex');
  return request(merchant, '/sites/prove', { method: 'POST', body: JSON.stringify({ siteId, proof }) });
}

try {
  assert.equal((await request(ALICE, '/signup', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).status, 200);
  assert.equal((await request(BOB, '/signup', { method: 'POST', body: JSON.stringify({ email: BOB }) })).status, 200);
  const alice = await complete(ALICE, 'signup', '/signup/complete');
  const bob = await complete(BOB, 'signup', '/signup/complete');
  assert.equal(alice.status, 200);
  assert.equal(bob.status, 200);
  assert.equal(alice.body.role, Role.SUBSCRIBER);
  assert.notEqual(alice.body.accountId, bob.body.accountId);
  assert.equal(runtime.adapter.allowedDomainRowCount(), 0);
  checks.push('exported requestSignup/completeSignup created two SUBSCRIBER merchants without domain rows');

  assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-north' }) })).status, 403);
  assert.equal((await prove(ALICE, 'site-north')).status, 200);
  assert.equal((await prove(ALICE, 'site-south')).status, 200);
  assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-north' }) })).status, 200);
  assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) })).status, 200);
  checks.push('site control required before grants; first merchant authorized two synthetic sites');

  for (const siteId of ['site-north', 'site-south']) {
    const bobChallenge = await request(BOB, '/sites/challenge', { method: 'POST', body: JSON.stringify({ siteId }) });
    assert.equal(bobChallenge.status, 200);
    const bobProof = await request(BOB, '/sites/prove', { method: 'POST', body: JSON.stringify({ siteId, proof: '00'.repeat(32) }) });
    assert.equal(bobProof.status, 403);
    const bobDenied = await request(BOB, '/tokens', { method: 'POST', body: JSON.stringify({ siteId, audience: 'inventory', scope: 'inventory:admin' }) });
    assert.equal(bobDenied.status, 403);
  }
  checks.push('second merchant cannot prove or authorize either synthetic site');

  const north = await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) });
  const south = await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', audience: 'dinkus-payments', scope: 'payments:admin' }) });
  assert.equal(north.status, 200);
  assert.equal(south.status, 200);
  const inventory = createInventoryCompatibilityVerifier({ issuer: runtime.issuer, audience: 'inventory', jwks: runtime.jwks });
  const payments = createPaymentsCompatibilityVerifier({ issuer: runtime.issuer, audience: 'dinkus-payments', jwks: runtime.jwks });
  assert.deepEqual(await inventory(new Request('https://inventory.invalid/v1/status', {
    headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-north' },
  })), { accountId: alice.body.accountId, siteId: 'site-north' });
  await assert.rejects(payments(new Request('https://payments.invalid/v1/status', {
    headers: { authorization: `Bearer ${north.body.token}`, 'x-dinkus-site': 'site-north' },
  }), 'payments:admin'));
  await assert.rejects(inventory(new Request('https://inventory.invalid/v1/status', {
    headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-south' },
  })));
  checks.push('issued JWTs verify for the intended audience and site header; wrong audience/site rejected');

  const aliceSession = cookies.get(ALICE)?.slice('dk_session='.length);
  const shortLived = await runtime.issue(aliceSession, {
    siteId: 'site-north',
    audience: 'inventory',
    scope: 'inventory:admin',
    ttlSeconds: 1,
  });
  assert.ok(await inventory(new Request('https://inventory.invalid/v1/status', {
    headers: { authorization: `Bearer ${shortLived.token}`, 'x-inventory-site': 'site-north' },
  })));
  await new Promise(resolve => setTimeout(resolve, Math.max(0, shortLived.claims.exp * 1000 - Date.now()) + 1100));
  assert.ok(Math.floor(Date.now() / 1000) > shortLived.claims.exp);
  await assert.rejects(inventory(new Request('https://inventory.invalid/v1/status', {
    headers: { authorization: `Bearer ${shortLived.token}`, 'x-inventory-site': 'site-north' },
  })));
  checks.push('already-issued JWTs stay valid until exp; expired tokens are rejected');

  assert.equal((await request(ALICE, '/tokens/renew', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) })).status, 200);
  const outstanding = await request(ALICE, '/sites/challenge', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) });
  const staleProof = createHmac('sha256', runtime.controlSecretFor('site-south')).update(outstanding.body.challenge).digest('hex');
  assert.equal((await request(ALICE, '/sites/revoke', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) })).status, 200);
  assert.equal((await request(ALICE, '/sites/prove', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', proof: staleProof }) })).status, 403);
  assert.equal((await request(ALICE, '/tokens/renew', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', audience: 'dinkus-payments', scope: 'payments:admin' }) })).status, 403);
  assert.deepEqual(await payments(new Request('https://payments.invalid/v1/status', {
    headers: { authorization: `Bearer ${south.body.token}`, 'x-dinkus-site': 'site-south' },
  }), 'payments:admin'), { accountId: alice.body.accountId, siteId: 'site-south' });
  checks.push('revoke blocks new issuance and outstanding challenge resurrection; prior JWT remains valid');

  assert.equal((await request(ALICE, '/signout', { method: 'POST', body: '{}' })).status, 200);
  assert.equal((await request(ALICE, '/signin', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).status, 200);
  assert.equal((await complete(ALICE, 'magic_link', '/signin/complete')).status, 200);
  assert.equal((await request(ALICE, '/account/disable', { method: 'POST', body: '{}' })).status, 200);
  assert.equal((await request(ALICE, '/session')).status, 401);
  assert.equal((await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) })).status, 401);
  assert.equal((await request(ALICE, '/signin', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).status, 200);
  assert.equal((await complete(ALICE, 'magic_link', '/signin/complete')).status, 401);
  assert.equal((await request(ALICE, '/recovery', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).status, 200);
  assert.equal((await complete(ALICE, 'recovery', '/recovery/complete')).status, 401);
  assert.deepEqual(await inventory(new Request('https://inventory.invalid/v1/status', {
    headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-north' },
  })), { accountId: alice.body.accountId, siteId: 'site-north' });
  checks.push('successful sign-in works; disable blocks session, issuance, sign-in, and recovery');

  assert.equal((await request(BOB, '/recovery', { method: 'POST', body: JSON.stringify({ email: BOB }) })).status, 200);
  assert.equal((await complete(BOB, 'recovery', '/recovery/complete')).status, 200);
  const meta = (await request(BOB, '/meta')).body;
  assert.equal(meta.cmsUserCount, 0);
  assert.equal(meta.publicLoginRoute, false);
  assert.equal(meta.allowedDomainRows, 0);
  assert.equal(meta.fixtureHttpSession, true);
  checks.push('recovery works for the second merchant; fixture HTTP session is not native browser integration');

  console.log(checks.map(check => `PASS ${check}`).join('\n'));
  const work = '.grilltrack/work/merchant-auth-proof';
  await mkdir(work, { recursive: true });
  await writeFile(`${work}/http-results.json`, `${JSON.stringify({
    at: new Date().toISOString(),
    base: 'http://127.0.0.1',
    issuerHost: new URL(runtime.issuer).host,
    checks,
    snapshot: meta,
    mail: runtime.capturedMail(),
    secretsPreserved: false,
  }, null, 2)}\n`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
