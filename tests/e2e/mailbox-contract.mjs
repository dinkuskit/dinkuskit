import assert from 'node:assert/strict';
import { validateManifest } from './run-contract.mjs';

export const MAILBOX_CONTRACT_VERSION = 1;
export const CONSUMER_CAPABILITY = 'synthetic-opaque-consumer-v1';
export const MAX_CANDIDATES = 50;
export const DEFAULT_HANDOFF_TTL_MS = 5 * 60 * 1000;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REF = /^[a-z][a-z0-9-]{2,63}$/;
const ADDRESS = /^[^@\s]{1,96}@([a-z0-9-]+\.)+invalid$/;
const PLACEMENTS = new Set(['inbox', 'spam', 'trash', 'other']);
const selections = new WeakSet();
const matches = new WeakMap();
const SAFE_REASONS = new Set([
  'candidate-limit', 'not-found', 'stale', 'ambiguous', 'wrong-recipient',
  'wrong-subject', 'wrong-intent', 'wrong-environment', 'wrong-run',
  'wrong-origin', 'wrong-path', 'received-not-inbox', 'handoff-expired',
  'wrong-context', 'already-consumed', 'consumer-missing',
  'consumer-unsupported', 'consumer-failure', 'tool-policy-blocked',
  'invalid-context', 'invalid-consumer-result', 'invalid-time',
  'matched',
]);

function exact(value, keys, name) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has undeclared fields`);
  return value;
}

function bounded(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a string`);
  assert.match(value, REF, `${name} is not a bounded reference`);
  return value;
}

function timestamp(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a timestamp`);
  assert.match(value, ISO, `${name} is not canonical`);
  assert.equal(new Date(value).toISOString(), value, `${name} is not canonical`);
  return value;
}

function origin(value, name) {
  assert.equal(typeof value, 'string', `${name} must be an origin`);
  const parsed = new URL(value);
  assert.ok(['http:', 'https:'].includes(parsed.protocol), `${name} has unsupported scheme`);
  assert.equal(parsed.pathname, '/', `${name} must not contain a path`);
  assert.equal(parsed.search, '', `${name} must not contain a query`);
  assert.equal(parsed.hash, '', `${name} must not contain a fragment`);
  assert.equal(parsed.username, '', `${name} must not contain userinfo`);
  assert.equal(parsed.password, '', `${name} must not contain userinfo`);
  if (parsed.protocol === 'http:') assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname), `${name} must be loopback`);
  assert.equal(value, parsed.origin + '/', `${name} is not canonical`);
  return value;
}

function address(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a synthetic address`);
  assert.match(value, ADDRESS, `${name} must use an .invalid domain`);
  return value;
}

function clone(value) { return structuredClone(value); }

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function contextShape(value, name = 'browser_context') {
  exact(value, ['role', 'context_ref', 'origin', 'path'], name);
  bounded(value.role, `${name}.role`);
  bounded(value.context_ref, `${name}.context_ref`);
  origin(value.origin, `${name}.origin`);
  assert.equal(typeof value.path, 'string', `${name}.path must be a path`);
  assert.match(value.path, /^\/[a-z0-9/_-]{1,127}$/, `${name}.path is invalid`);
  return value;
}

function safeResult(status, reason, extra = {}) {
  assert.ok(['passed', 'blocked', 'assisted'].includes(status), 'unsafe consumer status');
  assert.ok(SAFE_REASONS.has(reason) || reason === 'consumer-accepted' || reason === 'human-assisted', 'unsafe consumer reason');
  return Object.freeze({ status, reason, ...extra });
}

/**
 * Freeze the exact manifest-bound mailbox allocation. This consumes
 * `validateManifest`; it does not define or validate a second manifest shape.
 */
export function createMailboxSelection(manifestInput, allocationInput) {
  try { return allocationSnapshot(manifestInput, allocationInput); }
  catch { throw new Error('mailbox allocation invalid'); }
}

function allocationSnapshot(manifestInput, allocationInput) {
  const manifest = validateManifest(manifestInput);
  const allocation = exact(allocationInput, [
    'recipient_ref', 'recipient_address', 'mailbox_identity', 'intent', 'subject',
    'run_id', 'environment', 'receive_window', 'origin', 'path', 'browser_context',
  ], 'mailbox allocation');
  bounded(allocation.recipient_ref, 'recipient_ref');
  assert.ok(manifest.selectors.recipient_refs.includes(allocation.recipient_ref), 'recipient is outside manifest allocation');
  address(allocation.recipient_address, 'recipient_address');
  bounded(allocation.mailbox_identity, 'mailbox_identity');
  bounded(allocation.intent, 'intent');
  assert.equal(typeof allocation.subject, 'string', 'subject must be bounded');
  assert.ok(allocation.subject.length > 0 && allocation.subject.length <= 200, 'subject is out of bounds');
  assert.equal(allocation.run_id, manifest.run_id, 'run mismatch');
  assert.equal(allocation.environment, manifest.environment, 'environment mismatch');
  exact(allocation.receive_window, ['starts_at', 'ends_at'], 'receive_window');
  timestamp(allocation.receive_window.starts_at, 'receive_window.starts_at');
  timestamp(allocation.receive_window.ends_at, 'receive_window.ends_at');
  const created = Date.parse(manifest.timestamps.created_at);
  const start = Date.parse(allocation.receive_window.starts_at);
  const end = Date.parse(allocation.receive_window.ends_at);
  assert.ok(start >= created && end > start && end <= Date.parse(manifest.timestamps.deadline_at), 'receive window is outside manifest');
  origin(allocation.origin, 'origin');
  assert.equal(typeof allocation.path, 'string', 'path must be a string');
  assert.match(allocation.path, /^\/[a-z0-9/_-]{1,127}$/, 'path is invalid');
  contextShape(allocation.browser_context);
  assert.equal(allocation.origin, manifest.target.site_origin, 'target origin mismatch');
  assert.equal(allocation.browser_context.role, manifest.role, 'browser role mismatch');
  assert.equal(allocation.browser_context.origin, allocation.origin, 'browser origin mismatch');
  assert.equal(allocation.browser_context.path, allocation.path, 'browser path mismatch');
  const selection = freeze(clone({
    version: MAILBOX_CONTRACT_VERSION,
    recipient_ref: allocation.recipient_ref,
    recipient_address: allocation.recipient_address,
    mailbox_identity: allocation.mailbox_identity,
    intent: allocation.intent,
    subject: allocation.subject,
    run_id: allocation.run_id,
    environment: allocation.environment,
    receive_window: allocation.receive_window,
    origin: allocation.origin,
    path: allocation.path,
    browser_context: allocation.browser_context,
    deadline_at: manifest.timestamps.deadline_at,
  }));
  selections.add(selection);
  return selection;
}

function candidateShape(value, index) {
  const name = `candidate[${index}]`;
  exact(value, [
    'message_ref', 'recipient_ref', 'recipient_address', 'mailbox_identity',
    'intent', 'subject', 'run_id', 'environment', 'origin', 'path',
    'received_at', 'placement',
  ], name);
  bounded(value.message_ref, `${name}.message_ref`);
  bounded(value.recipient_ref, `${name}.recipient_ref`);
  address(value.recipient_address, `${name}.recipient_address`);
  bounded(value.mailbox_identity, `${name}.mailbox_identity`);
  bounded(value.intent, `${name}.intent`);
  assert.equal(typeof value.subject, 'string', `${name}.subject must be a string`);
  assert.ok(value.subject.length > 0 && value.subject.length <= 200, 'candidate subject out of bounds');
  bounded(value.run_id, `${name}.run_id`);
  assert.ok(['local', 'hosted-a', 'deployed-b'].includes(value.environment), `${name}.environment invalid`);
  origin(value.origin, `${name}.origin`);
  assert.equal(typeof value.path, 'string', `${name}.path must be a string`);
  assert.match(value.path, /^\/[a-z0-9/_-]{1,127}$/, `${name}.path invalid`);
  timestamp(value.received_at, `${name}.received_at`);
  assert.ok(PLACEMENTS.has(value.placement), `${name}.placement invalid`);
  return value;
}

/**
 * Correlate only bounded synthetic candidate metadata. No candidate may carry
 * an opaque URL, HTML, token, cookie, or auth state field.
 */
export function selectMailboxMessage(selection, candidatesInput, now) {
  if (!selections.has(selection)) throw new Error('selection must be the original allocation');
  let candidates;
  try {
    timestamp(now, 'selection time');
    assert.ok(Array.isArray(candidatesInput), 'candidates must be a list');
    if (candidatesInput.length <= MAX_CANDIDATES) candidates = candidatesInput.map(candidateShape);
  } catch { throw new Error('mailbox candidate invalid or undeclared fields'); }
  if (candidatesInput.length > MAX_CANDIDATES) return safeResult('blocked', 'candidate-limit');
  const windowStart = Date.parse(selection.receive_window.starts_at);
  const windowEnd = Date.parse(selection.receive_window.ends_at);
  const observedEnd = Math.min(windowEnd, Date.parse(now));
  const inWindow = candidates.filter((candidate) => Date.parse(candidate.received_at) >= windowStart && Date.parse(candidate.received_at) <= observedEnd);
  if (Date.parse(now) > windowEnd) return safeResult('blocked', 'stale');
  const matching = inWindow.filter((candidate) => candidate.recipient_ref === selection.recipient_ref
    && candidate.recipient_address === selection.recipient_address
    && candidate.mailbox_identity === selection.mailbox_identity
    && candidate.intent === selection.intent
    && candidate.subject === selection.subject
    && candidate.run_id === selection.run_id
    && candidate.environment === selection.environment
    && candidate.origin === selection.origin
    && candidate.path === selection.path);
  if (matching.length > 1) return safeResult('blocked', 'ambiguous');
  if (matching.length === 1) {
    const match = matching[0];
    if (match.placement !== 'inbox') {
      return safeResult('blocked', 'received-not-inbox', {
        message_ref: match.message_ref, placement: match.placement, received_at: match.received_at,
      });
    }
    const matchResult = safeResult('passed', 'matched', {
      message_ref: match.message_ref, placement: match.placement, received_at: match.received_at,
    });
    matches.set(matchResult, { selection, observed_at: now, handed_off: false });
    return matchResult;
  }
  if (inWindow.some((candidate) => candidate.recipient_ref !== selection.recipient_ref || candidate.recipient_address !== selection.recipient_address)) return safeResult('blocked', 'wrong-recipient');
  if (inWindow.some((candidate) => candidate.subject !== selection.subject)) return safeResult('blocked', 'wrong-subject');
  if (inWindow.some((candidate) => candidate.intent !== selection.intent)) return safeResult('blocked', 'wrong-intent');
  if (inWindow.some((candidate) => candidate.environment !== selection.environment)) return safeResult('blocked', 'wrong-environment');
  if (inWindow.some((candidate) => candidate.run_id !== selection.run_id)) return safeResult('blocked', 'wrong-run');
  if (inWindow.some((candidate) => candidate.origin !== selection.origin)) return safeResult('blocked', 'wrong-origin');
  if (inWindow.some((candidate) => candidate.path !== selection.path)) return safeResult('blocked', 'wrong-path');
  if (candidates.length > 0 && inWindow.length === 0) return safeResult('blocked', 'stale');
  return safeResult('blocked', 'not-found');
}

/**
 * Create a one-use, expiring handoff. The consumer callback is retained only
 * in this process and receives no serializable raw auth material.
 */
export function createOpaqueHandoff({ selection, match, consumer, now, ttlMs = DEFAULT_HANDOFF_TTL_MS }) {
  const matched = matches.get(match);
  if (!selections.has(selection) || matched?.selection !== selection || matched.handed_off) {
    throw new Error('handoff requires original allocation and unused matched message');
  }
  try { timestamp(now, 'handoff time'); }
  catch { throw new Error('handoff time invalid'); }
  assert.ok(Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= DEFAULT_HANDOFF_TTL_MS, 'handoff TTL invalid');
  const expiresMs = Math.min(Date.parse(match.received_at) + ttlMs, Date.parse(selection.deadline_at));
  if (Date.parse(now) < Date.parse(matched.observed_at) || Date.parse(now) >= expiresMs) throw new Error('handoff time outside matched message validity');
  let consumerCapability, consume;
  try { consumerCapability = consumer?.capability; consume = consumer?.consume; }
  catch { throw new Error('consumer interface invalid'); }
  matched.handed_off = true;
  let consumed = false;
  const expiresAt = new Date(expiresMs).toISOString();
  return Object.freeze({
    version: MAILBOX_CONTRACT_VERSION,
    expires_at: expiresAt,
    redeem(contextInput, at) {
      if (consumed) return safeResult('blocked', 'already-consumed');
      try { timestamp(at, 'redemption time'); } catch { return safeResult('blocked', 'invalid-time'); }
      if (Date.parse(at) < Date.parse(now)) return safeResult('blocked', 'invalid-time');
      if (Date.parse(at) >= Date.parse(expiresAt)) return safeResult('blocked', 'handoff-expired');
      let context;
      try { context = contextShape(clone(contextInput)); } catch { return safeResult('blocked', 'invalid-context'); }
      if (Object.keys(selection.browser_context).some((key) => context[key] !== selection.browser_context[key])) return safeResult('blocked', 'wrong-context');
      consumed = true;
      if (!consumer) return safeResult('blocked', 'consumer-missing');
      if (consumerCapability !== CONSUMER_CAPABILITY || typeof consume !== 'function') return safeResult('blocked', 'consumer-unsupported');
      try {
        const result = consume(freeze({ selection, match, context, capability: CONSUMER_CAPABILITY }));
        if (!result || typeof result !== 'object' || !['passed', 'blocked', 'assisted'].includes(result.status)) return safeResult('blocked', 'invalid-consumer-result');
        if (result.status === 'passed') return safeResult('passed', 'consumer-accepted');
        if (result.status === 'assisted') {
          timestamp(result.assistance_at, 'assistance_at');
          if (Date.parse(result.assistance_at) < Date.parse(now) || Date.parse(result.assistance_at) >= expiresMs) return safeResult('blocked', 'invalid-consumer-result');
          return safeResult('assisted', 'human-assisted', { assistance_at: result.assistance_at, assistance: true });
        }
        return safeResult('blocked', result.reason === 'tool-policy-blocked' ? 'tool-policy-blocked' : 'consumer-failure');
      } catch {
        return safeResult('blocked', 'consumer-failure');
      }
    },
  });
}
