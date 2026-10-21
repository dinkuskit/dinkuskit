import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// The docs preview fixture (its own EmDash SQLite database), run as Astro's
// development server or as the production build, for the docs route tests.
export const WORK = new URL('../../.grilltrack/work/docs-preview/', import.meta.url);

/** Start from an empty database: the next server start loads the seed. */
export async function resetDatabase() {
  await rm(new URL('./data.db', WORK), { force: true });
  for (const suffix of ['-wal', '-shm']) await rm(new URL(`./data.db${suffix}`, WORK), { force: true });
  await rm(new URL('./uploads/', WORK), { recursive: true, force: true });
}

export async function unusedPort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export function start(mode, port) {
  const args = mode === 'development'
    ? ['node_modules/astro/bin/astro.mjs', 'dev', '--config', 'fixtures/docs-preview/astro.config.mjs', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock']
    : [new URL('./dist/server/entry.mjs', WORK).pathname];
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ASTRO_DEV_BACKGROUND: '1', ASTRO_TELEMETRY_DISABLED: '1', HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-30_000); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-30_000); });
  const exited = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    logs: () => logs,
    request: (path, options = {}) => fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(60_000), ...options }),
    async ready() {
      for (let attempt = 0; attempt < 240 && child.exitCode === null; attempt++) {
        try { await fetch(`${base}/llms.txt`, { signal: AbortSignal.timeout(60_000) }); return; } catch { await delay(250); }
      }
      assert.fail(`Documentation ${mode} renderer did not start: ${logs}`);
    },
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    },
  };
}
