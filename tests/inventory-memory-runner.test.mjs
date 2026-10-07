import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { startInventoryMemoryController, connectionReceipt } from './helpers/inventory-memory-runner.mjs';
import { createInventoryReceiptFixture } from './helpers/inventory-unit-test-dispatcher.mjs';
import { exchangeStoreConnectionToken } from '../src/account/connect.ts';
import { parseCanonicalSiteOrigin } from '../src/account/proof-fetch.ts';

const SITE_ID = 'synthetic-inventory-runner-site';

function bounded(promise, milliseconds, reason) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(reason)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function cookies() {
  return new Map();
}

function cookieHeader(jar) {
  return [...jar.values()].join('; ');
}

function saveCookies(jar, response) {
  for (const value of response.headers.getSetCookie?.() ?? []) {
    const pair = value.split(';', 1)[0];
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const name = pair.slice(0, index);
    const body = pair.slice(index + 1);
    if (!body || value.includes('Max-Age=0')) jar.delete(name);
    else jar.set(name, pair);
  }
}

async function request(controller, jar, path, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', controller.safeURLs.website);
  const cookie = cookieHeader(jar);
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(new URL(path, controller.safeURLs.website), {
    redirect: 'manual',
    ...init,
    headers,
  });
  saveCookies(jar, response);
  return response;
}

async function completeCapturedMail(controller, jar, email) {
  const response = await request(controller, jar, '/__proof/browser/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(email)}`,
  });
  assert.equal(response.status, 303);
  return response;
}

async function signUp(controller, jar, email, callbackURL) {
  const response = await request(controller, jar, '/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(email)}&phone=%2B15555550123&service_channel=email&agreement=on&callbackURL=${encodeURIComponent(callbackURL)}`,
  });
  assert.equal(response.status, 303);
  await completeCapturedMail(controller, jar, email);
}

async function initiate(controller, siteId = SITE_ID, siteOrigin = controller.expectedStoreOrigin) {
  const verifier = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(verifier).digest('base64url');
  const codeChallenge = digest.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const response = await fetch(new URL('/api/store-connections', controller.safeURLs.website), {
    method: 'POST',
    headers: { origin: controller.safeURLs.website, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: siteId,
      site_origin: siteOrigin,
      callback_uri: `${siteOrigin}/_emdash/admin/plugins/dinkus-inventory/inventory`,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  if (siteOrigin === controller.expectedStoreOrigin) {
    await controller.registerFixtureReceipt(connectionReceipt({
      response: body,
      siteId,
      codeChallenge,
      expiresAt: body.expires_at,
      controller,
    }));
  }
  return { ...body, verifier, codeChallenge, siteId, siteOrigin };
}

async function approve(controller, jar, connection) {
  const page = await request(controller, jar, `/account/connect?connection_id=${encodeURIComponent(connection.connection_id)}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Approve this site/);
  const organizationId = html.match(/name="organization_id" value="([^"]+)"/)?.[1];
  assert.ok(organizationId);
  return request(controller, jar, `/account/connect?connection_id=${encodeURIComponent(connection.connection_id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'approve', organization_id: organizationId }).toString(),
  });
}

test('actual built website runner proves Better Auth consent, receipt, JWT/JWKS and child restart', async (t) => {
  const controller = await startInventoryMemoryController({
    websitePort: 47636,
    storePort: 47635,
    fixture: createInventoryReceiptFixture({ port: 47635 }),
  });
  t.after(async () => {
    await controller.stop();
    await controller.cleanup();
  });

  const jar = cookies();
  const connection = await initiate(controller);
  const unauthenticated = await request(controller, jar, `/account/connect?connection_id=${connection.connection_id}`);
  assert.equal(unauthenticated.status, 303);
  const callbackURL = new URL(unauthenticated.headers.get('location'), controller.safeURLs.website).searchParams.get('callbackURL');
  assert.equal(callbackURL, `/account/connect?connection_id=${connection.connection_id}`);
  await signUp(controller, jar, 'runner@merchant.example', callbackURL);

  const approved = await approve(controller, jar, connection);
  assert.equal(approved.status, 303);
  assert.equal(approved.headers.get('location'), `${controller.expectedStoreOrigin}/_emdash/admin/plugins/dinkus-inventory/inventory`);
  assert.equal(controller.fixtureRequests.length, 1);
  assert.equal(controller.fixtureRequests[0].method, 'GET');
  assert.equal(new URL(controller.fixtureRequests[0].url, controller.expectedStoreOrigin).pathname, '/_emdash/api/plugins/dinkus-inventory/store-proof');
  assert.equal(new URL(controller.fixtureRequests[0].url, controller.expectedStoreOrigin).searchParams.get('connection_id'), connection.connection_id);
  assert.equal(controller.fixtureRequests[0].accept, 'application/json');
  assert.equal(controller.fixtureRequests[0].body, '');

  const tokenResponse = await request(controller, jar, '/api/store-connections/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: 'dinkus-inventory-emdash',
      connection_id: connection.connection_id,
      code_verifier: connection.verifier,
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const tokenBody = await tokenResponse.json();
  assert.equal(tokenBody.token_type, 'Bearer');
  assert.equal(tokenBody.site_id, SITE_ID);
  const token = tokenBody.access_token;
  const tokenHeader = decodeJwt(token);
  const protectedHeader = decodeProtectedHeader(token);
  assert.equal(tokenHeader.iss, 'https://dinkuskit.com/account');
  assert.equal(tokenHeader.aud, 'inventory');
  assert.equal(tokenHeader.site_id, SITE_ID);

  const jwksBefore = await (await request(controller, jar, '/account/.well-known/jwks.json')).json();
  assert.equal(jwksBefore.keys.length, 1);
  assert.equal(jwksBefore.keys[0].kid, protectedHeader.kid);
  const verifiedBefore = await jwtVerify(token, await importJWK(jwksBefore.keys[0], 'ES256'), {
    issuer: 'https://dinkuskit.com/account',
    audience: 'inventory',
  });
  assert.equal(verifiedBefore.payload.site_id, SITE_ID);

  await controller.restart();
  assert.equal((await request(controller, jar, '/account')).status, 200);
  const jwksAfter = await (await request(controller, jar, '/account/.well-known/jwks.json')).json();
  assert.deepEqual(jwksAfter.keys, jwksBefore.keys);
  await jwtVerify(token, await importJWK(jwksAfter.keys[0], 'ES256'), {
    issuer: 'https://dinkuskit.com/account',
    audience: 'inventory',
  });
  assert.equal(controller.publicKey.kid.startsWith('inventory-test-'), true);
});

test('finite bridge rejects foreign authority, redirect, malformed, size and deadline responses', async (t) => {
  const controller = await startInventoryMemoryController({
    websitePort: 47634,
    storePort: 47633,
    fixture: createInventoryReceiptFixture({ port: 47633 }),
  });
  t.after(async () => {
    await controller.stop();
    await controller.cleanup();
  });
  const jar = cookies();
  await signUp(controller, jar, 'bridge@merchant.example', '/account');

  const foreignResponse = await fetch(new URL('/api/store-connections', controller.safeURLs.website), {
    method: 'POST',
    headers: { origin: controller.safeURLs.website, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: 'foreign-authority-site',
      site_origin: 'https://foreign.invalid',
      callback_uri: 'https://foreign.invalid/_emdash/admin/plugins/dinkus-inventory/inventory',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    }),
  });
  assert.equal(foreignResponse.status, 400);

  const wrongPort = await fetch(new URL('/api/store-connections', controller.safeURLs.website), {
    method: 'POST',
    headers: { origin: controller.safeURLs.website, 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: 'wrong-port',
      site_origin: 'http://127.0.0.1:47632',
      callback_uri: 'http://127.0.0.1:47632/_emdash/admin/plugins/dinkus-inventory/inventory',
      code_challenge: 'b'.repeat(43),
      code_challenge_method: 'S256',
    }),
  });
  assert.equal(wrongPort.status, 400);

  for (const [mode, expected] of [
    ['redirect', 'proof_redirect_rejected'],
    ['malformed', 'proof_malformed'],
    ['oversize', 'proof_too_large'],
    ['delay', 'proof_timeout'],
  ]) {
    await controller.setFixtureMode(mode);
    const connection = await initiate(controller, `bridge-${mode}`);
    const result = await approve(controller, jar, connection);
    assert.equal(result.status, 303);
    assert.match(result.headers.get('location') ?? '', new RegExp(expected));
    await controller.setFixtureMode('normal');
  }
});

test('controller dispatch preserves canonical request bytes and rejects foreign requests', async (t) => {
  const controller = await startInventoryMemoryController({
    websitePort: 47637,
  });
  t.after(async () => {
    await controller.stop();
    await controller.cleanup();
  });

  const response = await controller.dispatch(new Request('https://dinkuskit.com/api/store-connections', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-synthetic-observer': 'present' },
    body: JSON.stringify({
      client_id: 'dinkus-inventory-emdash',
      service: 'inventory',
      site_id: 'dispatch-body-site',
      site_origin: controller.expectedStoreOrigin,
      callback_uri: `${controller.expectedStoreOrigin}/_emdash/admin/plugins/dinkus-inventory/inventory`,
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
    }),
  }));
  assert.equal(response.status, 200);

  for (const request of [
    new Request('http://dinkuskit.com/api/store-connections', { method: 'POST' }),
    new Request('https://foreign.invalid/api/store-connections', { method: 'POST' }),
    new Request('https://dinkuskit.com/api/store-connections?foreign=1', { method: 'POST' }),
    new Request('https://dinkuskit.com/account', { method: 'POST' }),
    new Request('https://dinkuskit.com/api/store-connections', { method: 'GET' }),
  ]) {
    await assert.rejects(() => controller.dispatch(request), /dispatch_request_rejected/);
  }

  await controller.stop();
  await assert.rejects(() => controller.dispatch(new Request('https://dinkuskit.com/api/store-connections', {
    method: 'POST',
    body: '{}',
  })), /controller_stopped/);
  await assert.rejects(() => controller.restart(), /controller_stopped/);
});

test('controller stop aborts an in-flight website dispatch', async (t) => {
  const controller = await startInventoryMemoryController({
    websitePort: 47641,
  });
  t.after(async () => {
    await controller.stop().catch(() => {});
    await controller.cleanup().catch(() => {});
  });

  const originalFetch = globalThis.fetch;
  let started;
  const startedPromise = new Promise(resolve => {
    started = resolve;
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === controller.safeURLs.website &&
        url.pathname === '/api/store-connections') {
      started();
      return new Promise((resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        setTimeout(() => reject(new Error('dispatch_abort_timeout')), 1000);
      });
    }
    return originalFetch(input, init);
  };

  try {
    const dispatch = controller.dispatch(new Request(
      'https://dinkuskit.com/api/store-connections',
      { method: 'POST', body: '{}' },
    ));
    await startedPromise;
    const stop = controller.stop();
    await assert.rejects(() => dispatch, /AbortError|aborted/i);
    await stop;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('origin parsing stays production fail-closed while admitting only exact test origin', () => {
  assert.deepEqual(parseCanonicalSiteOrigin('http://127.0.0.1:47631'), {
    ok: false,
    reason: 'loopback_origin_rejected',
  });
  assert.deepEqual(parseCanonicalSiteOrigin('http://127.0.0.1:47631', {
    allowExactOrigin: 'http://127.0.0.1:47631',
  }), {
    ok: true,
    origin: 'http://127.0.0.1:47631',
  });
  assert.deepEqual(parseCanonicalSiteOrigin('http://127.0.0.1:47631', {
    allowExactOrigin: 'http://foreign.invalid:47631',
  }), {
    ok: false,
    reason: 'loopback_origin_rejected',
  });
  assert.deepEqual(parseCanonicalSiteOrigin('http://private.invalid:47631', {
    allowExactOrigin: 'http://private.invalid:47631',
  }), {
    ok: false,
    reason: 'site_origin_must_be_https',
  });
});

test('occupied website port refusal leaves the foreign server running', async () => {
  const foreign = createServer((_request, response) => {
    response.writeHead(200);
    response.end('foreign');
  });
  await new Promise((resolve) => foreign.listen(47638, '127.0.0.1', resolve));
  try {
    await assert.rejects(() => startInventoryMemoryController({ websitePort: 47638 }), /website_port_occupied/);
    assert.equal(foreign.listening, true);
    const response = await fetch('http://127.0.0.1:47638/');
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'foreign');
  } finally {
    await new Promise((resolve) => foreign.close(resolve));
  }
});

test('stop during a real child restart waits and stops the newly owned child', async (t) => {
  let releaseLaunch;
  let launchPaused;
  const launchReady = new Promise(resolve => {
    launchPaused = resolve;
  });
  const launchRelease = new Promise(resolve => {
    releaseLaunch = resolve;
  });
  const controller = await startInventoryMemoryController({
    websitePort: 47639,
    restartHooks: {
      beforeLaunch: async () => {
        launchPaused();
        await launchRelease;
      },
    },
  });
  t.after(async () => {
    await controller.stop().catch(() => {});
    await controller.cleanup().catch(() => {});
  });

  const restart = controller.restart();
  await launchReady;
  await assert.rejects(() => controller.restart(), /controller_busy/);
  const stop = controller.stop();
  await assert.rejects(
    () => controller.dispatch(new Request('https://dinkuskit.com/api/store-connections', { method: 'POST' })),
    /controller_unavailable/,
  );
  releaseLaunch();
  await restart;
  await stop;
  assert.equal(controller.owned.website, true);
  await assert.rejects(
    () => controller.dispatch(new Request('https://dinkuskit.com/api/store-connections', { method: 'POST' })),
    /controller_stopped/,
  );
  await assert.doesNotReject(() => controller.stop());
});

test('failed restart leaves a foreign server alive and dispatch unavailable', async (t) => {
  let foreign;
  let foreignRequests = 0;
  let releaseBody;
  let bodyCancelled = false;
  let bodyStarted;
  const bodyReady = new Promise(resolve => {
    bodyStarted = resolve;
  });
  const bodyRelease = new Promise(resolve => {
    releaseBody = resolve;
  });
  const body = new ReadableStream({
    async start(stream) {
      bodyStarted();
      await bodyRelease;
      if (bodyCancelled) return;
      stream.enqueue(new TextEncoder().encode('{"sensitive":"synthetic"}'));
      stream.close();
    },
    cancel() {
      bodyCancelled = true;
    },
  });
  const controller = await startInventoryMemoryController({
    websitePort: 47640,
    restartHooks: {
      beforePortCheck: async () => {
        foreign = createServer((_request, response) => {
          foreignRequests += 1;
          response.writeHead(200);
          response.end('foreign');
        });
        await new Promise((resolve, reject) => {
          foreign.once('error', reject);
          foreign.listen(47640, '127.0.0.1', resolve);
        });
      },
    },
  });
  t.after(async () => {
    await controller.stop().catch(() => {});
    await controller.cleanup().catch(() => {});
    if (foreign) await new Promise(resolve => foreign.close(resolve));
  });

  const dispatch = controller.dispatch(new Request('https://dinkuskit.com/api/store-connections', {
    method: 'POST',
    body,
    duplex: 'half',
  }));
  const dispatchOutcome = dispatch.then(
    () => null,
    error => error,
  );
  await bodyReady;
  const restart = controller.restart();
  await assert.rejects(() => restart, /website_port_occupied/);
  assert.equal(foreign.listening, true);
  const dispatchError = await bounded(
    dispatchOutcome,
    1000,
    'stalled_dispatch_did_not_abort',
  );
  assert(dispatchError instanceof Error);
  assert.match(dispatchError.message, /controller_unavailable/);
  assert.equal(foreignRequests, 0);
  releaseBody();
  const response = await fetch('http://127.0.0.1:47640/');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'foreign');
  assert.equal(foreignRequests, 1);
});

test('production token exchange remains fail-closed without an injected transport', async () => {
  const response = await exchangeStoreConnectionToken({
    db: {},
    body: {},
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'integration_unavailable' });
});
