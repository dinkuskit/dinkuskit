import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const persistTo = await mkdtemp(join(tmpdir(), 'dk-smoke-'));
const child = spawn('node_modules/.bin/wrangler', [
  'dev', '--local', '--persist-to', persistTo,
  '--port', String(port), '--ip', '127.0.0.1', '--config', 'dist/server/wrangler.json',
], {
  env: { ...process.env },
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
const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(15000), ...options });
const checks = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 120 && !exited; attempt++) {
    try {
      await request('/');
      ready = true;
      break;
    } catch { await sleep(500); }
  }
  assert.ok(ready, `Workerd failed to start: ${logs.slice(-3000)}`);
  let seedComplete = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const seeded = await request('/_emdash/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'DinkusKit', tagline: 'Local CMS fixture', includeContent: true }),
    });
    const payload = await seeded.json().catch(() => ({}));
    if (seeded.status === 409 || payload.seedComplete === true || payload.data?.seedComplete === true) {
      seedComplete = true;
      break;
    }
    assert.ok(seeded.status === 200, `setup seed HTTP ${seeded.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }
  assert.ok(seedComplete, `EmDash setup did not finish applying seed/seed.json via public /_emdash/api/setup: ${logs.slice(-2000)}`);
  checks.push('Public setup API applied seed/seed.json content without creating an editor account');
  for (const [path, heading, body] of [
    ['/', 'Commerce that belongs in EmDash.', 'Inventory, connected'],
    ['/getting-started', 'Your site. One connected experience.', 'Trial access'],
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(heading), `${path}: CMS title`);
    assert.ok(html.includes('data-native-blocks'), `${path}: native blocks wrapper`);
    assert.ok(html.includes(body), `${path}: native block content rendered`);
    checks.push(`${path}: seeded CMS title and native block content on workerd`);
  }
  const admin = await request('/_emdash/admin', { redirect: 'manual' });
  assert.ok([200, 301, 302, 303, 307, 308].includes(admin.status), 'EmDash admin route');
  checks.push('EmDash admin/setup route is reachable (no login or account creation performed)');
  const signup = await request('/account/signup', { redirect: 'manual' });
  assert.equal(signup.status, 503, 'production worker fail-closes merchant routes without explicit secret/baseURL');
  checks.push('Missing merchant secret/baseURL returns 503');
  assert.equal((await request('/__proof/mail/take', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status !== 200, true);
  checks.push('Production worker does not expose proof mail take');
  assert.equal((await request('/not-a-real-page')).status, 404);
  checks.push('Unknown route returns 404');
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} finally {
  if (!exited) child.kill('SIGTERM');
  await Promise.race([exit, sleep(5000)]);
  if (!exited) { child.kill('SIGKILL'); await exit; }
  await rm(persistTo, { recursive: true, force: true });
  const rootDir = '.grilltrack/work/website-foundation';
  await mkdir(rootDir, { recursive: true });
  await writeFile(`${rootDir}/smoke-server.log`, logs);
  await writeFile(`${rootDir}/smoke-results.json`, JSON.stringify({ at: new Date().toISOString(), checks, serverStopped: exited }, null, 2) + '\n');
}
