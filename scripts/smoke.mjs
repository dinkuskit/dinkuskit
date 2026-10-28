import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { rememberOwnedTree, spawnLogged, stopOwned } from './lib/cms-operation-helpers.mjs';

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
  const record = spawnLogged(children, spawn, {
    label,
    command: join(root, 'node_modules/.bin/wrangler'),
    args: [
      'dev', '--local', '--persist-to', persistTo,
      '--port', String(port), '--ip', '127.0.0.1', '--config', config,
    ],
    options: {
      cwd: root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  });
  record.logs = () => record.output().slice(-200_000);
  record.exited = () =>
    record.exitCode !== null ||
    record.signal !== null ||
    record.child.exitCode !== null ||
    record.child.signalCode !== null;
  record.port = port;
  return record;
}

async function stopWorker(record) {
  if (!record) return;
  try {
    await stopOwned(record, { termWaitMs: 5000, killWaitMs: 5000 });
  } finally {
    record.child?.stdout?.destroy();
    record.child?.stderr?.destroy();
  }
}

function request(base, path, options = {}) {
  return fetch(base + path, {
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
    ...options,
  });
}

async function assertDocsMcpClosed(base) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-11-25',
    authorization: 'Bearer ec_pat_ignored',
  };
  const call = (method, params) => request(base, '/docs/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const listed = await call('tools/list', {});
  assert.equal(listed.status, 200, 'docs MCP tools/list');
  const tools = await listed.json();
  assert.deepEqual(tools.result.tools.map(tool => tool.name), ['search_docs', 'get_docs']);
  const searched = await call('tools/call', { name: 'search_docs', arguments: { query: 'Choose your path' } });
  const read = await call('tools/call', { name: 'get_docs', arguments: { ids: ['start-here', 'store-owners/test-order', 'https://example.invalid/secret'] } });
  const dumped = JSON.stringify({ searched: await searched.json(), read: await read.json() });
  assert.equal(dumped.includes('Choose your path and check requirements'), false, 'docs MCP must not return a draft');
  assert.equal(dumped.includes('What counts as success'), false, 'docs MCP must not return an unpublished test-order article');
  assert.equal((await request(base, '/docs/mcp')).status, 405);
}

async function waitReady(record, base) {
  for (let attempt = 0; attempt < 120 && !record.exited(); attempt++) {
    rememberOwnedTree(record);
    try {
      await request(base, '/');
      rememberOwnedTree(record);
      return true;
    } catch {
      await sleep(500);
    }
  }
  rememberOwnedTree(record);
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
  assert.ok(!/Run your store yourself, or with the agent you choose/.test(freshHomeBody), 'Fresh production must not already contain seeded marketing copy');
  checks.push('Fresh production /_emdash GET/POST, spoofed Host/Origin/forwarded/cookie/query, encoded variants, and media are denied before any setup mutation');
  // Draft documentation must never become a public corpus, even through a guessed URL.
  assert.deepEqual(await (await request(base, '/docs/search.json')).json(), []);
  for (const path of ['/docs', '/docs/start-here', '/docs/start-here?preview=1', '/docs/markdown/start-here.md', '/llms.txt', '/docs/internal-plan']) {
    const response = await request(base, path);
    assert.equal(response.status, 404, `${path}: draft documentation is excluded`);
    assert.ok(!(await response.text()).includes('Choose your path and check requirements'), `${path}: no draft content`);
  }
  await assertDocsMcpClosed(base);
  checks.push('Production excludes draft documentation from HTML, Markdown, search, llms.txt and the docs MCP; query parameters cannot enable previews');
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
  const docsRows = JSON.parse(execFileSync(join(root, 'node_modules/.bin/wrangler'), [
    'd1', 'execute', 'DB', '--local', '--persist-to', persistTo, '--config', join(root, 'dist/server/wrangler.json'), '--json',
    '--command', "SELECT status, COUNT(*) AS count FROM ec_docs WHERE deleted_at IS NULL GROUP BY status",
  ], { cwd: root, encoding: 'utf8' }))[0].results;
  assert.deepEqual(docsRows, [{ status: 'draft', count: 13 }], 'seed loads the docs collection with 13 unpublished entries');
  checks.push('Seed created the docs collection in D1 with 13 unpublished entries');

  const production = await startWorker('production-seeded', join(root, 'dist/server/wrangler.json'), port);
  assert.ok(await waitReady(production, base), `Seeded production workerd failed to start: ${production.logs().slice(-3000)}`);
  for (const [path, heading, body] of [
    ['/', 'Run your store yourself, or with the agent you choose.', 'Your agent or your hands, same tools'],
    ['/getting-started', 'How DinkusKit fits together.', 'Ways to run it'],
  ]) {
    const response = await request(base, path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(heading), `${path}: CMS title`);
    assert.ok(html.includes('data-native-blocks'), `${path}: native blocks wrapper`);
    assert.ok(html.includes(body), `${path}: native block content rendered`);
    checks.push(`${path}: seeded CMS title and native block content on production workerd`);
    if (path === '/') {
      assert.ok(html.includes('the agent you choose help through the same tools, with only the access you give it'), 'Home describes the owner\'s own agent on the same tools, limited to the access given');
      assert.ok(html.includes('take its key back any time'), 'Home says an agent\'s access can be taken back');
      assert.ok(!html.includes('one chat box'), 'Home does not promise universal actions from one chat box');
      checks.push('Home renders the owner\'s own agent on the same tools, limited and revocable access, no one chat box');
    }
    if (path === '/getting-started') {
      assert.ok(!html.includes('Inventory Connect') && !html.includes('Trial access'), `${path}: no retired Inventory-first copy`);
      assert.ok(html.includes('so you don&#39;t depend on us') || html.includes("so you don't depend on us"), `${path}: ways to run it, planned self-hosting labeled`);
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
      assert.ok(
        html.includes('href="https://playground.dinkuskit.com/"')
        && html.includes('>Try the playground</a>'),
        `${path}: playground link is a clickable http(s) anchor`,
      );
      assert.ok(
        html.includes('href="https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md"')
        && html.includes('>Template setup</a>'),
        `${path}: template setup link is a clickable http(s) anchor`,
      );
    }
  }
  // The seed loads every docs article unpublished; production serves none of them.
  assert.deepEqual(await (await request(base, '/docs/search.json')).json(), []);
  for (const path of ['/docs', '/docs/start-here', '/docs/store-owners/test-order', '/docs/reference/commerce', '/docs/markdown/start-here.md', '/docs/start-here?preview=1', '/llms.txt']) {
    const response = await request(base, path);
    assert.equal(response.status, 404, `${path}: seeded draft documentation is excluded`);
    assert.ok(!(await response.text()).includes('Choose your path and check requirements'), `${path}: no draft content`);
  }
  await assertDocsMcpClosed(base);
  checks.push('Seeded production keeps the 13 unpublished docs entries out of HTML, Markdown, search, llms.txt and the docs MCP');
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
  await stopWorker(production);
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
