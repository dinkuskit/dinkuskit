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
    }
    if (field === 'provenance_class') {
      altered.environment = 'hosted-a';
      altered.site_origin = 'https://different.example.invalid/';
    }
    if (field === 'provenance_class') {
      altered.site_origin = 'https://different.example.invalid/';
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
  const assessed = assessRun(manifest(), result({ journey: { ...result().journey, status: 'failed', evidence: [receipt()] }, failure }));
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
  assert.equal(assessRun(manifest(), result({cleanup: {...result().cleanup, evidence: wrongRun}})).status, 'incomplete');
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
  const assessed = assessRun(manifest(), output);
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
