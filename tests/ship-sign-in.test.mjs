import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createLocalTestKeys } from '../src/account/jwt.ts';
import { exchangeShipToken, shipLabelAccess, startShipSignIn } from '../src/account/ship-sign-in.ts';
import { setEmployeePermissions } from '../src/account/organizations.ts';
import { SESSION_EXPIRES_IN_SECONDS, SHIP_SIGN_IN_CALLBACK, STORE_PASS_SERVICES, safeAccountPath, shipSignInPath, shipSignInRequest } from '../src/account/config.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const SITE = '7d0c3f0e-5d8b-4f43-9e43-2f9ad2c1a001';
const OTHER_SITE = '7d0c3f0e-5d8b-4f43-9e43-2f9ad2c1a002';

async function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const file of (await readdir('migrations/merchant')).filter(n => n.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(`migrations/merchant/${file}`, 'utf8'));
  }
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let args = [];
    const q = { bind(...values) { args = values; return q; }, async first() { return stmt.get(...args) ?? null; }, async all() { return { success: true, results: stmt.all(...args) }; }, async run() { return { success: true, meta: { changes: stmt.run(...args).changes } }; }, execute() { return { success: true, meta: { changes: stmt.run(...args).changes } }; } };
    return q;
  }, async batch(queries) { return sqlite.transaction(() => queries.map(q => q.execute()))(); } };
  const users = ['alice', 'admin', 'clerk', 'staff', 'bob'];
  for (const user of users) {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(user, user, `${user}@example.test`);
    sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES (?, ?, 1, 1)').run(user, `personal-${user}`);
  }
  for (const [org, owner] of [['a', 'alice'], ['b', 'bob']]) {
    sqlite.prepare("INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at) VALUES (?, ?, 'active', ?, ?, 'admitted', ?, 1, 1)").run(org, org, owner, `org-${org}`, owner);
    sqlite.prepare("INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active', '[]', 1, 1)").run(org, owner);
    sqlite.prepare('INSERT INTO dinkuskit_user_selection VALUES (?, ?, 1)').run(owner, org);
  }
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'admin', 'administrator', 'active', '[\"membership:manage\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'clerk', 'member', 'active', '[\"ship:labels\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'staff', 'member', 'active', '[\"site:view\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_store_identity VALUES (?, 'https://store-a.example.test', 'org-a', 1)").run(SITE);
  sqlite.prepare("INSERT INTO dinkuskit_store_identity VALUES (?, 'https://store-b.example.test', 'org-b', 1)").run(OTHER_SITE);
  sqlite.prepare("INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES (?, 'ship', 0, 1)").run(SITE);
  const session = (user, expiresAtMs = Date.now() + 7 * DAY_MS) => {
    const id = `session-${user}-${randomBytes(4).toString('hex')}`;
    sqlite.prepare('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, new Date(expiresAtMs).toISOString(), randomBytes(16).toString('hex'), new Date().toISOString(), new Date().toISOString(), user);
    return { userId: user, sessionId: id };
  };
  const keys = await createLocalTestKeys();
  return { sqlite, db, session, keys, privateJwkJson: JSON.stringify(keys.privateJwk), close() { sqlite.close(); } };
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

const STATE = 'state-' + 'x'.repeat(40);

async function signIn(f, login, site = SITE) {
  const { verifier, challenge } = pkce();
  const location = new URL(await startShipSignIn(f.db, { siteId: site, state: STATE, codeChallenge: challenge }, login));
  return { location, verifier, code: location.searchParams.get('code') };
}

const token = (f, body) => exchangeShipToken({ db: f.db, body, privateJwkJson: f.privateJwkJson });
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
