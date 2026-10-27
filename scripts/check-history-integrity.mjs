import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root });
const paths = git('ls-files', '-z', '--', '.grilltrack').toString().split('\0').filter(Boolean).sort();
const objects = paths.filter(path => path.startsWith('.grilltrack/lineage/objects/sha256/'));
assert.ok(objects.length, 'Expected tracked GrillTrack archive objects');
let objectBytes = 0;
for (const path of objects) {
  assert.match(path, /^\.grilltrack\/lineage\/objects\/sha256\/[0-9a-f]{64}$/);
  const file = new URL('../' + path, import.meta.url);
  assert.ok(lstatSync(file).isFile(), `Archive object must be a regular file: ${path}`);
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), path.split('/').at(-1), `Corrupt history: ${path}`);
  const attribute = git('check-attr', '-z', 'diff', '--', path).toString().split('\0')[2];
  assert.equal(attribute, 'unset', `Archive object should use opaque Git diffs: ${path}`);
  objectBytes += bytes.length;
}
for (const path of ['.grilltrack/ledger.json', '.grilltrack/events.jsonl']) {
  assert.notEqual(git('check-attr', '-z', 'diff', '--', path).toString().split('\0')[2], 'unset', `Active history must retain text diffs: ${path}`);
}

// An explicit immutable baseline proves a packaging-only cleanup preserved all
// history, including the active ledger/event stream, without relying on diffs.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--baseline'), 'Usage: check-history-integrity.mjs [--baseline <commit>]');
let baseline = null;
if (args.length) {
  baseline = git('rev-parse', '--verify', '--end-of-options', args[1] + '^{commit}').toString().trim();
  const entries = git('ls-tree', '-r', '-z', baseline, '--', '.grilltrack').toString().split('\0').filter(Boolean).map(entry => {
    const [metadata, path] = entry.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    assert.equal(type, 'blob');
    assert.equal(mode, '100644');
    return { path, oid };
  });
  assert.deepEqual(paths, entries.map(entry => entry.path).sort(), 'History paths were added or removed during packaging cleanup');
  for (const { path, oid } of entries) {
    assert.ok(readFileSync(new URL('../' + path, import.meta.url)).equals(git('cat-file', 'blob', oid)), `History changed from baseline: ${path}`);
  }
}
const snapshot = createHash('sha256');
for (const path of paths) snapshot.update(path + '\0').update(createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest());
console.log(JSON.stringify({ archiveObjects: objects.length, archiveBytes: objectBytes, historyFiles: paths.length, historySnapshotSha256: snapshot.digest('hex'), baseline, baselineByteEquality: baseline ? true : null, activeLedgerTextDiff: true }, null, 2));
