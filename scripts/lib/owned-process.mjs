/**
 * Owned-process tracking for loopback wrangler/workerd qualification.
 *
 * Only PIDs recorded from a spawn we started (root + descendants observed
 * while that tree was alive) may be signaled. Foreign processes are never
 * selected by name, port, or a dead parent's later pgrep.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

export function descendantPids(pid) {
  const found = [];
  const queue = [pid];
  while (queue.length) {
    const current = queue.shift();
    try {
      const kids = execFileSync('pgrep', ['-P', String(current)], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(Number);
      for (const kid of kids) {
        if (!found.includes(kid)) {
          found.push(kid);
          queue.push(kid);
        }
      }
    } catch {
      // pgrep exits 1 when the process has no children or the parent is gone.
    }
  }
  return found;
}

export function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function mergeRecordedPids(recorded, rootPid) {
  const next = new Set((recorded ?? []).filter((pid) => Number.isInteger(pid) && pid > 0));
  if (Number.isInteger(rootPid) && rootPid > 0) next.add(rootPid);
  for (const pid of [...next]) {
    for (const child of descendantPids(pid)) next.add(child);
  }
  return [...next];
}

export function recordedPidsStillAlive(recorded) {
  return (recorded ?? []).filter((pid) => processAlive(pid));
}

export function markReleasedPids(proc) {
  proc.releasedPids = proc.releasedPids ?? [];
  for (const pid of proc.recordedPids ?? []) {
    if (!processAlive(pid) && !proc.releasedPids.includes(pid)) proc.releasedPids.push(pid);
  }
  return proc.releasedPids;
}

export function killableOwnedPids(proc) {
  const released = new Set(proc.releasedPids ?? []);
  return (proc.recordedPids ?? []).filter((pid) => !released.has(pid) && processAlive(pid));
}

export function leftoverOwned(owned) {
  return owned.flatMap((proc) => {
    const recorded = proc.recordedPids ?? [];
    const released = new Set(proc.releasedPids ?? []);
    const leftover = recorded.filter((pid) => !released.has(pid) && processAlive(pid));
    return leftover.map((pid) => ({ label: proc.label, pid, recorded }));
  });
}

export async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

export async function portReleased(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => done(true));
    });
  });
}

export function spawnLogged(owned, spawn, { label, command, args, options = {} }) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-400_000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const record = {
    label,
    pid: child.pid,
    recordedPids: mergeRecordedPids([], child.pid),
    releasedPids: [],
    descendantsAtStart: descendantPids(child.pid),
    child,
    output: () => output,
    exitCode: null,
    signal: null,
    stoppedInFinally: false,
    killedTree: [],
  };
  record.exit = new Promise((done) => {
    child.once('exit', (code, signal) => {
      record.exitCode = code;
      record.signal = signal;
      done({ code, signal });
    });
    child.once('error', (error) => {
      output += String(error);
      record.exitCode = 1;
      done({ code: 1, signal: null, error });
    });
  });
  owned.push(record);
  return record;
}

export function rememberOwnedTree(proc) {
  proc.recordedPids = mergeRecordedPids(proc.recordedPids ?? [], proc.pid);
  markReleasedPids(proc);
  return proc.recordedPids;
}

export async function stopOwned(proc, { finallyBlock = false, termWaitMs = 15_000 } = {}) {
  if (!proc) return { code: null, signal: null };
  rememberOwnedTree(proc);
  if (!proc.child || proc.child.exitCode !== null) {
    proc.stoppedInFinally = proc.stoppedInFinally || finallyBlock;
    return proc.exit ? proc.exit : { code: proc.exitCode ?? null, signal: proc.signal ?? null };
  }
  rememberOwnedTree(proc);
  const tree = killableOwnedPids(proc);
  proc.killedTree = [...tree];
  try {
    proc.child.kill('SIGTERM');
  } catch {
    // already gone
  }
  for (const pid of tree) {
    if (pid !== proc.pid) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
  const finished = await Promise.race([proc.exit, sleep(termWaitMs).then(() => null)]);
  rememberOwnedTree(proc);
  if (!finished) {
    for (const pid of killableOwnedPids(proc)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    await proc.exit;
  }
  rememberOwnedTree(proc);
  proc.stoppedInFinally = proc.stoppedInFinally || finallyBlock;
  return { code: proc.exitCode, signal: proc.signal };
}
