import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const persistTo = await mkdtemp(join(tmpdir(), 'dk-smoke-'));
const fixtureConfig = join(root, 'dist/server/wrangler.smoke-seed.json');
const workRoot = join(root, '.grilltrack/work/website-review-repair-20260930/after');
const checks = [];
const children = [];

async function reservePort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}

function hashPersist(dir) {
  if (!existsSync(dir)) return 'missing';
  const files = [];
  const walk = current => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (/\.(sqlite|sqlite3|db)$/i.test(name) && !/-wal$|-shm$/.test(name)) {
        files.push(path);
      }
    }
  };
  walk(dir);
  files.sort();
  return createHash('sha256')
    .update(files.map(path => `${path.slice(dir.length)}:${readFileSync(path).toString('hex')}`).join('|'))
    .digest('hex');
}

function writeFixtureConfig() {
  const built = JSON.parse(readFileSync(join(root, 'dist/server/wrangler.json'), 'utf8'));
  copyFileSync(join(root, 'tests/fixtures/cms-proof-als.mjs'), join(root, 'dist/server/cms-proof-als.mjs'));
  copyFileSync(join(root, 'tests/fixtures/built-cms-seed-entry.mjs'), join(root, 'dist/server/cms-seed-entry.mjs'));
  writeFileSync(fixtureConfig, JSON.stringify({
    ...built,
    name: 'dinkuskit-website-smoke-seed',
    main: 'cms-seed-entry.mjs',
    no_bundle: true,
  }, null, 2));
}

async function startWorker(label, config, port) {
  const child = spawn(join(root, 'node_modules/.bin/wrangler'), [
    'dev', '--local', '--persist-to', persistTo,
    '--port', String(port), '--ip', '127.0.0.1', '--config', config,
  ], {
    cwd: root,
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
  const record = { label, child, logs: () => logs, exited: () => exited, exit, port };
  children.push(record);
  return record;
}

async function stopWorker(record) {
  if (!record || record.exited()) return;
  record.child.kill('SIGTERM');
  await Promise.race([record.exit, sleep(5000)]);
  if (!record.exited()) {
    record.child.kill('SIGKILL');
    await record.exit;
  }
}

function request(base, path, options = {}) {
  return fetch(base + path, {
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
    ...options,
  });
}

async function waitReady(record, base) {
  for (let attempt = 0; attempt < 120 && !record.exited(); attempt++) {
    try {
      await request(base, '/');
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

async function assertNamespaceDenied(base, label, path, options = {}) {
  const response = await request(base, path, options);
  const body = await response.text();
  assert.equal(response.status, 404, `${label}: fail-closed status`);
  assert.equal(response.headers.get('location'), null, `${label}: no CMS redirect`);
  assert.ok(!/My Awesome Blog|Create your admin|passkey registration/i.test(body), `${label}: no setup HTML`);
  assert.ok(Buffer.byteLength(body) < 2000, `${label}: no admin bundle`);
  return response;
}

async function denyCmsSurface(base, prefix) {
  await assertNamespaceDenied(base, `${prefix} GET admin`, '/_emdash/admin');
  await assertNamespaceDenied(base, `${prefix} GET setup`, '/_emdash/admin/setup');
  await assertNamespaceDenied(base, `${prefix} GET setup query`, '/_emdash/admin/setup?dev=1&unlock=1');
  await assertNamespaceDenied(base, `${prefix} POST setup`, '/_emdash/api/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'DinkusKit', tagline: 'Local CMS fixture', includeContent: true }),
  });
  await assertNamespaceDenied(base, `${prefix} POST setup/admin`, '/_emdash/api/setup/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'probe@example.test', name: 'Probe' }),
  });
  await assertNamespaceDenied(base, `${prefix} POST setup/admin/verify`, '/_emdash/api/setup/admin/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'probe@example.test' }),
  });
  await assertNamespaceDenied(base, `${prefix} spoof Host GET setup`, '/_emdash/admin/setup', {
    headers: {
      Host: 'localhost',
      'X-Forwarded-Host': 'localhost',
      'X-Forwarded-For': '127.0.0.1',
      Origin: 'http://localhost',
      Referer: 'http://localhost/_emdash/admin/setup',
      Cookie: 'emdash_session=fake; cms_proof=1',
    },
  });
  await assertNamespaceDenied(base, `${prefix} spoof Host POST setup/admin`, '/_emdash/api/setup/admin', {
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
  await assertNamespaceDenied(base, `${prefix} encoded namespace`, '/%5F%65%6D%64%61%73%68/admin');
  await assertNamespaceDenied(base, `${prefix} duplicate slash`, '//_emdash/admin/setup');
  await assertNamespaceDenied(base, `${prefix} CMS media`, '/_emdash/api/media/file/missing');
}

try {
  writeFixtureConfig();
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;

  const fresh = await startWorker('production-fresh', join(root, 'dist/server/wrangler.json'), port);
  assert.ok(await waitReady(fresh, base), `Fresh production workerd failed to start: ${fresh.logs().slice(-3000)}`);
  const beforeMutations = hashPersist(persistTo);
  await denyCmsSurface(base, 'fresh');
  assert.equal(hashPersist(persistTo), beforeMutations, 'Fresh production CMS probes must not mutate D1');
  const freshHome = await request(base, '/');
  const freshHomeBody = await freshHome.text();
  assert.ok(!/Commerce that belongs in EmDash/.test(freshHomeBody), 'Fresh production must not already contain seeded marketing copy');
  checks.push('Fresh production /_emdash GET/POST, spoofed Host/Origin/forwarded/cookie/query, encoded variants, and media are denied before any setup mutation');
  await stopWorker(fresh);

  const fixture = await startWorker('cms-seed-fixture', fixtureConfig, port);
  assert.ok(await waitReady(fixture, base), `CMS seed fixture failed to start: ${fixture.logs().slice(-3000)}`);
  let seedComplete = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const seeded = await request(base, '/_emdash/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'DinkusKit', tagline: 'Local CMS fixture', includeContent: true }),
    });
    const payload = await seeded.json().catch(() => ({}));
    if (seeded.status === 409 || payload.seedComplete === true || payload.data?.seedComplete === true) {
      seedComplete = true;
      break;
    }
    assert.ok(seeded.status === 200, `fixture setup seed HTTP ${seeded.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }
  assert.ok(seedComplete, `Fixture EmDash setup did not finish applying seed/seed.json: ${fixture.logs().slice(-2000)}`);
  const editorProbe = await request(base, '/_emdash/api/settings', {
    headers: { 'x-emdash-request': '1' },
  });
  assert.ok(editorProbe.status === 401 || editorProbe.status === 403, 'Seed fixture must not create a CMS editor');
  checks.push('Dedicated fixture entry seeded persisted D1 without creating a CMS editor');
  await stopWorker(fixture);

  const production = await startWorker('production-seeded', join(root, 'dist/server/wrangler.json'), port);
  assert.ok(await waitReady(production, base), `Seeded production workerd failed to start: ${production.logs().slice(-3000)}`);
  for (const [path, heading, body] of [
    ['/', 'Commerce that belongs in EmDash.', 'Inventory, coming soon'],
    ['/getting-started', 'Your site. One connected experience.', 'Trial access'],
  ]) {
    const response = await request(base, path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(heading), `${path}: CMS title`);
    assert.ok(html.includes('data-native-blocks'), `${path}: native blocks wrapper`);
    assert.ok(html.includes(body), `${path}: native block content rendered`);
    checks.push(`${path}: seeded CMS title and native block content on production workerd`);
    if (path === '/getting-started') {
      assert.ok(
        html.includes('href="https://docs.emdashcms.com/getting-started/"')
        && html.includes('>Create your first EmDash site</a>'),
        `${path}: official install docs are a clickable http(s) anchor`,
      );
      assert.ok(
        html.includes('href="https://docs.emdashcms.com/themes/overview/"')
        && html.includes('>EmDash themes</a>'),
        `${path}: official themes docs are a clickable http(s) anchor`,
      );
      assert.ok(!html.includes('coordinator-owned') && !html.includes('handoff'), `${path}: no internal coordination copy`);
      assert.ok(html.includes('No demo or setup destination is available'), `${path}: demo/setup remain pending`);
    }
  }
  await denyCmsSurface(base, 'seeded-production');
  checks.push('Production /_emdash remains denied after fixture seed, including spoofed and encoded variants');
  const signup = await request(base, '/account/signup', { redirect: 'manual' });
  assert.equal(signup.status, 503, 'production worker fail-closes merchant routes without explicit secret/baseURL');
  checks.push('Missing merchant secret/baseURL returns 503');
  assert.notEqual((await request(base, '/__proof/mail/take', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })).status, 200);
  checks.push('Production worker does not expose proof mail take');
  assert.equal((await request(base, '/not-a-real-page')).status, 404);
  checks.push('Unknown public route still returns 404');
  console.log(checks.map(check => `PASS ${check}`).join('\n'));
  await mkdir(workRoot, { recursive: true });
  await writeFile(join(workRoot, 'smoke-server.log'), [fresh, fixture, production].map(item => `# ${item.label}\n${item.logs()}`).join('\n\n'));
  await writeFile(join(workRoot, 'smoke-results.json'), `${JSON.stringify({
    at: new Date().toISOString(),
    checks,
    persistTo,
    serversStopped: children.every(item => item.exited()),
  }, null, 2)}\n`);
} finally {
  for (const child of children) await stopWorker(child);
  await rm(fixtureConfig, { force: true });
  await rm(persistTo, { recursive: true, force: true });
}
