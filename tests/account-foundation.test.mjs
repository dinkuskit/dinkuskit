import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { createOrganization, createAdditionalOrganization, consumeSignupAttempt, deletionGuard } from '../src/account/organizations.ts';
import { completeProofMail, request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

const form = async (runtime, jar, path, values) => request(runtime, jar, path, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString(),
});
const intake = (email, phone = '+15555550123', extra = {}) => ({ email, phone, service_channel: 'email', agreement: 'on', ...extra });
const state = async (runtime, email) => (await request(runtime, new Map(), `/__proof/foundation?email=${encodeURIComponent(email)}`)).json();
const organizations = async (runtime, jar) => (await request(runtime, jar, '/api/account/organizations')).json();
const fixture = async (runtime, body) => request(runtime, new Map(), '/__proof/foundation', { method: 'POST', body: JSON.stringify(body) });
const select = async (runtime, jar, organizationId) => form(runtime, jar, '/api/account/organizations', { action: 'select', organization_id: organizationId });
const manage = async (runtime, jar, organizationId, email, action, permissions = []) => request(runtime, jar, '/api/account/memberships', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams([['organization_id', organizationId], ['email', email], ['action', action], ...permissions.map(p => ['permission', p])]).toString(),
});

test('verified signup consumes this browser snapshot; expired, unsolicited and direct-auth logins gain no authority', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const attacker = new Map(), legitimate = new Map();
    const email = 'snapshot@example.com';
    await form(runtime, attacker, '/account/signup', intake(email, '+15555550001', { promotional_email: 'on', promotional_sms: 'on' }));
    const posted = await form(runtime, legitimate, '/account/signup', intake(email, '+15555550002'));
    const cookie = posted.headers.getSetCookie().find(c => c.startsWith('dk-signup-attempt='));
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//);
    await completeProofMail(runtime, legitimate, email);
    const original = await state(runtime, email);
    assert.equal(original.profile.phone, '+15555550002');
    assert.equal(original.profile.promotional_email, 0); assert.equal(original.profile.promotional_sms, 0);
    assert.equal(original.profile.email_verified, 1); assert.equal(original.profile.phone_verified, 0);
    assert.equal((await organizations(runtime, legitimate)).organizations.length, 1);
    const before = original.stats.slots;
    await form(runtime, attacker, '/account/signup', intake(email, '+15555550003', { promotional_sms: 'on' }));
    await completeProofMail(runtime, attacker, email);
    assert.deepEqual((await state(runtime, email)).profile, original.profile);
    assert.equal((await state(runtime, email)).stats.slots, before);

    const direct = new Map();
    assert.equal((await request(runtime, direct, '/api/auth/sign-in/magic-link', {
      method: 'POST', body: JSON.stringify({ email: 'direct@example.com', metadata: { intent: 'signup' } }),
    })).status, 200);
    await completeProofMail(runtime, direct, 'direct@example.com');
    for (let i = 0; i < 3; i++) {
      assert.equal((await organizations(runtime, direct)).organizations.length, 0);
      assert.equal((await request(runtime, direct, '/account')).status, 200);
    }
    assert.equal((await state(runtime, 'direct@example.com')).profile, null);
    assert.equal((await form(runtime, direct, '/api/account/organizations', { name: 'Bypass' })).status, 403);
    // A login-only user can finish the same signup page; no fabricated legacy organization.
    await form(runtime, direct, '/account/signup', intake('direct@example.com'));
    await completeProofMail(runtime, direct, 'direct@example.com');
    assert.equal((await organizations(runtime, direct)).organizations.length, 1);

    const expired = new Map();
    await form(runtime, expired, '/account/signup', intake('expired@example.com'));
    await fixture(runtime, { action: 'expire_signup' });
    await completeProofMail(runtime, expired, 'expired@example.com');
    assert.equal((await organizations(runtime, expired)).organizations.length, 0);
    const unsolicited = new Map();
    await form(runtime, new Map(), '/account/signup', intake('unsolicited@example.com'));
    await completeProofMail(runtime, unsolicited, 'unsolicited@example.com');
    assert.equal((await organizations(runtime, unsolicited)).organizations.length, 0);
    const invalid = await form(runtime, new Map(), '/account/signup', intake('invalid@example.com', '555-1234'));
    assert.match(invalid.headers.get('location'), /missing_intake/);
  } finally { await stopRuntime(runtime); }
});

test('email-only signup is admitted; without a phone the contact is email and no texts are chosen', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const jar = new Map();
    const email = 'email-only@example.com';
    const posted = await form(runtime, jar, '/account/signup', { email, phone: '', service_channel: 'phone', promotional_sms: 'on', agreement: 'on' });
    assert.equal(posted.headers.get('location'), '/account/check-email');
    await completeProofMail(runtime, jar, email);
    const saved = await state(runtime, email);
    assert.equal(saved.profile.phone, '');
    assert.equal(saved.profile.service_channel, 'email');
    assert.equal(saved.profile.promotional_sms, 0);
    assert.equal(saved.profile.email_verified, 1);
    const orgs = await organizations(runtime, jar);
    assert.equal(orgs.organizations.length, 1);
    assert.equal(orgs.organizations[0].admissionStatus, 'admitted');
    const noChannel = await form(runtime, new Map(), '/account/signup', { email: 'no-channel@example.com', phone: '+15555550199', agreement: 'on' });
    assert.equal(noChannel.headers.get('location'), '/account/check-email');
    const noAgreement = await form(runtime, new Map(), '/account/signup', { email: 'no-agreement@example.com' });
    assert.match(noAgreement.headers.get('location'), /missing_intake/);
  } finally { await stopRuntime(runtime); }
});

test('pending selection persists and Owner/Admin employee routes enforce current organization ceilings', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const owner = new Map(), admin = new Map(), employee = new Map();
    await signup(runtime, 'owner@example.com', owner);
    await signup(runtime, 'admin@example.com', admin);
    await signup(runtime, 'employee@example.com', employee);
    const org = (await organizations(runtime, owner)).selectedOrganizationId;
    assert.equal((await form(runtime, owner, '/api/account/organizations', { name: 'Second organization' })).status, 303);
    const second = await organizations(runtime, owner);
    const pending = second.organizations.find(o => o.organizationId !== org);
    assert.equal(pending.admissionStatus, 'pending_operator');
    assert.equal(second.selectedOrganizationId, pending.organizationId);
    assert.equal((await organizations(runtime, owner)).selectedOrganizationId, pending.organizationId);
    assert.match(await (await request(runtime, owner, '/account')).text(), /waiting for operator approval/);
    await select(runtime, owner, org);
    assert.equal((await manage(runtime, owner, pending.organizationId, 'admin@example.com', 'add_member')).status, 409);
    const slots = (await state(runtime, 'owner@example.com')).stats.slots;
    assert.equal((await manage(runtime, owner, org, 'admin@example.com', 'add_member')).status, 303);
    assert.equal((await manage(runtime, owner, org, 'admin@example.com', 'grant_admin', ['membership:manage', 'membership:view'])).status, 303);
    await select(runtime, admin, org);
    assert.equal((await request(runtime, admin, '/account/sites')).status, 403);
    const selected = await organizations(runtime, admin);
    assert.equal(selected.accountId, JSON.stringify(['https://dinkuskit.com/account', selected.subject]));
    assert.equal(selected.subject, (await organizations(runtime, owner)).subject);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'add_member')).status, 303);
    await select(runtime, employee, org);
    assert.equal((await request(runtime, employee, '/account/sites')).status, 403);
    assert.equal((await request(runtime, employee, '/api/account/memberships')).status, 403);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'set_permissions', ['site:view'])).status, 403);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'set_permissions', ['membership:view'])).status, 303);
    assert.equal((await request(runtime, employee, '/api/account/memberships')).status, 200);
    assert.equal((await manage(runtime, admin, org, 'owner@example.com', 'set_permissions', [])).status, 403);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'grant_admin', ['membership:manage'])).status, 403);
    assert.equal((await manage(runtime, owner, org, 'employee@example.com', 'set_permissions', ['inventory:admin'])).status, 403);
    assert.equal((await manage(runtime, admin, org, 'admin@example.com', 'set_permissions', [])).status, 403);
    assert.equal((await manage(runtime, owner, org, 'employee@example.com', 'set_permissions', ['site:view'])).status, 303);
    await select(runtime, employee, org);
    assert.equal((await request(runtime, employee, '/account/sites')).status, 200);
    assert.equal((await request(runtime, employee, '/api/account/memberships')).status, 403);
    assert.equal((await manage(runtime, employee, org, 'owner@example.com', 'add_member')).status, 403);
    assert.equal((await state(runtime, 'owner@example.com')).stats.slots, slots);
    // Removal: nobody removes the owner or themselves, and only the owner removes an Administrator.
    for (const [actor, email] of [[admin, 'owner@example.com'], [admin, 'admin@example.com'], [owner, 'owner@example.com'], [employee, 'owner@example.com']]) {
      assert.equal((await manage(runtime, actor, org, email, 'remove_member')).status, 403);
    }
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'remove_member')).status, 303);
    assert.equal((await organizations(runtime, employee)).selectedOrganizationId, null);
    assert.equal((await select(runtime, employee, org)).status, 403);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'add_member')).status, 303, 'a removed employee can be added again');
    assert.equal((await select(runtime, employee, org)).status, 303);
    assert.equal((await manage(runtime, owner, org, 'employee@example.com', 'grant_admin', ['membership:manage'])).status, 303);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'remove_member')).status, 403, 'an Administrator cannot remove another');
    assert.equal((await manage(runtime, owner, org, 'admin@example.com', 'remove_member')).status, 303);
    assert.equal((await organizations(runtime, admin)).selectedOrganizationId, null);
    assert.equal((await manage(runtime, admin, org, 'employee@example.com', 'set_permissions', [])).status, 401);
    const other = (await organizations(runtime, admin)).organizations[0].organizationId;
    assert.equal((await select(runtime, admin, other)).status, 303);
    assert.equal((await select(runtime, employee, pending.organizationId)).status, 403);
  } finally { await stopRuntime(runtime); }
});

test('actual local D1 last-slot contention admits only one of two qualifying people', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    await request(runtime, new Map(), '/account/signup');
    assert.equal((await fixture(runtime, { action: 'seed_last_slot' })).status, 200);
    const a = new Map(), b = new Map();
    await form(runtime, a, '/account/signup', intake('last-a@example.com'));
    await form(runtime, b, '/account/signup', intake('last-b@example.com'));
    await Promise.all([completeProofMail(runtime, a, 'last-a@example.com'), completeProofMail(runtime, b, 'last-b@example.com')]);
    const stats = (await state(runtime, 'last-a@example.com')).stats;
    assert.equal(stats.slots, 50); assert.equal(stats.admitted, 50); assert.equal(stats.unallocated, 0);
    const results = [...(await organizations(runtime, a)).organizations, ...(await organizations(runtime, b)).organizations];
    assert.equal(results.filter(o => o.admissionStatus === 'admitted').length, 1);
    assert.equal(results.filter(o => o.admissionStatus === 'pending_operator').length, 1);
  } finally { await stopRuntime(runtime); }
});

async function sqliteFixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const name of ['0001_better_auth', '0002_dinkuskit', '0003_store_connect', '0004_account_foundation']) sqlite.exec(await readFile(`migrations/merchant/${name}.sql`, 'utf8'));
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let values = [];
    const wrapper = { bind(...v) { values = v; return wrapper; }, async first() { return stmt.get(...values) ?? null; }, async all() { return { results: stmt.all(...values) }; }, async run() { return { meta: { changes: stmt.run(...values).changes } }; }, rawRun() { return stmt.run(...values); } };
    return wrapper;
  }, async batch(statements) { return sqlite.transaction(() => statements.map(q => q.rawRun()))(); } };
  return { sqlite, db };
}

function syntheticUser(sqlite, id, eligible = true) {
  sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(id, 'Synthetic', id + '@example.com');
  sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES (?, ?, 1, 1)').run(id, 'personal-' + id);
  if (eligible) sqlite.prepare(`INSERT INTO dinkuskit_signup_profile (user_id,email,phone,email_verified,service_channel,promotional_email,promotional_sms,agreement_accepted,created_at)
    VALUES (?, ?, '+15555550123', 1, 'email', 0, 0, 1, 1)`).run(id, id + '@example.com');
}

test('51-person lifetime allocation, idempotent completion and no ownership/closure recycling', async () => {
  const { sqlite, db } = await sqliteFixture();
  try {
    for (let i = 0; i < 51; i++) { syntheticUser(sqlite, 'person-' + i); await createOrganization(db, 'person-' + i, 'Synthetic'); }
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM dinkuskit_admission WHERE slot_number IS NOT NULL').get().n, 50);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM dinkuskit_organization WHERE admission_status = 'admitted'").get().n, 50);
    await Promise.all([createOrganization(db, 'person-0', 'Retry'), createOrganization(db, 'person-0', 'Retry')]);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM dinkuskit_organization').get().n, 51);
    sqlite.prepare("UPDATE dinkuskit_organization SET status = 'closed', owner_user_id = 'person-1' WHERE organization_id = 'initial_person-0'").run();
    assert.equal((await createAdditionalOrganization(db, 'person-0', 'After closure')).admissionStatus, 'pending_operator');
    assert.equal(sqlite.prepare('SELECT first_organization_id FROM dinkuskit_admission WHERE user_id = ?').get('person-0').first_organization_id, 'initial_person-0');
    assert.equal((await deletionGuard(db, 'person-1')).allowed, false);
    assert.throws(() => sqlite.prepare('UPDATE dinkuskit_admission SET slot_number = 51 WHERE user_id = ?').run('person-50'), /CHECK/);
    syntheticUser(sqlite, 'no-intake', false);
    await assert.rejects(createOrganization(db, 'no-intake', 'Forbidden'), /signup_incomplete/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM dinkuskit_admission WHERE user_id = ?').get('no-intake').n, 0);
    // One-use marker cannot be replayed in the same second or infer either opt-in.
    sqlite.prepare(`INSERT INTO dinkuskit_signup_attempt VALUES ('nonce', 'no-intake@example.com', '+15555550123', 'email', 0, 0, 1, ?, NULL, NULL, 1)`).run(Math.floor(Date.now() / 1000) + 300);
    assert.equal(await consumeSignupAttempt(db, 'no-intake', 'no-intake@example.com', 'nonce'), true);
    const marker = sqlite.prepare('SELECT consumption_id FROM dinkuskit_signup_attempt').get().consumption_id;
    await consumeSignupAttempt(db, 'no-intake', 'no-intake@example.com', 'nonce');
    assert.equal(sqlite.prepare('SELECT consumption_id FROM dinkuskit_signup_attempt').get().consumption_id, marker);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM dinkuskit_organization WHERE organization_id = 'initial_no-intake'").get().n, 1);
  } finally { sqlite.close(); }
});

test('v4 upgrade preserves legacy subjects, public signer history and site grants exactly once', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const name of ['0001_better_auth', '0002_dinkuskit', '0003_store_connect']) sqlite.exec(await readFile(`migrations/merchant/${name}.sql`, 'utf8'));
    for (const id of ['legacy-active', 'legacy-disabled']) syntheticUser(sqlite, id, false);
    sqlite.prepare("UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'legacy-disabled'").run();
    sqlite.prepare('INSERT INTO dinkuskit_jwks VALUES (?, ?, 1)').run('synthetic-public-key', JSON.stringify({ kty: 'EC', x: 'synthetic-public-only' }));
    sqlite.prepare("INSERT INTO dinkuskit_site_binding (site_id, site_origin, account_subject, service, granted_at) VALUES ('synthetic-site', 'https://synthetic.example', 'personal-legacy-active', 'inventory', 1)").run();
    const tables = ['dinkuskit_account', 'dinkuskit_jwks', 'dinkuskit_site_binding'];
    const before = tables.map(table => sqlite.prepare('SELECT * FROM ' + table).all());
    sqlite.exec(await readFile('migrations/merchant/0004_account_foundation.sql', 'utf8'));
    assert.deepEqual(tables.map(table => sqlite.prepare('SELECT * FROM ' + table).all()), before);
    assert.equal(sqlite.prepare("SELECT authority_subject FROM dinkuskit_organization WHERE organization_id = 'legacy_legacy-active'").get().authority_subject, 'personal-legacy-active');
    assert.equal(sqlite.prepare("SELECT status FROM dinkuskit_organization WHERE organization_id = 'legacy_legacy-disabled'").get().status, 'suspended');
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM dinkuskit_membership WHERE role = 'owner'").get().n, 2);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM dinkuskit_admission WHERE slot_number IS NOT NULL').get().n, 0);
  } finally { sqlite.close(); }
});

test('pending Owner cannot claim Connect and a removed Owner cannot approve after proof fetch', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const jar = new Map();
    await signup(runtime, 'consent-owner@example.com', jar);
    const org = (await organizations(runtime, jar)).selectedOrganizationId;
        const siteOrigin = 'https://consent-race.stores.example';
    const callback = siteOrigin + '/_emdash/admin/plugins/dinkus-inventory/inventory';
    const challenge = 'a'.repeat(43);
    const start = await request(runtime, new Map(), '/api/store-connections', {
      method: 'POST', body: JSON.stringify({ client_id: 'dinkus-inventory-emdash', service: 'inventory', protocol_version: 2,
        site_origin: siteOrigin, callback_uri: callback, code_challenge: challenge, code_challenge_method: 'S256' }),
    });
    assert.equal(start.status, 200);
    const connection = await start.json();
    const path = '/account/connect?connection_id=' + connection.connection_id;
    await form(runtime, jar, '/api/account/organizations', { name: 'Pending organization' });
    assert.equal((await request(runtime, jar, path)).status, 403);
    await select(runtime, jar, org);
    assert.equal((await request(runtime, jar, path)).status, 200);
    const missing = await form(runtime, jar, path, { action: 'approve' });
    assert.match(missing.headers.get('location'), /stale_organization/);
    await request(runtime, new Map(), '/__proof/receipt', { method: 'POST', body: JSON.stringify({
      version: 2, connection_id: connection.connection_id, challenge: connection.challenge, client_id: 'dinkus-inventory-emdash',
      service: 'inventory', site_id: connection.site_id, site_origin: siteOrigin, callback_uri: callback, code_challenge: challenge,
      expires_at: connection.expires_at, delay_ms: 20, revoke_owner_after_delay: true,
    }) });
    const approved = await form(runtime, jar, path, { action: 'approve', organization_id: org });
    assert.match(approved.headers.get('location'), /error=/);
    const grant = await (await request(runtime, new Map(), '/__proof/grant?site_id=' + connection.site_id)).json();
    assert.equal(grant.present, false);
  } finally { await stopRuntime(runtime); }
});
