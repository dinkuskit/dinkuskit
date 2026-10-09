import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { readDirectory, getPerson, getOrganization, getStore, parseDirectoryPage, OPERATOR_DIRECTORY_SCOPE } from '../src/account/operator-directory.ts';
import { canonicalAccountId } from '../src/account/identity.ts';
import { ACCOUNT_ISSUER } from '../src/account/config.ts';

async function fixture() {
  const sqlite = new Database(':memory:');
  for (const name of ['0001_better_auth', '0002_dinkuskit', '0003_store_connect', '0004_account_foundation']) sqlite.exec(await readFile(`migrations/merchant/${name}.sql`, 'utf8'));
  let afterRead = () => {}, failure = false;
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let values = [];
    const wrapper = { bind(...v) { values = v; return wrapper; }, async first() { if (failure) throw new Error('unavailable'); const row = stmt.get(...values) ?? null; await afterRead(sql); return row; }, async all() { if (failure) return { success: false }; const results = stmt.all(...values); await afterRead(sql); return { success: true, results }; } };
    return wrapper;
  } };
  for (const id of ['operator', 'alice', 'bob']) {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(id, `${id} Synthetic`, `${id}@example.test`);
    sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES (?, ?, 1, 1)').run(id, 'personal-' + id);
  }
  for (const [org, owner] of [['org-a', 'alice'], ['org-b', 'bob']]) {
    sqlite.prepare(`INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at) VALUES (?, ?, 'active', ?, ?, 'admitted', ?, 1, 1)`).run(org, org, owner, 'subject-' + org, owner);
    sqlite.prepare(`INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active', '[]', 1, 1)`).run(org, owner);
  }
  const grants = new Set();
  const runtime = { async authorize({ userId, callerId, resource, scope }) {
    assert.equal(userId, 'operator'); assert.equal(callerId, canonicalAccountId(ACCOUNT_ISSUER, 'personal-operator')); assert.equal(scope, OPERATOR_DIRECTORY_SCOPE);
    return grants.has(`${resource.type}:${resource.id}`);
  } };
  const input = { db, userId: 'operator', runtime, page: 1, pageSize: 1, search: '' };
  return { sqlite, input, grants, setHook(fn) { afterRead = fn; }, fail() { failure = true; } };
}
test('strict pagination rejects malformed, duplicate and excessive values', () => {
  for (const q of ['page=0','page=-1','page=abc','page=1&page=2','page=1.5','page=10001','page_size=51','page_size=0','q=a&q=b','unknown=1']) assert.equal(parseDirectoryPage(new URL('https://example.test/?'+q)), null, q);
  assert.deepEqual(parseDirectoryPage(new URL('https://example.test/?q=%25%5F&page=2&page_size=1')), { search: '%_', page: 2, pageSize: 1 });
});
test('production absence, wrong resource and authorizer errors deny without data', async () => {
  const f = await fixture(); try {
    assert.equal((await readDirectory({ ...f.input, runtime: undefined })).state, 'forbidden');
    assert.equal((await readDirectory(f.input)).state, 'forbidden');
    f.grants.add('directory:directory');
    assert.equal((await getOrganization({ ...f.input, organizationId: 'org-a' })).state, 'forbidden');
    assert.equal((await readDirectory({ ...f.input, runtime: { authorize: async () => { throw new Error('offline'); } } })).state, 'forbidden');
  } finally { f.sqlite.close(); }
});
test('literal search, deterministic list and relation pagination, explicit empty and unavailable', async () => {
  const f = await fixture(); try {
    f.grants.add('directory:directory');
    const first = await readDirectory(f.input), second = await readDirectory({ ...f.input, page: 2 });
    assert.equal(first.state, 'ok'); assert.equal(first.value.people.page.hasNext, true);
    assert.notEqual(first.value.people.rows[0].userId, second.value.people.rows[0].userId);
    assert.equal(first.value.organizations.rows[0].organizationId, 'org-a');
    assert.equal((await readDirectory({ ...f.input, search: '%' })).value.people.rows.length, 0);
    f.sqlite.prepare(`INSERT INTO dinkuskit_membership VALUES ('org-b', 'alice', 'member', 'removed', '[]', 1, 1)`).run();
    for (const grant of ['person:alice','organization:org-a','organization:org-b']) f.grants.add(grant);
    f.grants.delete('organization:org-b');
    assert.equal((await getPerson({ ...f.input, personId: 'alice' })).state, 'forbidden', 'lookahead cannot reveal a foreign membership');
    f.grants.add('organization:org-b');
    const member1 = await getPerson({ ...f.input, personId: 'alice' });
    const member2 = await getPerson({ ...f.input, personId: 'alice', page: 2 });
    assert.equal(member1.value.page.hasNext, true); assert.equal(member2.value.memberships[0].status, 'removed');
    assert.equal((await getPerson({ ...f.input, personId: 'alice', page: 3 })).value.memberships.length, 0);
    f.grants.add('person:missing'); assert.equal((await getPerson({ ...f.input, personId: 'missing' })).state, 'not_found');
    f.fail(); assert.equal((await readDirectory(f.input)).state, 'unavailable');
  } finally { f.sqlite.close(); }
});
test('revoked caller or grant during data/authorization reads never returns partial rows', async () => {
  for (const change of ['disable','subject','revoke','last-authorizer']) {
    const f = await fixture(); try {
      f.grants.add('directory:directory'); let triggered = false;
      if (change === 'last-authorizer') {
        let calls = 0; const original = f.input.runtime.authorize;
        f.input.runtime = { async authorize(args) { const result = await original(args); if (++calls === 2) f.sqlite.prepare("UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'operator'").run(); return result; } };
      } else f.setHook(sql => {
        if (triggered || !sql.includes('ORDER BY lower(name)')) return; triggered = true;
        if (change === 'disable') f.sqlite.prepare("UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = 'operator'").run();
        if (change === 'subject') f.sqlite.prepare("UPDATE dinkuskit_account SET subject = 'changed' WHERE user_id = 'operator'").run();
        if (change === 'revoke') f.grants.clear();
      });
      assert.deepEqual(await readDirectory(f.input), { state: 'forbidden' }, change);
    } finally { f.sqlite.close(); }
  }
});
test('all related organization grants rechecked after later reads', async () => {
  const f = await fixture(); try {
    f.sqlite.prepare(`INSERT INTO dinkuskit_membership VALUES ('org-b', 'alice', 'member', 'active', '[]', 1, 1)`).run();
    for (const g of ['person:alice','organization:org-a','organization:org-b']) f.grants.add(g);
    let revoke = false; const original = f.input.runtime.authorize;
    f.input.runtime = { async authorize(args) { if (args.resource.id === 'org-b' && !revoke) { revoke = true; f.grants.delete('organization:org-a'); } return original(args); } };
    assert.deepEqual(await getPerson({ ...f.input, personId: 'alice', pageSize: 20 }), { state: 'forbidden' });
  } finally { f.sqlite.close(); }
});
test('store connection is bound to current org, subject and service; reassignment fails closed', async () => {
  for (const reassign of [false, true]) {
    const f = await fixture(); try {
      f.sqlite.prepare(`INSERT INTO dinkuskit_site_binding VALUES ('site-a', 'https://site-a.example.test', 'subject-org-a', 'inventory', 0, 1, NULL)`).run();
      const add = f.sqlite.prepare(`INSERT INTO dinkuskit_store_connection (connection_id,client_id,service,site_id,site_origin,callback_uri,code_challenge,challenge,expires_at,interval_seconds,status,account_subject,consented_at,redeemed_at,created_at,organization_id) VALUES (?, 'fixture', ?, 'site-a', 'https://site-a.example.test', 'https://site-a.example.test/callback', 'synthetic', 'synthetic', 9999, 5, ?, ?, 1, 1, ?, ?)`);
      add.run('valid', 'inventory', 'redeemed', 'subject-org-a', 1, 'org-a');
      add.run('foreign', 'inventory', 'FOREIGN_SENTINEL', 'subject-org-b', 2, 'org-b');
      add.run('foreign-service', 'payments', 'OTHER_SERVICE_SENTINEL', 'subject-org-a', 3, 'org-a');
      f.grants.add('store:site-a'); f.grants.add('organization:org-a');
      if (reassign) f.setHook(sql => { if (sql.includes('FROM dinkuskit_store_connection')) f.sqlite.prepare("UPDATE dinkuskit_site_binding SET account_subject = 'subject-org-b' WHERE site_id = 'site-a'").run(); });
      const result = await getStore({ ...f.input, siteId: 'site-a' });
      if (reassign) assert.deepEqual(result, { state: 'forbidden' });
      else { assert.equal(result.value.connection.status, 'redeemed'); assert.doesNotMatch(JSON.stringify(result), /SENTINEL/); }
    } finally { f.sqlite.close(); }
  }
});
