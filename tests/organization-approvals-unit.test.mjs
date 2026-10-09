import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalCmsOrigin,
  currentCmsAdmin,
  rejectNonCanonicalCmsMutation,
} from '../src/account/cms-approval-authorization.ts';

function user(overrides = {}) {
  return {
    id: 'cms-1',
    email: 'cms-admin@example.test',
    name: 'CMS Admin',
    avatarUrl: null,
    role: 50,
    emailVerified: true,
    disabled: false,
    data: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function cmsDb(row) {
  const users = {
    selectFrom() {
      return {
        selectAll() { return this; },
        where() { return this; },
        async executeTakeFirst() { return row ? {
          id: row.id, email: row.email, name: null, avatar_url: null, role: row.role,
          email_verified: 1, disabled: row.disabled, data: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } : undefined; },
      };
    },
  };
  return {
    selectFrom: users.selectFrom.bind(users),
  };
}

test('CMS approval authority uses current official user state, not a merchant role', async () => {
  const actor = await currentCmsAdmin(user(), cmsDb({ id: 'cms-1', email: 'cms-admin@example.test', role: 50, disabled: 0 }));
  assert.deepEqual(actor, { id: 'cms-1', email: 'cms-admin@example.test', role: 50, disabled: false });
  assert.equal(await currentCmsAdmin(user(), cmsDb({ id: 'cms-1', email: 'cms-admin@example.test', role: 40, disabled: 0 })), null);
  assert.equal(await currentCmsAdmin(user(), cmsDb({ id: 'cms-1', email: 'cms-admin@example.test', role: 50, disabled: 1 })), null);
});

test('CMS approval provenance requires canonical host and exact Origin', () => {
  const request = new Request('https://dinkuskit.com/account/organization-approvals', { headers: { origin: 'https://dinkuskit.com' } });
  assert.equal(canonicalCmsOrigin(request, 'https://dinkuskit.com'), 'https://dinkuskit.com');
  assert.equal(rejectNonCanonicalCmsMutation(request, 'https://dinkuskit.com'), null);
  assert.equal(rejectNonCanonicalCmsMutation(new Request(request, { headers: { origin: 'https://evil.example' } }), 'https://dinkuskit.com')?.status, 403);
  assert.equal(rejectNonCanonicalCmsMutation(new Request('https://evil.example/account/organization-approvals', { headers: { origin: 'https://evil.example' } }), 'https://dinkuskit.com')?.status, 403);
  assert.equal(canonicalCmsOrigin(new Request('http://127.0.0.1:8787/account/organization-approvals'), 'https://dinkuskit.com'), null);
  assert.equal(canonicalCmsOrigin(new Request('http://127.0.0.1:8787/account/organization-approvals'), 'https://dinkuskit.com', true), 'http://127.0.0.1:8787');
});

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { decideOrganization, claimNotification, finishNotification, dispatchNotification } from '../src/account/organization-approvals.ts';
import { runWithMerchantTransports } from '../src/account/transports.ts';

function fixture() {
  const sqlite = new Database(':memory:');
  for (const file of ['0001_better_auth', '0002_dinkuskit', '0003_store_connect', '0004_account_foundation', '0005_operator_authorization', '0006_organization_approvals']) {
    sqlite.transaction(() => sqlite.exec(readFileSync(`migrations/merchant/${file}.sql`, 'utf8')))();
  }
  sqlite.exec(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('owner','Synthetic','owner@example.test',1,'2026-01-01','2026-01-01');
    INSERT INTO dinkuskit_signup_profile (user_id,email,phone,email_verified,phone_verified,service_channel,promotional_email,promotional_sms,agreement_accepted,created_at)
    VALUES ('owner','owner@example.test','+15555550123',1,0,'email',0,0,1,1);
    INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at)
    VALUES ('pending','Pending','pending_operator','owner','stable-subject','pending_operator','owner',1,1);`);
  let failIntent = false;
  function prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      first() { return sqlite.prepare(sql).get(...values) ?? null; },
      all() { return { results: sqlite.prepare(sql).all(...values) }; },
      run() {
        if (failIntent && sql.includes('INSERT INTO dinkuskit_organization_notification')) throw new Error('injected intent persistence failure');
        return { meta: { changes: sqlite.prepare(sql).run(...values).changes } };
      },
    };
  }
  const db = { prepare, batch: statements => sqlite.transaction(() => statements.map(s => s.run()))() };
  return { sqlite, db, failIntent: (value = true) => { failIntent = value; } };
}
const decision = (db, value = 'approved', id = 'pending') => decideOrganization({ db, organizationId: id,
  decision: value, actorUserId: 'cms-synthetic', actorEmail: 'cms@example.test' });

test('atomic outbox failure rolls back admission and audit; existing auto-admission cannot acquire an audit', async () => {
  const f = fixture();
  try {
    f.failIntent();
    await assert.rejects(decision(f.db), /injected intent/);
    assert.equal(f.sqlite.prepare('SELECT status FROM dinkuskit_organization').get().status, 'pending_operator');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM dinkuskit_organization_approval_audit').get().n, 0);
    f.failIntent(false);
    f.sqlite.exec("UPDATE dinkuskit_organization SET status='active',admission_status='admitted'");
    assert.equal(await decision(f.db), 'conflict');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM dinkuskit_organization_approval_audit').get().n, 0);
  } finally { f.sqlite.close(); }
});

test('missing profile records unavailable intent, repeated/opposed decisions preserve original audit and one outbox row', async () => {
  const f = fixture();
  try {
    f.sqlite.exec('DELETE FROM dinkuskit_signup_profile');
    assert.equal(await decision(f.db, 'denied'), 'decided');
    const audit = f.sqlite.prepare('SELECT * FROM dinkuskit_organization_approval_audit').get();
    const notice = f.sqlite.prepare('SELECT * FROM dinkuskit_organization_notification').get();
    assert.equal(notice.channel, 'none');
    assert.equal(notice.unavailable_reason, 'selected_contact_missing');
    assert.equal(await decision(f.db, 'denied'), 'already_decided');
    assert.equal(await decision(f.db, 'approved'), 'conflict');
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM dinkuskit_organization_approval_audit').get(), audit);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM dinkuskit_organization_notification').get().n, 1);
  } finally { f.sqlite.close(); }
});

test('lease claims fence retries and stale completion; changed contact blocks dispatch', async () => {
  const f = fixture();
  try {
    await decision(f.db);
    const id = f.sqlite.prepare('SELECT notification_id FROM dinkuskit_organization_notification').get().notification_id;
    const first = await claimNotification(f.db, id);
    assert.ok(first);
    assert.equal(await claimNotification(f.db, id), null);
    f.sqlite.prepare('UPDATE dinkuskit_organization_notification SET claimed_at=1').run();
    const next = await claimNotification(f.db, id);
    assert.ok(next);
    assert.notEqual(first.claimToken, next.claimToken);
    assert.equal(await finishNotification(f.db, id, first.claimToken, true), false);
    assert.equal(await finishNotification(f.db, id, next.claimToken, false, 'delivery_failed'), true);
    f.sqlite.exec("UPDATE dinkuskit_signup_profile SET service_channel='phone'");
    let sends = 0;
    await runWithMerchantTransports({ admissionEmail: { async send() { sends++; return {}; } } }, () => dispatchNotification(f.db, id));
    assert.equal(sends, 0);
    assert.equal(f.sqlite.prepare('SELECT status FROM dinkuskit_organization_notification').get().status, 'unavailable');
  } finally { f.sqlite.close(); }
});
