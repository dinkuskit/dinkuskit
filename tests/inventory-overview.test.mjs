import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { createSignedInventoryReader, validateOverview, INVENTORY_OVERVIEW_AUDIENCE, INVENTORY_OVERVIEW_SCOPE } from '../src/account/inventory-overview.ts';
import { ACCOUNT_ISSUER } from '../src/account/config.ts';
import { overviewPayload } from './fixtures/inventory-overview-payload.mjs';

const synthetic = overviewPayload('org_test');
test('merged nested metadata DTO handles available, observed empty and explicit unavailable without private fields', () => {
  const raw = structuredClone(synthetic);
  raw.customer = { email: 'private-sentinel@example.com' };
  raw.overview.sites[0].products = ['SECRET_PRODUCT']; raw.overview.sites[0].stock = 123; raw.overview.sites[0].origin = 'https://untrusted.example.test';
  const result = validateOverview(raw, 'org_test');
  assert.equal(result.state, 'available'); assert.equal(result.overview.allocatedPoolCount, 3); assert.equal(result.overview.rows[0].origin, null);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_PRODUCT|private-sentinel|untrusted|products|stock/);
  assert.equal(validateOverview(overviewPayload('org_test', { empty: true }), 'org_test').state, 'empty');
  const unavailable = validateOverview(overviewPayload('org_test', { unavailable: 'read_unavailable' }), 'org_test', 503);
  assert.equal(unavailable.state, 'unavailable'); assert.equal('overview' in unavailable, false); assert.ok(unavailable.observation.asOf);
});
test('rejects wrong organization, duplicate/dangling relationships, count mismatches, health claims and malformed dates', () => {
  const corrupt = [r => r.organizationId = 'other', r => r.overview.counts.pools++, r => r.overview.counts.sites++,
    r => r.overview.sites[1].siteId = r.overview.sites[0].siteId, r => r.overview.pools[1].poolId = r.overview.pools[0].poolId,
    r => r.overview.sites[0].poolId = 'unknown', r => r.overview.sites[0].provisioning = 'pending', r => r.overview.pools[0].siteCount = 42,
    r => r.overview.snapshot.health.availability = 'available', r => r.overview.snapshot.asOf = 'yesterday'];
  for (const change of corrupt) { const raw = structuredClone(synthetic); change(raw); assert.throws(() => validateOverview(raw, 'org_test'), /invalid_metadata/); }
  assert.throws(() => validateOverview(synthetic, 'org_test', 503), /invalid_metadata/);
  assert.throws(() => validateOverview(overviewPayload('org_test', { unavailable: 'read_unavailable' }), 'org_test', 200), /invalid_metadata/);
});
test('real signature carries independent caller and exact organization claims, bounded scope and fixed endpoint', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const iat = Math.floor(Date.now() / 1000);
  let calls = 0;
  const reader = createSignedInventoryReader({ signer: claims => new SignJWT(claims).setProtectedHeader({ alg: 'ES256' }).sign(privateKey),
    endpoint: 'https://inventory.example.test/v1/account-overview', now: () => iat,
    fetchImpl: async (url, init) => {
      calls++; assert.equal(url, 'https://inventory.example.test/v1/account-overview'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
      const { payload } = await jwtVerify(init.headers.authorization.slice(7), publicKey, { issuer: ACCOUNT_ISSUER, audience: INVENTORY_OVERVIEW_AUDIENCE });
      assert.deepEqual(payload, { iss: ACCOUNT_ISSUER, aud: INVENTORY_OVERVIEW_AUDIENCE, scope: INVENTORY_OVERVIEW_SCOPE, sub: 'personal-caller', organization_id: 'org_test', organization_subject: 'preserved-org-authority', iat, exp: iat + 300 });
      return Response.json(synthetic);
    } });
  const result = await reader.read({ callerId: 'personal-caller', organizationId: 'org_test', organizationSubject: 'preserved-org-authority' });
  assert.equal(validateOverview(result.body, 'org_test', result.status).state, 'available'); assert.equal(calls, 1);
  for (const endpoint of ['http://inventory.example.test/v1/account-overview', 'https://user:password@inventory.example.test/v1/account-overview', 'https://inventory.example.test/v1/account-overview?org=other', 'https://inventory.example.test/v1/stock']) {
    assert.throws(() => createSignedInventoryReader({ endpoint, signer: async () => '' }), /invalid_inventory_endpoint/);
  }
});
test('redirects, oversized bodies and failed transport never yield metadata', async () => {
  const request = { callerId: 'caller', organizationId: 'org_test', organizationSubject: 'subject' };
  for (const response of [new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.test' } }), new Response('x'.repeat(65_537)), new Response('not authorized', { status: 401 })]) {
    const reader = createSignedInventoryReader({ endpoint: 'https://inventory.example.test/v1/account-overview', signer: async () => 'synthetic-in-memory', fetchImpl: async () => response });
    await assert.rejects(reader.read(request));
  }
});
