import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
const request = (path, options = {}) => fetch(base + path, {
  signal: AbortSignal.timeout(5000),
  redirect: 'manual',
  ...options,
});
const dbFiles = ['.local/content.db', '.local/content.db-wal', '.local/content.db-shm'];
const hashRuntime = () => createHash('sha256')
  .update(dbFiles.filter(existsSync).map(path => `${path}:${readFileSync(path).toString('hex')}`).join('|'))
  .digest('hex');
const assertNamespaceDenied = async (label, path, options = {}) => {
  const response = await request(path, options);
  const body = await response.text();
  assert.equal(response.status, 404, `${label}: fail-closed status`);
  assert.equal(response.headers.get('location'), null, `${label}: no CMS redirect`);
  assert.ok(!/My Awesome Blog|Create your admin|passkey registration/i.test(body), `${label}: no setup HTML`);
  assert.ok(Buffer.byteLength(body) < 2000, `${label}: no admin bundle`);
  return response;
};
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
  const beforeMutations = hashRuntime();
  await assertNamespaceDenied('GET admin', '/_emdash/admin');
  await assertNamespaceDenied('GET setup', '/_emdash/admin/setup');
  await assertNamespaceDenied('POST setup/admin', '/_emdash/api/setup/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'probe@example.test', name: 'Probe' }),
  });
  await assertNamespaceDenied('POST setup/admin/verify', '/_emdash/api/setup/admin/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'probe@example.test' }),
  });
  assert.equal(hashRuntime(), beforeMutations, 'Namespace probes must not mutate the database');
  checks.push('Production /_emdash admin, setup, and setup POST routes are denied before DB mutation');
  await assertNamespaceDenied('spoof Host localhost GET setup', '/_emdash/admin/setup', {
    headers: {
      Host: 'localhost',
      'X-Forwarded-Host': 'localhost',
      'X-Forwarded-For': '127.0.0.1',
      Origin: 'http://localhost',
      Referer: 'http://localhost/_emdash/admin/setup',
    },
  });
  await assertNamespaceDenied('spoof Host localhost POST setup/admin', '/_emdash/api/setup/admin', {
    method: 'POST',
    headers: {
      Host: 'localhost',
      'X-Forwarded-Host': 'localhost',
      'X-Forwarded-For': '127.0.0.1',
      Origin: 'http://127.0.0.1',
      Cookie: 'emdash_session=fake',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'spoof@example.test', name: 'Spoof' }),
  });
  assert.equal(hashRuntime(), beforeMutations, 'Spoofed localhost Host/headers must not unlock or mutate');
  checks.push('Spoofed localhost Host and forwarded headers do not bypass the production namespace gate');
  await assertNamespaceDenied('CMS media namespace', '/_emdash/api/media/file/missing');
  checks.push('Production CMS-hosted /_emdash media namespace is denied by the same fail-closed default');
  assert.equal((await request('/not-a-real-page')).status, 404);
  checks.push('Unknown public route still returns 404');
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
