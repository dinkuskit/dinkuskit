import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_VERSION, FAILURE_WINDOW_MS, HISTORY_WINDOW_MS, FakeLifecycle,
  assessRun, validateManifest, validateResult,
} from './run-contract.mjs';

const target = {
  target_ref: 'target-local', site_ref: 'site-synthetic', release_ref: 'release-test',
  deployment_ref: 'deployment-local', provenance_class: 'local-fixture',
  source_ref: 'ref-local-fixture', account_ref: 'account-synthetic',
  site_origin: 'http://127.0.0.1:8787/',
};
const manifestBase = {
  version: CONTRACT_VERSION, run_id: 'run-slice-1', owner_repo: 'dinkuskit-website',
  environment: 'local', admission_required: 'manual', required_assistance_refs: [],
  suite: 'first', role: 'merchant', cohort_ref: 'cohort-synthetic', subject_ref: 'subject-synthetic',
  target, selectors: { resource_refs: ['resource-test'], recipient_refs: ['recipient-test'], capability_refs: ['capability-connect'] },
  timestamps: { created_at: '2026-01-01T00:00:00.000Z', deadline_at: '2026-01-01T00:45:00.000Z', heartbeat_at: '2026-01-01T00:10:00.000Z' },
  oracles: [{ stage_id: 'local-account', owner_repo: 'account-service', allowed_environments: ['local', 'hosted-a', 'deployed-b'], required: [{ kind: 'state', provider_ref: 'provider-local', state_ref: 'state-account-ready' }] }],
  cleanup_oracles: [
    {service: 'retry-suppression', owner_repo: 'ship-service', provider_ref: 'provider-ship'},
    {service: 'authority', owner_repo: 'account-service', provider_ref: 'provider-authority'},
    {service: 'resource-absence', owner_repo: 'template-service', provider_ref: 'provider-resource'},
  ],
};
const copy = (value) => structuredClone(value);
const manifest = (changes = {}) => copy({ ...manifestBase, ...changes });
function receipt(changes = {}) {
  return {
    receipt_ref: 'receipt-local', run_id: 'run-slice-1', environment: 'local',
    ...target, stage_id: 'local-account', owner_repo: 'account-service',
    oracle_kind: 'state', provider_ref: 'provider-local', state_ref: 'state-account-ready',
    evidence_hash: 'sha256:' + 'a'.repeat(64), authority_expires_at: null, ...changes,
  };
}
function cleanupEvidence(targetChanges = {}) {
  return manifestBase.cleanup_oracles.map((entry) => receipt({
    ...targetChanges, receipt_ref: `receipt-${entry.service}`, stage_id: `cleanup-${entry.service}`, owner_repo: entry.owner_repo, provider_ref: entry.provider_ref,
    state_ref: entry.service === 'retry-suppression' ? 'retries-suppressed' : entry.service === 'authority' ? 'authority-invalidated' : 'resource-absent',
  }));
}
function result(changes = {}) {
  return {
    version: CONTRACT_VERSION, run_id: 'run-slice-1',
    journey: { status: 'passed', admission: 'manual', assistance_refs: [], human_checkpoint_ref: 'checkpoint-human', evidence: [receipt()] },
    cleanup: { status: 'passed', resource_state: 'removed', evidence: cleanupEvidence() },
    failure: null, ...changes,
  };
}
function life(run = 'run-life', resource = 'resource-life', options = {}) {
  const fixture = new FakeLifecycle('2026-01-01T00:00:00.000Z', options);
  fixture.reserve({ run_id: run, account_ref: 'account-one', ownership_ref: `ownership-${run}`, resource_refs: [resource] });
  return fixture;
}
function safeCleanup(fixture, run) {
  fixture.recordCleanupReceipt(run, { service: 'retry-suppression', receipt_ref: 'receipt-retry' });
  fixture.recordCleanupReceipt(run, { service: 'authority', receipt_ref: 'receipt-authority' });
}

test('all public manifest/result boundaries are allowlisted and hashes are exact', () => {
  assert.deepEqual(validateManifest(copy(manifest())), manifest());
  assert.equal(validateResult(copy(result()), manifest()).run_id, 'run-slice-1');
  assert.throws(() => validateManifest({ ...manifest(), secret: 'nope' }), /undeclared fields/);
  assert.throws(() => validateManifest({ ...manifest(), target: { ...target, query: 'nope' } }), /undeclared fields/);
  assert.throws(() => validateManifest({ ...manifest(), target: { ...target, site_origin: 'https://user:pw@example.invalid/' } }), /userinfo|canonical|loopback/);
  assert.throws(() => validateResult({ ...result(), cleanup: { ...result().cleanup, raw_response: {} } }, manifest()), /undeclared fields/);
  assert.throws(() => validateResult({ ...result(), journey: { ...result().journey, evidence: [receipt({ evidence_hash: 'hash-weak' })] } }, manifest()), /exact hash/);
});

test('manual admission, assistance truth, and helper seeding cannot be implied', () => {
  assert.equal(assessRun(manifest({ required_assistance_refs: ['assistance-operator'] }), result()).status, 'blocked');
  assert.equal(assessRun(manifest(), result({ journey: { ...result().journey, admission: 'automatic', human_checkpoint_ref: null } })).status, 'blocked');
  const assisted = assessRun(manifest({ required_assistance_refs: ['assistance-operator'] }), result({ journey: { ...result().journey, assistance_refs: ['assistance-operator'] } }));
  assert.equal(assisted.status, 'passed');
  assert.equal(assisted.assistance, 'assisted');
  assert.equal(assessRun(manifest({ admission_required: 'any' }), result({ journey: { ...result().journey, admission: 'helper', assistance_refs: [] } })).status, 'blocked');
});

test('every target identity dimension and stage owner are bound, while supplementary evidence is insufficient', () => {
  const fields = ['run_id', 'environment', 'target_ref', 'site_ref', 'release_ref', 'deployment_ref', 'provenance_class', 'source_ref', 'account_ref', 'site_origin', 'stage_id', 'owner_repo', 'provider_ref', 'state_ref'];
  for (const field of fields) {
    const altered = receipt({ [field]: field === 'environment' ? 'hosted-a' : field === 'provenance_class' ? 'test-build' : field === 'run_id' ? 'run-other' : field === 'site_origin' ? 'http://127.0.0.1:8788/' : field === 'source_ref' ? 'ref-wrong-source' : `wrong-${field.replaceAll('_', '-')}` });
    if (field === 'environment') {
      altered.provenance_class = 'test-build';
      altered.site_origin = 'https://different.example.invalid/';
      altered.deployment_ref = 'deployment-a';
    }
    if (field === 'provenance_class') {
      altered.environment = 'hosted-a';
      altered.site_origin = 'https://different.example.invalid/';
      altered.deployment_ref = 'deployment-a';
    }
    if (field === 'deployment_ref') {
      altered.environment = 'hosted-a';
      altered.provenance_class = 'test-build';
      altered.site_origin = 'https://different.example.invalid/';
      altered.deployment_ref = 'deployment-a';
    }
    const attempt = () => assessRun(manifest(), result({ journey: { ...result().journey, evidence: [altered] } }));
    assert.equal(attempt().status, 'blocked', field);
  }
  const screenshot = receipt({ oracle_kind: 'screenshot', provider_ref: 'provider-screen', state_ref: 'state-screen' });
  assert.equal(assessRun(manifest(), result({ journey: { ...result().journey, evidence: [screenshot] } })).status, 'blocked');
  const crossProduct = manifest({ oracles: [{ stage_id: 'registry-stage', owner_repo: 'registry-plugin', allowed_environments: ['hosted-a', 'deployed-b'], required: [{ kind: 'registry', provider_ref: 'provider-registry', state_ref: 'state-installed' }] }], cleanup_oracles: manifestBase.cleanup_oracles });
  const crossReceipt = receipt({ stage_id: 'registry-stage', owner_repo: 'registry-plugin', oracle_kind: 'registry', provider_ref: 'provider-registry', state_ref: 'state-installed' });
  assert.equal(assessRun(crossProduct, result({ journey: { ...result().journey, evidence: [crossReceipt] } })).status, 'blocked', 'local hosted oracle remains blocked');
});

test('local signup cannot satisfy Registry or Stripe; A and B require exact provenance', () => {
  const hostedOracle = [{ stage_id: 'signup', owner_repo: 'merchant-auth', allowed_environments: ['hosted-a', 'deployed-b'], required: [
    { kind: 'provider', provider_ref: 'provider-auth', state_ref: 'state-signed-up' },
    { kind: 'registry', provider_ref: 'provider-registry', state_ref: 'state-installed' },
    { kind: 'stripe', provider_ref: 'provider-stripe', state_ref: 'state-connected' },
  ] }];
  const local = manifest({ oracles: hostedOracle });
  assert.equal(assessRun(local, result({ journey: { ...result().journey, evidence: hostedOracle[0].required.map((r) => receipt({ stage_id: 'signup', owner_repo: 'merchant-auth', oracle_kind: r.kind, provider_ref: r.provider_ref, state_ref: r.state_ref, evidence_hash: 'sha256:' + 'a'.repeat(64), authority_expires_at: null })) } })).status, 'blocked');
  const a = manifest({ environment: 'hosted-a', target: { ...target, target_ref: 'target-a', deployment_ref: 'deployment-a', provenance_class: 'test-build', source_ref: 'ref-a-build', site_origin: 'https://a.example.invalid/' } });
  const aResult = result({ cleanup: {...result().cleanup, evidence: cleanupEvidence({...a.target, environment: 'hosted-a'})}, journey: { ...result().journey, evidence: [receipt({ ...a.target, environment: 'hosted-a' })] } });
  assert.equal(assessRun(a, aResult).status, 'passed');
  const b = manifest({ environment: 'deployed-b', target: { ...target, target_ref: 'target-b', deployment_ref: 'deployment-b', provenance_class: 'public-release', source_ref: 'sha256:' + 'b'.repeat(64), site_origin: 'https://b.example.invalid/' } });
  assert.equal(assessRun(b, result({ cleanup: {...result().cleanup, evidence: cleanupEvidence({...b.target, environment: 'deployed-b'})}, journey: { ...result().journey, evidence: [receipt({ ...b.target, environment: 'deployed-b' })] } })).status, 'passed');
  assert.throws(() => validateManifest({ ...b, target: { ...b.target, provenance_class: 'test-build' } }), /public-release|test-build/);
});

test('failed stage returns public-safe failure, last proof and owning repository', () => {
  const failure = { code: 'provider-timeout', failure_at: '2026-01-01T00:20:00.000Z', expected: 'provider-ready', observed: 'provider-timeout', proof_ref: 'proof-last', owner_repo: 'merchant-auth', next_action: 'retry-provider', last_accepted_receipt_ref: 'receipt-local', owning_stage_repo: 'merchant-auth' };
  const failureOracle = { stage_id: 'merchant-stage', owner_repo: 'merchant-auth', allowed_environments: ['local', 'hosted-a', 'deployed-b'], required: [{ kind: 'state', provider_ref: 'provider-auth', state_ref: 'state-auth-ready' }] };
  const assessed = assessRun(manifest({ oracles: [...manifestBase.oracles, failureOracle] }), result({ journey: { ...result().journey, status: 'failed', evidence: [receipt()] }, failure }));
  assert.equal(assessed.status, 'failed');
  assert.deepEqual(assessed.failure, failure);
  assert.equal(assessed.last_accepted_receipt.receipt_ref, 'receipt-local');
  assert.equal(assessed.owning_stage_repo, 'merchant-auth');
});

test('cleanup receipts are independent and booleans cannot spoof safety', () => {
  const fixture = life();
  fixture.allocate('run-life', 'resource-life');
  fixture.sealEvidence('run-life');
  const removed = fixture.complete('run-life');
  assert.equal(removed.state, 'cleanup-pending');
  assert.equal(fixture.canAdmit(), false);
  safeCleanup(fixture, 'run-life');
  assert.equal(fixture.cleanup('run-life').state, 'removed');
  assert.equal(fixture.cleanup('run-life').state, 'removed');
});

test('allocation intent precedes allocation, selectors and ownership are exact', () => {
  const fixture = life();
  assert.deepEqual(fixture.events.slice(0, 3).map((entry) => entry.type), ['cleanup-ownership-registered', 'cleanup-intent-recorded', 'allocation-started'].slice(0, 2));
  assert.throws(() => fixture.allocate('run-life', 'resource-other'), /outside admitted selector/);
  fixture.allocate('run-life', 'resource-life', { interrupted: true });
  assert.throws(() => fixture.reconcileInterrupted({ run_id: 'run-life', account_ref: 'account-two', ownership_ref: 'ownership-run-life', resource_ref: 'resource-life' }), /account ownership mismatch/);
  assert.throws(() => fixture.reconcileInterrupted({ run_id: 'run-life', account_ref: 'account-one', ownership_ref: 'ownership-other', resource_ref: 'resource-life' }), /cleanup ownership mismatch/);
  assert.equal(fixture.reconcileInterrupted({ run_id: 'run-life', account_ref: 'account-one', ownership_ref: 'ownership-run-life', resource_ref: 'resource-life' }).run_id, 'run-life');
});

test('failure keeps first reason/expiry across restart, late checks and crash reconciliation', () => {
  const fixture = life('run-failure', 'resource-failure');
  fixture.allocate('run-failure', 'resource-failure');
  fixture.advance(20 * 60 * 1000);
  const first = fixture.checkDeadline('run-failure');
  assert.equal(first.failure_reason, 'heartbeat-missing');
  assert.equal(first.expiry_at, '2026-01-01T01:15:00.000Z');
  const restarted = FakeLifecycle.restore(fixture.snapshot());
  restarted.advance(60 * 60 * 1000);
  assert.equal(restarted.fail('run-failure', 'new-reason').failure_reason, 'heartbeat-missing');
  assert.equal(restarted.record('run-failure').expiry_at, first.expiry_at);
  assert.equal(restarted.cleanup('run-failure').state, 'failed');
  const crash = life('run-crash', 'resource-crash');
  crash.allocate('run-crash', 'resource-crash', { interrupted: true });
  crash.fail('run-crash', 'allocation-failed');
  assert.equal(crash.reconcileInterrupted({ run_id: 'run-crash', account_ref: 'account-one', ownership_ref: 'ownership-run-crash', resource_ref: 'resource-crash' }).run_id, 'run-crash');
  assert.equal(crash.record('run-crash').failure_reason, 'allocation-failed');
  assert.equal(crash.record('run-crash').state, 'failed');
});

test('failure cleanup is just-before/at expiry, success is immediate, and history uses terminal time plus fourteen days', () => {
  const failed = life('run-expiry', 'resource-expiry');
  failed.allocate('run-expiry', 'resource-expiry');
  failed.fail('run-expiry', 'test-failure');
  failed.recordCleanupReceipt('run-expiry', { service: 'retry-suppression', receipt_ref: 'retry' });
  failed.recordCleanupReceipt('run-expiry', { service: 'authority', receipt_ref: 'authority' });

  failed.advance(FAILURE_WINDOW_MS - 1);
  assert.equal(failed.cleanup('run-expiry').state, 'failed');
  failed.advance(1);
  assert.equal(failed.cleanup('run-expiry').state, 'removed');
  const success = life('run-success', 'resource-success');
  success.allocate('run-success', 'resource-success'); success.sealEvidence('run-success');
  assert.equal(success.complete('run-success').state, 'cleanup-pending');
  safeCleanup(success, 'run-success');
  assert.equal(success.cleanup('run-success').state, 'removed');
  const terminal = success.record('run-success').terminal_at;
  assert.equal(success.history[0].expires_at, new Date(Date.parse(terminal) + HISTORY_WINDOW_MS).toISOString());
  success.advance(HISTORY_WINDOW_MS); success.purgeHistory(); assert.equal(success.history.length, 0);
});

test('unavailable or ambiguous cleanup blocks admission, retries safely, and budget pause does not stop cleanup', () => {
  const fixture = life('run-retry', 'resource-retry', {});
  fixture.allocate('run-retry', 'resource-retry'); fixture.sealEvidence('run-retry'); fixture.complete('run-retry'); safeCleanup(fixture, 'run-retry');
  fixture.setOperationOutcome('cleanup', 'unavailable');
  assert.equal(fixture.cleanup('run-retry').state, 'cleanup-pending');
  assert.equal(fixture.canAdmit(), false);
  fixture.setOperationOutcome('cleanup', 'success');
  assert.equal(fixture.cleanup('run-retry').state, 'removed');
  const paused = life('run-paused', 'resource-paused');
  paused.setBudgetPaused('run-paused', true); paused.allocate('run-paused', 'resource-paused'); paused.sealEvidence('run-paused'); paused.complete('run-paused'); safeCleanup(paused, 'run-paused');
  assert.equal(paused.cleanup('run-paused').state, 'removed');
});

test('deadline uses heartbeat boundary and snapshots reject obvious tampering without mutable aliases', () => {
  const fixture = life('run-heartbeat', 'resource-heartbeat', { hardDeadlineMs: 45 * 60 * 1000 });
  fixture.allocate('run-heartbeat', 'resource-heartbeat'); fixture.advance(15 * 60 * 1000);
  assert.equal(fixture.checkDeadline('run-heartbeat').failure_reason, 'heartbeat-missing');
  const original = life('run-snapshot', 'resource-snapshot'); original.allocate('run-snapshot', 'resource-snapshot'); original.fail('run-snapshot', 'fixed');
  const snapshot = original.snapshot(); snapshot.records[0].expiry_at = '2026-01-01T99:00:00.000Z';
  assert.throws(() => FakeLifecycle.restore(snapshot), /timestamp|expiry|invalid/);
  const clean = original.snapshot(); const restored = FakeLifecycle.restore(clean); clean.records[0].ownership_ref = 'mutated'; assert.equal(restored.record('run-snapshot').ownership_ref, 'ownership-run-snapshot');
});

test('cleanup result requires same-run service safety and absence, independent of claimed success', () => {
  for (const status of ['failed', 'unknown', 'inconsistent']) {
    const assessed = assessRun(manifest(), result({cleanup: {...result().cleanup, status}}));
    assert.equal(assessed.status, 'incomplete');
    assert.equal(assessed.journey, 'passed');
  }
  for (const service of ['retry-suppression', 'authority', 'resource-absence']) {
    const evidence = cleanupEvidence().filter((entry) => entry.stage_id !== `cleanup-${service}`);
    assert.equal(assessRun(manifest(), result({cleanup: {...result().cleanup, evidence}})).status, 'incomplete', service);
  }
  const wrongRun = cleanupEvidence().map((entry) => ({...entry, run_id: 'run-other'}));
  assert.equal(assessRun(manifest(), result({cleanup: {...result().cleanup, evidence: wrongRun}})).status, 'blocked');
  assert.equal(assessRun(manifest(), result({cleanup: {...result().cleanup, resource_state: 'active'}})).status, 'incomplete');
  assert.throws(() => validateResult(result({cleanup: {...result().cleanup, retry_suppressed: true}})), /undeclared/);
});

test('future authority expiry cannot claim safe cleanup, at-expiry evidence can', () => {
  const evidence = cleanupEvidence().map((entry) => entry.stage_id === 'cleanup-authority'
    ? {...entry, state_ref: 'authority-expired', authority_expires_at: '2026-01-01T00:15:00.000Z'} : entry);
  const output = result({cleanup: {...result().cleanup, evidence}});
  assert.equal(assessRun(manifest(), output, '2026-01-01T00:14:59.999Z').status, 'incomplete');
  assert.equal(assessRun(manifest(), output, '2026-01-01T00:15:00.000Z').status, 'passed');
  const fixture = life('run-authority', 'resource-authority'); fixture.allocate('run-authority', 'resource-authority');
  fixture.sealEvidence('run-authority'); fixture.complete('run-authority');
  fixture.recordCleanupReceipt('run-authority', {service: 'retry-suppression', receipt_ref: 'receipt-retry'});
  fixture.recordCleanupReceipt('run-authority', {service: 'authority', receipt_ref: 'receipt-expiry', authority_expires_at: '2026-01-01T00:05:00.000Z'});
  assert.equal(fixture.cleanup('run-authority').cleanup_status, 'unknown');
  assert.throws(() => fixture.recordCleanupReceipt('run-authority', {service: 'authority', receipt_ref: 'receipt-long', authority_expires_at: '2026-01-01T00:06:00.000Z'}), /five minute/);
  fixture.advance(5 * 60 * 1000); assert.equal(fixture.cleanup('run-authority').state, 'removed');
});

test('local hosted-signup proof is blocked even without Registry or Stripe requirements', () => {
  const stage = {stage_id: 'hosted-signup', owner_repo: 'account-service', allowed_environments: ['hosted-a', 'deployed-b'],
    required: [{kind: 'provider', provider_ref: 'provider-auth', state_ref: 'state-signup'}]};
  const proof = receipt({stage_id: stage.stage_id, oracle_kind: 'provider', provider_ref: 'provider-auth', state_ref: 'state-signup'});
  assert.equal(assessRun(manifest({oracles: [stage]}), result({journey: {...result().journey, evidence: [proof]}})).status, 'blocked');
});

test('A receipt cannot satisfy B; a test build cannot relabel itself as public release', () => {
  const aTarget = {...target, provenance_class: 'test-build', deployment_ref: 'deployment-a', site_origin: 'https://a.example.invalid/'};
  const bTarget = {...target, provenance_class: 'public-release', deployment_ref: 'deployment-b', site_origin: 'https://b.example.invalid/'};
  const b = manifest({environment: 'deployed-b', target: bTarget});
  const attempt = result({journey: {...result().journey, evidence: [receipt({...aTarget, environment: 'hosted-a'})]}});
  assert.equal(assessRun(b, attempt).status, 'blocked');
  assert.throws(() => assessRun(b, result({journey: {...result().journey, evidence: [receipt({...aTarget, environment: 'deployed-b'})]}})), /provenance mismatch/);
});

test('failed stages keep independent evidence, excluding a later screenshot or wrong state', () => {
  const failure = {code: 'provider-timeout', failure_at: '2026-01-01T00:20:00.000Z', expected: 'provider-ready', observed: 'provider-timeout',
    proof_ref: 'proof-last', owner_repo: 'ship-service', next_action: 'inspect-provider', last_accepted_receipt_ref: 'receipt-local', owning_stage_repo: 'ship-service'};
  const output = result({journey: {...result().journey, status: 'failed', evidence: [receipt(), receipt({receipt_ref: 'receipt-screen', oracle_kind: 'screenshot'}), receipt({receipt_ref: 'receipt-wrong', state_ref: 'state-other'})]}, failure});
  const failureOracle = { stage_id: 'ship-stage', owner_repo: 'ship-service', allowed_environments: ['local', 'hosted-a', 'deployed-b'], required: [{ kind: 'state', provider_ref: 'provider-ship', state_ref: 'state-ship' }] };
  const assessed = assessRun(manifest({ oracles: [...manifestBase.oracles, failureOracle] }), output);
  assert.equal(assessed.last_accepted_receipt.receipt_ref, 'receipt-local'); assert.equal(assessed.owning_stage_repo, 'ship-service');
  assert.deepEqual(assessed.failure, failure);
});

test('heartbeat renewal cannot resurrect a missed heartbeat or extend the hard deadline', () => {
  const fixture = life('run-renew', 'resource-renew'); fixture.allocate('run-renew', 'resource-renew');
  for (let i = 0; i < 4; i++) { fixture.advance(10 * 60 * 1000); fixture.heartbeat('run-renew'); }
  fixture.advance(5 * 60 * 1000 - 1); assert.equal(fixture.checkDeadline('run-renew').state, 'active');
  fixture.advance(1); assert.equal(fixture.checkDeadline('run-renew').failure_reason, 'hard-deadline');
  assert.equal(fixture.record('run-renew').failure_at, '2026-01-01T00:45:00.000Z');
  assert.throws(() => fixture.heartbeat('run-renew'), /live run/);
  const late = life('run-late', 'resource-late'); late.allocate('run-late', 'resource-late'); late.advance(2 * FAILURE_WINDOW_MS);
  assert.equal(late.checkDeadline('run-late').failure_reason, 'heartbeat-missing');
  assert.equal(late.record('run-late').expiry_at, '2026-01-01T01:15:00.000Z');
  assert.throws(() => late.heartbeat('run-late'), /live run/);
});

test('injected clock independently declares runner loss', () => {
  let now = Date.parse('2026-01-01T00:00:00.000Z');
  const fixture = new FakeLifecycle('2026-01-01T00:00:00.000Z', {clock: () => now});
  fixture.reserve({run_id: 'run-clock', account_ref: 'account-one', ownership_ref: 'ownership-clock', resource_refs: ['resource-clock']});
  fixture.allocate('run-clock', 'resource-clock'); now += 15 * 60 * 1000;
  assert.equal(fixture.checkDeadline('run-clock').failure_reason, 'heartbeat-missing');
});

test('failure history anchors to first terminal time and cleanup ownership survives history expiry', () => {
  const fixture = life('run-history', 'resource-history'); fixture.allocate('run-history', 'resource-history');
  fixture.advance(1000); fixture.fail('run-history', 'test-failure');
  const terminal = fixture.record('run-history').terminal_at;
  assert.equal(fixture.history[0].expires_at, new Date(Date.parse(terminal) + HISTORY_WINDOW_MS).toISOString());
  fixture.advance(HISTORY_WINDOW_MS); fixture.purgeHistory();
  assert.equal(fixture.history.length, 1, 'unresolved ownership retained');
  safeCleanup(fixture, 'run-history'); assert.equal(fixture.cleanup('run-history').state, 'removed');
  assert.equal(fixture.record('run-history').terminal_at, terminal);
  fixture.purgeHistory(); assert.equal(fixture.history.length, 0);
});

test('absent store alone is unresolved; suppression and authority plus exact absence resolve it', () => {
  const fixture = life('run-absent', 'resource-absent'); fixture.allocate('run-absent', 'resource-absent');
  assert.throws(() => fixture.recordCleanupReceipt('run-absent', {service: 'resource-absence', receipt_ref: 'receipt-absent'}), /pending or failed/);
  fixture.sealEvidence('run-absent'); fixture.complete('run-absent');
  assert.throws(() => fixture.recordCleanupReceipt('run-absent', {service: 'resource-absence', receipt_ref: 'receipt-absent'}), /precede removal/);
  fixture.loseResource('resource-absent');
  assert.equal(fixture.record('run-absent').cleanup_status, 'unknown');
  fixture.recordCleanupReceipt('run-absent', {service: 'resource-absence', receipt_ref: 'receipt-absent'});
  assert.equal(fixture.cleanup('run-absent').state, 'cleanup-pending');
  safeCleanup(fixture, 'run-absent'); assert.equal(fixture.cleanup('run-absent').state, 'removed');
});

test('admission is blocked by active runs, budget pause and unknown or ambiguous cleanup', () => {
  const fixture = life('run-budget', 'resource-budget');
  const reservation = {run_id: 'run-new', account_ref: 'account-one', ownership_ref: 'ownership-new', resource_refs: ['resource-new']};
  assert.throws(() => fixture.reserve(reservation), /admission/);
  fixture.allocate('run-budget', 'resource-budget'); fixture.sealEvidence('run-budget');
  assert.equal(fixture.complete('run-budget').state, 'cleanup-pending');
  safeCleanup(fixture, 'run-budget');
  fixture.setOperationOutcome('cleanup', 'ambiguous'); assert.equal(fixture.cleanup('run-budget').cleanup_status, 'failed');
  assert.throws(() => fixture.reserve(reservation), /admission/);
  fixture.setBudgetPaused('run-budget', true); fixture.setOperationOutcome('cleanup', 'success');
  assert.equal(fixture.cleanup('run-budget').state, 'removed'); assert.equal(fixture.canAdmit(), false);
  fixture.setBudgetPaused('run-budget', false); assert.equal(fixture.reserve(reservation).state, 'reserved');
});

test('cross-run/account similarly named fake resource is refused without deletion', () => {
  const fixture = life('run-owned', 'resource-owned'); fixture.allocate('run-owned', 'resource-owned', {interrupted: true});
  fixture.fail('run-owned', 'allocation-failed');
  const data = fixture.snapshot(); data.resources[0] = {...data.resources[0], run_id: 'run-other', account_ref: 'account-other'};
  const restored = FakeLifecycle.restore(data);
  assert.equal(restored.reconcileInterrupted({run_id: 'run-owned', account_ref: 'account-one', ownership_ref: 'ownership-run-owned', resource_ref: 'resource-owned'}).cleanup_status, 'failed');
  safeCleanup(restored, 'run-owned'); restored.advance(FAILURE_WINDOW_MS);
  assert.equal(restored.cleanup('run-owned').state, 'failed'); assert.equal(restored.snapshot().resources.length, 1);
  assert.equal(restored.canAdmit(), false);
});

test('strict restart boundary rejects extra fields and expiry/deadline tampering', () => {
  const fixture = life('run-strict', 'resource-strict'); fixture.allocate('run-strict', 'resource-strict'); fixture.fail('run-strict', 'test-failure');
  for (const mutate of [
    (s) => {s.records[0].secret = 'nope';}, (s) => {s.resources[0].token = 'nope';},
    (s) => {s.events[0].cookie = 'nope';}, (s) => {s.records[0].expiry_at = '2026-01-01T02:00:00.000Z';},
    (s) => {s.records[0].deadline_at = '2026-01-01T01:00:00.000Z';},
  ]) { const snapshot = fixture.snapshot(); mutate(snapshot); assert.throws(() => FakeLifecycle.restore(snapshot)); }
  assert.throws(() => fixture.recordCleanupReceipt('run-strict', {service: 'authority', receipt_ref: 'receipt-safe', token: 'nope'}), /undeclared/);
  assert.throws(() => validateManifest({...manifest(), timestamps: {...manifest().timestamps, created_at: '2026-02-30T00:00:00.000Z'}}), /canonical/);
});

test('cleanup receipts are refused in reserved and active states, requiring cleanup-pending or failed', () => {
  const f = life('run-receipt-state', 'resource-receipt-state');
  assert.throws(() => f.recordCleanupReceipt('run-receipt-state', { service: 'retry-suppression', receipt_ref: 'receipt-stale' }), /pending or failed/);
  f.allocate('run-receipt-state', 'resource-receipt-state');
  assert.throws(() => f.recordCleanupReceipt('run-receipt-state', { service: 'retry-suppression', receipt_ref: 'receipt-stale' }), /pending or failed/);
  f.sealEvidence('run-receipt-state');
  const pending = f.complete('run-receipt-state');
  assert.equal(pending.state, 'cleanup-pending');
  assert.equal(f.canAdmit(), false);
  f.recordCleanupReceipt('run-receipt-state', { service: 'retry-suppression', receipt_ref: 'receipt-retry' });
  f.recordCleanupReceipt('run-receipt-state', { service: 'authority', receipt_ref: 'receipt-authority' });
  const cleaned = f.cleanup('run-receipt-state');
  assert.equal(cleaned.cleanup_status, 'passed');
  assert.equal(cleaned.state, 'removed');
  assert.equal(f.canAdmit(), true);

  const failed = life('run-receipt-fail', 'resource-receipt-fail');
  failed.allocate('run-receipt-fail', 'resource-receipt-fail');
  failed.fail('run-receipt-fail', 'explicit-fail');
  assert.equal(failed.record('run-receipt-fail').state, 'failed');
  failed.recordCleanupReceipt('run-receipt-fail', { service: 'retry-suppression', receipt_ref: 'receipt-retry-fail' });
  failed.recordCleanupReceipt('run-receipt-fail', { service: 'authority', receipt_ref: 'receipt-authority-fail' });
  assert.equal(failed.cleanup('run-receipt-fail').state, 'failed');
  failed.advance(FAILURE_WINDOW_MS);
  const failCleaned = failed.cleanup('run-receipt-fail');
  assert.equal(failCleaned.cleanup_status, 'passed');
  assert.equal(failCleaned.state, 'removed');
  assert.equal(failed.canAdmit(), true);
});

test('validateResult requires descriptor when journey fails, preserving unknown and other outcomes', () => {
  const failedNoDescriptor = {
    version: CONTRACT_VERSION,
    run_id: 'run-fail-desc',
    journey: { status: 'failed', admission: 'automatic', assistance_refs: [], human_checkpoint_ref: null, evidence: [] },
    cleanup: { status: 'unknown', resource_state: 'failed', evidence: [] },
    failure: null,
  };
  assert.throws(() => validateResult(failedNoDescriptor), /failure descriptor|descriptor/);

  const validFailure = {
    code: 'provider-timeout',
    failure_at: '2026-01-01T00:20:00.000Z',
    expected: 'provider-ready',
    observed: 'provider-timeout',
    proof_ref: 'proof-fixture',
    owner_repo: 'test-repo',
    next_action: 'retry-operation',
    last_accepted_receipt_ref: null,
    owning_stage_repo: 'test-repo',
  };
  const failedWithDescriptor = { ...failedNoDescriptor, failure: validFailure };
  assert.equal(validateResult(failedWithDescriptor).failure.code, 'provider-timeout');

  const unknownNull = {
    version: CONTRACT_VERSION,
    run_id: 'run-unknown',
    journey: { status: 'unknown', admission: 'automatic', assistance_refs: [], human_checkpoint_ref: null, evidence: [] },
    cleanup: { status: 'unknown', resource_state: 'failed', evidence: [] },
    failure: null,
  };
  assert.equal(validateResult(unknownNull).failure, null);

  const unknownWithDesc = { ...unknownNull, failure: validFailure };
  assert.equal(validateResult(unknownWithDesc).failure.code, 'provider-timeout');

  const passedNull = {
    version: CONTRACT_VERSION,
    run_id: 'run-pass',
    journey: { status: 'passed', admission: 'manual', assistance_refs: [], human_checkpoint_ref: 'checkpoint-human', evidence: [receipt()] },
    cleanup: { status: 'passed', resource_state: 'removed', evidence: cleanupEvidence() },
    failure: null,
  };
  assert.equal(validateResult(passedNull).failure, null);
});

test('targetShape rejects deployment-local for all nonlocal provenance including public-release', () => {
  const deployedBManifest = {
    version: CONTRACT_VERSION,
    run_id: 'run-deployed-b',
    owner_repo: 'website',
    environment: 'deployed-b',
    admission_required: 'any',
    required_assistance_refs: [],
    suite: 'first',
    role: 'merchant',
    cohort_ref: 'cohort-fixture',
    subject_ref: 'subject-fixture',
    target: {
      target_ref: 'target-fixture',
      site_ref: 'site-fixture',
      release_ref: 'release-fixture',
      deployment_ref: 'deployment-local',
      provenance_class: 'public-release',
      source_ref: 'sha256:' + 'b'.repeat(64),
      account_ref: 'account-fixture',
      site_origin: 'https://fixture.example.invalid/',
    },
    selectors: { resource_refs: ['resource-fixture'], recipient_refs: ['recipient-fixture'], capability_refs: ['capability-fixture'] },
    timestamps: { created_at: '2026-01-01T00:00:00.000Z', heartbeat_at: '2026-01-01T00:01:00.000Z', deadline_at: '2026-01-01T00:45:00.000Z' },
    oracles: [{ stage_id: 'stage-fixture', owner_repo: 'website', allowed_environments: ['deployed-b'], required: [{ kind: 'state', provider_ref: 'provider-fixture', state_ref: 'state-fixture' }] }],
    cleanup_oracles: [
      { service: 'retry-suppression', owner_repo: 'website', provider_ref: 'provider-fixture' },
      { service: 'authority', owner_repo: 'website', provider_ref: 'provider-fixture' },
      { service: 'resource-absence', owner_repo: 'website', provider_ref: 'provider-fixture' },
    ],
  };
  assert.throws(() => validateManifest(deployedBManifest), /deployment is invalid/);

  const validDeployedB = {
    ...deployedBManifest,
    target: { ...deployedBManifest.target, deployment_ref: 'deployment-b' },
  };
  assert.equal(validateManifest(validDeployedB).target.deployment_ref, 'deployment-b');

  const validLocal = {
    ...deployedBManifest,
    environment: 'local',
    target: {
      ...deployedBManifest.target,
      deployment_ref: 'deployment-local',
      provenance_class: 'local-fixture',
      source_ref: 'ref-local-fixture',
      site_origin: 'http://127.0.0.1:8787/',
    },
    oracles: [{ stage_id: 'stage-fixture', owner_repo: 'website', allowed_environments: ['local'], required: [{ kind: 'state', provider_ref: 'provider-fixture', state_ref: 'state-fixture' }] }],
  };
  assert.equal(validateManifest(validLocal).target.deployment_ref, 'deployment-local');
});

test('hosted-a and deployed-b reject loopback origins while preserving local fixtures and synthetic https', () => {
  const hostedManifest = (site_origin) => manifest({
    environment: 'hosted-a',
    target: { ...target, target_ref: 'target-a', deployment_ref: 'deployment-a', provenance_class: 'test-build', source_ref: 'ref-a-build', site_origin },
    oracles: [{ stage_id: 'local-account', owner_repo: 'account-service', allowed_environments: ['hosted-a'], required: [{ kind: 'state', provider_ref: 'provider-local', state_ref: 'state-account-ready' }] }],
  });
  const deployedManifest = (site_origin) => manifest({
    environment: 'deployed-b',
    target: { ...target, target_ref: 'target-b', deployment_ref: 'deployment-b', provenance_class: 'public-release', source_ref: 'sha256:' + 'b'.repeat(64), site_origin },
    oracles: [{ stage_id: 'local-account', owner_repo: 'account-service', allowed_environments: ['deployed-b'], required: [{ kind: 'state', provider_ref: 'provider-local', state_ref: 'state-account-ready' }] }],
  });

  for (const origin of ['https://localhost/', 'https://localhost./', 'https://test.localhost/', 'https://127.0.0.1/', 'https://127.2.3.4/', 'https://[::1]/', 'https://[::ffff:7f00:1]/']) {
    assert.throws(() => validateManifest(hostedManifest(origin)), /loopback origin/);
    assert.throws(() => validateManifest(deployedManifest(origin)), /loopback origin/);
    assert.throws(() => validateResult(result({ journey: { ...result().journey, evidence: [receipt({ environment: 'hosted-a', provenance_class: 'test-build', site_origin: origin })] } })), /loopback origin/);
    assert.throws(() => validateResult(result({ journey: { ...result().journey, evidence: [receipt({ environment: 'deployed-b', provenance_class: 'public-release', site_origin: origin })] } })), /loopback origin/);
  }

  // Preserves valid local fixtures
  for (const local of ['http://127.0.0.1:8787/', 'http://localhost:8787/', 'http://[::1]:8787/']) {
    assert.equal(validateManifest(manifest({ target: { ...target, site_origin: local } })).target.site_origin, local);
    assert.equal(validateResult(result({ journey: { ...result().journey, evidence: [receipt({ site_origin: local })] } })).journey.evidence[0].site_origin, local);
  }

  // Preserves synthetic HTTPS hosted .invalid origins
  assert.equal(validateManifest(hostedManifest('https://a.example.invalid/')).target.site_origin, 'https://a.example.invalid/');
  assert.equal(validateManifest(deployedManifest('https://b.example.invalid/')).target.site_origin, 'https://b.example.invalid/');
});

test('failed result attribution binds owning_stage_repo and last_accepted_receipt_ref to declared manifest stage evidence', () => {
  const validFailure = {
    code: 'provider-timeout', failure_at: '2026-01-01T00:20:00.000Z', expected: 'provider-ready', observed: 'provider-timeout',
    proof_ref: 'proof-fixture', owner_repo: 'account-service', next_action: 'retry-provider',
    last_accepted_receipt_ref: null, owning_stage_repo: 'account-service',
  };

  // 1. Arbitrary owning_stage_repo not declared in manifest.oracles must be rejected
  assert.throws(() => assessRun(manifest(), result({
    journey: { ...result().journey, status: 'failed', evidence: [receipt()] },
    failure: { ...validFailure, owning_stage_repo: 'untrusted-arbitrary-repo', last_accepted_receipt_ref: 'receipt-local' },
  })), /stage ownership|owning_stage_repo/);

  // 2. Nonexistent last_accepted_receipt_ref when failure occurs before successful stages must be rejected
  assert.throws(() => assessRun(manifest(), result({
    journey: { ...result().journey, status: 'failed', evidence: [] },
    failure: { ...validFailure, owning_stage_repo: 'account-service', last_accepted_receipt_ref: 'nonexistent-receipt' },
  })), /accepted stage evidence|last_accepted_receipt_ref/);

  // 3. Nonexistent / mismatching last_accepted_receipt_ref when failure occurs after successful stage must be rejected
  assert.throws(() => assessRun(manifest(), result({
    journey: { ...result().journey, status: 'failed', evidence: [receipt()] },
    failure: { ...validFailure, owning_stage_repo: 'account-service', last_accepted_receipt_ref: 'receipt-fabricated' },
  })), /accepted stage evidence|last_accepted_receipt_ref/);

  // 4. Preserve explicit null last receipt for failure before successful stages
  const assessedBefore = assessRun(manifest(), result({
    journey: { ...result().journey, status: 'failed', evidence: [] },
    failure: { ...validFailure, owning_stage_repo: 'account-service', last_accepted_receipt_ref: null },
  }));
  assert.equal(assessedBefore.status, 'failed');
  assert.equal(assessedBefore.last_accepted_receipt, null);
  assert.equal(assessedBefore.owning_stage_repo, 'account-service');

  // 5. Preserve consistent valid failure descriptor after successful stages
  const assessedAfter = assessRun(manifest(), result({
    journey: { ...result().journey, status: 'failed', evidence: [receipt()] },
    failure: { ...validFailure, owning_stage_repo: 'account-service', last_accepted_receipt_ref: 'receipt-local' },
  }));
  assert.equal(assessedAfter.status, 'failed');
  assert.equal(assessedAfter.last_accepted_receipt.receipt_ref, 'receipt-local');
  assert.equal(assessedAfter.owning_stage_repo, 'account-service');
});

test("FakeLifecycle.restore rejects malformed restart states and preserves valid restoration", () => {
  // 1. Repro: reserve+allocate active resource, snapshot, change state to failed (with null failure/terminal metadata).
  // In buggy code, this was accepted; cleanup immediately returned removed/passed with zero history and canAdmit true.
  const activeLife = life("run-repro-fail", "resource-repro-fail");
  activeLife.allocate("run-repro-fail", "resource-repro-fail");
  const malformedFailed = activeLife.snapshot();
  malformedFailed.records[0].state = "failed";
  assert.throws(() => FakeLifecycle.restore(malformedFailed), /failed state requires failure metadata/);

  // 2. Snapshot in cleanup-pending state requires terminal metadata and rejects failure metadata
  const liveForPending = life("run-pending", "resource-pending");
  liveForPending.allocate("run-pending", "resource-pending");
  liveForPending.sealEvidence("run-pending");
  liveForPending.complete("run-pending");
  const pendingSnap = liveForPending.snapshot();
  assert.equal(pendingSnap.records[0].state, "cleanup-pending");

  const missingTerminal = structuredClone(pendingSnap);
  missingTerminal.records[0].terminal_at = null;
  missingTerminal.records[0].history_expires_at = null;
  assert.throws(() => FakeLifecycle.restore(missingTerminal), /cleanup-pending requires terminal metadata/);

  const pendingWithFailure = structuredClone(pendingSnap);
  pendingWithFailure.records[0].failure_at = "2026-01-01T00:00:00.000Z";
  assert.throws(() => FakeLifecycle.restore(pendingWithFailure), /cleanup-pending cannot have failure metadata/);

  // 3. Obvious state consistency at this same boundary: live runs cannot have failure or terminal metadata
  const liveSnap = activeLife.snapshot();
  const liveWithCleanupReceipts = structuredClone(liveSnap);
  liveWithCleanupReceipts.records[0].receipts = [
    { service: 'retry-suppression', receipt_ref: 'receipt-early-retry', authority_expires_at: null },
    { service: 'authority', receipt_ref: 'receipt-early-authority', authority_expires_at: null },
  ];
  assert.throws(() => FakeLifecycle.restore(liveWithCleanupReceipts), /live state cannot have cleanup receipts/);
  assert.equal(FakeLifecycle.restore(liveSnap).record('run-repro-fail').state, 'active');
  const liveWithFailure = structuredClone(liveSnap);
  liveWithFailure.records[0].failure_at = "2026-01-01T00:00:00.000Z";
  assert.throws(() => FakeLifecycle.restore(liveWithFailure), /live state cannot have failure metadata/);

  const liveWithTerminal = structuredClone(liveSnap);
  liveWithTerminal.records[0].terminal_at = "2026-01-01T00:00:00.000Z";
  assert.throws(() => FakeLifecycle.restore(liveWithTerminal), /live state cannot have terminal metadata/);

  const reservedLife = life("run-reserved", "resource-reserved");
  const reservedSnap = reservedLife.snapshot();
  const reservedWithAlloc = structuredClone(reservedSnap);
  reservedWithAlloc.records[0].resource_ref = "resource-reserved";
  assert.throws(() => FakeLifecycle.restore(reservedWithAlloc), /reserved state cannot have allocated resource/);

  // 4. Failed state requires retry suppression
  const validFailedLife = life("run-valid-fail", "resource-valid-fail");
  validFailedLife.allocate("run-valid-fail", "resource-valid-fail");
  validFailedLife.fail("run-valid-fail", "explicit-failure");
  const validFailedSnap = validFailedLife.snapshot();
  const failedNoRetry = structuredClone(validFailedSnap);
  failedNoRetry.records[0].retry_suppression_required = false;
  assert.throws(() => FakeLifecycle.restore(failedNoRetry), /failed state requires retry suppression/);

  // 5. Valid restoration of failed run preserves failure window and terminal history
  const restoredFailed = FakeLifecycle.restore(validFailedSnap);
  safeCleanup(restoredFailed, "run-valid-fail");
  assert.equal(restoredFailed.cleanup("run-valid-fail").state, "failed");
  assert.equal(restoredFailed.canAdmit(), false);
  restoredFailed.advance(FAILURE_WINDOW_MS);
  const cleanedFailed = restoredFailed.cleanup("run-valid-fail");
  assert.equal(cleanedFailed.state, "removed");
  assert.equal(cleanedFailed.cleanup_status, "passed");
  assert.equal(restoredFailed.canAdmit(), true);
  assert.equal(restoredFailed.history.length, 1);
  assert.equal(restoredFailed.history[0].run_id, "run-valid-fail");

  // 6. Valid restoration of cleanup-pending run
  const restoredPending = FakeLifecycle.restore(pendingSnap);
  safeCleanup(restoredPending, "run-pending");
  const cleanedPending = restoredPending.cleanup("run-pending");
  assert.equal(cleanedPending.state, "removed");
  assert.equal(cleanedPending.cleanup_status, "passed");
  assert.equal(restoredPending.canAdmit(), true);
  assert.equal(restoredPending.history.length, 1);
  assert.equal(restoredPending.history[0].run_id, "run-pending");
});

test("reconcileInterrupted enforces deadlines before reconciliation, preserving failure and owned identity", () => {
  // 1. Late heartbeat reconciliation: advance 16 min (past default 15 min heartbeat)
  const fixtureHb = life("run-interrupted-hb", "resource-interrupted-hb");
  fixtureHb.allocate("run-interrupted-hb", "resource-interrupted-hb", { interrupted: true });
  fixtureHb.advance(16 * 60 * 1000);
  const recHb = fixtureHb.reconcileInterrupted({
    run_id: "run-interrupted-hb", account_ref: "account-one",
    ownership_ref: "ownership-run-interrupted-hb", resource_ref: "resource-interrupted-hb",
  });
  assert.equal(recHb.resource_ref, "resource-interrupted-hb");
  const rHb = fixtureHb.record("run-interrupted-hb");
  assert.equal(rHb.state, "failed");
  assert.equal(rHb.failure_reason, "heartbeat-missing");
  assert.equal(rHb.failure_at, "2026-01-01T00:15:00.000Z");
  assert.equal(rHb.resource_ref, "resource-interrupted-hb");
  safeCleanup(fixtureHb, "run-interrupted-hb");
  fixtureHb.advance(FAILURE_WINDOW_MS);
  const cleanedHb = fixtureHb.cleanup("run-interrupted-hb");
  assert.equal(cleanedHb.state, "removed");
  assert.equal(cleanedHb.cleanup_status, "passed");

  // 2. Late hard deadline reconciliation: keep heartbeat alive, advance 46 min (past 45 min hard deadline)
  const fixtureHard = life("run-interrupted-hard", "resource-interrupted-hard");
  fixtureHard.allocate("run-interrupted-hard", "resource-interrupted-hard", { interrupted: true });
  fixtureHard.advance(14 * 60 * 1000); fixtureHard.heartbeat("run-interrupted-hard");
  fixtureHard.advance(14 * 60 * 1000); fixtureHard.heartbeat("run-interrupted-hard");
  fixtureHard.advance(14 * 60 * 1000); fixtureHard.heartbeat("run-interrupted-hard");
  fixtureHard.advance(4 * 60 * 1000); // 46 minutes total
  const recHard = fixtureHard.reconcileInterrupted({
    run_id: "run-interrupted-hard", account_ref: "account-one",
    ownership_ref: "ownership-run-interrupted-hard", resource_ref: "resource-interrupted-hard",
  });
  assert.equal(recHard.resource_ref, "resource-interrupted-hard");
  const rHard = fixtureHard.record("run-interrupted-hard");
  assert.equal(rHard.state, "failed");
  assert.equal(rHard.failure_reason, "hard-deadline");
  assert.equal(rHard.failure_at, "2026-01-01T00:45:00.000Z");
  assert.equal(rHard.resource_ref, "resource-interrupted-hard");
  safeCleanup(fixtureHard, "run-interrupted-hard");
  fixtureHard.advance(FAILURE_WINDOW_MS);
  assert.equal(fixtureHard.cleanup("run-interrupted-hard").state, "removed");

  // 3. Timely reconciliation: advance 5 min (within heartbeat)
  const fixtureTimely = life("run-timely", "resource-timely");
  fixtureTimely.allocate("run-timely", "resource-timely", { interrupted: true });
  fixtureTimely.advance(5 * 60 * 1000);
  const recTimely = fixtureTimely.reconcileInterrupted({
    run_id: "run-timely", account_ref: "account-one",
    ownership_ref: "ownership-run-timely", resource_ref: "resource-timely",
  });
  assert.equal(recTimely.resource_ref, "resource-timely");
  const rTimely = fixtureTimely.record("run-timely");
  assert.equal(rTimely.state, "active");
  assert.equal(rTimely.failure_at, null);

  // 4. Previously failed recovery: first failure time/expiry must not be reset
  const fixturePrev = life("run-prev-fail", "resource-prev-fail");
  fixturePrev.allocate("run-prev-fail", "resource-prev-fail", { interrupted: true });
  fixturePrev.advance(5 * 60 * 1000);
  const tFail = "2026-01-01T00:05:00.000Z";
  fixturePrev.fail("run-prev-fail", "early-fault", tFail);
  const firstFail = fixturePrev.record("run-prev-fail");
  assert.equal(firstFail.failure_at, tFail);
  assert.equal(firstFail.failure_reason, "early-fault");
  fixturePrev.advance(50 * 60 * 1000); // advance past both heartbeat and hard deadline
  const recPrev = fixturePrev.reconcileInterrupted({
    run_id: "run-prev-fail", account_ref: "account-one",
    ownership_ref: "ownership-run-prev-fail", resource_ref: "resource-prev-fail",
  });
  assert.equal(recPrev.resource_ref, "resource-prev-fail");
  const rPrev = fixturePrev.record("run-prev-fail");
  assert.equal(rPrev.state, "failed");
  assert.equal(rPrev.failure_at, tFail);
  assert.equal(rPrev.failure_reason, "early-fault");
  assert.equal(rPrev.expiry_at, firstFail.expiry_at);
});

test("FakeLifecycle.restore validates known-owner resource/selector consistency and excludes removed-run resources while preserving foreign refusal", () => {
  // 1. Resource attributed to an exact known run/account/ownership outside that run's admitted selector must be rejected
  const activeFixture = life("run-selector-check", "resource-admitted");
  activeFixture.allocate("run-selector-check", "resource-admitted");
  const snapOutsideSelector = activeFixture.snapshot();
  snapOutsideSelector.resources[0].resource_ref = "resource-unadmitted";
  assert.throws(() => FakeLifecycle.restore(snapOutsideSelector), /resource outside admitted selector/);

  // 2. Removed run leaving owned resource outside or within selector must be rejected, preventing owned resources when canAdmit is true
  const removedFixture = life("run-removed-owned", "resource-removed-owned");
  removedFixture.allocate("run-removed-owned", "resource-removed-owned");
  removedFixture.sealEvidence("run-removed-owned");
  removedFixture.complete("run-removed-owned");
  safeCleanup(removedFixture, "run-removed-owned");
  const cleaned = removedFixture.cleanup("run-removed-owned");
  assert.equal(cleaned.state, "removed");
  assert.equal(removedFixture.canAdmit(), true);
  const snapRemoved = removedFixture.snapshot();
  assert.equal(snapRemoved.resources.length, 0);

  // 2a. Attempt to restore with resource attributed to removed run outside selector
  const snapRemovedOutside = structuredClone(snapRemoved);
  snapRemovedOutside.resources.push({
    resource_ref: "resource-outside-removed",
    run_id: "run-removed-owned",
    account_ref: "account-one",
    ownership_ref: "ownership-run-removed-owned",
  });
  assert.throws(() => FakeLifecycle.restore(snapRemovedOutside), /resource outside admitted selector|removed run cannot retain resources/);

  // 2b. Attempt to restore with resource attributed to removed run within selector
  const snapRemovedInside = structuredClone(snapRemoved);
  snapRemovedInside.resources.push({
    resource_ref: "resource-removed-owned",
    run_id: "run-removed-owned",
    account_ref: "account-one",
    ownership_ref: "ownership-run-removed-owned",
  });
  assert.throws(() => FakeLifecycle.restore(snapRemovedInside), /removed run cannot retain resources|removed resource still present/);

  // 3. Known-owner consistency: resource account_ref or ownership_ref mismatch for known run must be rejected
  const snapAccountMismatch = activeFixture.snapshot();
  snapAccountMismatch.resources[0].account_ref = "account-mismatched";
  assert.throws(() => FakeLifecycle.restore(snapAccountMismatch), /resource account mismatch/);

  const snapOwnershipMismatch = activeFixture.snapshot();
  snapOwnershipMismatch.resources[0].ownership_ref = "ownership-mismatched";
  assert.throws(() => FakeLifecycle.restore(snapOwnershipMismatch), /resource ownership mismatch/);

  // 4. Valid restore of active run with matching selector and ownership
  const restoredValid = FakeLifecycle.restore(activeFixture.snapshot());
  assert.equal(restoredValid.record("run-selector-check").state, "active");
  assert.equal(restoredValid.snapshot().resources[0].resource_ref, "resource-admitted");

  // 5. Preserve documented deliberately FOREIGN fake resource injection for refusal tests
  const snapForeign = activeFixture.snapshot();
  snapForeign.resources.push({
    resource_ref: "resource-foreign-fixture",
    run_id: "run-foreign-unknown",
    account_ref: "account-foreign",
    ownership_ref: "ownership-foreign",
  });
  const restoredForeign = FakeLifecycle.restore(snapForeign);
  assert.equal(restoredForeign.snapshot().resources.length, 2);
  assert.ok(restoredForeign.snapshot().resources.some((r) => r.run_id === "run-foreign-unknown"));
});

test("FakeLifecycle.restore requires retained history for unresolved runs and unexpired removed runs, preserving expired tombstones", () => {
  // 1. Unresolved runs (failed) require history_retained === true
  const failedFixture = life("run-history-fail", "resource-history-fail");
  failedFixture.allocate("run-history-fail", "resource-history-fail");
  failedFixture.fail("run-history-fail", "test-history-fail");
  const snapFailed = failedFixture.snapshot();
  const snapFailedNoHistory = structuredClone(snapFailed);
  snapFailedNoHistory.records[0].history_retained = false;
  assert.throws(() => FakeLifecycle.restore(snapFailedNoHistory), /unresolved run must retain history/);

  // 2. Unresolved runs (cleanup-pending) require history_retained === true
  const pendingFixture = life("run-history-pending", "resource-history-pending");
  pendingFixture.allocate("run-history-pending", "resource-history-pending");
  pendingFixture.sealEvidence("run-history-pending");
  pendingFixture.complete("run-history-pending");
  const snapPending = pendingFixture.snapshot();
  const snapPendingNoHistory = structuredClone(snapPending);
  snapPendingNoHistory.records[0].history_retained = false;
  assert.throws(() => FakeLifecycle.restore(snapPendingNoHistory), /unresolved run must retain history/);

  // 3. Live unresolved runs require history_retained === true
  const liveFixture = life("run-history-live", "resource-history-live");
  liveFixture.allocate("run-history-live", "resource-history-live");
  const snapLive = liveFixture.snapshot();
  const snapLiveNoHistory = structuredClone(snapLive);
  snapLiveNoHistory.records[0].history_retained = false;
  assert.throws(() => FakeLifecycle.restore(snapLiveNoHistory), /unresolved run must retain history/);

  // 4. Newly removed run before history_expires_at requires history_retained === true
  safeCleanup(pendingFixture, "run-history-pending");
  const cleanedPending = pendingFixture.cleanup("run-history-pending");
  assert.equal(cleanedPending.state, "removed");
  const snapNewlyRemoved = pendingFixture.snapshot();
  const snapNewlyRemovedNoHistory = structuredClone(snapNewlyRemoved);
  snapNewlyRemovedNoHistory.records[0].history_retained = false;
  assert.throws(() => FakeLifecycle.restore(snapNewlyRemovedNoHistory), /history dropped before expiry/);

  // 5. Valid restore of unexpired removed run with history_retained === true
  const restoredNewlyRemoved = FakeLifecycle.restore(snapNewlyRemoved);
  assert.equal(restoredNewlyRemoved.history.length, 1);
  assert.equal(restoredNewlyRemoved.history[0].run_id, "run-history-pending");

  // 6. Legitimate expired removed tombstone at or after history_expires_at preserves history_retained === false
  pendingFixture.advance(HISTORY_WINDOW_MS);
  pendingFixture.purgeHistory();
  assert.equal(pendingFixture.history.length, 0);
  assert.equal(pendingFixture.record("run-history-pending").history_retained, false);
  const snapExpiredTombstone = pendingFixture.snapshot();
  const restoredTombstone = FakeLifecycle.restore(snapExpiredTombstone);
  assert.equal(restoredTombstone.record("run-history-pending").history_retained, false);
  assert.equal(restoredTombstone.history.length, 0);
  assert.equal(restoredTombstone.canAdmit(), true);
});

test('standalone validateResult enforces deployment provenance on journey and cleanup receipts while accepting valid local, test-build, and public-release', () => {
  const localReceipt = receipt({
    environment: 'local',
    provenance_class: 'local-fixture',
    deployment_ref: 'deployment-local',
    site_origin: 'http://127.0.0.1:8787/',
  });
  const hostedReceipt = receipt({
    environment: 'hosted-a',
    provenance_class: 'test-build',
    deployment_ref: 'deployment-a',
    site_origin: 'https://a.example.invalid/',
  });
  const publicReceipt = receipt({
    environment: 'deployed-b',
    provenance_class: 'public-release',
    deployment_ref: 'deployment-b',
    site_origin: 'https://b.example.invalid/',
  });

  // 2. Standalone validateResult rejects public-release/deployment-local in journey evidence
  assert.throws(
    () => validateResult(result({
      journey: { ...result().journey, evidence: [{ ...publicReceipt, deployment_ref: 'deployment-local' }] },
    })),
    /deployment is invalid/
  );

  // 3. Standalone validateResult rejects local-fixture with arbitrary hosted deployment in journey evidence
  assert.throws(
    () => validateResult(result({
      journey: { ...result().journey, evidence: [{ ...localReceipt, deployment_ref: 'deployment-arbitrary' }] },
    })),
    /deployment is invalid/
  );

  // 4. Standalone validateResult rejects test-build with deployment-local in journey evidence
  assert.throws(
    () => validateResult(result({
      journey: { ...result().journey, evidence: [{ ...hostedReceipt, deployment_ref: 'deployment-local' }] },
    })),
    /deployment is invalid/
  );

  // 5. Standalone validateResult rejects public-release/deployment-local in cleanup evidence
  const badCleanupPublic = result({
    cleanup: {
      ...result().cleanup,
      evidence: cleanupEvidence({
        environment: 'deployed-b',
        provenance_class: 'public-release',
        deployment_ref: 'deployment-local',
        site_origin: 'https://b.example.invalid/',
      }),
    },
  });
  assert.throws(() => validateResult(badCleanupPublic), /deployment is invalid/);

  // 6. Standalone validateResult rejects local-fixture/arbitrary-hosted-deployment in cleanup evidence
  const badCleanupLocal = result({
    cleanup: {
      ...result().cleanup,
      evidence: cleanupEvidence({
        environment: 'local',
        provenance_class: 'local-fixture',
        deployment_ref: 'deployment-arbitrary',
        site_origin: 'http://127.0.0.1:8787/',
      }),
    },
  });
  assert.throws(() => validateResult(badCleanupLocal), /deployment is invalid/);

  // 7. Regression valid local, test-build, and public-release receipts validate cleanly in journey and cleanup
  const validLocalResult = validateResult(result({
    journey: { ...result().journey, evidence: [localReceipt] },
    cleanup: {
      ...result().cleanup,
      evidence: cleanupEvidence({
        environment: 'local',
        provenance_class: 'local-fixture',
        deployment_ref: 'deployment-local',
        site_origin: 'http://127.0.0.1:8787/',
      }),
    },
  }));
  assert.equal(validLocalResult.journey.evidence[0].deployment_ref, 'deployment-local');
  assert.equal(validLocalResult.cleanup.evidence[0].deployment_ref, 'deployment-local');

  const validHostedResult = validateResult(result({
    journey: { ...result().journey, evidence: [hostedReceipt] },
    cleanup: {
      ...result().cleanup,
      evidence: cleanupEvidence({
        environment: 'hosted-a',
        provenance_class: 'test-build',
        deployment_ref: 'deployment-a',
        site_origin: 'https://a.example.invalid/',
      }),
    },
  }));
  assert.equal(validHostedResult.journey.evidence[0].deployment_ref, 'deployment-a');

  const validPublicResult = validateResult(result({
    journey: { ...result().journey, evidence: [publicReceipt] },
    cleanup: {
      ...result().cleanup,
      evidence: cleanupEvidence({
        environment: 'deployed-b',
        provenance_class: 'public-release',
        deployment_ref: 'deployment-b',
        site_origin: 'https://b.example.invalid/',
      }),
    },
  }));
  assert.equal(validPublicResult.journey.evidence[0].deployment_ref, 'deployment-b');
});

test('FakeLifecycle.restore enforces event chronological ordering, time bounds against snapshot and run creation, and run association while preserving foreign refusal', () => {
  const activeFixture = life('run-events-check', 'resource-events-check');
  activeFixture.allocate('run-events-check', 'resource-events-check');
  const snapValid = activeFixture.snapshot();

  // 1. Future event relative to snapshot.now must be rejected
  const snapFuture = structuredClone(snapValid);
  snapFuture.events.push({
    type: 'budget-updated',
    at: new Date(Date.parse(snapFuture.now) + 60000).toISOString(),
    run_id: 'run-events-check',
  });
  assert.throws(() => FakeLifecycle.restore(snapFuture), /future/);

  // 2. Event before run creation must be rejected
  const snapBeforeCreation = structuredClone(snapValid);
  const runCreated = Date.parse(snapBeforeCreation.records[0].created_at);
  snapBeforeCreation.events.unshift({
    type: 'heartbeat-renewed',
    at: new Date(runCreated - 60000).toISOString(),
    run_id: 'run-events-check',
  });
  assert.throws(() => FakeLifecycle.restore(snapBeforeCreation), /precedes run creation/);

  // 3. Reordered events (not in internal chronological order) must be rejected
  const orderFixture = life('run-order-check', 'resource-order-check');
  orderFixture.advance(10000);
  orderFixture.allocate('run-order-check', 'resource-order-check');
  orderFixture.advance(10000);
  const snapReordered = orderFixture.snapshot();
  // Swap the first event (at 00:00:00) with the last event (at 00:00:10)
  const lastIdx = snapReordered.events.length - 1;
  const temp = snapReordered.events[0];
  snapReordered.events[0] = snapReordered.events[lastIdx];
  snapReordered.events[lastIdx] = temp;
  assert.throws(() => FakeLifecycle.restore(snapReordered), /chronological order/);

  // 4. Fabricated ownership/lifecycle event for a nonexistent run must be rejected
  const snapUnknownRun = structuredClone(snapValid);
  snapUnknownRun.events.push({
    type: 'cleanup-ownership-registered',
    at: snapUnknownRun.now,
    run_id: 'run-nonexistent',
  });
  assert.throws(() => FakeLifecycle.restore(snapUnknownRun), /unknown run/);

  // 5. IMPORTANT: Preserve documented foreign-resource refusal fixtures:
  // loseResource can emit resource-unavailable for injected foreign resource
  const snapForeign = structuredClone(snapValid);
  snapForeign.resources.push({
    resource_ref: 'resource-foreign-injected',
    run_id: 'run-foreign-refusal',
    account_ref: 'account-foreign',
    ownership_ref: 'ownership-foreign',
  });
  const restoredForeign = FakeLifecycle.restore(snapForeign);
  restoredForeign.loseResource('resource-foreign-injected');
  const snapAfterLose = restoredForeign.snapshot();
  assert.ok(snapAfterLose.events.some((e) => e.type === 'resource-unavailable' && e.run_id === 'run-foreign-refusal'));
  const restoredAfterLose = FakeLifecycle.restore(snapAfterLose);
  assert.ok(restoredAfterLose.events.some((e) => e.type === 'resource-unavailable' && e.run_id === 'run-foreign-refusal'));

  // 6. Event timestamps occurring after terminal/expiry due to cleanup receipts are accepted (not blocked by false terminal upper bound)
  const failFixture = life('run-late-events', 'resource-late-events');
  failFixture.allocate('run-late-events', 'resource-late-events');
  failFixture.fail('run-late-events', 'test-late-events');
  failFixture.advance(FAILURE_WINDOW_MS + 10000);
  failFixture.recordCleanupReceipt('run-late-events', { service: 'retry-suppression', receipt_ref: 'receipt-rs' });
  failFixture.recordCleanupReceipt('run-late-events', { service: 'authority', receipt_ref: 'receipt-auth' });
  const snapLate = failFixture.snapshot();
  const lateReceiptEvent = snapLate.events.find((e) => e.type === 'cleanup-receipt-recorded');
  assert.ok(lateReceiptEvent, 'cleanup receipt event should exist');
  assert.ok(Date.parse(lateReceiptEvent.at) > Date.parse(snapLate.records[0].expiry_at), 'event occurs after expiry');
  const restoredLate = FakeLifecycle.restore(snapLate);
  assert.equal(restoredLate.record('run-late-events').state, 'failed');

  // 7. Valid snapshot restores cleanly
  const restoredValid = FakeLifecycle.restore(snapValid);
  assert.equal(restoredValid.record('run-events-check').state, 'active');
  assert.equal(restoredValid.events.length, snapValid.events.length);
});

test("assessRun blocks when valid required journey or cleanup evidence is accompanied by foreign-run, foreign-environment, or foreign-target extras across target dimensions while preserving valid supplementary evidence", () => {
  const dimensions = ["run_id", "environment", "target_ref", "site_ref", "release_ref", "deployment_ref", "provenance_class", "source_ref", "account_ref", "site_origin"];
  for (const field of dimensions) {
    const foreign = receipt({
      receipt_ref: `receipt-foreign-${field.replaceAll("_", "-")}`,
      [field]: field === "environment" ? "hosted-a" : field === "provenance_class" ? "test-build" : field === "run_id" ? "run-foreign" : field === "site_origin" ? "http://127.0.0.1:8788/" : field === "source_ref" ? "ref-wrong-source" : `foreign-${field.replaceAll("_", "-")}`,
    });
    if (field === "environment") {
      foreign.provenance_class = "test-build";
      foreign.deployment_ref = "deployment-a";
      foreign.site_origin = "https://foreign.example.invalid/";
    }
    if (field === "provenance_class") {
      foreign.environment = "hosted-a";
      foreign.deployment_ref = "deployment-a";
      foreign.site_origin = "https://foreign.example.invalid/";
    }
    if (field === "deployment_ref") {
      foreign.environment = "hosted-a";
      foreign.provenance_class = "test-build";
      foreign.deployment_ref = "deployment-a";
      foreign.site_origin = "https://foreign.example.invalid/";
    }
    // Journey evidence contains valid required receipt AND foreign extra
    const journeyWithExtra = result({
      journey: { ...result().journey, evidence: [receipt(), foreign] },
    });
    const assessedJourney = assessRun(manifest(), journeyWithExtra);
    assert.equal(assessedJourney.status, "blocked", `journey foreign extra on ${field} must block`);

    // Cleanup evidence contains valid required cleanup evidence AND foreign extra
    const cleanupWithExtra = result({
      cleanup: {
        ...result().cleanup,
        evidence: [...cleanupEvidence(), foreign],
      },
    });
    const assessedCleanup = assessRun(manifest(), cleanupWithExtra);
    assert.equal(assessedCleanup.status, "blocked", `cleanup foreign extra on ${field} must block`);
  }

  // Preserve valid same-target supplementary evidence (e.g. screenshot, agent-assertion)
  const validSupplementary = receipt({
    receipt_ref: "receipt-supplementary",
    oracle_kind: "screenshot",
    provider_ref: "provider-screen",
    state_ref: "state-screen",
  });
  const journeyWithSupp = result({
    journey: { ...result().journey, evidence: [receipt(), validSupplementary] },
  });
  assert.equal(assessRun(manifest(), journeyWithSupp).status, "passed");

  // Preserve independent cross-product stage ownership
  const crossManifest = manifest({
    oracles: [
      ...manifestBase.oracles,
      {
        stage_id: "plugin-stage",
        owner_repo: "registry-plugin",
        allowed_environments: ["local", "hosted-a"],
        required: [{ kind: "state", provider_ref: "provider-plugin", state_ref: "state-plugin-ready" }],
      },
    ],
  });
  const crossReceipt = receipt({
    receipt_ref: "receipt-cross",
    stage_id: "plugin-stage",
    owner_repo: "registry-plugin",
    oracle_kind: "state",
    provider_ref: "provider-plugin",
    state_ref: "state-plugin-ready",
  });
  const crossResult = result({
    journey: { ...result().journey, evidence: [receipt(), crossReceipt] },
  });
  assert.equal(assessRun(crossManifest, crossResult).status, "passed");
});

test("nonlocal targets and receipts reject unspecified and wildcard address forms while preserving hosted HTTPS and local loopback", () => {
  const hostedManifest = (site_origin) => manifest({
    environment: "hosted-a",
    target: { ...target, target_ref: "target-a", deployment_ref: "deployment-a", provenance_class: "test-build", source_ref: "ref-a-build", site_origin },
    oracles: [{ stage_id: "local-account", owner_repo: "account-service", allowed_environments: ["hosted-a"], required: [{ kind: "state", provider_ref: "provider-local", state_ref: "state-account-ready" }] }],
  });
  const deployedManifest = (site_origin) => manifest({
    environment: "deployed-b",
    target: { ...target, target_ref: "target-b", deployment_ref: "deployment-b", provenance_class: "public-release", source_ref: "sha256:" + "b".repeat(64), site_origin },
    oracles: [{ stage_id: "local-account", owner_repo: "account-service", allowed_environments: ["deployed-b"], required: [{ kind: "state", provider_ref: "provider-local", state_ref: "state-account-ready" }] }],
  });

  const unspecifiedOrigins = [
    "https://0.0.0.0/",
    "https://0.0.0.0:8443/",
    "https://[::]/",
    "https://[::]:8443/",
    "https://[::ffff:0.0.0.0]/",
    "https://[::ffff:0:0]/",
    "https://[::ffff:0.0.0.0]:8443/",
    "https://[::0.0.0.0]/",
    "https://[0:0:0:0:0:0:0:0]/",
    "https://[0:0:0:0:0:ffff:0:0]/",
  ];

  for (const origin of unspecifiedOrigins) {
    // 1. Rejected on hosted-a and deployed-b manifests
    assert.throws(() => validateManifest(hostedManifest(origin)), /unspecified/);
    assert.throws(() => validateManifest(deployedManifest(origin)), /unspecified/);

    // 2. Rejected on hosted-a and deployed-b journey receipts
    assert.throws(() => validateResult(result({
      journey: {
        ...result().journey,
        evidence: [receipt({ environment: "hosted-a", provenance_class: "test-build", deployment_ref: "deployment-a", site_origin: origin })],
      },
    })), /unspecified/);
    assert.throws(() => validateResult(result({
      journey: {
        ...result().journey,
        evidence: [receipt({ environment: "deployed-b", provenance_class: "public-release", deployment_ref: "deployment-b", site_origin: origin })],
      },
    })), /unspecified/);

    // 3. Rejected on cleanup receipts
    assert.throws(() => validateResult(result({
      cleanup: {
        ...result().cleanup,
        evidence: cleanupEvidence({ environment: "hosted-a", provenance_class: "test-build", deployment_ref: "deployment-a", site_origin: origin }),
      },
    })), /unspecified/);
  }

  // Preserve valid canonical hosted HTTPS
  assert.equal(validateManifest(hostedManifest("https://a.example.invalid/")).target.site_origin, "https://a.example.invalid/");
  assert.equal(validateManifest(deployedManifest("https://b.example.invalid/")).target.site_origin, "https://b.example.invalid/");

  // Preserve existing local loopback behavior
  for (const local of ["http://127.0.0.1:8787/", "http://localhost:8787/", "http://[::1]:8787/"]) {
    assert.equal(validateManifest(manifest({ target: { ...target, site_origin: local } })).target.site_origin, local);
    assert.equal(validateResult(result({ journey: { ...result().journey, evidence: [receipt({ site_origin: local })] } })).journey.evidence[0].site_origin, local);
  }
});
