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
  if (!Number.isInteger(pid) || pid <= 0) return [];
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

export function mergeRecordedPids(
  recorded,
  rootPid,
  released = [],
  getDescendants = descendantPids,
  isAlive = processAlive,
) {
  const releasedSet = new Set((released ?? []).filter((pid) => Number.isInteger(pid) && pid > 0));
  const next = new Set((recorded ?? []).filter((pid) => Number.isInteger(pid) && pid > 0));
  if (Number.isInteger(rootPid) && rootPid > 0) next.add(rootPid);
  for (const pid of [...next]) {
    // No scans from released parent PIDs that might be reused.
    // Also only scan currently alive processes.
    if (!releasedSet.has(pid) && isAlive(pid)) {
      for (const child of getDescendants(pid)) next.add(child);
    }
  }
  return [...next];
}

export function recordedPidsStillAlive(recorded) {
  return (recorded ?? []).filter((pid) => processAlive(pid));
}

export function markReleasedPids(proc, isAlive = processAlive) {
  proc.releasedPids = proc.releasedPids ?? [];
  for (const pid of proc.recordedPids ?? []) {
    if (!isAlive(pid) && !proc.releasedPids.includes(pid)) proc.releasedPids.push(pid);
  }
  return proc.releasedPids;
}

export function killableOwnedPids(proc, isAlive = processAlive) {
  const released = new Set(proc.releasedPids ?? []);
  return (proc.recordedPids ?? []).filter((pid) => !released.has(pid) && isAlive(pid));
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
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-400_000);
  };
  if (child.stdout) child.stdout.on('data', capture);
  if (child.stderr) child.stderr.on('data', capture);
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

export function rememberOwnedTree(proc, isAlive = processAlive, getDescendants = descendantPids) {
  markReleasedPids(proc, isAlive);
  proc.recordedPids = mergeRecordedPids(proc.recordedPids ?? [], proc.pid, proc.releasedPids, getDescendants, isAlive);
  markReleasedPids(proc, isAlive);
  return proc.recordedPids;
}

export async function stopOwned(
  proc,
  {
    finallyBlock = false,
    termWaitMs = 15_000,
    killWaitMs = 5_000,
    _processAlive = processAlive,
    _kill = (pid, sig) => process.kill(pid, sig),
    _descendantPids = descendantPids,
  } = {}
) {
  if (!proc) return { code: null, signal: null };
  rememberOwnedTree(proc, _processAlive, _descendantPids);

  const isRootReleased = () => (proc.releasedPids ?? []).includes(proc.pid);
  const rootCanBeKilled = !isRootReleased() && proc.child && proc.child.exitCode === null && _processAlive(proc.pid);
  const rootDone = isRootReleased() || !proc.child || proc.child.exitCode !== null || !_processAlive(proc.pid);

  const initialLive = killableOwnedPids(proc, _processAlive);
  if (initialLive.length === 0 && rootDone) {
    proc.stoppedInFinally = proc.stoppedInFinally || finallyBlock;
    if (isRootReleased() || !proc.exit) {
      return { code: proc.exitCode ?? null, signal: proc.signal ?? null };
    }
    return await proc.exit;
  }

  // Record all live PIDs in killedTree
  proc.killedTree = [...new Set([...(proc.killedTree ?? []), ...initialLive])];

  // Signal SIGTERM to parent (if alive and not released) and all live recorded owned descendants
  if (rootCanBeKilled) {
    try {
      proc.child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
  for (const pid of initialLive) {
    if (pid !== proc.pid) {
      try {
        _kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }

  // Wait for parent AND live recorded descendants to exit up to termWaitMs
  const termDeadline = Date.now() + termWaitMs;
  while (Date.now() < termDeadline) {
    rememberOwnedTree(proc, _processAlive, _descendantPids);
    const alive = killableOwnedPids(proc, _processAlive);
    const parentDone = isRootReleased() || !proc.child || proc.child.exitCode !== null || !_processAlive(proc.pid);
    if (alive.length === 0 && parentDone) break;
    await sleep(Math.min(50, Math.max(10, termDeadline - Date.now())));
  }

  // If live recorded descendants or parent still remain, escalate to SIGKILL
  rememberOwnedTree(proc, _processAlive, _descendantPids);
  let stillAlive = killableOwnedPids(proc, _processAlive);
  const parentStillAlive = !isRootReleased() && proc.child && proc.child.exitCode === null && _processAlive(proc.pid);
  if (stillAlive.length > 0 || parentStillAlive) {
    proc.killedTree = [...new Set([...(proc.killedTree ?? []), ...stillAlive])];
    if (parentStillAlive) {
      try {
        proc.child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
    for (const pid of stillAlive) {
      if (pid !== proc.pid) {
        try {
          _kill(pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
    }

    // Bounded wait after SIGKILL
    const killDeadline = Date.now() + killWaitMs;
    while (Date.now() < killDeadline) {
      rememberOwnedTree(proc, _processAlive, _descendantPids);
      stillAlive = killableOwnedPids(proc, _processAlive);
      const parentDone = isRootReleased() || !proc.child || proc.child.exitCode !== null || !_processAlive(proc.pid);
      if (stillAlive.length === 0 && parentDone) break;
      await sleep(Math.min(50, Math.max(10, killDeadline - Date.now())));
    }
  }

  rememberOwnedTree(proc, _processAlive, _descendantPids);
  proc.stoppedInFinally = proc.stoppedInFinally || finallyBlock;

  // Verify no recorded survivors remain
  const survivors = killableOwnedPids(proc, _processAlive);
  if (survivors.length > 0) {
    throw new Error(
      `Owned process tree ${proc.label ?? proc.pid} failed to stop cleanly; survivors remain alive: ${survivors.join(', ')}`
    );
  }

  if (proc.exit && !isRootReleased()) {
    return await Promise.race([
      proc.exit,
      sleep(500).then(() => ({ code: proc.exitCode ?? null, signal: proc.signal ?? null })),
    ]);
  }
  return { code: proc.exitCode ?? null, signal: proc.signal ?? null };
}
