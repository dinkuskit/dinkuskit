import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeLink,
  completeProofMail,
  request,
  signup,
  startMerchantTestRuntime,
  startProductionWorker,
  stopRuntime,
  takeMail,
} from './helpers/merchant-harness.mjs';

const ALICE = 'alice@merchant.example';
const BOB = 'bob@merchant.example';

test('built workerd Astro routes: signup, isolation, persistence, CSRF, disable', async (t) => {
  const first = await startMerchantTestRuntime();
  const aliceJar = new Map();
  const bobJar = new Map();
  try {
    const signupPage = await request(first, aliceJar, '/account/signup');
    assert.equal(signupPage.status, 200);
    assert.match(await signupPage.text(), /Create your account/);

    const protectedPage = await request(first, aliceJar, '/account', { redirect: 'manual' });
    assert.equal(protectedPage.status, 303);
    assert.equal(protectedPage.headers.get('location'), '/account/sign-in');

    const alice = await signup(first, ALICE, aliceJar);
    assert.equal(alice.posted.status, 303);
    assert.equal(alice.mail.hasToken, true);

    const aliceAccount = await request(first, aliceJar, '/account');
    assert.equal(aliceAccount.status, 200);
    const aliceHtml = await aliceAccount.text();
    assert.match(aliceHtml, /Your DinkusKit account/);
    assert.match(aliceHtml, /alice@merchant\.example/);
    assert.doesNotMatch(aliceHtml, /Account:/);

    await signup(first, BOB, bobJar);
    const bobHtml = await (await request(first, bobJar, '/account')).text();
    assert.match(bobHtml, /bob@merchant\.example/);
    assert.doesNotMatch(bobHtml, /alice@merchant\.example/);

    const reused = await completeLink(first, new Map(), 'not-a-real-token');
    assert.ok([302, 303, 307].includes(reused.status));

    const foreignSignup = await request(first, new Map(), '/account/signup', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
      body: `email=${encodeURIComponent('eve@merchant.example')}`,
    });
    assert.equal(foreignSignup.status, 403);

    const missingOriginSignup = await request(first, new Map(), '/account/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `email=${encodeURIComponent('eve@merchant.example')}`,
      omitOrigin: true,
    });
    assert.equal(missingOriginSignup.status, 403);

    const foreignDisable = await request(first, aliceJar, '/account', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=disable',
    });
    assert.equal(foreignDisable.status, 403);
    assert.equal((await request(first, aliceJar, '/account')).status, 200);

    const missingOriginDisable = await request(first, aliceJar, '/account', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=disable',
      omitOrigin: true,
    });
    assert.equal(missingOriginDisable.status, 403);
    assert.equal((await request(first, aliceJar, '/account')).status, 200);

    const noAction = await request(first, aliceJar, '/account', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'ignored=1',
    });
    assert.ok([200, 303].includes(noAction.status));
    assert.equal((await request(first, aliceJar, '/account')).status, 200);

    const tokens = await request(first, aliceJar, '/account/tokens', { method: 'POST', body: '{}' });
    assert.equal(tokens.status, 403);

    assert.equal((await request(first, aliceJar, '/account', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=disable',
    })).status, 303);
    assert.equal((await request(first, aliceJar, '/account', { redirect: 'manual' })).status, 303);

    assert.equal((await request(first, new Map(), '/account/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `email=${encodeURIComponent(ALICE)}`,
    })).status, 303);
    assert.equal(await takeMail(first, ALICE), null);

    await first.worker.stop();
    const restarted = await startMerchantTestRuntime({ persistTo: first.persistTo, secret: first.secret });
    try {
      assert.equal((await request(restarted, bobJar, '/account')).status, 200);
      assert.equal((await request(restarted, bobJar, '/account/logout', { method: 'POST' })).status, 303);
      assert.equal((await request(restarted, bobJar, '/account', { redirect: 'manual' })).status, 303);

      await t.test('expired verification is rejected', async () => {
        assert.equal((await request(restarted, new Map(), '/account/recover', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: `email=${encodeURIComponent(BOB)}`,
        })).status, 303);
        await request(restarted, new Map(), '/__proof/expire-verification', { method: 'POST', body: '{}' });
        const expired = await completeProofMail(restarted, new Map(), BOB);
        assert.match(expired.headers.get('location') ?? '', /error=/);
      });
    } finally {
      await stopRuntime({ ...restarted, ownedPersist: true });
    }
  } finally {
    try { await first.worker.stop(); } catch {}
  }
});

test('production worker does not expose proof routes', async () => {
  const runtime = await startProductionWorker({ vars: { MERCHANT_PROOF_SINK: '1' } });
  try {
    const take = await runtime.worker.fetch(new URL('/__proof/mail/take', runtime.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: runtime.origin },
      body: JSON.stringify({ email: 'anyone@merchant.example' }),
    });
    assert.notEqual(take.status, 200);
    const signup = await runtime.worker.fetch(new URL('/account/signup', runtime.origin), { redirect: 'manual' });
    assert.equal(signup.status, 503);
  } finally {
    await runtime.worker.stop();
    await stopRuntime({ ...runtime, ownedPersist: false });
  }
});

test('production entry ignores rogue simulation bindings', async () => {
  const runtime = await startProductionWorker({ rogueTestBindings: true });
  try {
    const take = await runtime.worker.fetch(new URL('/__proof/mail/take', runtime.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: runtime.origin },
      body: JSON.stringify({ email: 'rogue@merchant.example' }),
    });
    assert.notEqual(take.status, 200);
    const receipt = await runtime.worker.fetch(new URL('/__proof/receipt', runtime.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: runtime.origin },
      body: JSON.stringify({ connection_id: 'rogue', version: 1 }),
    });
    assert.notEqual(receipt.status, 200);
    const signup = await runtime.worker.fetch(new URL('/account/signup', runtime.origin), { redirect: 'manual' });
    assert.equal(signup.status, 503);
  } finally {
    await stopRuntime({ ...runtime, ownedPersist: false });
  }
});
