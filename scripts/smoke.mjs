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
const child = spawn(process.execPath, ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production' },
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
const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(5000), ...options });
const checks = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !exited; attempt++) {
    try {
      await request('/');
      ready = true;
      break;
    } catch { await sleep(200); }
  }
  assert.ok(ready, `Server failed to start: ${logs.slice(-3000)}`);
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
    assert.ok(html.includes(`href="https://dinkuskit.com${path}"`), `${path}: canonical URL`);
    checks.push(`${path}: seeded CMS title, native block content and canonical URL`);
  }
  const admin = await request('/_emdash/admin', { redirect: 'manual' });
  assert.ok([200, 301, 302, 303, 307, 308].includes(admin.status), 'EmDash admin route');
  if (admin.status !== 200) {
    const target = new URL(admin.headers.get('location'), base);
    assert.equal(target.origin, base, 'Local admin redirect stays local');
    assert.ok(target.pathname.startsWith('/_emdash/'), 'Admin redirects into EmDash');
    const page = await request(target.pathname + target.search);
    assert.equal(page.status, 200, 'EmDash setup/login loads');
    assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  }
  checks.push('EmDash admin/setup route is reachable (no login or account creation performed)');
  assert.equal((await request('/not-a-real-page')).status, 404);
  checks.push('Unknown route returns 404');
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} finally {
  if (!exited) child.kill('SIGTERM');
  await Promise.race([exit, sleep(5000)]);
  if (!exited) { child.kill('SIGKILL'); await exit; }
  const root = '.grilltrack/work/website-foundation';
  await mkdir(root, { recursive: true });
  await writeFile(`${root}/smoke-server.log`, logs);
  await writeFile(`${root}/smoke-results.json`, JSON.stringify({ at: new Date().toISOString(), checks, serverStopped: exited }, null, 2) + '\n');
}
