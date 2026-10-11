import assert from 'node:assert/strict';

export const CONTRACT_VERSION = 1;
export const FAILURE_WINDOW_MS = 60 * 60 * 1000;
export const HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_HEARTBEAT_MS = 15 * 60 * 1000;
const ID = /^[a-z][a-z0-9-]{2,63}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const PIN = /^(?:ref-[a-z0-9][a-z0-9._/-]{2,127}|sha256:[a-f0-9]{64})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ENVIRONMENTS = new Set(['local', 'hosted-a', 'deployed-b']);
const PROVENANCE = new Set(['local-fixture', 'test-build', 'public-release']);
const ORACLE_KINDS = new Set(['provider', 'state', 'registry', 'stripe']);
const SUPPLEMENTARY = new Set(['screenshot', 'agent-assertion']);
const CLEANUP_SERVICES = new Set(['retry-suppression', 'authority', 'resource-absence']);

function object(value, name) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value;
}
function exact(value, keys, name) {
  object(value, name);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has undeclared fields`);
  return value;
}
function id(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a string`);
  assert.match(value, ID, `${name} is not a bounded reference`);
  return value;
}
function source(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a string`);
  assert.match(value, PIN, `${name} must be a pinned ref or bounded digest`);
  return value;
}
function time(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a string`);
  assert.match(value, ISO, `${name} must be an ISO timestamp`);
  assert.equal(Number.isNaN(Date.parse(value)), false, `${name} must be a timestamp`);
  assert.equal(new Date(value).toISOString(), value, `${name} must be a canonical timestamp`);
  return value;
}
function origin(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a canonical HTTPS origin`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, 'https:', `${name} must use HTTPS`);
  assert.equal(parsed.pathname, '/', `${name} must not contain a path`);
  assert.equal(parsed.search, '', `${name} must not contain a query`);
  assert.equal(parsed.hash, '', `${name} must not contain a fragment`);
  assert.equal(parsed.username, '', `${name} must not contain userinfo`);
  assert.equal(parsed.password, '', `${name} must not contain userinfo`);
  assert.equal(value, parsed.origin + '/', `${name} must be canonical`);
  return value;
}
function localOrigin(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a canonical loopback origin`);
  const parsed = new URL(value);
  assert.ok(['http:', 'https:'].includes(parsed.protocol), `${name} must use HTTP(S)`);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname), `${name} must be loopback`);
  assert.equal(parsed.pathname, '/', `${name} must not contain a path`);
  assert.equal(parsed.search, '', `${name} must not contain a query`);
  assert.equal(parsed.hash, '', `${name} must not contain a fragment`);
  assert.equal(parsed.username, '', `${name} must not contain userinfo`);
  assert.equal(parsed.password, '', `${name} must not contain userinfo`);
  assert.equal(value, parsed.origin + '/', `${name} must be canonical`);
  return value;
}
function clone(value) { return structuredClone(value); }
function refs(value, name) {
  assert.ok(Array.isArray(value), `${name} must be a list`);
  value.forEach((entry, i) => id(entry, `${name}[${i}]`));
  return value;
}
function targetShape(target, name) {
  exact(target, ['target_ref', 'site_ref', 'release_ref', 'deployment_ref', 'provenance_class', 'source_ref', 'account_ref', 'site_origin'], name);
  for (const key of ['target_ref', 'site_ref', 'release_ref', 'deployment_ref', 'account_ref']) id(target[key], `${name}.${key}`);
  assert.ok(PROVENANCE.has(target.provenance_class), `${name}.provenance_class is invalid`);
  source(target.source_ref, `${name}.source_ref`);
  if (target.provenance_class === 'local-fixture') {
    localOrigin(target.site_origin, `${name}.site_origin`);
  } else origin(target.site_origin, `${name}.site_origin`);
  if (target.provenance_class === 'local-fixture') {
    assert.equal(target.deployment_ref, 'deployment-local', 'local deployment is invalid');
  } else {
    assert.notEqual(target.deployment_ref, 'deployment-local', `${target.provenance_class} deployment is invalid`);
  }
  return target;
}
function requirement(value, name) {
  exact(value, ['kind', 'provider_ref', 'state_ref'], name);
  assert.ok(ORACLE_KINDS.has(value.kind), `${name}.kind is invalid`);
  id(value.provider_ref, `${name}.provider_ref`);
  id(value.state_ref, `${name}.state_ref`);
  return value;
}
function oracle(value, index) {
  const name = `manifest.oracles[${index}]`;
  exact(value, ['stage_id', 'owner_repo', 'allowed_environments', 'required'], name);
  assert.ok(Array.isArray(value.allowed_environments) && value.allowed_environments.length > 0, 'oracle environments required');
  value.allowed_environments.forEach((env) => assert.ok(ENVIRONMENTS.has(env), 'oracle environment invalid'));
  id(value.stage_id, `${name}.stage_id`);
  id(value.owner_repo, `${name}.owner_repo`);
  assert.ok(Array.isArray(value.required) && value.required.length > 0, `${name}.required must not be empty`);
  value.required.forEach((entry, i) => requirement(entry, `${name}.required[${i}]`));
  return value;
}
function validateReceipt(value, name = 'receipt') {
  exact(value, ['receipt_ref', 'run_id', 'environment', 'target_ref', 'site_ref', 'release_ref', 'deployment_ref', 'provenance_class', 'source_ref', 'account_ref', 'site_origin', 'stage_id', 'owner_repo', 'oracle_kind', 'provider_ref', 'state_ref', 'evidence_hash', 'authority_expires_at'], name);
  for (const key of ['receipt_ref', 'run_id', 'target_ref', 'site_ref', 'release_ref', 'deployment_ref', 'account_ref', 'stage_id', 'owner_repo', 'provider_ref', 'state_ref']) id(value[key], `${name}.${key}`);
  assert.ok(ENVIRONMENTS.has(value.environment), `${name}.environment is invalid`);
  assert.ok(PROVENANCE.has(value.provenance_class), `${name}.provenance_class is invalid`);
  if (value.environment === 'local') assert.equal(value.provenance_class, 'local-fixture', `${name} local provenance mismatch`);
  if (value.environment === 'hosted-a') assert.equal(value.provenance_class, 'test-build', `${name} hosted A provenance mismatch`);
  if (value.environment === 'deployed-b') assert.equal(value.provenance_class, 'public-release', `${name} deployed B provenance mismatch`);
  source(value.source_ref, `${name}.source_ref`);
  if (value.provenance_class === 'local-fixture') localOrigin(value.site_origin, `${name}.site_origin`);
  else origin(value.site_origin, `${name}.site_origin`);
  assert.ok(ORACLE_KINDS.has(value.oracle_kind) || SUPPLEMENTARY.has(value.oracle_kind), `${name}.oracle_kind is invalid`);
  if (value.authority_expires_at !== null) time(value.authority_expires_at, `${name}.authority_expires_at`);
  assert.match(value.evidence_hash, HASH, `${name}.evidence_hash must be an exact hash`);
  return value;
}

export function validateManifest(input) {
  const manifest = exact(input, ['version', 'run_id', 'owner_repo', 'environment', 'admission_required', 'required_assistance_refs', 'suite', 'role', 'cohort_ref', 'subject_ref', 'target', 'selectors', 'timestamps', 'oracles', 'cleanup_oracles'], 'manifest');
  assert.equal(manifest.version, CONTRACT_VERSION, 'manifest.version is unsupported');
  id(manifest.run_id, 'manifest.run_id'); id(manifest.owner_repo, 'manifest.owner_repo');
  assert.ok(ENVIRONMENTS.has(manifest.environment), 'manifest.environment is invalid');
  assert.ok(manifest.admission_required === 'manual' || manifest.admission_required === 'any', 'manifest.admission_required is invalid');
  refs(manifest.required_assistance_refs, 'manifest.required_assistance_refs');
  assert.ok(['first', 'returning'].includes(manifest.suite), 'manifest.suite is invalid');
  id(manifest.role, 'manifest.role'); id(manifest.cohort_ref, 'manifest.cohort_ref'); id(manifest.subject_ref, 'manifest.subject_ref');
  targetShape(manifest.target, 'manifest.target');
  if (manifest.environment === 'local') assert.equal(manifest.target.provenance_class, 'local-fixture', 'local must use local-fixture provenance');
  if (manifest.environment === 'hosted-a') assert.equal(manifest.target.provenance_class, 'test-build', 'hosted A must use test-build provenance');
  if (manifest.environment === 'deployed-b') assert.equal(manifest.target.provenance_class, 'public-release', 'deployed B must use public-release provenance');
  exact(manifest.selectors, ['resource_refs', 'recipient_refs', 'capability_refs'], 'manifest.selectors');
  for (const key of Object.keys(manifest.selectors)) refs(manifest.selectors[key], `manifest.selectors.${key}`);
  exact(manifest.timestamps, ['created_at', 'deadline_at', 'heartbeat_at'], 'manifest.timestamps');
  for (const key of Object.keys(manifest.timestamps)) time(manifest.timestamps[key], `manifest.timestamps.${key}`);
  const created = Date.parse(manifest.timestamps.created_at);
  assert.ok(Date.parse(manifest.timestamps.heartbeat_at) >= created, 'heartbeat precedes creation');
  assert.ok(Date.parse(manifest.timestamps.deadline_at) > Date.parse(manifest.timestamps.heartbeat_at), 'deadline must follow heartbeat');
  assert.ok(Date.parse(manifest.timestamps.deadline_at) <= created + 45 * 60 * 1000, 'run deadline exceeds forty-five minutes');
  assert.ok(Array.isArray(manifest.oracles) && manifest.oracles.length > 0, 'manifest.oracles must not be empty');
  manifest.oracles.forEach(oracle);
  assert.equal(new Set(manifest.oracles.map((entry) => entry.stage_id)).size, manifest.oracles.length, 'duplicate stage');
  assert.ok(Array.isArray(manifest.cleanup_oracles), 'cleanup oracles required');
  manifest.cleanup_oracles.forEach((entry) => {
    exact(entry, ['service', 'owner_repo', 'provider_ref'], 'cleanup oracle');
    assert.ok(CLEANUP_SERVICES.has(entry.service), 'cleanup service invalid');
    id(entry.owner_repo, 'cleanup owner'); id(entry.provider_ref, 'cleanup provider');
  });
  assert.deepEqual(manifest.cleanup_oracles.map((entry) => entry.service).sort(), [...CLEANUP_SERVICES].sort(), 'all cleanup services required exactly once');
  return clone(manifest);
}

export function validateResult(input, manifest = null) {
  const result = exact(input, ['version', 'run_id', 'journey', 'cleanup', 'failure'], 'result');
  assert.equal(result.version, CONTRACT_VERSION, 'result.version is unsupported');
  id(result.run_id, 'result.run_id');
  if (manifest) assert.equal(result.run_id, manifest.run_id, 'result.run_id does not match manifest');
  exact(result.journey, ['status', 'admission', 'assistance_refs', 'human_checkpoint_ref', 'evidence'], 'result.journey');
  assert.ok(['passed', 'failed', 'unknown'].includes(result.journey.status), 'journey.status is invalid');
  assert.ok(['manual', 'automatic', 'helper'].includes(result.journey.admission), 'journey.admission is invalid');
  refs(result.journey.assistance_refs, 'journey.assistance_refs');
  if (result.journey.human_checkpoint_ref !== null) id(result.journey.human_checkpoint_ref, 'journey.human_checkpoint_ref');
  assert.ok(Array.isArray(result.journey.evidence), 'journey.evidence must be a list');
  result.journey.evidence.forEach((entry, i) => validateReceipt(entry, `journey.evidence[${i}]`));
  exact(result.cleanup, ['status', 'resource_state', 'evidence'], 'result.cleanup');
  assert.ok(['passed', 'failed', 'unknown', 'inconsistent'].includes(result.cleanup.status), 'cleanup.status is invalid');
  assert.ok(['reserved', 'provisioning', 'active', 'evidence-sealed', 'cleanup-pending', 'removed', 'failed'].includes(result.cleanup.resource_state), 'cleanup.resource_state is invalid');
  assert.ok(Array.isArray(result.cleanup.evidence), 'cleanup.evidence must be a list');
  result.cleanup.evidence.forEach((entry, i) => validateReceipt(entry, `cleanup.evidence[${i}]`));
  if (result.journey.status === 'failed') {
    assert.ok(result.failure !== null, 'failure descriptor required when journey failed');
  }
  if (result.failure !== null) {
    exact(result.failure, ['code', 'failure_at', 'expected', 'observed', 'proof_ref', 'owner_repo', 'next_action', 'last_accepted_receipt_ref', 'owning_stage_repo'], 'result.failure');
    id(result.failure.code, 'failure.code'); time(result.failure.failure_at, 'failure.failure_at');
    for (const key of ['expected', 'observed', 'next_action']) id(result.failure[key], `failure.${key}`);
    if (result.failure.proof_ref !== null) id(result.failure.proof_ref, 'failure.proof_ref');
    id(result.failure.owner_repo, 'failure.owner_repo');
    if (result.failure.last_accepted_receipt_ref !== null) id(result.failure.last_accepted_receipt_ref, 'failure.last_accepted_receipt_ref');
    id(result.failure.owning_stage_repo, 'failure.owning_stage_repo');
  }
  return clone(result);
}

function sameTarget(manifest, receipt) {
  return receipt.run_id === manifest.run_id && receipt.environment === manifest.environment &&
    Object.keys(manifest.target).every((key) => receipt[key] === manifest.target[key]);
}
export function assessRun(manifestInput, resultInput, assessedAt = manifestInput.timestamps.heartbeat_at) {
  const manifest = validateManifest(manifestInput);
  const result = validateResult(resultInput, manifest);
  time(assessedAt, 'assessment time');
  const failures = [];
  const accepted = [];
  for (const stage of manifest.oracles) {
    const permitted = stage.allowed_environments.includes(manifest.environment);
    for (const req of stage.required) {
      const receipt = result.journey.evidence.find((entry) => permitted && sameTarget(manifest, entry)
        && entry.stage_id === stage.stage_id && entry.owner_repo === stage.owner_repo
        && entry.oracle_kind === req.kind && entry.provider_ref === req.provider_ref && entry.state_ref === req.state_ref);
      if (receipt) accepted.push(receipt);
      else failures.push({code: 'required-evidence-missing', stage_id: stage.stage_id, owner_repo: stage.owner_repo,
        expected: req.state_ref, observed: permitted ? 'receipt-missing-or-mismatched' : 'environment-not-permitted', next_action: 'collect-independent-receipt'});
    }
  }
  if (manifest.admission_required === 'manual' && (result.journey.admission !== 'manual' || result.journey.human_checkpoint_ref === null)) {
    failures.push({code: 'manual-admission-unmet', owner_repo: manifest.owner_repo, expected: 'manual-admission', observed: result.journey.admission, next_action: 'record-manual-admission'});
  }
  if (manifest.required_assistance_refs.some((ref) => !result.journey.assistance_refs.includes(ref))
      || (result.journey.admission === 'helper' && result.journey.assistance_refs.length === 0)) {
    failures.push({code: 'assistance-unrecorded', owner_repo: manifest.owner_repo, expected: 'assistance-receipt', observed: 'assistance-missing', next_action: 'record-assistance'});
  }
  if (result.journey.status === 'passed' && result.failure !== null) failures.push({code: 'contradictory-journey', owner_repo: manifest.owner_repo, expected: 'consistent-outcome', observed: 'failure-present', next_action: 'resolve-failure'});
  const assistance = result.journey.assistance_refs.length > 0 ? 'assisted' : 'unassisted';
  const last = result.journey.evidence.filter((entry) => accepted.includes(entry)).at(-1) ?? null;
  const cleanupMissing = manifest.cleanup_oracles.filter((req) => !result.cleanup.evidence.some((entry) => {
    if (!sameTarget(manifest, entry) || entry.stage_id !== `cleanup-${req.service}` || entry.owner_repo !== req.owner_repo
        || entry.provider_ref !== req.provider_ref || entry.oracle_kind !== 'state') return false;
    if (req.service === 'authority') return (entry.state_ref === 'authority-invalidated' && entry.authority_expires_at === null)
      || (entry.state_ref === 'authority-expired' && entry.authority_expires_at !== null && Date.parse(entry.authority_expires_at) <= Date.parse(assessedAt));
    return entry.state_ref === (req.service === 'retry-suppression' ? 'retries-suppressed' : 'resource-absent') && entry.authority_expires_at === null;
  }));
  const cleanupComplete = result.cleanup.status === 'passed' && result.cleanup.resource_state === 'removed' && cleanupMissing.length === 0;
  let status = result.journey.status;
  if (status === 'passed') status = failures.length ? 'blocked' : cleanupComplete ? 'passed' : 'incomplete';
  if (!cleanupComplete) failures.push({code: 'cleanup-incomplete', owner_repo: manifest.owner_repo,
    expected: 'resource-absence-and-service-safety', observed: 'cleanup-unresolved', next_action: 'resolve-cleanup'});
  return {run_id: manifest.run_id, environment: manifest.environment, target: manifest.target, status, journey: result.journey.status, cleanup: cleanupComplete ? 'passed' : result.cleanup.status === 'failed' ? 'failed' : 'unknown',
    assistance, failures, failure: result.failure, last_accepted_receipt: last,
    owning_stage_repo: result.failure?.owning_stage_repo ?? failures[0]?.owner_repo ?? last?.owner_repo ?? manifest.owner_repo};
}

// Only this fixture owns resources. These operations never call a provider.
export class FakeLifecycle {
  #now; #clock; #hardDeadlineMs; #paused = false;
  #records = new Map(); #resources = new Map(); #events = [];
  #operation = 'success';

  constructor(start = '2026-01-01T00:00:00.000Z', { hardDeadlineMs = 45 * 60 * 1000, clock = null } = {}) {
    time(start, 'clock start');
    assert.ok(Number.isSafeInteger(hardDeadlineMs) && hardDeadlineMs > 0 && hardDeadlineMs <= 45 * 60 * 1000, 'hard deadline invalid');
    assert.ok(clock === null || typeof clock === 'function', 'clock must be a function');
    this.#now = Date.parse(start); this.#clock = clock; this.#hardDeadlineMs = hardDeadlineMs;
  }
  get now() {
    if (this.#clock) {
      const current = this.#clock();
      assert.ok(Number.isSafeInteger(current) && current >= this.#now, 'clock must be monotonic');
      this.#now = current;
    }
    return new Date(this.#now).toISOString();
  }
  get events() { return clone(this.#events); }
  get history() {
    return clone([...this.#records.values()].filter((r) => r.history_retained && r.terminal_at !== null)
      .map((r) => ({run_id: r.run_id, terminal_at: r.terminal_at, expires_at: r.history_expires_at})));
  }
  advance(ms) {
    assert.equal(this.#clock, null, 'advance the injected clock externally');
    assert.ok(Number.isSafeInteger(ms) && ms >= 0, 'clock advance must be non-negative integer');
    this.#now += ms; return this.now;
  }
  #event(type, run_id) { this.#events.push({type, at: this.now, run_id}); }
  #record(run_id) { id(run_id, 'run_id'); const r = this.#records.get(run_id); assert.ok(r, 'unknown run'); return r; }
  #terminal(r, at) {
    r.terminal_at ??= at;
    r.history_expires_at = new Date(Date.parse(r.terminal_at) + HISTORY_WINDOW_MS).toISOString();
  }
  #unresolved(r, status, reason) {
    r.cleanup_status = status; r.cleanup_reason = reason; this.#event('cleanup-unresolved', r.run_id);
    return clone(r);
  }
  setOperationOutcome(service, value) {
    assert.equal(service, 'cleanup', 'only cleanup operation can be injected');
    assert.ok(['success', 'unavailable', 'ambiguous'].includes(value), 'operation outcome invalid');
    this.#operation = value;
  }
  setBudgetPaused(run_id, paused) {
    this.#record(run_id); assert.equal(typeof paused, 'boolean', 'budget pause must be boolean');
    this.#paused = paused; this.#event('budget-updated', run_id);
  }
  canAdmit() { return !this.#paused && [...this.#records.values()].every((r) => r.state === 'removed'); }
  reserve(input) {
    const {run_id, account_ref, ownership_ref, resource_refs} = exact(input, ['run_id', 'account_ref', 'ownership_ref', 'resource_refs'], 'reservation');
    id(run_id, 'run_id'); id(account_ref, 'account_ref'); id(ownership_ref, 'ownership_ref'); refs(resource_refs, 'resource_refs');
    assert.equal(resource_refs.length, 1, 'slice 1 admits one exact fake resource');
    assert.equal(this.canAdmit(), true, 'active run, budget pause or unresolved cleanup blocks new admission');
    assert.equal(this.#records.has(run_id), false, 'run already reserved');
    const r = {run_id, account_ref, ownership_ref, resource_refs: [...resource_refs], resource_ref: null,
      state: 'reserved', created_at: this.now, deadline_at: new Date(Date.parse(this.now) + this.#hardDeadlineMs).toISOString(), heartbeat_at: this.now,
      failure_at: null, failure_reason: null, expiry_at: null, terminal_at: null, history_expires_at: null, history_retained: true,
      cleanup_intent: true, cleanup_status: 'unknown', cleanup_reason: 'not-started', retry_suppression_required: false, receipts: []};
    this.#records.set(run_id, r);
    this.#event('cleanup-ownership-registered', run_id); this.#event('cleanup-intent-recorded', run_id);
    return clone(r);
  }
  #live(run_id, states) {
    this.checkDeadline(run_id);
    const r = this.#record(run_id); assert.ok(states.includes(r.state), 'action requires live run'); return r;
  }
  heartbeat(run_id) {
    const r = this.#live(run_id, ['reserved', 'provisioning', 'active']);
    r.heartbeat_at = this.now; this.#event('heartbeat-renewed', run_id); return clone(r);
  }
  allocate(run_id, resource_ref, options = {}) {
    assert.ok(Object.keys(options).every((key) => key === 'interrupted'), 'allocation has undeclared fields');
    assert.ok(options.interrupted === undefined || typeof options.interrupted === 'boolean', 'interrupted must be boolean');
    const r = this.#live(run_id, ['reserved']); id(resource_ref, 'resource_ref');
    assert.ok(r.resource_refs.includes(resource_ref), 'resource is outside admitted selector');
    assert.equal(this.#resources.has(resource_ref), false, 'resource is already in use');
    r.state = 'provisioning'; this.#event('allocation-started', run_id);
    this.#resources.set(resource_ref, {resource_ref, run_id, account_ref: r.account_ref, ownership_ref: r.ownership_ref});
    if (options.interrupted) { this.#event('allocation-interrupted', run_id); return null; }
    r.resource_ref = resource_ref; r.state = 'active'; this.#event('allocation-recorded', run_id);
    return clone(this.#resources.get(resource_ref));
  }
  reconcileInterrupted(input) {
    const {run_id, account_ref, ownership_ref, resource_ref} = exact(input, ['run_id', 'account_ref', 'ownership_ref', 'resource_ref'], 'reconciliation');
    const r = this.#record(run_id);
    assert.equal(r.account_ref, account_ref, 'account ownership mismatch');
    assert.equal(r.ownership_ref, ownership_ref, 'cleanup ownership mismatch');
    assert.ok(r.resource_refs.includes(resource_ref), 'resource outside admitted selector');
    assert.ok(['provisioning', 'failed'].includes(r.state), 'reconciliation requires interrupted run');
    const found = this.#resources.get(resource_ref);
    if (!found) return this.#unresolved(r, 'unknown', 'resource-unavailable');
    if (found.run_id !== run_id || found.account_ref !== account_ref || found.ownership_ref !== ownership_ref) {
      return this.#unresolved(r, 'failed', 'ownership-mismatch');
    }
    r.resource_ref = resource_ref;
    if (r.failure_at === null) r.state = 'active';
    this.#event('allocation-reconciled', run_id); return clone(found);
  }
  loseResource(resource_ref) {
    id(resource_ref, 'resource_ref');
    const resource = this.#resources.get(resource_ref); assert.ok(resource, 'unknown fake resource');
    this.#resources.delete(resource_ref); this.#event('resource-unavailable', resource.run_id);
  }
  sealEvidence(run_id) {
    const r = this.#live(run_id, ['active']); r.state = 'evidence-sealed'; this.#event('evidence-sealed', run_id);
  }
  fail(run_id, reason, detectedAt = this.now) {
    const r = this.#record(run_id); id(reason, 'failure reason'); time(detectedAt, 'failure detected_at');
    assert.ok(Date.parse(detectedAt) >= Date.parse(r.created_at) && Date.parse(detectedAt) <= Date.parse(this.now), 'failure timestamp outside run');
    assert.ok(['reserved', 'provisioning', 'active', 'evidence-sealed', 'failed'].includes(r.state), 'terminal run cannot fail again');
    if (r.failure_at === null) {
      r.failure_at = detectedAt; r.failure_reason = reason;
      r.expiry_at = new Date(Date.parse(detectedAt) + FAILURE_WINDOW_MS).toISOString();
      this.#terminal(r, detectedAt);
      r.retry_suppression_required = true;
      this.#event('retry-suppression-required', run_id);
    }
    r.state = 'failed'; this.#event('failure-classified', run_id); return clone(r);
  }
  checkDeadline(run_id) {
    const r = this.#record(run_id);
    if (!['reserved', 'provisioning', 'active', 'evidence-sealed'].includes(r.state)) return clone(r);
    const hard = Date.parse(r.deadline_at), heartbeat = Date.parse(r.heartbeat_at) + DEFAULT_HEARTBEAT_MS;
    const deadline = Math.min(hard, heartbeat);
    if (Date.parse(this.now) >= deadline) return this.fail(run_id, hard <= heartbeat ? 'hard-deadline' : 'heartbeat-missing', new Date(deadline).toISOString());
    return clone(r);
  }
  recordCleanupReceipt(run_id, input) {
    object(input, 'cleanup receipt');
    assert.ok(Object.keys(input).every((key) => ['service', 'receipt_ref', 'status', 'authority_expires_at'].includes(key)), 'cleanup receipt has undeclared fields');
    const {service, receipt_ref, status = 'safe', authority_expires_at = null} = input;
    const r = this.#record(run_id); assert.notEqual(r.state, 'removed', 'removed run is immutable');
    assert.ok(['cleanup-pending', 'failed'].includes(r.state), 'cleanup receipt requires pending or failed state');
    assert.ok(CLEANUP_SERVICES.has(service), 'cleanup service invalid'); id(receipt_ref, 'receipt_ref'); assert.equal(status, 'safe', 'unsafe receipt');
    if (authority_expires_at !== null) {
      assert.equal(service, 'authority', 'only authority receipt has expiry'); time(authority_expires_at, 'authority expiry');
      assert.ok(Date.parse(authority_expires_at) <= Date.parse(this.now) + 5 * 60 * 1000, 'authority expiry exceeds five minute bound');
    }
    if (service === 'resource-absence') assert.equal(this.#resources.has(r.resource_refs[0]), false, 'resource absence cannot precede removal');
    r.receipts = r.receipts.filter((entry) => entry.service !== service);
    r.receipts.push({service, receipt_ref, authority_expires_at}); this.#event('cleanup-receipt-recorded', run_id);
    return clone(r);
  }
  complete(run_id) {
    const r = this.#live(run_id, ['evidence-sealed']);
    r.state = 'cleanup-pending'; r.retry_suppression_required = true; this.#terminal(r, this.now);
    this.#event('cleanup-pending', run_id); return this.cleanup(run_id);
  }
  cleanup(run_id) {
    const r = this.#record(run_id);
    if (r.state === 'removed') return clone(r);
    assert.ok(['cleanup-pending', 'failed'].includes(r.state), 'cleanup requires pending or failed state');
    if (r.failure_at !== null && Date.parse(this.now) < Date.parse(r.expiry_at)) return clone(r);
    if (this.#operation !== 'success') return this.#unresolved(r, this.#operation === 'ambiguous' ? 'failed' : 'unknown', this.#operation);
    const authority = r.receipts.find((entry) => entry.service === 'authority');
    if (!r.receipts.some((entry) => entry.service === 'retry-suppression') || !authority
        || (authority.authority_expires_at !== null && Date.parse(this.now) < Date.parse(authority.authority_expires_at))) {
      return this.#unresolved(r, 'unknown', 'service-safety-unresolved');
    }
    const resource = this.#resources.get(r.resource_refs[0]);
    if (resource) {
      if (r.resource_ref === null) return this.#unresolved(r, 'unknown', 'allocation-id-not-reconciled');
      if (resource.run_id !== run_id || resource.account_ref !== r.account_ref || resource.ownership_ref !== r.ownership_ref) {
        return this.#unresolved(r, 'failed', 'ownership-mismatch');
      }
      this.#resources.delete(r.resource_ref); this.#event('resource-removed', run_id);
      r.receipts.push({service: 'resource-absence', receipt_ref: 'receipt-fake-absence', authority_expires_at: null});
    } else if (!r.receipts.some((entry) => entry.service === 'resource-absence')) {
      return this.#unresolved(r, 'unknown', 'absence-receipt-missing');
    }
    r.state = 'removed'; r.cleanup_status = 'passed'; r.cleanup_reason = 'complete'; return clone(r);
  }
  purgeHistory() {
    for (const r of this.#records.values()) {
      if (r.state === 'removed' && Date.parse(this.now) >= Date.parse(r.history_expires_at)) r.history_retained = false;
    }
  }
  record(run_id) { return clone(this.#record(run_id)); }
  snapshot() {
    return clone({version: CONTRACT_VERSION, now: this.now, hardDeadlineMs: this.#hardDeadlineMs, paused: this.#paused,
      operation: this.#operation, records: [...this.#records.values()], resources: [...this.#resources.values()], events: this.#events});
  }
  static restore(snapshot) {
    exact(snapshot, ['version', 'now', 'hardDeadlineMs', 'paused', 'operation', 'records', 'resources', 'events'], 'snapshot');
    assert.equal(snapshot.version, CONTRACT_VERSION, 'snapshot version invalid');
    assert.equal(typeof snapshot.paused, 'boolean', 'budget pause invalid');
    const life = new FakeLifecycle(snapshot.now, {hardDeadlineMs: snapshot.hardDeadlineMs});
    life.#paused = snapshot.paused; life.setOperationOutcome('cleanup', snapshot.operation);
    assert.ok(Array.isArray(snapshot.records) && Array.isArray(snapshot.resources) && Array.isArray(snapshot.events), 'snapshot lists required');
    for (const r of snapshot.records) {
      exact(r, ['run_id', 'account_ref', 'ownership_ref', 'resource_refs', 'resource_ref', 'state', 'created_at', 'deadline_at', 'heartbeat_at',
        'failure_at', 'failure_reason', 'expiry_at', 'terminal_at', 'history_expires_at', 'history_retained', 'cleanup_intent', 'cleanup_status', 'cleanup_reason', 'retry_suppression_required', 'receipts'], 'snapshot record');
      for (const key of ['run_id', 'account_ref', 'ownership_ref', 'cleanup_reason']) id(r[key], key);
      assert.equal(life.#records.has(r.run_id), false, 'duplicate snapshot run');
      refs(r.resource_refs, 'resource selectors'); assert.equal(r.resource_refs.length, 1, 'one selector required');
      assert.ok(r.resource_ref === null || r.resource_refs.includes(r.resource_ref), 'saved resource outside ownership');
      assert.ok(['reserved', 'provisioning', 'active', 'evidence-sealed', 'failed', 'cleanup-pending', 'removed'].includes(r.state), 'state invalid');
      assert.ok(['unknown', 'failed', 'passed'].includes(r.cleanup_status), 'cleanup status invalid');
      for (const key of ['created_at', 'deadline_at', 'heartbeat_at']) time(r[key], key);
      assert.equal(Date.parse(r.deadline_at), Date.parse(r.created_at) + snapshot.hardDeadlineMs, 'hard deadline changed');
      assert.ok(Date.parse(r.heartbeat_at) >= Date.parse(r.created_at) && Date.parse(r.heartbeat_at) <= Date.parse(snapshot.now), 'heartbeat invalid');
      assert.equal(r.cleanup_intent, true, 'cleanup intent missing');
      for (const key of ['history_retained', 'retry_suppression_required']) assert.equal(typeof r[key], 'boolean', key);
      if (r.failure_at !== null) {
        time(r.failure_at, 'failure_at'); id(r.failure_reason, 'failure_reason'); time(r.expiry_at, 'expiry_at');
        assert.equal(Date.parse(r.expiry_at), Date.parse(r.failure_at) + FAILURE_WINDOW_MS, 'failure expiry changed');
        assert.equal(r.terminal_at, r.failure_at, 'failure terminal changed');
        assert.ok(Date.parse(r.failure_at) >= Date.parse(r.created_at) && Date.parse(r.failure_at) <= Date.parse(snapshot.now), 'failure outside run');
        assert.ok(['failed', 'removed'].includes(r.state), 'failed run reactivated');
      } else { assert.equal(r.failure_reason, null); assert.equal(r.expiry_at, null); }
      if (r.terminal_at !== null) {
        time(r.terminal_at, 'terminal_at'); time(r.history_expires_at, 'history expiry');
        assert.ok(Date.parse(r.terminal_at) >= Date.parse(r.created_at) && Date.parse(r.terminal_at) <= Date.parse(snapshot.now), 'terminal outside run');
        assert.equal(Date.parse(r.history_expires_at), Date.parse(r.terminal_at) + HISTORY_WINDOW_MS, 'history expiry changed');
      } else assert.equal(r.history_expires_at, null);
      assert.ok(Array.isArray(r.receipts), 'receipts required');
      for (const receipt of r.receipts) {
        exact(receipt, ['service', 'receipt_ref', 'authority_expires_at'], 'snapshot receipt');
        assert.ok(CLEANUP_SERVICES.has(receipt.service), 'receipt service invalid'); id(receipt.receipt_ref, 'receipt ref');
        if (receipt.authority_expires_at !== null) { assert.equal(receipt.service, 'authority'); time(receipt.authority_expires_at, 'authority expiry'); }
      }
      assert.equal(new Set(r.receipts.map((entry) => entry.service)).size, r.receipts.length, 'duplicate safety receipt');
      if (r.state === 'removed') {
        assert.equal(r.cleanup_status, 'passed', 'removed cleanup inconsistent');
        assert.ok(r.terminal_at !== null, 'removed terminal missing');
        assert.ok([...CLEANUP_SERVICES].every((service) => r.receipts.some((entry) => entry.service === service)), 'removed safety receipts missing');
        const authority = r.receipts.find((entry) => entry.service === 'authority');
        assert.ok(authority.authority_expires_at === null || Date.parse(authority.authority_expires_at) <= Date.parse(snapshot.now), 'authority not expired');
      } else assert.notEqual(r.cleanup_status, 'passed', 'unresolved cleanup cannot pass');
      life.#records.set(r.run_id, clone(r));
    }
    for (const resource of snapshot.resources) {
      exact(resource, ['resource_ref', 'run_id', 'account_ref', 'ownership_ref'], 'snapshot resource');
      for (const value of Object.values(resource)) id(value, 'resource reference');
      assert.equal(life.#resources.has(resource.resource_ref), false, 'duplicate resource');
      // Foreign fake resources may be injected to exercise refusal; they grant no ownership.
      life.#resources.set(resource.resource_ref, clone(resource));
    }
    for (const r of life.#records.values()) {
      if (r.state === 'removed') assert.equal(life.#resources.has(r.resource_refs[0]), false, 'removed resource still present');
    }
    const eventTypes = new Set(['cleanup-ownership-registered', 'cleanup-intent-recorded', 'budget-updated', 'heartbeat-renewed',
      'allocation-started', 'allocation-interrupted', 'allocation-recorded', 'allocation-reconciled', 'resource-unavailable',
      'evidence-sealed', 'retry-suppression-required', 'failure-classified', 'cleanup-receipt-recorded', 'cleanup-pending', 'cleanup-unresolved', 'resource-removed']);
    for (const entry of snapshot.events) {
      exact(entry, ['type', 'at', 'run_id'], 'snapshot event');
      assert.ok(eventTypes.has(entry.type), 'event type invalid'); time(entry.at, 'event time'); id(entry.run_id, 'event run');
    }
    life.#events = clone(snapshot.events);
    return life;
  }
}
