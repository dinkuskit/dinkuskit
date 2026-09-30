import assert from 'node:assert/strict';
import { contentFieldData, contentProof, d1PersistPaths, kvOnlyPersist, localBindingTable, sanitizeText, sanitizeValue, unwrapApiData, unwrapContentEnvelope, workerdReady } from './lib/cms-operation-helpers.mjs';
import { leftoverOwned, mergeRecordedPids, recordedPidsStillAlive } from './lib/owned-process.mjs';

const checks = [];
const record = (check) => {
  checks.push(check);
  console.log(`PASS ${check}`);
};

const official = {
  success: true,
  data: {
    item: { id: 'home', slug: 'home', status: 'published', data: { title: 'Live title', layout: [] } },
    _rev: 'rev-1',
  },
};

const { item, rev } = unwrapContentEnvelope(official, 'official GET');
assert.equal(item.id, 'home');
assert.equal(rev, 'rev-1');
assert.equal(contentFieldData(item).title, 'Live title');
record('Official content envelope unwraps data.item and data._rev');

assert.throws(
  () => unwrapContentEnvelope({ success: true, data: official.data.item }, 'wrong'),
  /missing data\.item and data\._rev/,
);
record('Treating data as the item is rejected as a false official shape');

assert.throws(
  () => unwrapApiData({ success: true }, 'empty'),
  /apiSuccess envelope missing/,
);
record('apiSuccess wrapper without data fails closed');

const files = [
  '/tmp/persist/v3/kv/SESSION/blobs/abc',
  '/tmp/persist/v3/cache/miniflare-CacheObject/metadata.sqlite',
  '/tmp/persist/v3/d1/miniflare-D1DatabaseObject/xyz.sqlite',
];
assert.deepEqual(d1PersistPaths(files), [files[2]]);
assert.equal(kvOnlyPersist(files.slice(0, 1)), true);
assert.equal(kvOnlyPersist(files), false);
record('D1 persist detection does not treat KV session blobs as D1');

const redacted = sanitizeValue({
  cookie: 'astro-session=secret',
  challenge: 'abc',
  title: 'ok',
});
assert.equal(redacted.cookie, '[redacted]');
assert.equal(redacted.challenge, '[redacted]');
assert.equal(redacted.title, 'ok');
assert.ok(!sanitizeText('Set-Cookie: astro-session=secret\nReady on http://127.0.0.1:9').includes('astro-session='));
record('Sanitizer redacts session/passkey fields and leaves synthetic titles');

assert.ok(workerdReady('Ready on http://127.0.0.1:50248'));
assert.equal(workerdReady('GET / 200'), false);
const bindings = localBindingTable(`
env.SESSION                                                      KV Namespace              local
env.DB (dinkuskit-cms-operation-fixture)                         D1 Database               local
env.MEDIA (dinkuskit-cms-operation-media-fixture)                R2 Bucket                 local
`);
assert.equal(bindings.d1Local, true);
assert.equal(bindings.r2Local, true);
record('Workerd ready and local D1/R2 binding lines require actual log evidence');

const proof = contentProof(official);
assert.equal(proof.title, 'Live title');
assert.equal(proof.hasRev, true);
assert.equal(proof.status, 'published');
record('Content proof stores title/status only, not raw credential-bearing bodies');

const recorded = mergeRecordedPids([11, 12], 10);
assert.ok(recorded.includes(10) && recorded.includes(11) && recorded.includes(12));
assert.deepEqual(recordedPidsStillAlive([process.pid, 999_999_999]), [process.pid]);
assert.deepEqual(
  leftoverOwned([{
    label: 'dead-parent',
    recordedPids: [process.pid],
    releasedPids: [],
  }]).map((entry) => entry.pid),
  [process.pid],
);
assert.deepEqual(
  leftoverOwned([{
    label: 'released-root',
    recordedPids: [process.pid],
    releasedPids: [process.pid],
  }]),
  [],
);
record('Cleanup leftover uses recorded owned PIDs, not only children of a dead parent');

console.log(checks.map((check) => `PASS ${check}`).join('\n'));
