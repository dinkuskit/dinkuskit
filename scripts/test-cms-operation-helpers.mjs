import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { contentFieldData, contentProof, d1PersistPaths, kvOnlyPersist, localBindingTable, sanitizeText, sanitizeValue, unwrapApiData, unwrapContentEnvelope, workerdReady } from './lib/cms-operation-helpers.mjs';
import {
  descendantPids,
  killableOwnedPids,
  leftoverOwned,
  mergeRecordedPids,
  processAlive,
  recordedPidsStillAlive,
  rememberOwnedTree,
  spawnLogged,
  stopOwned,
} from './lib/owned-process.mjs';

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

async function waitForProcessOutput(proc, token, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!proc.output().includes(token)) {
    if (proc.child && (proc.child.exitCode !== null || proc.child.signalCode !== null || !processAlive(proc.pid))) {
      throw new Error(`Process ${proc.label ?? proc.pid} exited early before emitting ${token}: output=${proc.output()}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for process ${proc.label ?? proc.pid} to emit ${token}: output=${proc.output()}`);
    }
    await sleep(25);
  }
}

async function teardownPids(pids, timeoutMs = 2000) {
  const targetPids = [...new Set((pids ?? []).filter((p) => Number.isInteger(p) && p > 0))];
  for (const pid of targetPids) {
    if (processAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already dead
      }
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = targetPids.filter((pid) => processAlive(pid));
    if (alive.length === 0) break;
    await sleep(25);
  }
  const survivors = targetPids.filter((pid) => processAlive(pid));
  assert.deepEqual(survivors, [], `Harness teardown failed: survivors remain alive: ${survivors.join(', ')}`);
}

// Regression: Released live task process tree is neither rediscovered/scanned nor signaled
{
  const harnessOwned = [];
  const parentCode = `
    import { spawn } from "node:child_process";
    const kidCode = "setTimeout(() => process.exit(0), 4000); console.log('KID_READY');";
    const kid = spawn(process.execPath, ['-e', kidCode], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    kid.stdout.on('data', () => console.log('PARENT_READY'));
    setTimeout(() => process.exit(0), 4000);
  `;
  const parentProc = spawnLogged(harnessOwned, spawn, {
    label: 'regression-released-tree-parent',
    command: process.execPath,
    args: ['--input-type=module', '-e', parentCode],
  });

  let childPid = null;
  try {
    await waitForProcessOutput(parentProc, 'PARENT_READY', 3000);
    const kids = descendantPids(parentProc.pid);
    assert.equal(kids.length, 1, 'Live descendant must exist under parent');
    childPid = kids[0];

    assert.equal(processAlive(parentProc.pid), true, 'Parent must be alive');
    assert.equal(processAlive(childPid), true, 'Child must be alive');

    // Create a proc record marked released for the helper-under-test
    const procUnderTest = {
      label: 'released-parent-test',
      pid: parentProc.pid,
      child: parentProc.child,
      recordedPids: [parentProc.pid],
      releasedPids: [parentProc.pid],
      exitCode: null,
      signal: null,
      exit: parentProc.exit,
      killedTree: [],
    };

    // 1. Prove descendant is neither rediscovered nor scanned from released parent PID
    rememberOwnedTree(procUnderTest);
    assert.ok(procUnderTest.releasedPids.includes(parentProc.pid), 'Parent PID must remain released');
    assert.equal(
      procUnderTest.recordedPids.includes(childPid),
      false,
      'Live descendant must NOT be rediscovered/scanned from released parent PID',
    );

    // 2. Prove direct proc.child.kill and stopOwned do NOT signal released root PID
    await stopOwned(procUnderTest, { termWaitMs: 100, killWaitMs: 100 });
    assert.equal(
      procUnderTest.killedTree?.includes(parentProc.pid),
      false,
      'Released parent PID must not be signaled or included in killedTree',
    );
    assert.equal(
      processAlive(parentProc.pid),
      true,
      'Released parent PID must remain alive (not killed by stopOwned)',
    );

    record('rememberOwnedTree and stopOwned neither rediscover/scan nor signal released live task process tree');
  } finally {
    await teardownPids([parentProc.pid, childPid]);
  }
}

// Regression: Released root after SIGTERM is not signaled or waited on PID reuse during escalation
{
  const rootPid = 100_001;
  const descendantPid = 100_002;
  const childKills = [];
  const directKills = [];

  let rootTerminated = false;
  let descendantTerminated = false;

  const mockChild = {
    exitCode: null,
    kill: (sig) => {
      childKills.push(sig);
      if (sig === 'SIGTERM') {
        rootTerminated = true;
      }
    },
  };

  const proc = {
    label: 'mock-reused-root',
    pid: rootPid,
    child: mockChild,
    recordedPids: [rootPid, descendantPid],
    releasedPids: [],
    exitCode: null,
    signal: 'SIGTERM',
    exit: Promise.resolve({ code: null, signal: 'SIGTERM' }),
  };

  let simulatedReuse = false;
  const controlledProcessAlive = (pid) => {
    if (pid === descendantPid) return !descendantTerminated;
    if (pid === rootPid) {
      if (!rootTerminated) return true;
      if (!simulatedReuse) {
        simulatedReuse = true;
        return false;
      }
      return true;
    }
    return false;
  };

  const mockKill = (pid, sig) => {
    directKills.push({ pid, sig });
    if (pid === descendantPid && sig === 'SIGKILL') {
      descendantTerminated = true;
    }
  };

  await stopOwned(proc, {
    termWaitMs: 30,
    killWaitMs: 30,
    _processAlive: controlledProcessAlive,
    _kill: mockKill,
    _descendantPids: () => [],
  });

  assert.deepEqual(childKills, ['SIGTERM'], 'Root must only receive initial SIGTERM, NEVER SIGKILL on PID reuse');
  assert.ok(proc.releasedPids.includes(rootPid), 'Root PID must be recorded in releasedPids');
  assert.deepEqual(
    directKills,
    [
      { pid: descendantPid, sig: 'SIGTERM' },
      { pid: descendantPid, sig: 'SIGKILL' },
    ],
    'Descendant must receive SIGTERM then escalate to SIGKILL',
  );
  record('stopOwned does not signal released root PID if reused after SIGTERM');
}

// Regression: Fail closed if recorded survivors remain alive after escalation
const impossiblePid = 2_147_483_647;
const fakeProc = {
  label: 'stub-survivor',
  pid: impossiblePid,
  recordedPids: [impossiblePid],
  releasedPids: [],
  child: null,
  exitCode: 0,
  signal: null,
};
await assert.rejects(
  async () => {
    await stopOwned(fakeProc, {
      termWaitMs: 20,
      killWaitMs: 20,
      _processAlive: (p) => p === impossiblePid,
      _kill: () => {},
      _descendantPids: () => [],
    });
  },
  /survivors remain alive: 2147483647/,
);
record('stopOwned fails closed and throws when recorded survivors remain alive after escalation');

// Regression Scenario A: Live recorded descendant surviving normal parent exit 0 (exercises line 152 in old helper)
{
  const owned = [];
  const parentCode = `
    import { spawn } from "node:child_process";
    const kidCode = "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 4000); console.log('KID_READY');";
    const kid = spawn(process.execPath, ['-e', kidCode], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    kid.stdout.on('data', () => {
      console.log('PARENT_READY');
    });
    process.on('SIGHUP', () => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 4000);
  `;
  const proc = spawnLogged(owned, spawn, {
    label: 'regression-parent-exit-first',
    command: process.execPath,
    args: ['--input-type=module', '-e', parentCode],
  });

  let childPid = null;
  try {
    await waitForProcessOutput(proc, 'PARENT_READY', 3000);
    rememberOwnedTree(proc);
    const kids = proc.recordedPids.filter((p) => p !== proc.pid);
    assert.equal(kids.length, 1, 'Descendant PID must be recorded while parent is alive');
    childPid = kids[0];

    assert.equal(processAlive(proc.pid), true, 'Parent must be alive before exit');
    assert.equal(processAlive(childPid), true, 'Descendant must be alive before parent exit');

    // Trigger normal exit 0 on parent via SIGHUP
    process.kill(proc.pid, 'SIGHUP');
    await proc.exit;
    assert.equal(proc.exitCode, 0, 'Parent must exit with code 0');
    assert.equal(proc.child.exitCode, 0, 'proc.child.exitCode must be 0 (proving line 152 in old helper)');
    assert.equal(processAlive(childPid), true, 'Descendant must still be alive after parent exit 0');

    const res = await stopOwned(proc, { termWaitMs: 150, killWaitMs: 1000 });
    assert.equal(processAlive(childPid), false, 'Descendant must be terminated by stopOwned');
    assert.deepEqual(killableOwnedPids(proc), [], 'No killable owned PIDs may remain');
    assert.deepEqual(leftoverOwned([proc]), [], 'No leftover owned processes may remain');
    record('stopOwned cleans up recorded descendants surviving normal parent exit 0, escalating past ignored SIGTERM');
  } finally {
    await teardownPids([proc.pid, childPid]);
  }
}

// Regression Scenario B: Descendant ignoring SIGTERM when parent exits during SIGTERM phase (exercises promise race in old helper)
{
  const owned = [];
  const parentCode = `
    import { spawn } from "node:child_process";
    const kidCode = "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 4000); console.log('KID_READY');";
    const kid = spawn(process.execPath, ['-e', kidCode], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    kid.stdout.on('data', () => console.log('PARENT_READY'));
    setTimeout(() => process.exit(0), 4000);
  `;
  const proc = spawnLogged(owned, spawn, {
    label: 'regression-descendant-ignores-sigterm',
    command: process.execPath,
    args: ['--input-type=module', '-e', parentCode],
  });

  let childPid = null;
  try {
    await waitForProcessOutput(proc, 'PARENT_READY', 3000);
    rememberOwnedTree(proc);
    const kids = proc.recordedPids.filter((p) => p !== proc.pid);
    assert.equal(kids.length, 1, 'Descendant PID must be recorded');
    childPid = kids[0];

    assert.equal(processAlive(childPid), true, 'Child must be alive before stopOwned');
    assert.equal(processAlive(proc.pid), true, 'Parent must be alive before stopOwned');

    const res = await stopOwned(proc, { termWaitMs: 150, killWaitMs: 1000 });
    assert.equal(processAlive(childPid), false, 'Descendant must be terminated after escalation');
    assert.equal(processAlive(proc.pid), false, 'Parent must be terminated');
    assert.deepEqual(killableOwnedPids(proc), [], 'No killable owned PIDs may remain');
    assert.deepEqual(leftoverOwned([proc]), [], 'No leftover owned processes may remain');
    record('stopOwned escalates to SIGKILL independently of parent exit when descendant ignores SIGTERM');
  } finally {
    await teardownPids([proc.pid, childPid]);
  }
}
