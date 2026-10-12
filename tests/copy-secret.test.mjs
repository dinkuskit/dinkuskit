import assert from 'node:assert/strict';
import test from 'node:test';
import { COPY_MESSAGE, copySecret } from '../src/account/copy-secret.ts';

// Synthetic value; the real key is never put in tests, logs or snapshots.
const SECRET = 'dk_store_' + 'x'.repeat(43);

const recorder = () => {
  const calls = [];
  return { calls, legacyCopy: text => { calls.push(text === SECRET); return true; } };
};

test('copy uses the async clipboard when it works', async () => {
  const written = [];
  const legacy = recorder();
  const outcome = await copySecret(SECRET, { clipboard: { writeText: async text => { written.push(text === SECRET); } }, isSecureContext: true, legacyCopy: legacy.legacyCopy });
  assert.equal(outcome, 'copied');
  assert.deepEqual(written, [true]);
  assert.deepEqual(legacy.calls, [], 'no fallback after success');
  assert.equal(COPY_MESSAGE[outcome], 'Copied.');
});

test('copy falls back when the clipboard rejects, is missing, or the context is not secure', async () => {
  for (const env of [
    { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } }, isSecureContext: true },
    { clipboard: null, isSecureContext: true },
    { clipboard: undefined },
    { clipboard: { writeText: async () => assert.fail('must not use the clipboard in a non-secure context') }, isSecureContext: false },
  ]) {
    const legacy = recorder();
    assert.equal(await copySecret(SECRET, { ...env, legacyCopy: legacy.legacyCopy }), 'copied_fallback');
    assert.deepEqual(legacy.calls, [true]);
  }
});

test('copy asks the person to copy by hand when every method fails', async () => {
  const rejecting = { writeText: async () => { throw new Error('denied'); } };
  assert.equal(await copySecret(SECRET, { clipboard: rejecting, isSecureContext: true, legacyCopy: () => false }), 'select_manually');
  assert.equal(await copySecret(SECRET, { clipboard: rejecting, isSecureContext: true, legacyCopy: () => { throw new Error('execCommand'); } }), 'select_manually');
  assert.equal(await copySecret(SECRET, {}), 'select_manually');
  assert.match(COPY_MESSAGE.select_manually, /Couldn't copy/);
  assert.ok(!Object.values(COPY_MESSAGE).some(message => message.includes(SECRET)), 'feedback never contains the key');
});

test('copy never logs the key', async () => {
  const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  const seen = [];
  for (const name of Object.keys(originals)) console[name] = (...args) => seen.push(args.join(' '));
  try {
    await copySecret(SECRET, { clipboard: { writeText: async () => { throw new Error('denied'); } }, isSecureContext: true, legacyCopy: () => { throw new Error('nope'); } });
  } finally { Object.assign(console, originals); }
  assert.deepEqual(seen, []);
});
