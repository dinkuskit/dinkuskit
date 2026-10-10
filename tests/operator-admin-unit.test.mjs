import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { readdir, readFile } from 'node:fs/promises';
import { validateBlockResponse } from '@emdash-cms/blocks/server';
import { cutOffStore, decideAsOperator, listPeople, listReviewOrganizations, listStores, setPersonSuspended } from '../src/account/operator-admin.ts';
import { handleInteraction } from '../src/operator-admin/pages.ts';

const actor = { userId: 'cms-admin', email: 'operator@example.test' };

/** better-sqlite3 behind the D1 calls the account code uses; batch runs in one transaction. */
function d1(sqlite) {
  const statement = (sql) => {
    const stmt = sqlite.prepare(sql); let values = [];
    const wrapper = {
      bind(...v) { values = v; return wrapper; },
      async first() { return stmt.reader ? stmt.get(...values) ?? null : null; },
      async all() { return { success: true, results: stmt.all(...values) }; },
      async run() { return execute(); },
      execute,
    };
    function execute() {
      if (stmt.reader) return { success: true, results: stmt.all(...values), meta: { changes: 0 } };
      const info = stmt.run(...values);
      return { success: true, meta: { changes: info.changes } };
    }
    return wrapper;
  };
  return {
    prepare: statement,
    async batch(statements) { return sqlite.transaction(() => statements.map(s => s.execute()))(); },
  };
}

async function fixture() {
  const sqlite = new Database(':memory:');
  for (const name of (await readdir('migrations/merchant')).sort()) sqlite.exec(await readFile(`migrations/merchant/${name}`, 'utf8'));
  const person = (id, email, created, phone = '') => {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(id, `${id} Synthetic`, email);
    sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,disabled,created_at,updated_at) VALUES (?, ?, 0, ?, ?)').run(id, `personal-${id}`, created, created);
    sqlite.prepare(`INSERT INTO dinkuskit_signup_profile (user_id,email,phone,email_verified,service_channel,promotional_email,promotional_sms,agreement_accepted,created_at)
      VALUES (?, ?, ?, 1, 'email', 0, 0, 1, ?)`).run(id, email, phone, created);
  };
  const org = (id, owner, status, admission, created, slot = null) => {
    sqlite.prepare(`INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, `Business ${id}`, status, owner, `subject-${id}`, admission, owner, created, created);
    sqlite.prepare(`INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active', '[]', 1, 1)`).run(id, owner);
    if (slot !== undefined) sqlite.prepare('INSERT OR IGNORE INTO dinkuskit_admission (user_id,first_organization_id,slot_number,created_at) VALUES (?, ?, ?, ?)').run(owner, id, slot, created);
  };
  person('alice', 'alice@example.test', 100, '+15555550100');
  person('bob', 'bob@example.test', 200);
  org('org-auto', 'alice', 'active', 'admitted', 100, 1);
  org('org-wait', 'bob', 'pending_operator', 'pending_operator', 300, null);
  sqlite.prepare(`INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('s1', 9999999999, 't1', 1, 1, 'alice')`).run();
  sqlite.prepare(`INSERT INTO dinkuskit_store_identity VALUES ('site-1', 'https://shop.example.test', 'subject-org-auto', 400)`).run();
  for (const service of ['payments', 'inventory']) sqlite.prepare(`INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES ('site-1', ?, 0, 400)`).run(service);
  return { sqlite, db: d1(sqlite) };
}

const actions = sqlite => sqlite.prepare('SELECT action, target_id, service, actor_email FROM dinkuskit_operator_action ORDER BY created_at, rowid').all();

test('approvals list waiting businesses first and marks the first 50 as approved automatically', async () => {
  const { db } = await fixture();
  const { rows, hasNext } = await listReviewOrganizations(db);
  assert.equal(hasNext, false);
  assert.deepEqual(rows.map(r => [r.organizationId, r.state, r.automatic]), [['org-wait', 'waiting', false], ['org-auto', 'approved', true]]);
});

test('operator answers: waiting, automatic and changed decisions are saved and logged', async () => {
  const { sqlite, db } = await fixture();
  assert.equal(await decideAsOperator(db, 'org-wait', 'approved', actor), 'decided');
  assert.equal(sqlite.prepare("SELECT status FROM dinkuskit_organization WHERE organization_id='org-wait'").get().status, 'active');
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM dinkuskit_organization_notification WHERE organization_id='org-wait'").get().n, 1);
  assert.equal(await decideAsOperator(db, 'org-wait', 'approved', actor), 'unchanged');
  assert.equal(sqlite.prepare("SELECT status FROM dinkuskit_organization_notification WHERE organization_id='org-wait'").get().status, 'pending');

  assert.equal(await decideAsOperator(db, 'org-auto', 'denied', actor), 'changed');
  let row = sqlite.prepare("SELECT status, admission_status FROM dinkuskit_organization WHERE organization_id='org-auto'").get();
  assert.deepEqual({ ...row }, { status: 'denied', admission_status: 'denied' });
  assert.equal(await decideAsOperator(db, 'org-auto', 'denied', actor), 'unchanged');
  assert.equal(await decideAsOperator(db, 'org-auto', 'approved', actor), 'changed');
  row = sqlite.prepare("SELECT status, admission_status FROM dinkuskit_organization WHERE organization_id='org-auto'").get();
  assert.deepEqual({ ...row }, { status: 'active', admission_status: 'admitted' });
  const audit = sqlite.prepare("SELECT decision, actor_email FROM dinkuskit_organization_approval_audit WHERE organization_id='org-auto'").get();
  assert.deepEqual({ ...audit }, { decision: 'approved', actor_email: 'operator@example.test' });
  // A changed answer never queues a second owner email.
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM dinkuskit_organization_notification WHERE organization_id='org-auto'").get().n, 0);
  // Changing a waiting business's first answer cancels its unsent "approved" email.
  assert.equal(await decideAsOperator(db, 'org-wait', 'denied', actor), 'changed');
  const notice = sqlite.prepare("SELECT status, unavailable_reason FROM dinkuskit_organization_notification WHERE organization_id='org-wait'").get();
  assert.deepEqual({ ...notice }, { status: 'unavailable', unavailable_reason: 'decision_changed' });
  assert.deepEqual(actions(sqlite).map(a => [a.action, a.target_id]), [
    ['organization_approved', 'org-wait'], ['organization_declined', 'org-auto'], ['organization_approved', 'org-auto'],
    ['organization_declined', 'org-wait'],
  ]);
  assert.equal(await decideAsOperator(db, 'missing', 'approved', actor), 'not_found');
  sqlite.prepare("UPDATE dinkuskit_organization SET status='closed' WHERE organization_id='org-auto'").run();
  assert.equal(await decideAsOperator(db, 'org-auto', 'denied', actor), 'conflict');
});

test('confirming an automatic approval records who checked it', async () => {
  const { sqlite, db } = await fixture();
  assert.equal(await decideAsOperator(db, 'org-auto', 'approved', actor), 'changed');
  assert.equal(sqlite.prepare("SELECT decision FROM dinkuskit_organization_approval_audit WHERE organization_id='org-auto'").get().decision, 'approved');
  assert.equal((await listReviewOrganizations(db)).rows.find(r => r.organizationId === 'org-auto').decidedBy, 'operator@example.test');
  assert.equal(await decideAsOperator(db, 'org-auto', 'approved', actor), 'unchanged');
});

test('suspend signs the person out and blocks them; restore puts them back', async () => {
  const { sqlite, db } = await fixture();
  assert.equal(await setPersonSuspended(db, 'alice', true, actor), 'changed');
  assert.equal(sqlite.prepare("SELECT disabled FROM dinkuskit_account WHERE user_id='alice'").get().disabled, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM session WHERE userId='alice'").get().n, 0);
  assert.equal(await setPersonSuspended(db, 'alice', true, actor), 'unchanged');
  assert.equal((await listPeople(db, 'alice')).rows[0].suspended, true);
  assert.equal(await setPersonSuspended(db, 'alice', false, actor), 'changed');
  assert.equal(sqlite.prepare("SELECT disabled FROM dinkuskit_account WHERE user_id='alice'").get().disabled, 0);
  assert.equal(await setPersonSuspended(db, 'nobody', true, actor), 'not_found');
  assert.deepEqual(actions(sqlite).map(a => a.action), ['person_suspended', 'person_restored']);
  assert.deepEqual((await listPeople(db)).rows.map(p => [p.email, p.phone]), [['bob@example.test', ''], ['alice@example.test', '+15555550100']]);
});

test('cut off one service, then everything left, and log each', async () => {
  const { sqlite, db } = await fixture();
  let [store] = (await listStores(db)).rows;
  assert.deepEqual(store.services, { payments: 'connected', inventory: 'connected', coupons: 'none', ship: 'none' });
  assert.equal(store.ownerEmail, 'alice@example.test');
  assert.equal(await cutOffStore(db, 'site-1', 'payments', actor), 1);
  assert.equal(await cutOffStore(db, 'site-1', 'payments', actor), 0);
  [store] = (await listStores(db)).rows;
  assert.equal(store.services.payments, 'cut_off');
  assert.equal(await cutOffStore(db, 'site-1', null, actor), 1);
  [store] = (await listStores(db, 'shop.example')).rows;
  assert.deepEqual(store.services, { payments: 'cut_off', inventory: 'cut_off', coupons: 'none', ship: 'none' });
  assert.deepEqual(actions(sqlite).map(a => [a.action, a.service]), [['service_cut_off', 'payments'], ['service_cut_off', 'inventory']]);
  assert.equal((await listStores(db, 'no-such-store')).rows.length, 0);
});

test('every admin page and action returns valid Block Kit', async () => {
  const { sqlite, db } = await fixture();
  const ctx = { db, actor };
  const check = async interaction => {
    const response = await handleInteraction(ctx, interaction);
    const result = validateBlockResponse(response);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    return response;
  };
  for (const page of ['/approvals', '/people', '/stores', '/unknown']) await check({ type: 'page_load', page });
  let r = await check({ type: 'block_action', action_id: 'approvals:decline', value: 'org-auto' });
  assert.equal(r.toast.message, 'Business declined.');
  r = await check({ type: 'block_action', action_id: 'approvals:approve', value: 'org-wait' });
  assert.equal(r.toast.message, 'Business approved.');
  r = await check({ type: 'block_action', action_id: 'approvals:approve', value: '../bad id' });
  assert.equal(r.toast.type, 'error');
  r = await check({ type: 'form_submit', action_id: 'people:search', values: { q: 'bob' } });
  assert.equal(JSON.stringify(r.blocks).includes('alice@example.test'), false);
  r = await check({ type: 'block_action', action_id: 'people:suspend', value: JSON.stringify({ id: 'alice', page: 1, q: '' }) });
  assert.match(r.toast.message, /Suspended/);
  r = await check({ type: 'block_action', action_id: 'stores:choose', value: JSON.stringify({ id: 'site-1', service: 'payments', page: 1, q: '' }) });
  assert.match(JSON.stringify(r.blocks), /Yes, cut it off/);
  assert.equal(sqlite.prepare("SELECT revoked FROM dinkuskit_service_grant WHERE service='payments'").get().revoked, 0, 'choosing alone changes nothing');
  r = await check({ type: 'block_action', action_id: 'stores:cut', value: JSON.stringify({ id: 'site-1', service: 'payments', page: 1, q: '' }) });
  assert.equal(r.toast.message, 'Service cut off.');
  r = await check({ type: 'block_action', action_id: 'stores:cut', value: JSON.stringify({ id: 'site-1', service: 'stock', page: 1, q: '' }) });
  assert.equal(r.toast.type, 'error');
  await check({ type: 'block_action', action_id: 'people:page', value: JSON.stringify({ page: 2, q: '' }) });
  await check({ type: 'block_action', action_id: 'stores:sort', value: { column: 'store' } });
});
