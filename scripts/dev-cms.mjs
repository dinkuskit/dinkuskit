import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn('node_modules/.bin/astro', ['dev', '--host', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
const capture = chunk => { logs = (logs + chunk.toString()).slice(-200_000); };
child.stdout.on('data', capture);
child.stderr.on('data', capture);
let exited = false;
const exit = new Promise(resolve => {
  child.once('exit', () => { exited = true; resolve(); });
  child.once('error', error => { logs += String(error); exited = true; resolve(); });
});
const request = (path, options = {}) => fetch(base + path, {
  signal: AbortSignal.timeout(8000),
  redirect: 'manual',
  ...options,
});
const checks = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 150 && !exited; attempt++) {
    try {
      const home = await request('/');
      if (home.status === 200) {
        ready = true;
        break;
      }
    } catch { await sleep(200); }
  }
  assert.ok(ready, `Astro dev failed to start: ${logs.slice(-3000)}`);
  const admin = await request('/_emdash/admin');
  assert.ok([200, 301, 302, 303, 307, 308].includes(admin.status), 'Local dev admin route');
  let setup = admin;
  if (admin.status !== 200) {
    const target = new URL(admin.headers.get('location'), base);
    assert.equal(target.origin, base, 'Local admin redirect stays on the bound loopback origin');
    assert.ok(target.pathname.startsWith('/_emdash/'), 'Local admin redirects into EmDash');
    setup = await request(target.pathname + target.search);
  }
  assert.equal(setup.status, 200, 'Local Astro dev serves EmDash setup');
  assert.match(setup.headers.get('content-type') ?? '', /text\/html/);
  const html = await setup.text();
  assert.ok(html.includes('My Awesome Blog') || html.toLowerCase().includes('setup'), 'Local setup form is present');
  assert.ok(!/probe@example\.test|spoof@example\.test/.test(html), 'No probe account was created');
  checks.push('Astro dev on 127.0.0.1 still serves the local EmDash setup form (no account created)');
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} finally {
  if (!exited) child.kill('SIGTERM');
  await Promise.race([exit, sleep(8000)]);
  if (!exited) { child.kill('SIGKILL'); await exit; }
  const root = '.grilltrack/work/website-review-repair-20260930/after';
  await mkdir(root, { recursive: true });
  await writeFile(`${root}/dev-cms-server.log`, logs);
  await writeFile(`${root}/dev-cms-results.json`, JSON.stringify({ at: new Date().toISOString(), checks, serverStopped: exited }, null, 2) + '\n');
}
