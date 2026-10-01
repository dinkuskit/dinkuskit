import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { Role } from '@emdash-cms/auth';
import { createInventoryCompatibilityVerifier, createPaymentsCompatibilityVerifier } from '../src/account/verifiers.ts';
import { createMerchantAuthHarness, listenMerchantAuth } from './helpers/merchant-auth-harness.mjs';

const ALICE = 'alice@unconfigured-merchant.example';
const BOB = 'bob@other-merchant.example';

async function start() {
  const runtime = await createMerchantAuthHarness();
  const { server, base } = await listenMerchantAuth(runtime);
  const cookies = new Map();
  const request = async (merchant, path, options = {}) => {
    const headers = { ...(options.headers ?? {}) };
    const cookie = cookies.get(merchant);
    if (cookie) headers.cookie = cookie;
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const response = await fetch(base + path, { ...options, headers });
    const setCookie = response.headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    for (const value of setCookie) {
      if (value.includes('Max-Age=0')) cookies.delete(merchant);
      else if (value.startsWith('dk_session=')) cookies.set(merchant, value.split(';', 1)[0]);
    }
    const body = await response.json();
    return { response, body };
  };
  const complete = async (merchant, kind, path) => {
    const token = runtime.takeToken(merchant, kind);
    return request(merchant, path, { method: 'POST', body: JSON.stringify({ token }) });
  };
  const prove = async (merchant, siteId) => {
    const challenged = await request(merchant, '/sites/challenge', { method: 'POST', body: JSON.stringify({ siteId }) });
    assert.equal(challenged.response.status, 200, challenged.body.error);
    const proof = createHmac('sha256', runtime.controlSecretFor(siteId)).update(challenged.body.challenge).digest('hex');
    return request(merchant, '/sites/prove', { method: 'POST', body: JSON.stringify({ siteId, proof }) });
  };
  const sessionId = merchant => cookies.get(merchant)?.slice(`${'dk_session'}`.length + 1);
  return { runtime, server, request, complete, prove, sessionId };
}

test('HTTP fixture: exported helpers, two merchants, grants, JWTs, disable, expiry, revoke', async () => {
  const { runtime, server, request, complete, prove, sessionId } = await start();
  try {
    assert.equal((await request(ALICE, '/signup', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).response.status, 200);
    assert.equal((await request(BOB, '/signup', { method: 'POST', body: JSON.stringify({ email: BOB }) })).response.status, 200);
    const aliceSignup = await complete(ALICE, 'signup', '/signup/complete');
    const bobSignup = await complete(BOB, 'signup', '/signup/complete');
    assert.equal(aliceSignup.response.status, 200);
    assert.equal(bobSignup.response.status, 200);
    assert.notEqual(aliceSignup.body.accountId, bobSignup.body.accountId);
    assert.equal(aliceSignup.body.websiteEditor, false);
    assert.equal(aliceSignup.body.role, Role.SUBSCRIBER);
    assert.equal(JSON.parse(aliceSignup.body.accountId)[0], runtime.issuer);
    assert.equal(runtime.adapter.allowedDomainRowCount(), 0);
    assert.deepEqual(await runtime.adapter.getAllowedDomains(), []);

    assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-north' }) })).response.status, 403);
    assert.equal((await prove(ALICE, 'site-north')).response.status, 200);
    assert.equal((await prove(ALICE, 'site-south')).response.status, 200);
    assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-north' }) })).response.status, 200);
    assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) })).response.status, 200);

    for (const siteId of ['site-north', 'site-south']) {
      const bobChallenge = await request(BOB, '/sites/challenge', { method: 'POST', body: JSON.stringify({ siteId }) });
      assert.equal(bobChallenge.response.status, 200);
      const bobWrong = await request(BOB, '/sites/prove', { method: 'POST', body: JSON.stringify({ siteId, proof: '00'.repeat(32) }) });
      assert.equal(bobWrong.response.status, 403);
      assert.equal((await request(BOB, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId }) })).response.status, 403);
      assert.equal((await request(BOB, '/tokens', { method: 'POST', body: JSON.stringify({ siteId, audience: 'inventory', scope: 'inventory:admin' }) })).response.status, 403);
    }

    const north = await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) });
    const south = await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', audience: 'dinkus-payments', scope: 'payments:admin' }) });
    const checkout = await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', audience: 'dinkus-payments', scope: 'payments:checkout' }) });
    assert.equal(north.response.status, 200);
    assert.equal(south.response.status, 200);
    assert.equal(checkout.response.status, 200);
    const inventory = createInventoryCompatibilityVerifier({ issuer: runtime.issuer, audience: 'inventory', jwks: runtime.jwks });
    const payments = createPaymentsCompatibilityVerifier({ issuer: runtime.issuer, audience: 'dinkus-payments', jwks: runtime.jwks });
    const wrongIssuer = createInventoryCompatibilityVerifier({ issuer: 'https://other-accounts.invalid', audience: 'inventory', jwks: runtime.jwks });
    assert.deepEqual(await inventory(new Request('https://inventory.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-north' },
    })), { accountId: aliceSignup.body.accountId, siteId: 'site-north' });
    assert.deepEqual(await payments(new Request('https://payments.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${south.body.token}`, 'x-dinkus-site': 'site-south' },
    }), 'payments:admin'), { accountId: aliceSignup.body.accountId, siteId: 'site-south' });
    await assert.rejects(inventory(new Request('https://inventory.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-south' },
    })));
    await assert.rejects(payments(new Request('https://payments.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${north.body.token}`, 'x-dinkus-site': 'site-north' },
    }), 'payments:admin'));
    await assert.rejects(payments(new Request('https://payments.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${south.body.token}`, 'x-dinkus-site': 'site-south' },
    }), 'payments:checkout'));
    await assert.rejects(wrongIssuer(new Request('https://inventory.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-north' },
    })));
    assert.equal((await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'payments:admin' }) })).response.status, 400);

    const shortLived = await runtime.issue(sessionId(ALICE), {
      siteId: 'site-north',
      audience: 'inventory',
      scope: 'inventory:admin',
      ttlSeconds: 1,
    });
    assert.deepEqual(await inventory(new Request('https://inventory.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${shortLived.token}`, 'x-inventory-site': 'site-north' },
    })), { accountId: aliceSignup.body.accountId, siteId: 'site-north' });
    const waitMs = Math.max(0, shortLived.claims.exp * 1000 - Date.now()) + 1100;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    assert.ok(Math.floor(Date.now() / 1000) > shortLived.claims.exp);
    await assert.rejects(inventory(new Request('https://inventory.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${shortLived.token}`, 'x-inventory-site': 'site-north' },
    })));

    const renewed = await request(ALICE, '/tokens/renew', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) });
    assert.equal(renewed.response.status, 200);

    const outstanding = await request(ALICE, '/sites/challenge', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) });
    assert.equal(outstanding.response.status, 200);
    const staleProof = createHmac('sha256', runtime.controlSecretFor('site-south')).update(outstanding.body.challenge).digest('hex');
    assert.equal((await request(ALICE, '/sites/revoke', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) })).response.status, 200);
    assert.equal((await request(ALICE, '/sites/prove', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', proof: staleProof }) })).response.status, 403);
    assert.equal((await request(ALICE, '/sites/authorize', { method: 'POST', body: JSON.stringify({ siteId: 'site-south' }) })).response.status, 403);
    assert.equal((await request(ALICE, '/tokens/renew', { method: 'POST', body: JSON.stringify({ siteId: 'site-south', audience: 'dinkus-payments', scope: 'payments:admin' }) })).response.status, 403);
    assert.deepEqual(await payments(new Request('https://payments.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${south.body.token}`, 'x-dinkus-site': 'site-south' },
    }), 'payments:admin'), { accountId: aliceSignup.body.accountId, siteId: 'site-south' });

    assert.equal((await request(ALICE, '/signout', { method: 'POST', body: '{}' })).response.status, 200);
    assert.equal((await request(ALICE, '/session')).response.status, 401);
    assert.equal((await request(ALICE, '/signin', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).response.status, 200);
    const signedIn = await complete(ALICE, 'magic_link', '/signin/complete');
    assert.equal(signedIn.response.status, 200);
    assert.equal(signedIn.body.accountId, aliceSignup.body.accountId);
    assert.equal((await request(ALICE, '/session')).response.status, 200);

    assert.equal((await request(ALICE, '/account/disable', { method: 'POST', body: '{}' })).response.status, 200);
    assert.equal((await request(ALICE, '/session')).response.status, 401);
    assert.equal((await request(ALICE, '/tokens', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) })).response.status, 401);
    assert.equal((await request(ALICE, '/tokens/renew', { method: 'POST', body: JSON.stringify({ siteId: 'site-north', audience: 'inventory', scope: 'inventory:admin' }) })).response.status, 401);
    assert.deepEqual(await inventory(new Request('https://inventory.dinkuskit.invalid/v1/status', {
      headers: { authorization: `Bearer ${north.body.token}`, 'x-inventory-site': 'site-north' },
    })), { accountId: aliceSignup.body.accountId, siteId: 'site-north' });

    assert.equal((await request(ALICE, '/signin', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).response.status, 200);
    assert.equal((await complete(ALICE, 'magic_link', '/signin/complete')).response.status, 401);
    assert.equal((await request(ALICE, '/recovery', { method: 'POST', body: JSON.stringify({ email: ALICE }) })).response.status, 200);
    assert.equal((await complete(ALICE, 'recovery', '/recovery/complete')).response.status, 401);

    assert.equal((await request(BOB, '/signout', { method: 'POST', body: '{}' })).response.status, 200);
    assert.equal((await request(BOB, '/recovery', { method: 'POST', body: JSON.stringify({ email: BOB }) })).response.status, 200);
    const recovered = await complete(BOB, 'recovery', '/recovery/complete');
    assert.equal(recovered.response.status, 200);
    assert.equal(recovered.body.accountId, bobSignup.body.accountId);

    const meta = await request(BOB, '/meta');
    assert.equal(meta.body.cmsUserCount, 0);
    assert.equal(meta.body.websiteEditorCount, 0);
    assert.equal(meta.body.publicLoginRoute, false);
    assert.equal(meta.body.allowedDomainRows, 0);
    assert.equal(meta.body.fixtureHttpSession, true);
    assert.equal(meta.body.nativeBrowserIntegration, false);
    assert.equal(meta.body.merchantCount, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
