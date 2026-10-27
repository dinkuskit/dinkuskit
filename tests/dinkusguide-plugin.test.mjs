import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireAdmissionLease, releaseAdmissionLease, parseAskRequestPayload, validateUpstreamGuideResponse } from '../packages/dinkusguide-chat/src/contract.ts';

const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const limits = { maxQuestionCharacters: 2000, maxBodyBytes: 16384 };
const headers = { 'content-type': 'application/json' };
const options = { now: 100000, timeoutMs: 1000, maxConcurrency: 2, requestsPerMinute: 20, perIpRequestsPerMinute: 6, clientIp: null };
function store() {
  let state = null, revision = 0;
  return {
    async getVersioned() { return state === null ? null : { value: structuredClone(state), revision: String(revision) }; },
    async compareAndSet(_key, expected, value) {
      if (expected !== (state === null ? null : String(revision))) return { applied: false };
      state = structuredClone(value); revision++; return { applied: true, revision: String(revision) };
    },
  };
}

test('question limits count code points and reject malformed UTF-8 and extra authority fields', () => {
  assert.equal(parseAskRequestPayload(bytes({ question: '😀'.repeat(2000) }), headers, limits).ok, true);
  assert.equal(parseAskRequestPayload(bytes({ question: '😀'.repeat(2001) }), headers, limits).ok, false);
  assert.equal(parseAskRequestPayload(new Uint8Array([0xff]), headers, limits).ok, false);
  for (const extra of ['history', 'visitorId', 'system', 'model', 'tools']) {
    assert.equal(parseAskRequestPayload(bytes({ question: 'hello', [extra]: [] }), headers, limits).ok, false);
  }
});

test('atomic leases bound simultaneous admission and survive the visitor deadline', async () => {
  const kv = store();
  const attempts = await Promise.all(Array.from({ length: 12 }, () => acquireAdmissionLease(kv, options)));
  const accepted = attempts.filter(value => value.acquired);
  assert.equal(accepted.length, 2);
  assert.equal((await acquireAdmissionLease(kv, { ...options, now: 102000 })).acquired, false);
  await releaseAdmissionLease(kv, accepted[0].leaseId, 102000);
  assert.equal((await acquireAdmissionLease(kv, { ...options, now: 102000 })).acquired, true);
  assert.equal((await acquireAdmissionLease(kv, { ...options, now: 197000 })).acquired, true);
});

test('trusted IP and global budgets persist after lease release and reset by window', async () => {
  const kv = store();
  const local = { ...options, clientIp: '192.0.2.1', perIpRequestsPerMinute: 1 };
  const first = await acquireAdmissionLease(kv, local);
  assert.equal(first.acquired, true);
  await releaseAdmissionLease(kv, first.leaseId, local.now);
  assert.equal((await acquireAdmissionLease(kv, local)).acquired, false);
  assert.equal((await acquireAdmissionLease(kv, { ...local, clientIp: '192.0.2.2' })).acquired, true);
  assert.equal((await acquireAdmissionLease(kv, { ...local, now: 180000 })).acquired, true);
  assert.doesNotMatch(JSON.stringify(await kv.getVersioned()), /192\.0\.2\./);
});

test('completed answers retain text while citations require an admitted public owner and immutable line span', () => {
  const base = 'https://github.com/dinkuskit/dinkus-guide/blob/' + 'a'.repeat(40) + '/README.md';
  const answer = 'Full answer. '.repeat(300);
  assert.equal(validateUpstreamGuideResponse(200, bytes({ status: 'answered', answer, citations: [base + '#L1-L5'] })).body.answer, answer);
  for (const citation of [base, base + '#L5-L1', base.replace('dinkuskit', 'other') + '#L1', 'javascript:alert(1)']) {
    assert.equal(validateUpstreamGuideResponse(200, bytes({ status: 'answered', answer, citations: [citation] })).ok, false);
  }
});
