import assert from 'node:assert/strict';
import test from 'node:test';
import { startCmsMerchantTestRuntime, stopRuntime, signup, request } from './helpers/merchant-harness.mjs';
import { createAuthenticatedEditor } from './helpers/emdash-editor.mjs';

const queue = '/account/organization-approvals';
const adminRoute = '/_emdash/api/plugins/dinkuskit-operator/admin';
const adminCall = (runtime, jar, body) => request(runtime, jar, adminRoute, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-emdash-request': '1' }, body: JSON.stringify(body),
});
const adminDecide = (runtime, jar, id, decision) => adminCall(runtime, jar, { type: 'block_action', action_id: decision === 'approved' ? 'approvals:approve' : 'approvals:decline', value: id });
const adminRetry = (runtime, jar, notificationId) => adminCall(runtime, jar, { type: 'block_action', action_id: 'approvals:retry', value: notificationId });
const toastOf = async response => { assert.equal(response.status, 200); const body = await response.json(); return (body.data ?? body).toast; };
const accountSection = (html, id) => {
  const section = html.match(new RegExp(`<section aria-labelledby="admission-${id}"[\\s\\S]*?</section>`));
  assert.ok(section, `Missing admission section ${id}`);
  return section[0];
};
const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });

test('workerd: EmDash Admin decisions in the operator admin, audit, outbox and retry with real sessions', async () => {
  const runtime = await startCmsMerchantTestRuntime();
  try {
    const editor = await createAuthenticatedEditor(runtime);
    assert.equal(editor.ok, true, `CMS fixture stage: ${editor.stage}`);
    const merchant = await signup(runtime, 'approval-owner@example.test');
    assert.equal(merchant.completed.status, 303);
    const configure = async body => {
      const r = await request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify(body) });
      assert.equal(r.status, 200); return r.json();
    };
    const state = async id => (await request(runtime, new Map(), `/__proof/approvals?id=${encodeURIComponent(id)}`)).json();
    const pending = async name => {
      const r = await request(runtime, merchant.jar, '/api/account/organizations', form({ name }));
      assert.equal(r.status, 303);
      return new URL(r.headers.get('location'), runtime.origin).searchParams.get('organization_id');
    };
    const decide = (id, decision, jar = editor.jar) => adminDecide(runtime, jar, id, decision);
    const organizations = await (await request(runtime, merchant.jar, '/api/account/organizations')).json();
    const automatic = organizations.organizations[0].organizationId;
    // The old queue address now opens the admin page.
    for (const path of [queue, `${queue}/${automatic}`]) {
      const moved = await request(runtime, editor.jar, path, { omitOrigin: true });
      assert.equal(moved.status, 303);
      assert.equal(moved.headers.get('location'), '/_emdash/admin/plugins/dinkuskit-operator/approvals');
    }
    assert.equal((await toastOf(await decide(automatic, 'approved'))).message, 'Business approved.');
    assert.equal((await state(automatic)).audit.decision, 'approved', 'confirming an automatic approval is recorded');
    assert.equal((await state(automatic)).notices.length, 0, 'no email for an automatic approval');
    const approved = await pending('Redwood Works');
    const denied = await pending('Lakeside Lab');
    const sms = await pending('SMS example');
    const unverified = await pending('Unverified example');
    const concurrent = await pending('Concurrent example');
    const before = await state(approved);
    const pendingAccount = await request(runtime, merchant.jar, '/account');
    assert.equal(pendingAccount.status, 200);
    assert.match(accountSection(await pendingAccount.text(), approved), /Admission: Pending/);
    assert.match(pendingAccount.headers.get('cache-control'), /private, no-store/);
    const q = await adminCall(runtime, editor.jar, { type: 'page_load', page: '/approvals' });
    assert.equal(q.status, 200);
    assert.match(JSON.stringify(await q.json()), /Redwood Works/);
    for (const jar of [new Map(), merchant.jar]) assert.ok([401, 403].includes((await decide(approved, 'approved', jar)).status));
    await configure({ cms: { role: 40, disabled: 0 } });
    assert.equal((await decide(approved, 'approved')).status, 403, 'demotion applies to existing CMS session');
    await configure({ cms: { role: 50, disabled: 1 } });
    assert.ok([401, 403].includes((await decide(approved, 'approved')).status), 'disabled current CMS user denied');
    assert.equal((await state(approved)).org.status, 'pending_operator');
    await configure({ cms: { role: 50, disabled: 0 }, mode: 'failure' });
    assert.equal((await toastOf(await decide(approved, 'approved'))).message, 'Business approved.');
    let saved = await state(approved);
    assert.equal(saved.org.status, 'active');
    assert.equal(saved.org.admission_status, 'admitted');
    assert.equal(saved.audit.decision, 'approved');
    assert.equal(saved.audit.actor_email, editor.email);
    assert.equal(saved.notices.length, 1);
    assert.equal(saved.notices[0].status, 'pending');
    assert.equal(saved.notices[0].last_error, 'delivery_failed');
    assert.equal(saved.messages.length, 0);
    const approvedAfterDecision = await request(runtime, merchant.jar, '/account');
    const approvedAfterDecisionHtml = await approvedAfterDecision.text();
    assert.match(accountSection(approvedAfterDecisionHtml, approved), /Admission: Admitted/);
    assert.match(accountSection(approvedAfterDecisionHtml, approved), /Email notification is pending/);
    assert.doesNotMatch(approvedAfterDecisionHtml, /delivery_failed|claimToken|actor_user_id/);
    assert.deepEqual(saved.allocations, before.allocations);
    assert.equal(saved.grants.n, 0);
    const originalAudit = saved.audit;
    assert.equal((await toastOf(await decide(approved, 'approved'))).message, 'Already approved.');
    assert.deepEqual((await state(approved)).audit, originalAudit);
    await configure({ mode: 'slow' });
    const retries = await Promise.all([adminRetry(runtime, editor.jar, saved.notices[0].notification_id), adminRetry(runtime, editor.jar, saved.notices[0].notification_id)]);
    assert.ok(retries.every(r => r.status === 200));
    saved = await state(approved);
    assert.equal(saved.notices[0].status, 'delivered');
    assert.equal(saved.messages.length, 1, 'concurrent retries share one delivery claim');
    assert.match(saved.messages[0].subject, /approved/);
    const acceptedAccount = await request(runtime, merchant.jar, '/account');
    const acceptedAccountHtml = await acceptedAccount.text();
    assert.match(acceptedAccountHtml, /Email accepted for sending/);
    assert.match(acceptedAccountHtml, /does not confirm delivery to the recipient/);
    assert.deepEqual(saved.audit, originalAudit);
    await configure({ mode: 'failure' });
    assert.equal((await toastOf(await decide(denied, 'denied'))).message, 'Business declined.');
    const d = await state(denied);
    assert.equal(d.org.status, 'denied');
    assert.equal(d.notices[0].status, 'pending');
    const deniedAccount = await request(runtime, merchant.jar, '/account');
    const deniedAccountHtml = await deniedAccount.text();
    assert.match(accountSection(deniedAccountHtml, denied), /Admission: Denied/);
    assert.match(deniedAccountHtml, /Email notification is pending/);
    assert.equal((await request(runtime, merchant.jar, '/api/account/organizations', form({ action: 'select', organization_id: denied }))).status, 403);
    // Approving a declined business later cancels its unsent "denied" email.
    assert.equal((await toastOf(await decide(denied, 'approved'))).message, 'Business approved.');
    const reversed = await state(denied);
    assert.equal(reversed.org.status, 'active');
    assert.equal(reversed.notices[0].status, 'unavailable');
    assert.equal(reversed.notices[0].unavailable_reason, 'decision_changed');
    assert.equal((await toastOf(await adminRetry(runtime, editor.jar, reversed.notices[0].notification_id))).type, 'info');
    await configure({ mode: 'success', organizationId: sms, profile: { channel: 'phone', emailVerified: 1, phoneVerified: 1 } });
    await toastOf(await decide(sms, 'approved'));
    const smsState = await state(sms);
    assert.equal(smsState.notices[0].status, 'unavailable');
    assert.equal(smsState.notices[0].unavailable_reason, 'sms_unavailable');
    assert.equal(smsState.messages.length, 1, 'no fallback to email');
    const smsAccount = await request(runtime, merchant.jar, '/account');
    const smsAccountHtml = await smsAccount.text();
    assert.match(smsAccountHtml, /SMS notifications are unavailable/);
    assert.doesNotMatch(smsAccountHtml, /sms_unavailable|selected_phone_unverified|provider/);
    await configure({ organizationId: unverified, profile: { channel: 'email', emailVerified: 0, phoneVerified: 1 } });
    await toastOf(await decide(unverified, 'denied'));
    assert.equal((await state(unverified)).notices[0].unavailable_reason, 'selected_email_unverified');
    await configure({ organizationId: concurrent, profile: { channel: 'email', emailVerified: 1, phoneVerified: 0 } });
    const racing = await Promise.all([decide(concurrent, 'approved'), decide(concurrent, 'denied')]);
    assert.ok(racing.every(r => r.status === 200));
    const raceState = await state(concurrent);
    assert.equal(raceState.notices.length, 1, 'only the first answer queues an email');
    assert.deepEqual(raceState.allocations, before.allocations);
  } finally { await stopRuntime(runtime); }
});

test('merchant admission refresh isolates owner notifications, current members and outsiders', async () => {
  const runtime = await startCmsMerchantTestRuntime();
  try {
    const editor = await createAuthenticatedEditor(runtime);
    assert.equal(editor.ok, true);
    const owner = await signup(runtime, 'status-owner@example.test');
    const member = await signup(runtime, 'status-member@example.test');
    const outsider = await signup(runtime, 'status-outsider@example.test');
    const configure = body => request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify(body) });
    const state = async id => (await request(runtime, new Map(), `/__proof/approvals?id=${id}`)).json();
    const account = async jar => {
      const r = await request(runtime, jar, '/account');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'private, no-store');
      return r.text();
    };
    const initial = await (await request(runtime, owner.jar, '/api/account/organizations')).json();
    const automatic = initial.organizations[0].organizationId;
    assert.match(accountSection(await account(owner.jar), automatic), /Admission: Admitted/);
    assert.doesNotMatch(accountSection(await account(owner.jar), automatic), /notification|operator decision/i);
    const created = await request(runtime, owner.jar, '/api/account/organizations', form({ name: 'Private admission example' }));
    const id = new URL(created.headers.get('location'), runtime.origin).searchParams.get('organization_id');
    const manage = (action, email) => request(runtime, owner.jar, '/api/account/memberships', form({ action, organization_id: id, email }));
    assert.equal((await manage('add_member', 'status-member@example.test')).status, 303);
    assert.equal((await request(runtime, member.jar, '/api/account/organizations', form({ action: 'select', organization_id: id }))).status, 303);
    assert.match(accountSection(await account(owner.jar), id), /Admission: Pending/);
    assert.match(accountSection(await account(member.jar), id), /Admission: Pending/);
    const before = await state(id);
    await configure({ mode: 'failure' });
    await toastOf(await adminDecide(runtime, editor.jar, id, 'approved'));
    const ownerHtml = await account(owner.jar);
    const ownerSection = accountSection(ownerHtml, id);
    assert.match(ownerSection, /Admission: Admitted/);
    assert.match(ownerSection, /Email notification is pending/);
    assert.match(ownerSection, /Notification availability does not change this admission decision/);
    assert.match(ownerHtml, /Admission does not connect sites or activate services/);
    const saved = await state(id);
    for (const forbidden of [saved.audit.actor_user_id, saved.audit.actor_email, saved.notices[0].notification_id, 'delivery_failed', '+15555550123']) {
      assert.ok(!ownerSection.includes(forbidden), 'no raw audit, recipient, claim or error disclosure');
    }
    assert.ok(!ownerSection.includes('status-owner@example.test'), 'notification recipient is not rendered');
    const memberSection = accountSection(await account(member.jar), id);
    assert.match(memberSection, /Admission: Admitted/);
    assert.doesNotMatch(memberSection, /notification|accepted for sending|recipient/i);
    assert.doesNotMatch(await account(outsider.jar), /Private admission example|Email notification/);
    assert.ok([401, 403].includes((await adminRetry(runtime, owner.jar, saved.notices[0].notification_id)).status));
    assert.ok([401, 403].includes((await adminDecide(runtime, member.jar, id, 'denied')).status));
    await configure({ mode: 'success' });
    assert.equal((await toastOf(await adminRetry(runtime, editor.jar, saved.notices[0].notification_id))).message, 'Email sent.');
    const accepted = accountSection(await account(owner.jar), id);
    assert.match(accepted, /Email accepted for sending/);
    assert.match(accepted, /does not confirm delivery to the recipient/);
    assert.doesNotMatch(accountSection(await account(member.jar), id), /accepted for sending/);
    await configure({ removeMembership: { organizationId: id, email: 'status-member@example.test' } });
    assert.doesNotMatch(await account(member.jar), /Private admission example/);
    const second = await request(runtime, owner.jar, '/api/account/organizations', form({ name: 'Denied-only example' }));
    const deniedId = new URL(second.headers.get('location'), runtime.origin).searchParams.get('organization_id');
    await configure({ organizationId: deniedId, profile: { channel: 'phone', emailVerified: 1, phoneVerified: 1 } });
    await toastOf(await adminDecide(runtime, editor.jar, deniedId, 'denied'));
    const deniedSection = accountSection(await account(owner.jar), deniedId);
    assert.match(deniedSection, /Admission: Denied/);
    assert.match(deniedSection, /SMS notifications are unavailable/);
    assert.match(deniedSection, /Service connections are unavailable/);
    for (const organizationId of [automatic, id]) await configure({ removeMembership: { organizationId, email: 'status-owner@example.test' } });
    const deniedOnly = await account(owner.jar);
    assert.match(deniedOnly, /No organization is currently selectable/);
    assert.doesNotMatch(deniedOnly, /organization-switcher-form|Switch organization|Employee access/);
    const missing = await request(runtime, owner.jar, '/api/account/organizations', form({ name: 'Missing contact example' }));
    const missingId = new URL(missing.headers.get('location'), runtime.origin).searchParams.get('organization_id');
    await configure({ organizationId: missingId, profile: 'missing' });
    await toastOf(await adminDecide(runtime, editor.jar, missingId, 'denied'));
    assert.match(accountSection(await account(owner.jar), missingId), /Decision notification is unavailable/);
    const after = await state(id);
    assert.deepEqual(after.audit, saved.audit);
    assert.deepEqual(after.allocations, before.allocations);
    assert.equal(after.grants.n, 0);
  } finally { await stopRuntime(runtime); }
});
