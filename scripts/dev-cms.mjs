import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { dev } from 'astro';

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const host = '127.0.0.1';
const base = `http://${host}:${port}`;
const request = (path, options = {}) => fetch(base + path, {
  signal: AbortSignal.timeout(8000),
  redirect: 'manual',
  ...options,
});
const checks = [];
let server;
let address = null;
let serverStopped = false;
let listenerClosed = false;
let stopError = null;
let startError = null;
try {
  server = await dev({ server: { host, port } });
  address = server.address;
  assert.equal(address?.port, port, 'Public Astro dev API bound the requested port');
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const setup = await request('/_emdash/admin/setup');
      if ([200, 301, 302, 303, 307, 308].includes(setup.status)) {
        ready = true;
        break;
      }
      const admin = await request('/_emdash/admin');
      if ([200, 301, 302, 303, 307, 308].includes(admin.status)) {
        ready = true;
        break;
      }
    } catch { await sleep(200); }
  }
  assert.ok(ready, `Astro dev API failed to serve setup on ${base}`);
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
  checks.push('Astro public dev API on 127.0.0.1 still serves the local EmDash setup form (no account created)');
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} catch (error) {
  startError = error;
} finally {
  if (server) {
    try {
      await server.stop();
      serverStopped = true;
    } catch (error) {
      stopError = String(error);
    }
  }
  listenerClosed = await new Promise(resolve => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
  const root = '.grilltrack/work/website-review-repair-20260930/after';
  const receipt = {
    at: new Date().toISOString(),
    api: "import { dev } from 'astro'",
    host,
    port,
    address: address && { address: address.address, family: address.family, port: address.port },
    checks,
    serverStopped,
    listenerClosed,
    stop: { method: 'server.stop', completed: serverStopped, error: stopError },
  };
  await mkdir(root, { recursive: true });
  await writeFile(`${root}/dev-cms-server.log`, [
    `api=import { dev } from 'astro'`,
    `host=${host}`,
    `port=${port}`,
    `address=${address?.address ?? ''}`,
    `boundPort=${address?.port ?? ''}`,
    `family=${address?.family ?? ''}`,
    `serverStopped=${serverStopped}`,
    `listenerClosed=${listenerClosed}`,
    stopError ? `stopError=${stopError}` : '',
  ].filter(Boolean).join('\n') + '\n');
  await writeFile(`${root}/dev-cms-results.json`, JSON.stringify(receipt, null, 2) + '\n');
}
if (startError) throw startError;
assert.ok(serverStopped, 'Public Astro dev API server.stop completed');
assert.ok(listenerClosed, 'Exact own direct dev server port is closed after server.stop');
