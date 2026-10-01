#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { createLocalJWKSet, jwtVerify } from 'jose';
import {
  completeProofMail,
  grantPresent,
  request,
  signup,
  startMerchantTestRuntime,
  stopRuntime,
} from '../tests/helpers/merchant-harness.mjs';

// In-memory store for PKCE verifiers during interactive sessions
const inMemoryVerifiers = new Map();

function challenge() {
  const verifier = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge: digest };
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
      site_id: start.siteId,
      site_origin: start.siteOrigin,
      callback_uri: start.callback,
      code_challenge: start.pkce.challenge,
      expires_at: start.body.expires_at,
    }),
  });
}

async function runProof({ serve = false } = {}) {
  const workDir = '.grilltrack/work/merchant-connect-proof-20260930';
  const pidPath = `${workDir}/launcher.pid`;
  const interfacePath = `${workDir}/interface.json`;

  console.log('[merchant-connect-proof-launcher] Starting local test workerd runtime...');
  const sigintBefore = new Set(process.rawListeners('SIGINT'));
  const sigtermBefore = new Set(process.rawListeners('SIGTERM'));

  const runtime = await startMerchantTestRuntime();
  const origin = runtime.origin;
  const jwksUrl = `${origin}/account/.well-known/jwks.json`;

  console.log(`[merchant-connect-proof-launcher] Loopback website origin: ${origin}`);
  console.log(`[merchant-connect-proof-launcher] Public JWKS URL:        ${jwksUrl}`);
  console.log(`[merchant-connect-proof-launcher] Synthetic Mailbox:      ${origin}/__proof/browser [Test only / no external email]`);

  // Snapshot/remove only runtime-attached signal listeners so this CLI owns signal handling and graceful cleanup
  for (const listener of process.rawListeners('SIGINT')) {
    if (!sigintBefore.has(listener)) {
      process.removeListener('SIGINT', listener);
    }
  }
  for (const listener of process.rawListeners('SIGTERM')) {
    if (!sigtermBefore.has(listener)) {
      process.removeListener('SIGTERM', listener);
    }
  }

  let terminationSignal = null;
  let signalResolver = null;
  let isCleaningUp = false;

  const onSignal = async (sig) => {
    terminationSignal = sig;
    if (signalResolver) {
      signalResolver();
    } else if (!isCleaningUp) {
      isCleaningUp = true;
      try {
        if (serve) {
          await unlink(pidPath).catch(() => {});
          await unlink(interfacePath).catch(() => {});
        }
        console.log('[merchant-connect-proof-launcher] Stopping runtime...');
        await stopRuntime(runtime);
        console.log('[merchant-connect-proof-launcher] Runtime stopped cleanly.');
      } catch (err) {
        console.error('[merchant-connect-proof-launcher] Error during signal cleanup:', err);
      } finally {
        const exitCode = sig === 'SIGINT' ? 130 : 143;
        console.log(`[merchant-connect-proof-launcher] Exiting on signal ${sig} (code ${exitCode}).`);
        process.exit(exitCode);
      }
    }
  };

  const sigintHandler = () => onSignal('SIGINT');
  const sigtermHandler = () => onSignal('SIGTERM');
  process.once('SIGINT', sigintHandler);
  process.once('SIGTERM', sigtermHandler);

  try {
    const siteId = 'demo-store-01';
    const siteOrigin = 'https://demo-store-01.stores.example';
    const pkce = challenge();

    console.log('\n--- Step 1: Plugin initiates store connection ---');
    const start = await startConnection(runtime, siteId, siteOrigin, pkce);
    start.siteId = siteId;
    start.siteOrigin = siteOrigin;
    assert.equal(start.response.status, 200, 'Connection initiation must return 200');
    const connId = start.body.connection_id;
    console.log(`Connection ID: ${connId}`);
    console.log(`Verification URI: ${start.body.verification_uri}`);

    await storeReceipt(runtime, start);
    console.log('Simulated receipt stored in local test KV sink [Simulated receipt / test only - local KV sink].');

    console.log('\n--- Step 2: Unauthenticated merchant accesses verification URI ---');
    const expectedContinuation = `/account/connect?connection_id=${encodeURIComponent(connId)}`;
    const unauth = await request(runtime, new Map(), `/account/connect?connection_id=${connId}`, { redirect: 'manual' });
    assert.equal(unauth.status, 303, 'Unauthenticated access must redirect');
    const redirectLoc = unauth.headers.get('location');
    assert.equal(
      redirectLoc,
      `/account/sign-in?callbackURL=${encodeURIComponent(expectedContinuation)}`,
      'Must redirect to /account/sign-in with safe continuation preserving connection_id',
    );
    console.log(`Redirected safely to: ${redirectLoc}`);

    console.log('\n--- Step 3: Merchant signs in via Better Auth magic link ---');
    const merchantEmail = 'merchant-demo@example.com';
    const jar = new Map();
    // Pre-create merchant account
    await signup(runtime, merchantEmail, jar);

    const signinPost = await request(runtime, jar, '/account/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `email=${encodeURIComponent(merchantEmail)}&callbackURL=${encodeURIComponent(expectedContinuation)}`,
    });
    assert.equal(signinPost.status, 303);
    assert.equal(signinPost.headers.get('location'), '/account/check-email');
    console.log('Magic link dispatched to synthetic test mail sink [Test only / no external email].');

    console.log('\n--- Step 4: Follow captured magic link to safe callback without exposing token ---');
    const completed = await completeProofMail(runtime, jar, merchantEmail);
    assert.equal(completed.status, 303);
    const completedLoc = new URL(completed.headers.get('location'), origin);
    assert.equal(completedLoc.origin, origin);
    assert.equal(completedLoc.pathname + completedLoc.search, expectedContinuation);
    console.log(`Returned to safe continuation: ${completedLoc.pathname + completedLoc.search}`);

    console.log('\n--- Step 5: Merchant views consent page and approves connection ---');
    const connectPage = await request(runtime, jar, expectedContinuation);
    assert.equal(connectPage.status, 200);
    const html = await connectPage.text();
    assert.match(html, /Connect this store/);
    console.log('Consent page rendered successfully for merchant.');

    const approve = await request(runtime, jar, expectedContinuation, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    assert.equal(approve.status, 303);
    assert.equal(approve.headers.get('location'), start.callback);
    console.log(`Approved. Merchant redirected back to plugin callback: ${start.callback}`);

    console.log('\n--- Step 6: Plugin exchanges PKCE verifier for ES256 JWT ---');
    const tokenRes = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: connId,
        code_verifier: pkce.verifier,
      }),
    });
    assert.equal(tokenRes.status, 200, 'Token exchange must succeed');
    const tokenBody = await tokenRes.json();
    assert.equal(tokenBody.token_type, 'Bearer');
    assert.equal(tokenBody.site_id, siteId);
    console.log(`Access Token issued: [Bearer token issued, opaque in memory] (TTL: ${tokenBody.expires_in}s)`);

    console.log('\n--- Step 7: Verify JWT with public JWKS ---');
    const jwksRes = await request(runtime, new Map(), '/account/.well-known/jwks.json');
    assert.equal(jwksRes.status, 200);
    const jwks = await jwksRes.json();
    const keySet = createLocalJWKSet(jwks);
    const verified = await jwtVerify(tokenBody.access_token, keySet, {
      issuer: 'https://dinkuskit.com/account',
      audience: 'inventory',
    });
    assert.equal(verified.payload.site_id, siteId);
    assert.equal(verified.payload.scope, 'inventory:admin');
    console.log('JWT verified successfully:');
    console.log(`  Issuer:   ${verified.payload.iss}`);
    console.log(`  Audience: ${verified.payload.aud}`);
    console.log(`  Scope:    ${verified.payload.scope}`);
    console.log(`  Subject:  ${verified.payload.sub}`);
    console.log(`  Site ID:  ${verified.payload.site_id}`);

    console.log('\n--- Step 8: Test revocation semantics ---');
    const revoke = await request(runtime, jar, '/account/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `action=revoke&site_id=${encodeURIComponent(siteId)}`,
    });
    assert.equal(revoke.status, 303);
    console.log('Site binding revoked. Attempting new connection for revoked site...');

    const nextStart = await startConnection(runtime, siteId, siteOrigin);
    nextStart.siteId = siteId;
    nextStart.siteOrigin = siteOrigin;
    await storeReceipt(runtime, nextStart);
    const reApprove = await request(runtime, jar, `/account/connect?connection_id=${nextStart.body.connection_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=approve',
    });
    const reApproveLoc = new URL(reApprove.headers.get('location'), origin);
    assert.equal(
      reApproveLoc.searchParams.get('error'),
      'reinstall_requires_manual_migration',
      'Must fail with exact reinstall_requires_manual_migration error',
    );

    const blockedToken = await request(runtime, new Map(), '/api/store-connections/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: 'dinkus-inventory-emdash',
        connection_id: nextStart.body.connection_id,
        code_verifier: nextStart.pkce.verifier,
      }),
    });
    assert.notEqual(blockedToken.status, 200, 'Must not issue token for revoked connection');
    assert.equal((await blockedToken.json()).error, 'authorization_pending');
    console.log('New connection and token issuance blocked post-revocation (fail-closed).');

    // Existing token remains valid until exp
    const reverified = await jwtVerify(tokenBody.access_token, keySet, {
      issuer: 'https://dinkuskit.com/account',
      audience: 'inventory',
    });
    assert.equal(reverified.payload.site_id, siteId);
    console.log('Pre-issued JWT remains cryptographically valid until exp per CHARTER (no immediate token revocation/introspection).');

    // Cryptographic exp rejection at a test future clock without sleeping
    await assert.rejects(
      jwtVerify(tokenBody.access_token, keySet, {
        issuer: 'https://dinkuskit.com/account',
        audience: 'inventory',
        currentDate: new Date((verified.payload.exp + 30) * 1000),
      }),
      { code: 'ERR_JWT_EXPIRED' },
    );
    console.log('Cryptographic exp rejection verified at future clock (no sleep required).');

    console.log('\n--- Step 9: Create fresh unclaimed connection for interactive browser ---');
    const freshSiteId = 'interactive-store-01';
    const freshSiteOrigin = 'https://interactive-store-01.stores.example';
    const freshPkce = challenge();
    const freshStart = await startConnection(runtime, freshSiteId, freshSiteOrigin, freshPkce);
    freshStart.siteId = freshSiteId;
    freshStart.siteOrigin = freshSiteOrigin;
    await storeReceipt(runtime, freshStart);
    console.log('Fresh unclaimed connection created with simulated receipt [Simulated receipt / test only - local KV sink].');

    const freshConnId = freshStart.body.connection_id;
    const freshConsentUrl = `${origin}/account/connect?connection_id=${encodeURIComponent(freshConnId)}`;

    // Retain verifier in process memory only (never written to file or printed)
    inMemoryVerifiers.set(freshConnId, freshPkce.verifier);

    console.log('\nInteractive Safe URLs:');
    console.log(`  Consent URL:   ${freshConsentUrl}`);
    console.log(`  Origin:        ${origin}`);
    console.log(`  Public JWKS:   ${jwksUrl}`);
    console.log(`  Test Mailbox:  ${origin}/__proof/browser [Test only / no external email]`);

    console.log('\n=== All Merchant Connect Proof Invariants Verified Successfully! ===');

    if (serve) {
      const safeInterface = {
        schema: 'dinkuskit.website.merchant-connect-interactive.v1',
        simulation_label: 'Simulated receipt / test only - local KV sink',
        canonical_issuer: 'https://dinkuskit.com/account',
        contract_jwks_url: 'https://dinkuskit.com/account/.well-known/jwks.json',
        loopback_website_origin: origin,
        local_jwks_url: jwksUrl,
        local_mailbox_url: `${origin}/__proof/browser`,
        consent_url: freshConsentUrl,
        connection_id: freshConnId,
        site_id: freshSiteId,
        site_origin: freshSiteOrigin,
        callback_uri: freshStart.callback,
        running_pid: process.pid,
        owned_stop_handle: `kill ${process.pid}`,
      };

      await writeFile(pidPath, String(process.pid), 'utf8');
      await writeFile(interfacePath, JSON.stringify(safeInterface, null, 2), 'utf8');

      console.log(`\n[Server Running] PID: ${process.pid}`);
      console.log(`Website Origin: ${origin}`);
      console.log(`Public JWKS:    ${jwksUrl}`);
      console.log(`Test Mailbox:   ${origin}/__proof/browser [Test only / no external email]`);
      console.log(`Consent URL:    ${freshConsentUrl}`);
      console.log(`Stop Handle:    kill $(cat ${pidPath})`);
      console.log('Press Ctrl+C or send SIGINT/SIGTERM to terminate server.');

      await new Promise(resolve => {
        signalResolver = resolve;
      });
    }
  } finally {
    isCleaningUp = true;
    process.removeListener('SIGINT', sigintHandler);
    process.removeListener('SIGTERM', sigtermHandler);
    if (serve) {
      await unlink(pidPath).catch(() => {});
      await unlink(interfacePath).catch(() => {});
    }
    console.log('[merchant-connect-proof-launcher] Stopping runtime...');
    await stopRuntime(runtime);
    console.log('[merchant-connect-proof-launcher] Runtime stopped cleanly.');
  }

  if (terminationSignal) {
    const exitCode = terminationSignal === 'SIGINT' ? 130 : 143;
    console.log(`[merchant-connect-proof-launcher] Exiting on signal ${terminationSignal} (code ${exitCode}).`);
    process.exit(exitCode);
  }
}

const isServe = process.argv.includes('--serve');
runProof({ serve: isServe }).catch(err => {
  console.error('[merchant-connect-proof-launcher] Error:', err);
  process.exit(1);
});
