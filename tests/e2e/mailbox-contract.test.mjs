import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSUMER_CAPABILITY,
  createMailboxSelection,
  createOpaqueHandoff,
  selectMailboxMessage as selectAtTime,
} from './mailbox-contract.mjs';

const selectMailboxMessage = (selected, candidates, now = '2026-01-01T00:15:00.000Z') => selectAtTime(selected, candidates, now);

const manifest = {
  version: 1, run_id: 'run-mailbox', owner_repo: 'dinkuskit-website',
  environment: 'local', admission_required: 'manual', required_assistance_refs: [],
  suite: 'first', role: 'merchant', cohort_ref: 'cohort-synthetic', subject_ref: 'subject-synthetic',
  target: {
    target_ref: 'target-local', site_ref: 'site-synthetic', release_ref: 'release-test',
    deployment_ref: 'deployment-local', provenance_class: 'local-fixture',
    source_ref: 'ref-local-fixture', account_ref: 'account-synthetic',
    site_origin: 'http://127.0.0.1:8787/',
  },
  selectors: { resource_refs: ['resource-test'], recipient_refs: ['recipient-test'], capability_refs: ['capability-connect'] },
  timestamps: {
    created_at: '2026-01-01T00:00:00.000Z',
    deadline_at: '2026-01-01T00:45:00.000Z',
    heartbeat_at: '2026-01-01T00:10:00.000Z',
  },
  oracles: [{
    stage_id: 'local-account', owner_repo: 'account-service',
    allowed_environments: ['local'],
    required: [{ kind: 'state', provider_ref: 'provider-local', state_ref: 'state-ready' }],
  }],
  cleanup_oracles: [
    { service: 'retry-suppression', owner_repo: 'ship-service', provider_ref: 'provider-ship' },
    { service: 'authority', owner_repo: 'account-service', provider_ref: 'provider-authority' },
    { service: 'resource-absence', owner_repo: 'template-service', provider_ref: 'provider-resource' },
  ],
};

const allocation = {
  recipient_ref: 'recipient-test', recipient_address: 'identity@mailbox.invalid',
  mailbox_identity: 'mailbox-synthetic', intent: 'sign-in',
  subject: 'Synthetic sign-in', run_id: 'run-mailbox', environment: 'local',
  receive_window: { starts_at: '2026-01-01T00:10:00.000Z', ends_at: '2026-01-01T00:20:00.000Z' },
  origin: 'http://127.0.0.1:8787/', path: '/account/callback',
  browser_context: { role: 'merchant', context_ref: 'context-one', origin: 'http://127.0.0.1:8787/', path: '/account/callback' },
};

const selection = () => createMailboxSelection(structuredClone(manifest), structuredClone(allocation));
const candidate = (changes = {}) => ({
  message_ref: 'message-one', recipient_ref: 'recipient-test',
  recipient_address: 'identity@mailbox.invalid', mailbox_identity: 'mailbox-synthetic',
  intent: 'sign-in', subject: 'Synthetic sign-in', run_id: 'run-mailbox',
  environment: 'local', origin: 'http://127.0.0.1:8787/', path: '/account/callback',
  received_at: '2026-01-01T00:15:00.000Z', placement: 'inbox', ...changes,
});

test('handoff requires the unique message selected by this allocation', () => {
  const selected = selection();
  assert.throws(() => createOpaqueHandoff({ selection: selected, now: '2026-01-01T00:15:00.000Z' }), /matched message/);
  const match = selectMailboxMessage(selected, [candidate()]);
  assert.throws(() => createOpaqueHandoff({ selection: selection(), match, now: '2026-01-01T00:15:00.000Z' }), /matched message/);
  assert.throws(() => selectMailboxMessage(Object.freeze({ ...selected }), [candidate()]), /selection/);
});

test('allocation is bound to manifest target and browser role', () => {
  assert.throws(() => createMailboxSelection(manifest, { ...allocation, browser_context: { ...allocation.browser_context, role: 'cms-admin' } }));
  assert.throws(() => createMailboxSelection(manifest, { ...allocation, origin: 'https://foreign.invalid/', browser_context: { ...allocation.browser_context, origin: 'https://foreign.invalid/' } }));
});

test('boundary errors never retain supplied auth canaries', () => {
  const canary = 'synthetic-auth-canary';
  for (const attempt of [
    () => createMailboxSelection(manifest, { ...allocation, run_id: canary }),
    () => createMailboxSelection(manifest, { ...allocation, origin: `https://fixture.invalid/?token=${canary}` }),
    () => selectMailboxMessage(selection(), [candidate({ message_ref: canary.toUpperCase() })]),
    () => selectMailboxMessage(selection(), [candidate({ origin: `bad:${canary}` })]),
  ]) {
    try { attempt(); assert.fail('expected rejection'); } catch (error) {
      assert.equal(String(error).includes(canary), false);
      assert.equal(JSON.stringify(error).includes(canary), false);
      assert.equal(error.stack.includes(canary), false);
    }
  }
});

function matchedHandoff(options) {
  const selected = options.selection;
  const match = selectMailboxMessage(selected, [candidate()], options.now);
  return createOpaqueHandoff({ ...options, match });
}

test('unique exact fresh match passes and returns only safe correlation metadata', () => {
  const result = selectMailboxMessage(selection(), [candidate()]);
  assert.deepEqual(result, {
    status: 'passed', reason: 'matched', message_ref: 'message-one',
    placement: 'inbox', received_at: '2026-01-01T00:15:00.000Z',
  });
});

test('stale, ambiguous, and every identity mismatch fail closed', () => {
  const cases = [
    [candidate({ received_at: '2026-01-01T00:30:00.000Z' }), 'stale'],
    [candidate(), 'ambiguous'],
    [{ recipient_ref: 'recipient-other' }, 'wrong-recipient'],
    [{ recipient_address: 'other@mailbox.invalid' }, 'wrong-recipient'],
    [{ mailbox_identity: 'mailbox-other' }, 'not-found'],
    [{ subject: 'Other subject' }, 'wrong-subject'],
    [{ intent: 'recover' }, 'wrong-intent'],
    [{ environment: 'hosted-a' }, 'wrong-environment'],
    [{ run_id: 'run-other' }, 'wrong-run'],
    [{ origin: 'http://127.0.0.1:8788/' }, 'wrong-origin'],
    [{ path: '/account/other' }, 'wrong-path'],
  ];
  assert.equal(selectMailboxMessage(selection(), [cases[0][0]]).reason, 'stale');
  assert.equal(selectMailboxMessage(selection(), [candidate(), candidate({ message_ref: 'message-two' })]).reason, 'ambiguous');
  for (const [changes, reason] of cases.slice(2)) assert.equal(selectMailboxMessage(selection(), [candidate(changes)]).reason, reason);
});

test('Spam is received evidence but cannot pass inbox placement', () => {
  const result = selectMailboxMessage(selection(), [candidate({ placement: 'spam' })]);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'received-not-inbox');
  assert.equal(result.placement, 'spam');
});

test('candidate bound and undeclared raw fields are fail closed', () => {
  assert.equal(selectMailboxMessage(selection(), Array.from({ length: 51 }, candidate)).reason, 'candidate-limit');
  assert.throws(() => selectMailboxMessage(selection(), [candidate({ token: 'fixture-only' })]), /undeclared/);
});

test('handoff is one-use, expiring, and bound to the original browser context', () => {
  let calls = 0;
  const handoff = matchedHandoff({
    selection: selection(), now: '2026-01-01T00:15:00.000Z',
    consumer: { capability: CONSUMER_CAPABILITY, consume: ({ capability }) => {
      calls++;
      assert.equal(capability, CONSUMER_CAPABILITY);
      return { status: 'passed' };
    } },
  });
  assert.equal(handoff.redeem({ ...allocation.browser_context, context_ref: 'context-other' }, '2026-01-01T00:15:00.000Z').reason, 'wrong-context');
  assert.equal(handoff.redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z').status, 'passed');
  assert.equal(handoff.redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z').reason, 'already-consumed');
  assert.equal(calls, 1);
  const expired = matchedHandoff({ selection: selection(), now: '2026-01-01T00:15:00.000Z' });
  assert.equal(expired.redeem(allocation.browser_context, '2026-01-01T00:20:00.000Z').reason, 'handoff-expired');
});

test('selection and consumer input mutation cannot widen the frozen handoff', () => {
  const original = selection();
  const handoff = matchedHandoff({ selection: original, now: '2026-01-01T00:15:00.000Z' });
  assert.throws(() => { original.browser_context.context_ref = 'context-other'; }, TypeError);
  const callerContext = { ...allocation.browser_context };
  callerContext.context_ref = 'context-other';
  assert.equal(handoff.redeem(callerContext, '2026-01-01T00:15:00.000Z').reason, 'wrong-context');
  const input = structuredClone(allocation);
  const snapshot = createMailboxSelection(manifest, input);
  input.recipient_address = 'other@mailbox.invalid';
  input.browser_context.context_ref = 'context-other';
  input.receive_window.ends_at = '2026-01-01T00:40:00.000Z';
  assert.equal(snapshot.recipient_address, allocation.recipient_address);
  assert.equal(snapshot.browser_context.context_ref, allocation.browser_context.context_ref);
  assert.equal(snapshot.receive_window.ends_at, allocation.receive_window.ends_at);
  assert.equal(selectMailboxMessage(snapshot, [candidate({ recipient_address: input.recipient_address })]).status, 'blocked');
});

test('missing, unsupported, tool-policy-blocked, and assisted consumers are honest', () => {
  assert.equal(matchedHandoff({ selection: selection(), now: '2026-01-01T00:15:00.000Z' }).redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z').reason, 'consumer-missing');
  assert.equal(matchedHandoff({
    selection: selection(), now: '2026-01-01T00:15:00.000Z',
    consumer: { capability: 'unsupported', consume: () => ({ status: 'passed' }) },
  }).redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z').reason, 'consumer-unsupported');
  assert.equal(matchedHandoff({
    selection: selection(), now: '2026-01-01T00:15:00.000Z',
    consumer: { capability: CONSUMER_CAPABILITY, consume: () => ({ status: 'blocked', reason: 'tool-policy-blocked' }) },
  }).redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z').reason, 'tool-policy-blocked');
  const assisted = matchedHandoff({
    selection: selection(), now: '2026-01-01T00:15:00.000Z',
    consumer: { capability: CONSUMER_CAPABILITY, consume: () => ({ status: 'assisted', assistance_at: '2026-01-01T00:16:00.000Z' }) },
  }).redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z');
  assert.deepEqual(assisted, { status: 'assisted', reason: 'human-assisted', assistance_at: '2026-01-01T00:16:00.000Z', assistance: true });
});

test('consumer exceptions never escape raw text', () => {
  const result = matchedHandoff({
    selection: selection(), now: '2026-01-01T00:15:00.000Z',
    consumer: { capability: CONSUMER_CAPABILITY, consume: () => { throw new Error('private fixture detail'); } },
  }).redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z');
  assert.deepEqual(result, { status: 'blocked', reason: 'consumer-failure' });
});

test('invalid, omitted, backdated redemption time and delayed handoff refuse', () => {
  let calls = 0;
  const selected = selection();
  assert.throws(() => selectAtTime(selected, [candidate()]), /candidate invalid/);
  const match = selectMailboxMessage(selected, [candidate()], '2026-01-01T00:15:00.000Z');
  const transfer = createOpaqueHandoff({ selection: selected, match, now: '2026-01-01T00:15:00.000Z', consumer: {
    capability: CONSUMER_CAPABILITY, consume: () => { calls++; return { status: 'passed' }; },
  } });
  for (const at of [undefined, 'bad-time', '2026-01-01T00:14:59.000Z']) {
    assert.equal(transfer.redeem(allocation.browser_context, at).reason, 'invalid-time');
  }
  assert.equal(transfer.redeem(allocation.browser_context, '2026-01-01T00:20:00.000Z').reason, 'handoff-expired');
  assert.equal(calls, 0);
  assert.throws(() => createOpaqueHandoff({ selection: selected, match, now: '2026-01-01T00:15:01.000Z' }), /matched message/);
  const another = selection();
  const lateMatch = selectMailboxMessage(another, [candidate()], '2026-01-01T00:19:00.000Z');
  assert.throws(() => createOpaqueHandoff({ selection: another, match: lateMatch, now: '2026-01-01T00:20:00.000Z' }), /validity/);
});

test('secret-bearing consumer output is stripped and policy refusal never retries', () => {
  const canary = 'synthetic-auth-output-canary';
  let calls = 0;
  const transfer = matchedHandoff({ selection: selection(), now: '2026-01-01T00:15:00.000Z', consumer: {
    capability: CONSUMER_CAPABILITY, consume: () => { calls++; return { status: 'blocked', reason: 'tool-policy-blocked', raw_url: canary }; },
  } });
  const refused = transfer.redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z');
  assert.equal(refused.reason, 'tool-policy-blocked');
  assert.equal(JSON.stringify(refused).includes(canary), false);
  assert.equal(transfer.redeem(allocation.browser_context, '2026-01-01T00:15:01.000Z').reason, 'already-consumed');
  assert.equal(calls, 1);
  const accepted = matchedHandoff({ selection: selection(), now: '2026-01-01T00:15:00.000Z', consumer: {
    capability: CONSUMER_CAPABILITY, consume: () => ({ status: 'passed', raw_html: canary }),
  } }).redeem(allocation.browser_context, '2026-01-01T00:15:00.000Z');
  assert.equal(JSON.stringify(accepted).includes(canary), false);
});
