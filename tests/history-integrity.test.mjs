import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, copyFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('archive audit accepts unchanged bytes and rejects corruption, symlinks and hidden active history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dinkus-history-audit-'));
  const run = (...args) => spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' });
  const check = (...args) => run(process.execPath, 'scripts/check-history-integrity.mjs', ...args);
  const attribute = '.grilltrack/lineage/objects/sha256/* -diff linguist-generated=true\n';
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, '.grilltrack/lineage/objects/sha256'), { recursive: true });
    await copyFile(new URL('../scripts/check-history-integrity.mjs', import.meta.url), join(root, 'scripts/check-history-integrity.mjs'));
    await writeFile(join(root, '.gitattributes'), attribute);
    await writeFile(join(root, '.grilltrack/ledger.json'), '{}\n');
    await writeFile(join(root, '.grilltrack/events.jsonl'), '{}\n');
    const bytes = Buffer.from('synthetic immutable history\n');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const object = join(root, '.grilltrack/lineage/objects/sha256', digest);
    await writeFile(object, bytes);
    assert.equal(run('git', 'init', '--quiet').status, 0);
    assert.equal(run('git', 'add', '.').status, 0);
    assert.equal(run('git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Synthetic history baseline').status, 0);
    assert.equal(check('--baseline', 'HEAD').status, 0);

    await writeFile(object, 'changed bytes');
    const corrupt = check();
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /Corrupt history/);
    await writeFile(object, bytes);

    await writeFile(join(root, '.grilltrack/ledger.json'), '{"changed":true}\n');
    assert.notEqual(check('--baseline', 'HEAD').status, 0);
    await writeFile(join(root, '.grilltrack/ledger.json'), '{}\n');

    await writeFile(join(root, '.gitattributes'), attribute + '.grilltrack/ledger.json -diff\n');
    assert.notEqual(check().status, 0);
    await writeFile(join(root, '.gitattributes'), attribute);

    await rm(object);
    await symlink(join(root, '.grilltrack/ledger.json'), object);
    assert.notEqual(check().status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
