import { readShipSandboxRegistration, SHIP_SANDBOX_AUDIENCE } from '../src/account/ship-recipient.ts';
import { issueStorePass, replaceStoreKey } from '../src/account/store-passes.ts';
import { checkoutSettingsJson } from '../src/account/commerce-settings.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { fixture, SITE, OTHER_SITE, mintSandboxPass } from './helpers/ship-issuer-fixture.mjs';
import { exchangeShipToken, shipLabelAccess, startShipSignIn } from '../src/account/ship-sign-in.ts';
import { setEmployeePermissions } from '../src/account/organizations.ts';
import { SESSION_EXPIRES_IN_SECONDS, SHIP_SIGN_IN_CALLBACK, STORE_PASS_SERVICES, safeAccountPath, shipSignInPath, shipSignInRequest } from '../src/account/config.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const STATE = 'state-' + 'x'.repeat(40);

async function signIn(f, login, site = SITE) {
  const { verifier, challenge } = pkce();
  const location = new URL(await startShipSignIn(f.db, { siteId: site, state: STATE, codeChallenge: challenge }, login, f.registration));
  return { location, verifier, code: location.searchParams.get('code') };
}

const token = (f, body) => exchangeShipToken({ db: f.db, body, registration: f.registration, privateJwkJson: f.privateJwkJson });
const refresh = (f, refreshToken) => token(f, { grant_type: 'refresh_token', refresh_token: refreshToken });

test('Ship sign-in request: exact parameters, canonical continuation, and a usable state on its own', () => {
  const { challenge } = pkce();
  const good = new URLSearchParams({ site_id: SITE, state: STATE, code_challenge: challenge, code_challenge_method: 'S256' });
  const parsed = shipSignInRequest(good);
  assert.deepEqual(parsed, { ok: true, siteId: SITE, state: STATE, codeChallenge: challenge });
  assert.equal(safeAccountPath(`/account/ship-sign-in?${good}`), shipSignInPath(parsed), 'sign-in comes back to the same request');
  for (const [name, params, state] of [
    ['extra parameter', { ...Object.fromEntries(good), redirect_uri: 'https://evil.example.test/' }, STATE],
    ['plain method', { ...Object.fromEntries(good), code_challenge_method: 'plain' }, STATE],
    ['short challenge', { ...Object.fromEntries(good), code_challenge: 'abc' }, STATE],
    ['bad site id', { ...Object.fromEntries(good), site_id: '../x' }, STATE],
    ['short state', { ...Object.fromEntries(good), state: 'short' }, null],
  ]) {
    const result = shipSignInRequest(new URLSearchParams(params));
    assert.equal(result.ok, false, name);
    assert.equal(result.state, state, name);
    assert.equal(safeAccountPath(`/account/ship-sign-in?${new URLSearchParams(params)}`), '/account', name);
  }
  const twice = new URLSearchParams(good); twice.append('state', STATE);
  assert.deepEqual(shipSignInRequest(twice), { ok: false, state: null }, 'a repeated state is not usable');
  assert.ok(!STORE_PASS_SERVICES.some(s => s.scope === 'ship:labels'), 'store passes never mint ship:labels');
});

test('who may print labels: owners, administrators, and employees the owner ticked; never another business', async () => {
  const f = await fixture(); try {
    for (const user of ['alice', 'admin', 'clerk']) {
      const { location } = await signIn(f, f.session(user));
      assert.equal(`${location.origin}${location.pathname}`, SHIP_SIGN_IN_CALLBACK, user);
      assert.equal(location.searchParams.get('state'), STATE, user);
      assert.match(location.searchParams.get('code') ?? '', /^[A-Za-z0-9_-]{43}$/, user);
    }
    const refused = async (login, site = SITE) => (await signIn(f, login, site)).location.searchParams.get('error');
    assert.equal(await refused(f.session('staff')), 'access_denied', 'an employee without Print shipping labels');
    assert.equal(await refused(f.session('bob')), 'access_denied', 'another business');
    assert.equal(await refused(f.session('alice'), OTHER_SITE), 'access_denied', 'a store of another business');
    assert.equal(await refused(f.session('alice'), 'no-such-store'), 'access_denied', 'an unknown store');

    assert.equal(await setEmployeePermissions(f.db, 'alice', 'a', 'staff', ['site:view', 'ship:labels']), 'ok', 'the owner ticks Print shipping labels');
    assert.equal((await signIn(f, f.session('staff'))).location.searchParams.get('error'), null);

    f.sqlite.prepare("UPDATE dinkuskit_membership SET status = 'suspended' WHERE user_id = 'clerk'").run();
    assert.equal(await refused(f.session('clerk')), 'access_denied', 'a suspended membership');
    f.sqlite.prepare("UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'admin'").run();
    assert.equal(await refused(f.session('admin')), 'access_denied', 'a person the operator suspended');

    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked = 1, revoked_by = 'owner' WHERE site_id = ?").run(SITE);
    assert.equal(await refused(f.session('alice')), 'ship_not_enabled');
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked_by = 'operator' WHERE site_id = ?").run(SITE);
    assert.equal(await refused(f.session('alice')), 'store_unavailable', 'an operator cut-off');
    f.sqlite.prepare("DELETE FROM dinkuskit_service_grant WHERE site_id = ?").run(SITE);
    assert.equal(await refused(f.session('alice')), 'ship_not_enabled', 'Ship never turned on');
    f.sqlite.prepare("INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES (?, 'ship', 0, 1)").run(SITE);
    f.sqlite.prepare("UPDATE dinkuskit_organization SET status = 'suspended' WHERE organization_id = 'a'").run();
    assert.equal(await refused(f.session('alice')), 'store_unavailable', 'a suspended business');
    assert.equal(await refused(f.session('staff')), 'store_unavailable');
    f.sqlite.prepare("UPDATE dinkuskit_organization SET status = 'active', admission_status = 'pending_operator' WHERE organization_id = 'a'").run();
    assert.equal(await refused(f.session('alice')), 'store_unavailable', 'a business still waiting for approval');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM dinkuskit_ship_sign_in_code').get().n, 4, 'codes only for the people who may print');
  } finally { f.close(); }
});

test('a code works once, only with its verifier, only within a minute, and gives a ship:labels pass', async () => {
  const f = await fixture(); try {
    const login = f.session('clerk');
    const first = await signIn(f, login);
    const answer = await token(f, { code: first.code, code_verifier: first.verifier });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    const body = await answer.json();
    assert.deepEqual(Object.keys(body).sort(), ['access_token', 'expires_in', 'refresh_token', 'token_type']);
    assert.equal(body.token_type, 'Bearer'); assert.equal(body.expires_in, 300);
    const { payload } = await jwtVerify(body.access_token, createLocalJWKSet({ keys: [f.keys.publicJwk] }), {
      issuer: 'https://dinkuskit.com/account', audience: 'dinkus-ship', algorithms: ['ES256'],
    });
    assert.equal(payload.scope, 'ship:labels'); assert.equal(payload.site_id, SITE); assert.equal(payload.sub, 'org-a');
    assert.equal(payload.uid, 'clerk'); assert.equal(payload.email, 'clerk@example.test');
    assert.equal(payload.exp - payload.iat, 300);
    assert.equal(payload.store_name, undefined); assert.equal(payload.reply_to, undefined);
    assert.deepEqual(await (await token(f, { code: first.code, code_verifier: first.verifier })).json(), { error: 'invalid_grant' }, 'never twice');

    const wrong = await signIn(f, login);
    assert.deepEqual(await (await token(f, { code: wrong.code, code_verifier: pkce().verifier })).json(), { error: 'invalid_grant' });
    assert.equal((await token(f, { code: wrong.code, code_verifier: wrong.verifier })).status, 400, 'a wrong verifier burns the code');

    const late = await signIn(f, login);
    f.sqlite.prepare('UPDATE dinkuskit_ship_sign_in_code SET expires_at = ? WHERE used_at IS NULL').run(Math.floor(Date.now() / 1000) - 1);
    assert.deepEqual(await (await token(f, { code: late.code, code_verifier: late.verifier })).json(), { error: 'invalid_grant' }, 'expired');

    const changed = await signIn(f, login);
    await setEmployeePermissions(f.db, 'alice', 'a', 'clerk', []);
    assert.equal((await token(f, { code: changed.code, code_verifier: changed.verifier })).status, 400, 'checked again when traded');

    for (const bad of [null, [], {}, { code: 'x' }, { code: first.code, code_verifier: first.verifier, extra: 1 }, { grant_type: 'password', code: 'x', code_verifier: 'y' }]) {
      assert.deepEqual(await (await token(f, bad)).json(), { error: 'invalid_request' }, JSON.stringify(bad));
    }
    const unsigned = await signIn(f, f.session('alice'));
    const noKey = await exchangeShipToken({ db: f.db, body: { code: unsigned.code, code_verifier: unsigned.verifier } });
    assert.equal(noKey.status, 503);
  } finally { f.close(); }
});

test('refresh keeps Ship signed in until DinkusKit.com sign-out, removal, a cut-off or Ship off, and a copied token ends it', async () => {
  const f = await fixture(); try {
    const start = async (login) => {
      const s = await signIn(f, login);
      return (await (await token(f, { code: s.code, code_verifier: s.verifier })).json()).refresh_token;
    };
    const alice = f.session('alice');
    let current = await start(alice);
    const step = await refresh(f, current);
    assert.equal(step.status, 200);
    const rotated = (await step.json()).refresh_token;
    assert.notEqual(rotated, current);
    assert.deepEqual(await (await refresh(f, current)).json(), { error: 'invalid_grant' }, 'the old token came back');
    assert.equal((await refresh(f, rotated)).status, 400, 'so that sign-in ended, including the newest token');

    current = await start(alice);
    f.sqlite.prepare('DELETE FROM session WHERE id = ?').run(alice.sessionId);
    assert.equal((await refresh(f, current)).status, 400, 'signed out of DinkusKit.com');

    const clerk = f.session('clerk');
    current = await start(clerk);
    current = (await (await refresh(f, current)).json()).refresh_token;
    await setEmployeePermissions(f.db, 'alice', 'a', 'clerk', []);
    assert.equal((await refresh(f, current)).status, 400, 'Print shipping labels taken away');

    const owner = f.session('alice');
    current = await start(owner);
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked = 1, revoked_by = 'owner' WHERE site_id = ?").run(SITE);
    assert.equal((await refresh(f, current)).status, 400, 'Ship turned off');
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked = 0, revoked_by = NULL WHERE site_id = ?").run(SITE);
    assert.equal((await refresh(f, current)).status, 400, 'turning Ship on again does not revive an ended sign-in');

    current = await start(owner);
    f.sqlite.prepare("UPDATE \"user\" SET email = 'new-alice@example.test' WHERE id = 'alice'").run();
    assert.equal((await refresh(f, current)).status, 400, 'email changed');
    f.sqlite.prepare("UPDATE \"user\" SET email = 'alice@example.test' WHERE id = 'alice'").run();
    assert.equal((await refresh(f, 'not-a-token')).status, 400);
  } finally { f.close(); }
});

test('a refresh counts as using DinkusKit.com and extends the sign-in once a day', async () => {
  const f = await fixture(); try {
    const expiry = (id) => Date.parse(f.sqlite.prepare('SELECT expiresAt FROM session WHERE id = ?').get(id).expiresAt);
    const login = f.session('alice', Date.now() + 2 * DAY_MS);
    const s = await signIn(f, login);
    let current = (await (await token(f, { code: s.code, code_verifier: s.verifier })).json()).refresh_token;
    assert.ok(expiry(login.sessionId) < Date.now() + 3 * DAY_MS, 'signing in to Ship alone does not extend it');
    current = (await (await refresh(f, current)).json()).refresh_token;
    const extended = expiry(login.sessionId);
    assert.ok(Math.abs(extended - (Date.now() + SESSION_EXPIRES_IN_SECONDS * 1000)) < 60_000, 'a week from now');
    await refresh(f, current);
    assert.equal(expiry(login.sessionId), extended, 'not again within a day');
    const ended = f.session('bob', Date.now() - 1000);
    assert.deepEqual(await shipLabelAccess(f.db, OTHER_SITE, 'bob'), { ok: false, error: 'ship_not_enabled' });
    f.sqlite.prepare("INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES (?, 'ship', 0, 1)").run(OTHER_SITE);
    const late = await signIn(f, ended, OTHER_SITE);
    assert.equal((await token(f, { code: late.code, code_verifier: late.verifier })).status, 400, 'an expired DinkusKit.com sign-in');
  } finally { f.close(); }
});

const REGISTRATION = { siteId: SITE, generation: 'test-generation-1' };
function enableSandbox(f) {
  f.registration = { ...REGISTRATION };
  f.sqlite.prepare("INSERT INTO dinkuskit_commerce_settings (site_id,shipping_mode,shipping_minor,shipping_revision,live,updated_by_user_id,updated_at) VALUES (?, 'free', 0, 1, 0, 'alice', 1)").run(SITE);
}
async function sandboxClaims(f, body, scope) {
  const { payload } = await jwtVerify(body.access_token, createLocalJWKSet({ keys: [f.keys.publicJwk] }), { issuer: 'https://dinkuskit.com/account', audience: SHIP_SANDBOX_AUDIENCE });
  assert.equal(payload.site_id, SITE);
  assert.equal(payload.scope, scope);
  assert.equal(payload.ship_recipient, 'ship-sandbox');
  assert.equal(payload.ship_generation, REGISTRATION.generation);
  assert.equal(payload.ship_mode, 'test');
  assert.equal(payload.ship_cohort, undefined);
  assert.equal(payload.order_id, undefined);
  await assert.rejects(jwtVerify(body.access_token, createLocalJWKSet({ keys: [f.keys.publicJwk] }), { audience: 'dinkus-ship' }));
  return payload;
}

test('sandbox registration is absent by default and accepts only exact bounded server fields', () => {
  assert.equal(readShipSandboxRegistration(undefined), undefined);
  assert.deepEqual(readShipSandboxRegistration(JSON.stringify(REGISTRATION)), REGISTRATION);
  for (const value of ['', null, {}, 'null', '[]', JSON.stringify({ ...REGISTRATION, origin: 'https://evil.test' }), JSON.stringify({ ...REGISTRATION, audience: 'dinkus-ship' }), JSON.stringify({ ...REGISTRATION, generation: '' }), JSON.stringify({ ...REGISTRATION, generation: 'a'.repeat(129) }), JSON.stringify({ ...REGISTRATION, generation: '../next' }), JSON.stringify({ ...REGISTRATION, siteId: '../site' })]) {
    assert.throws(() => readShipSandboxRegistration(value));
  }
});

test('sandbox machine passes require registered site, expected generation, TEST settings and existing key/grant', async () => {
  const f = await fixture(); try {
    enableSandbox(f);
    const key = await replaceStoreKey(f.db, { siteId: SITE, subject: 'org-a', organizationId: 'a', actorUserId: 'alice' });
    const request = { site_id: SITE, audience: SHIP_SANDBOX_AUDIENCE, scope: 'ship:orders', generation: REGISTRATION.generation };
    const send = (body, registration = f.registration) => issueStorePass({ db: f.db, authorization: `Bearer ${key}`, body, registration, privateJwkJson: f.privateJwkJson });
    const ok = await send(request); assert.equal(ok.status, 200); await sandboxClaims(f, await ok.json(), 'ship:orders');
    for (const body of [
      { ...request, site_id: OTHER_SITE }, { ...request, generation: 'old-generation' },
      { ...request, scope: 'ship:labels' }, { ...request, recipient: 'ship-sandbox' },
      { site_id: SITE, scope: 'ship:orders', audience: SHIP_SANDBOX_AUDIENCE },
      { site_id: SITE, scope: 'ship:orders', audience: 'dinkus-ship' },
    ]) assert.notEqual((await send(body)).status, 200);
    assert.notEqual((await send(request, null)).status, 200);
    f.sqlite.prepare('UPDATE dinkuskit_commerce_settings SET live = 1').run();
    assert.equal((await send(request)).status, 403);
    f.sqlite.prepare('DELETE FROM dinkuskit_commerce_settings').run();
    assert.equal((await send(request)).status, 403);
    f.registration = undefined; enableSandbox(f);
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked = 1 WHERE service = 'ship'").run();
    assert.equal((await send(request)).status, 403);
    f.sqlite.prepare("UPDATE dinkuskit_service_grant SET revoked = 0 WHERE service = 'ship'").run();
    f.sqlite.prepare("UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'alice'").run();
    assert.equal((await send(request)).status, 403);
  } finally { f.close(); }
});

test('checkout output preserves production shape and binds sandbox to TEST only', () => {
  const input = { siteId: SITE, siteOrigin: 'https://store.example.test', binding: { providerId: 'authorize_net', bindingRef: 'test-binding', ready: true }, settings: { live: false, shippingMode: 'free', shippingMinor: 0, shippingRevision: 1 }, coupons: false, ship: true };
  assert.deepEqual(JSON.parse(checkoutSettingsJson(input)).ship, { origin: 'https://ship.dinkuskit.com', audience: 'dinkus-ship' });
  assert.deepEqual(JSON.parse(checkoutSettingsJson({ ...input, registration: REGISTRATION })).ship, { origin: 'https://ship.sm0ky.dev', audience: SHIP_SANDBOX_AUDIENCE, recipient: 'ship-sandbox', generation: REGISTRATION.generation, mode: 'test' });
  assert.equal(checkoutSettingsJson({ ...input, registration: { ...REGISTRATION, siteId: OTHER_SITE } }), checkoutSettingsJson(input));
  assert.throws(() => checkoutSettingsJson({ ...input, registration: REGISTRATION, settings: { ...input.settings, live: true } }), /ship_test_required/);
});

test('sandbox labels pin callback, code and rotating refresh; stale or removed registration never retargets', async () => {
  const f = await fixture(); try {
    enableSandbox(f);
    const login = f.session('alice');
    const code = await signIn(f, login);
    assert.equal(code.location.origin, 'https://ship.sm0ky.dev');
    assert.equal(code.location.pathname, '/auth/callback');
    const response = await token(f, { code: code.code, code_verifier: code.verifier });
    assert.equal(response.status, 200); const first = await response.json(); await sandboxClaims(f, first, 'ship:labels');
    const renewed = await refresh(f, first.refresh_token); assert.equal(renewed.status, 200);
    const second = await renewed.json(); await sandboxClaims(f, second, 'ship:labels');
    assert.equal((await refresh(f, first.refresh_token)).status, 400);
    assert.equal((await refresh(f, second.refresh_token)).status, 400, 'replay ends family');
    for (const registration of [{ ...REGISTRATION, generation: 'test-generation-2' }, undefined, { ...REGISTRATION, siteId: OTHER_SITE }]) {
      f.registration = REGISTRATION;
      const pending = await signIn(f, login);
      const active = await signIn(f, login);
      const family = await (await token(f, { code: active.code, code_verifier: active.verifier })).json();
      f.registration = registration;
      assert.equal((await token(f, { code: pending.code, code_verifier: pending.verifier })).status, 400);
      assert.equal((await refresh(f, family.refresh_token)).status, 400);
    }
  } finally { f.close(); }
});

test('legacy code and refresh never upgrade; sandbox live/missing settings and dead login refuse', async () => {
  const f = await fixture(); try {
    const login = f.session('alice');
    const oldCode = await signIn(f, login);
    const oldActive = await signIn(f, login);
    const oldFamily = await (await token(f, { code: oldActive.code, code_verifier: oldActive.verifier })).json();
    enableSandbox(f);
    assert.equal((await token(f, { code: oldCode.code, code_verifier: oldCode.verifier })).status, 400);
    assert.equal((await refresh(f, oldFamily.refresh_token)).status, 400);
    const active = await signIn(f, login);
    const family = await (await token(f, { code: active.code, code_verifier: active.verifier })).json();
    const pending = await signIn(f, login);
    f.sqlite.prepare('UPDATE dinkuskit_commerce_settings SET live = 1').run();
    assert.equal((await signIn(f, login)).location.searchParams.get('error'), 'store_unavailable');
    assert.equal((await token(f, { code: pending.code, code_verifier: pending.verifier })).status, 400);
    assert.equal((await refresh(f, family.refresh_token)).status, 400);
    f.sqlite.prepare('DELETE FROM dinkuskit_commerce_settings').run();
    assert.equal((await signIn(f, login)).location.searchParams.get('error'), 'store_unavailable');
    f.registration = undefined; enableSandbox(f);
    const dead = await signIn(f, login);
    f.sqlite.prepare('DELETE FROM session WHERE id = ?').run(login.sessionId);
    assert.equal((await token(f, { code: dead.code, code_verifier: dead.verifier })).status, 400);
  } finally { f.close(); }
});

test('sandbox concurrent code redemption and refresh rotation have at most one success', async () => {
  const f = await fixture(); try {
    enableSandbox(f);
    const pending = await signIn(f, f.session('alice'));
    const redeemed = await Promise.all([1, 2].map(() => token(f, { code: pending.code, code_verifier: pending.verifier })));
    assert.deepEqual(redeemed.map(r => r.status).sort(), [200, 400]);
    const family = await redeemed.find(r => r.status === 200).json();
    const rotated = await Promise.all([1, 2].map(() => refresh(f, family.refresh_token)));
    assert.deepEqual(rotated.map(r => r.status).sort(), [200, 400]);
    const next = await rotated.find(r => r.status === 200).json();
    assert.equal((await refresh(f, next.refresh_token)).status, 400, 'duplicate refresh terminates the family');
  } finally { f.close(); }
});

test('shared integration helper mints through the actual issuer', async () => {
  const produced = await mintSandboxPass();
  const { payload } = await jwtVerify(produced.token, createLocalJWKSet({ keys: [produced.publicJwk] }), { issuer: 'https://dinkuskit.com/account', audience: SHIP_SANDBOX_AUDIENCE });
  assert.equal(payload.site_id, produced.siteId);
  assert.equal(payload.ship_generation, produced.generation);
  assert.equal(payload.scope, 'ship:orders');
});
