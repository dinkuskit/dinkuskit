import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { grantPresent, request, signup, startMerchantTestRuntime, startProductionWorker, stopRuntime } from './helpers/merchant-harness.mjs';

const ALICE = 'alice-connect@merchant.example';
const BOB = 'bob-connect@merchant.example';

function challenge() {
  const verifier = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge: digest };
}

function originFor(label) {
  return `https://${label}.stores.example`;
}

async function startConnection(runtime, siteId, siteOrigin, pkce = challenge()) {
  const callback = `${siteOrigin}/_emdash/admin/plugins/dinkus-inventory/inventory`;
  const response = await request(runtime, new Map(), '/api/store-connections', {
    method: 'POST',
    body: JSON.stringify({
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: siteId,
      site_origin: siteOrigin,
      callback_uri: callback,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    }),
  });
  const body = await response.json();
  return { response, body, pkce, callback };
}

async function storeReceipt(runtime, start) {
  return request(runtime, new Map(), '/__proof/receipt', {
    method: 'POST',
    body: JSON.stringify({
      version: 1,
      connection_id: start.body.connection_id,
      challenge: start.body.challenge,
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: start.body.verification_uri && start.body.connection_id ? undefined : undefined,
      ...{
        site_id: start.siteId,
        site_origin: start.siteOrigin,
        callback_uri: start.callback,
        code_challenge: start.pkce.challenge,
        expires_at: start.body.expires_at,
      },
    }),
  });
}

test('store-connections protocol: consent, PKCE, uniqueness, revoke, already_redeemed', async () => {
  const runtime = await startMerchantTestRuntime();
  const alice = new Map();
  const bob = new Map();
  try {
    await signup(runtime, ALICE, alice);
    await signup(runtime, BOB, bob);

    const siteA = originFor('alpha');
    const siteB = originFor('beta');
    const pkceA = challenge();
    const startA = await startConnection(runtime, 'site-alpha', siteA, pkceA);
    startA.siteId = 'site-alpha';
    startA.siteOrigin = siteA;
    assert.equal(startA.response.status, 200);
    assert.equal(startA.body.verification_uri, `${runtime.origin}/account/connect?connection_id=${startA.body.connection_id}`);
    assert.ok(startA.body.expires_at - Date.now() <= 600_000);

    const loopback = await startConnection(runtime, 'loop', 'http://127.0.0.1');
    assert.equal(loopback.response.status, 400);

    await storeReceipt(runtime, startA);
    const connectPage = await request(runtime, alice, `/account/connect?connection_id=${startA.body.connection_id}`);
    assert.equal(connectPage.status, 200);
    assert.match(await connectPage.text(), /Connect this store/);

    const approve = await request(runtime, alice, `/account/connect?connection_id=${startA.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(approve.status, 303);
    assert.equal(approve.headers.get('location'), startA.callback);

    const pending = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({ client_id: 'dinkus-inventory-emdash', connection_id: startA.body.connection_id, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verif' }),
    });
    assert.equal(pending.status, 400);
    assert.equal((await pending.json()).error, 'invalid_grant');

    const token = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: startA.body.connection_id,
        code_verifier: pkceA.verifier,
      }),
    });
    assert.equal(token.status, 200);
    const issued = await token.json();
    assert.equal(issued.token_type, 'Bearer');
    assert.equal(issued.site_id, 'site-alpha');
    assert.equal(typeof issued.access_token, 'string');

    const replay = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: startA.body.connection_id,
        code_verifier: pkceA.verifier,
      }),
    });
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'already_redeemed');

    const pkceFresh = challenge();
    const startFresh = await startConnection(runtime, 'site-alpha', siteA, pkceFresh);
    startFresh.siteId = 'site-alpha';
    startFresh.siteOrigin = siteA;
    await storeReceipt(runtime, startFresh);
    const freshApprove = await request(runtime, alice, `/account/connect?connection_id=${startFresh.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(freshApprove.status, 303);
    assert.equal(freshApprove.headers.get('location'), startFresh.callback);
    const remintSilent = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: startA.body.connection_id,
        code_verifier: pkceA.verifier,
      }),
    });
    assert.equal((await remintSilent.json()).error, 'already_redeemed');
    const freshToken = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: startFresh.body.connection_id,
        code_verifier: pkceFresh.verifier,
      }),
    });
    assert.equal(freshToken.status, 200);

    const pkceB = challenge();
    const startB = await startConnection(runtime, 'site-beta', siteB, pkceB);
    startB.siteId = 'site-beta';
    startB.siteOrigin = siteB;
    await storeReceipt(runtime, startB);
    const bobApprove = await request(runtime, bob, `/account/connect?connection_id=${startB.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(bobApprove.status, 303);

    const conflictPkce = challenge();
    const conflict = await startConnection(runtime, 'site-alpha', siteA, conflictPkce);
    conflict.siteId = 'site-alpha';
    conflict.siteOrigin = siteA;
    await storeReceipt(runtime, conflict);
    const bobConflict = await request(runtime, bob, `/account/connect?connection_id=${conflict.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(bobConflict.status, 303);
    assert.match(bobConflict.headers.get('location') ?? '', /error=ownership_conflict|error=/);

    const tampered = await startConnection(runtime, 'site-gamma', originFor('gamma'));
    tampered.siteId = 'site-gamma';
    tampered.siteOrigin = originFor('gamma');
    await request(runtime, new Map(), '/__proof/receipt', {
      method: 'POST',
      body: JSON.stringify({
        version: 1,
        connection_id: tampered.body.connection_id,
        challenge: 'tampered-challenge',
        client_id: 'dinkus-inventory-emdash',
        service: 'inventory',
        site_id: 'site-gamma',
        site_origin: originFor('gamma'),
        callback_uri: tampered.callback,
        code_challenge: tampered.pkce.challenge,
        expires_at: tampered.body.expires_at,
      }),
    });
    const tamperedApprove = await request(runtime, alice, `/account/connect?connection_id=${tampered.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.match(tamperedApprove.headers.get('location') ?? '', /error=/);

    const sites = await request(runtime, alice, '/account/sites');
    const sitesHtml = await sites.text();
    assert.match(sitesHtml, /alpha\.stores\.example/);
    const revoke = await request(runtime, alice, '/account/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=revoke&site_id=site-alpha',
    });
    assert.equal(revoke.status, 303);

    const afterRevoke = await startConnection(runtime, 'site-alpha', siteA);
    afterRevoke.siteId = 'site-alpha';
    afterRevoke.siteOrigin = siteA;
    await storeReceipt(runtime, afterRevoke);
    const remint = await request(runtime, alice, `/account/connect?connection_id=${afterRevoke.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.match(remint.headers.get('location') ?? '', /error=reinstall_requires_manual_migration|error=/);
  } finally {
    await stopRuntime(runtime);
  }
});

test('production fetch policy rejects loopback sentinel', async () => {
  const runtime = await startMerchantTestRuntime();
  const sentinelHits = [];
  const server = createServer((req, res) => {
    sentinelHits.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version: 1, connection_id: 'probe', challenge: 'x' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const probe = await request(runtime, new Map(), '/__proof/fetch-probe', {
      method: 'POST',
      body: JSON.stringify({ siteOrigin: `http://127.0.0.1:${port}`, connectionId: 'probe' }),
    });
    const body = await probe.json();
    assert.equal(body.ok, false);
    assert.equal(body.reason, 'loopback_origin_rejected');
    assert.equal(body.transport, 'production-fetch');
    assert.equal(sentinelHits.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await stopRuntime(runtime);
  }
});

test('pending claim isolates a second merchant from preview and consent', async () => {
  const runtime = await startMerchantTestRuntime();
  const alice = new Map();
  const bob = new Map();
  try {
    await signup(runtime, ALICE, alice);
    await signup(runtime, BOB, bob);
    const start = await startConnection(runtime, 'pending-iso', originFor('pending-iso'));
    start.siteId = 'pending-iso';
    start.siteOrigin = originFor('pending-iso');
    const path = `/account/connect?connection_id=${start.body.connection_id}`;
    const first = await request(runtime, alice, path);
    assert.equal(first.status, 200);
    assert.match(await first.text(), /pending-iso\.stores\.example/);
    const second = await request(runtime, bob, path);
    assert.equal(second.status, 303);
    assert.equal(second.headers.get('location'), '/account/sites');
    const secondSites = await request(runtime, bob, '/account/sites');
    assert.doesNotMatch(await secondSites.text(), /pending-iso\.stores\.example/);
    await storeReceipt(runtime, start);
    const bobApprove = await request(runtime, bob, path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(bobApprove.status, 303);
    assert.equal(bobApprove.headers.get('location'), '/account/sites');
    const bobDeny = await request(runtime, bob, path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=deny',
    });
    assert.equal(bobDeny.headers.get('location'), '/account/sites');
    assert.equal(await grantPresent(runtime, 'pending-iso'), false);
  } finally {
    await stopRuntime(runtime);
  }
});

test('denied then approve leaves no grant; concurrent deny/approve is consistent', async () => {
  const runtime = await startMerchantTestRuntime();
  const alice = new Map();
  try {
    await signup(runtime, ALICE, alice);
    const denied = await startConnection(runtime, 'denied-race', originFor('denied-race'));
    denied.siteId = 'denied-race';
    denied.siteOrigin = originFor('denied-race');
    await storeReceipt(runtime, denied);
    const path = `/account/connect?connection_id=${denied.body.connection_id}`;
    await request(runtime, alice, path);
    const deny = await request(runtime, alice, path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=deny',
    });
    assert.equal(deny.status, 303);
    const lateApprove = await request(runtime, alice, path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.match(lateApprove.headers.get('location') ?? '', /error=|\/account\/sites/);
    assert.equal(await grantPresent(runtime, 'denied-race'), false);

    const concurrent = await startConnection(runtime, 'concurrent-race', originFor('concurrent-race'));
    concurrent.siteId = 'concurrent-race';
    concurrent.siteOrigin = originFor('concurrent-race');
    await storeReceipt(runtime, concurrent);
    const concurrentPath = `/account/connect?connection_id=${concurrent.body.connection_id}`;
    await request(runtime, alice, concurrentPath);
    const [denyRace, approveRace] = await Promise.all([
      request(runtime, alice, concurrentPath, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'action=deny',
      }),
      request(runtime, alice, concurrentPath, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'action=approve',
      }),
    ]);
    assert.equal(denyRace.status, 303);
    assert.equal(approveRace.status, 303);
    const granted = await grantPresent(runtime, 'concurrent-race');
    const denyLoc = denyRace.headers.get('location') ?? '';
    const approveLoc = approveRace.headers.get('location') ?? '';
    const denySuccess = denyLoc.includes('/_emdash/admin/plugins/dinkus-inventory/inventory');
    const approveSuccess = approveLoc.includes('/_emdash/admin/plugins/dinkus-inventory/inventory') && !approveLoc.includes('error=');
    assert.equal(denySuccess && approveSuccess, false);
    if (denySuccess) assert.equal(granted, false);
    if (approveSuccess) assert.equal(granted, true);
    if (!denySuccess && !approveSuccess) assert.equal(granted, false);
  } finally {
    await stopRuntime(runtime);
  }
});

test('delayed proof past expiry and missing signing key do not mint', async () => {
  const keyed = await startMerchantTestRuntime();
  const alice = new Map();
  try {
    await signup(keyed, ALICE, alice);
    const delayed = await startConnection(keyed, 'late-proof', originFor('late-proof'));
    delayed.siteId = 'late-proof';
    delayed.siteOrigin = originFor('late-proof');
    await request(keyed, new Map(), '/__proof/receipt', {
      method: 'POST',
      body: JSON.stringify({
        version: 1,
        connection_id: delayed.body.connection_id,
        challenge: delayed.body.challenge,
        client_id: 'dinkus-inventory-emdash',
        service: 'inventory',
        site_id: 'late-proof',
        site_origin: originFor('late-proof'),
        callback_uri: delayed.callback,
        code_challenge: delayed.pkce.challenge,
        expires_at: delayed.body.expires_at,
        delay_ms: 20,
        expire_after_delay: true,
      }),
    });
    const path = `/account/connect?connection_id=${delayed.body.connection_id}`;
    const late = await request(keyed, alice, path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.match(late.headers.get('location') ?? '', /error=/);
    assert.equal(await grantPresent(keyed, 'late-proof'), false);
  } finally {
    await stopRuntime(keyed);
  }

  const unsigned = await startMerchantTestRuntime({ jwt: false });
  const unsignedJar = new Map();
  try {
    await signup(unsigned, ALICE, unsignedJar);
    const start = await startConnection(unsigned, 'unsigned', originFor('unsigned'));
    start.siteId = 'unsigned';
    start.siteOrigin = originFor('unsigned');
    await storeReceipt(unsigned, start);
    const approve = await request(unsigned, unsignedJar, `/account/connect?connection_id=${start.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(approve.status, 303);
    assert.equal(approve.headers.get('location'), start.callback);
    const token = await request(unsigned, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: start.body.connection_id,
        code_verifier: start.pkce.verifier,
      }),
    });
    assert.equal(token.status, 503);
    assert.equal((await token.json()).error, 'signing_key_unavailable');
    const replay = await request(unsigned, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: start.body.connection_id,
        code_verifier: start.pkce.verifier,
      }),
    });
    assert.equal((await replay.json()).error, 'signing_key_unavailable');
  } finally {
    await stopRuntime(unsigned);
  }

  const invalid = await startMerchantTestRuntime({ jwt: '{"kty":"oct"}' });
  const invalidJar = new Map();
  try {
    await signup(invalid, ALICE, invalidJar);
    const start = await startConnection(invalid, 'bad-key', originFor('bad-key'));
    start.siteId = 'bad-key';
    start.siteOrigin = originFor('bad-key');
    await storeReceipt(invalid, start);
    const approve = await request(invalid, invalidJar, `/account/connect?connection_id=${start.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(approve.headers.get('location'), start.callback);
    const token = await request(invalid, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: start.body.connection_id,
        code_verifier: start.pkce.verifier,
      }),
    });
    assert.equal(token.status, 503);
    assert.equal((await token.json()).error, 'invalid_signing_key');
    const replay = await request(invalid, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: start.body.connection_id,
        code_verifier: start.pkce.verifier,
      }),
    });
    assert.equal((await replay.json()).error, 'invalid_signing_key');
  } finally {
    await stopRuntime(invalid);
  }
});

test('unusable signing keys do not consume or leak library errors', async () => {
  const coord = Buffer.alloc(32, 1).toString('base64url');
  const scalar = Buffer.alloc(32, 2).toString('base64url');
  const cases = [
    { label: 'malformed-shape', jwt: JSON.stringify({ kty: 'EC', crv: 'P-256', d: 'invalid', kid: 'test-invalid' }) },
    { label: 'invalid-coordinates', jwt: JSON.stringify({ kty: 'EC', crv: 'P-256', d: scalar, x: coord, y: coord, kid: 'test-coords' }) },
    { label: 'curve-mismatch', jwt: JSON.stringify({ kty: 'EC', crv: 'P-384', d: scalar, x: coord, y: coord, kid: 'test-p384' }) },
  ];
  for (const fixture of cases) {
    const runtime = await startMerchantTestRuntime({ jwt: fixture.jwt });
    const jar = new Map();
    try {
      await signup(runtime, ALICE, jar);
      const start = await startConnection(runtime, fixture.label, originFor(fixture.label));
      start.siteId = fixture.label;
      start.siteOrigin = originFor(fixture.label);
      await storeReceipt(runtime, start);
      const approve = await request(runtime, jar, `/account/connect?connection_id=${start.body.connection_id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'action=approve',
      });
      assert.equal(approve.headers.get('location'), start.callback, fixture.label);
      const first = await request(runtime, new Map(), '/api/store-connections/token', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'dinkus-inventory-emdash',
          connection_id: start.body.connection_id,
          code_verifier: start.pkce.verifier,
        }),
      });
      const firstBody = await first.json();
      assert.equal(first.status, 503, fixture.label);
      assert.equal(firstBody.error, 'invalid_signing_key', fixture.label);
      assert.equal('access_token' in firstBody, false, fixture.label);
      const replay = await request(runtime, new Map(), '/api/store-connections/token', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'dinkus-inventory-emdash',
          connection_id: start.body.connection_id,
          code_verifier: start.pkce.verifier,
        }),
      });
      const replayBody = await replay.json();
      assert.equal(replay.status, 503, fixture.label);
      assert.equal(replayBody.error, 'invalid_signing_key', fixture.label);
      assert.equal('access_token' in replayBody, false, fixture.label);
    } finally {
      await stopRuntime(runtime);
    }
  }
});

test('production entry cannot mint persisted approved rows even with rogue bindings', async () => {
  const persistTo = await mkdtemp(join(tmpdir(), 'dk-prod-issue-'));
  const seeded = await startMerchantTestRuntime({ persistTo });
  const alice = new Map();
  let connectionId = '';
  let verifier = '';
  try {
    await signup(seeded, ALICE, alice);
    const start = await startConnection(seeded, 'prod-blocked', originFor('prod-blocked'));
    start.siteId = 'prod-blocked';
    start.siteOrigin = originFor('prod-blocked');
    await storeReceipt(seeded, start);
    const approve = await request(seeded, alice, `/account/connect?connection_id=${start.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(approve.status, 303);
    assert.equal(approve.headers.get('location'), start.callback);
    connectionId = start.body.connection_id;
    verifier = start.pkce.verifier;
  } finally {
    await stopRuntime(seeded);
  }

  const production = await startProductionWorker({
    persistTo,
    secret: seeded.secret,
    jwt: seeded.jwt,
    origin: 'https://dinkuskit.com',
    rogueTestBindings: true,
  });
  try {
    const first = await request(production, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: connectionId,
        code_verifier: verifier,
      }),
    });
    const firstBody = await first.json();
    assert.equal(first.status, 503);
    assert.equal(firstBody.error, 'integration_unavailable');
    assert.equal('access_token' in firstBody, false);
    const replay = await request(production, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: connectionId,
        code_verifier: verifier,
      }),
    });
    const replayBody = await replay.json();
    assert.equal(replay.status, 503);
    assert.equal(replayBody.error, 'integration_unavailable');
    assert.equal('access_token' in replayBody, false);
  } finally {
    await stopRuntime(production);
  }

  const simulation = await startMerchantTestRuntime({
    persistTo,
    secret: seeded.secret,
    jwt: seeded.jwt,
  });
  try {
    const minted = await request(simulation, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: connectionId,
        code_verifier: verifier,
      }),
    });
    const body = await minted.json();
    assert.equal(minted.status, 200);
    assert.equal(body.token_type, 'Bearer');
    assert.equal(body.site_id, 'prod-blocked');
    assert.equal(typeof body.access_token, 'string');
  } finally {
    await stopRuntime({ ...simulation, ownedPersist: true });
  }
});
