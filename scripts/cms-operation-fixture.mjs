import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  contentFieldData,
  contentProof,
  d1PersistPaths,
  kvOnlyPersist,
  localBindingTable,
  sanitizeText,
  unwrapApiData,
  unwrapContentEnvelope,
  workerdReady,
} from './lib/cms-operation-helpers.mjs';
import {
  leftoverOwned,
  portReleased,
  processAlive,
  rememberOwnedTree,
  reservePort,
  spawnLogged,
  stopOwned,
} from './lib/owned-process.mjs';
import { createSoftwarePasskey } from './lib/cms-operation-software-passkey.mjs';
import { LEGACY_SOURCE, prepareLegacyRuntime, prepareUpgradeConfig } from './lib/emdash-upgrade-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upgrade = process.argv.includes('--upgrade');
const work = join(root, upgrade ? '.grilltrack/work/emdash-upgrade-20261007' : '.grilltrack/work/cms-operation-20260930');
const persist = join(work, 'persist');
const owned = [];
const checks = [];
const NODE = process.execPath;
const MARKER = 'CMS-OPERATION-MARKER-20260930';
const OPERATOR = { email: 'cms-operator@fixture.invalid', name: 'Fixture CMS Operator' };

function record(check) {
  checks.push(check);
  console.log(`PASS ${check}`);
}

function pkgVersion(name) {
  return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
}

function walkFiles(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, found);
    else found.push(path);
  }
  return found;
}

function persistFiles() {
  return walkFiles(persist).sort();
}

function persistFingerprint() {
  const files = persistFiles();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.slice(persist.length));
    hash.update(readFileSync(file));
  }
  return { files: files.map((path) => path.slice(persist.length)), hash: hash.digest('hex') };
}

function startLogged(label, command, args, options = {}) {
  return spawnLogged(owned, spawn, {
    label,
    command,
    args,
    options: { cwd: options.cwd ?? root, env: options.env ?? process.env },
  });
}

function cookieJar() {
  const jar = new Map();
  return {
    apply(response) {
      for (const value of response.headers.getSetCookie?.() ?? []) {
        const [pair] = value.split(';', 1);
        const eq = pair.indexOf('=');
        if (eq < 1) continue;
        const name = pair.slice(0, eq);
        const cookie = pair.slice(eq + 1);
        if (/Max-Age=0/i.test(value) || cookie === '') jar.delete(name);
        else jar.set(name, cookie);
      }
    },
    header() {
      if (jar.size === 0) return {};
      return { cookie: [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ') };
    },
    names: () => [...jar.keys()],
  };
}

async function waitReady(base, worker, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    if (worker.child.exitCode !== null) {
      throw new Error(`Worker exited before ready: code=${worker.exitCode} log=${sanitizeText(worker.output(), 800)}`);
    }
    try {
      const response = await fetch(`${base}/_emdash/api/setup/status`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      });
      last = `${response.status}`;
      if (response.status === 200) {
        const body = await response.json();
        if (body?.success === true) return { response, body };
      }
    } catch (error) {
      last = String(error);
    }
    await sleep(400);
  }
  throw new Error(`Worker was not ready on ${base}: ${last}\n${sanitizeText(worker.output(), 1200)}`);
}

async function jsonOf(response) {
  const text = await response.text();
  try {
    return { status: response.status, ok: response.ok, text, json: JSON.parse(text) };
  } catch {
    return { status: response.status, ok: response.ok, text, json: null };
  }
}

async function writeSanitizedLog(name, text) {
  await writeFile(join(work, name), `${sanitizeText(text, 20_000)}\n`);
}

function publicExcerpt(html) {
  const text = String(html ?? '').replace(/document\.cookie\s*=[^;]+;?/g, 'document.cookie="[redacted]";');
  const title = text.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
  const heading = text.match(/<h1>([^<]*)<\/h1>/i)?.[1] ?? '';
  return `${JSON.stringify({
    statusTitle: title,
    heading,
    hasMarker: text.includes(MARKER),
    nativeBlocks: text.includes('data-native-blocks'),
  }, null, 2)}\n`;
}

async function main() {
  assert.equal(process.version, 'v22.23.2', 'Node 22.23.2 required');
  assert.equal(process.execPath, NODE, 'child processes must use process.execPath');
  const versions = {
    node: process.version,
    emdash: pkgVersion('emdash'),
    '@emdash-cms/auth': pkgVersion('@emdash-cms/auth'),
    '@emdash-cms/cloudflare': pkgVersion('@emdash-cms/cloudflare'),
    '@astrojs/cloudflare': pkgVersion('@astrojs/cloudflare'),
    wrangler: pkgVersion('wrangler'),
    astro: pkgVersion('astro'),
  };
  assert.equal(versions.emdash, '1.2.0');
  assert.equal(versions['@emdash-cms/auth'], '1.2.0');
  assert.equal(versions['@emdash-cms/cloudflare'], '1.2.0');
  assert.equal(versions['@astrojs/cloudflare'], '14.3.3');
  assert.equal(versions.wrangler, '4.144.0');

  const productionConfig = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
  const productionGuard = readFileSync(join(root, 'src/emdash-namespace-guard.ts'), 'utf8');
  const candidateConfig = readFileSync(join(root, 'astro.cloudflare.config.mjs'), 'utf8');
  const fixtureConfig = readFileSync(join(root, 'fixtures/cms-operation/astro.config.mjs'), 'utf8');
  assert.match(productionConfig, /@astrojs\/cloudflare/);
  assert.match(productionConfig, /emdash-namespace-guard/);
  assert.doesNotMatch(productionConfig, /fixtures\/cms-operation|access-namespace-guard/);
  assert.match(candidateConfig, /access-namespace-guard/);
  assert.match(fixtureConfig, /loopback-editor-guard/);
  assert.match(productionGuard, /import\.meta\.env\.DEV/);
  assert.match(productionGuard, /Not Found/);
  record('Production worker uses Cloudflare + deny-all namespace guard; Access candidate and loopback CMS-operation fixture stay on separate configs');

  await mkdir(work, { recursive: true });
  await rm(persist, { recursive: true, force: true });
  await rm(join(work, 'dist'), { recursive: true, force: true });
  await rm(join(work, '.astro'), { recursive: true, force: true });
  await mkdir(persist, { recursive: true });

  const fixtureEnv = {
    ...process.env, PATH: `${dirname(NODE)}:${process.env.PATH}`,
    WRANGLER_SEND_METRICS: 'false', CI: '1',
    ...(upgrade ? { DK_CMS_FIXTURE_UPGRADE: '1' } : {}),
  };
  const run = async (label, command, args, cwd, required = true) => {
    const proc = startLogged(label, command, args, { cwd, env: fixtureEnv });
    const completed = await proc.exit;
    await writeSanitizedLog(`${label}.log`, proc.output());
    if (required) assert.equal(completed.code, 0, `${label} failed: ${sanitizeText(proc.output(), 1800)}`);
    return completed.code;
  };
  const legacy = upgrade ? await prepareLegacyRuntime(root, work, run) : null;

  const generatedWrangler = join(work, 'dist/server/wrangler.json');
  const build = startLogged('astro-build', NODE, [
    join(root, 'node_modules/astro/bin/astro.mjs'),
    'build',
    '--config',
    'fixtures/cms-operation/astro.config.mjs',
  ], {
    env: {
      ...fixtureEnv,
    },
  });
  const built = await build.exit;
  await writeSanitizedLog('build.log', build.output());
  assert.equal(built.code, 0, `Fixture Cloudflare build failed:\n${sanitizeText(build.output(), 4000)}`);
  assert.ok(existsSync(generatedWrangler), 'Astro Cloudflare build writes dist/server/wrangler.json');

  const wranglerConfig = JSON.parse(readFileSync(generatedWrangler, 'utf8'));
  const workerBundle = wranglerConfig.main
    ? resolve(dirname(generatedWrangler), wranglerConfig.main)
    : join(work, 'dist/server/index.js');
  assert.ok(existsSync(workerBundle), `Worker bundle missing at ${workerBundle}`);
  const bundle = readFileSync(workerBundle, 'utf8');
  const d1Binding = (wranglerConfig.d1_databases ?? []).find((item) => item.binding === 'DB');
  const r2Binding = (wranglerConfig.r2_buckets ?? []).find((item) => item.binding === 'MEDIA');
  assert.ok(d1Binding, 'Generated wrangler config has D1 binding DB');
  assert.ok(r2Binding, 'Generated wrangler config has R2 binding MEDIA');
  const databaseId = d1Binding.database_id;
  assert.ok(
    databaseId === undefined || String(databaseId).startsWith('local-'),
    `D1 database_id must be absent or local-prefixed, got ${databaseId}`,
  );
  assert.ok(
    /@emdash-cms\/cloudflare|kysely-d1|cloudflare:workers/.test(bundle),
    'Worker bundle must reference the official Cloudflare/D1 adapter, not merely list DB in wrangler JSON',
  );
  record('Fresh Cloudflare adapter build uses official D1 DB + R2 MEDIA bindings and no production resource IDs');

  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const currentConfig = upgrade ? await prepareUpgradeConfig(root, generatedWrangler, origin, false) : generatedWrangler;
  const legacyConfig = legacy ? await prepareUpgradeConfig(root, join(legacy.work, 'dist/server/wrangler.json'), origin, true) : null;
  if (legacy) {
    for (const name of ['0001_better_auth.sql', '0002_dinkuskit.sql', '0003_store_connect.sql', '0004_account_foundation.sql']) {
      await run(`legacy-merchant-${name}`, NODE, [join(root, 'node_modules/wrangler/bin/wrangler.js'),
        'd1', 'execute', 'dinkuskit-upgrade-merchant', '--local', '--config', legacyConfig,
        '--persist-to', persist, '--file', join(legacy.root, 'migrations/merchant', name), '--yes'], root);
    }
    record('Pinned public 1.0.1 source and lock built the baseline worker; merchant schema initialized only in owned local D1');
  }
  const env = {
    ...process.env,
    PATH: `${dirname(NODE)}:${join(root, 'node_modules/.bin')}:${process.env.PATH}`,
    WRANGLER_SEND_METRICS: 'false',
    CI: '1',
    EMDASH_SITE_URL: origin,
  };

  const startWorker = (label, config = currentConfig) => startLogged(label, NODE, [
    join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'dev',
    '--config',
    config,
    '--persist-to',
    persist,
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--var',
    `EMDASH_SITE_URL:${origin}`,
  ], { env });

  const worker1 = startWorker(upgrade ? 'worker-1-emdash-1.0.1' : 'worker-1', legacyConfig ?? currentConfig);
  const ready = await waitReady(origin, worker1);
  rememberOwnedTree(worker1);
  const runtimeLog = worker1.output().replace(/\x1B\[[0-9;]*m/g, '');
  await writeSanitizedLog('wrangler-1.log', worker1.output());
  assert.ok(workerdReady(runtimeLog), `Wrangler/workerd Ready line missing:\n${sanitizeText(runtimeLog, 800)}`);
  const bindings = localBindingTable(runtimeLog);
  assert.ok(bindings.d1Local, 'Wrangler binding table did not show local D1 env.DB');
  assert.ok(bindings.r2Local, 'Wrangler binding table did not show local R2 env.MEDIA');
  record('Wrangler/workerd local emulation started on loopback with official local D1/R2 bindings');

  const cookies = cookieJar();
  const request = async (path, options = {}) => {
    const headers = {
      origin,
      'x-emdash-request': '1',
      ...cookies.header(),
      ...(options.headers ?? {}),
    };
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const response = await fetch(origin + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      ...options,
      headers,
    });
    cookies.apply(response);
    return response;
  };
  const publicFetch = (path) => fetch(origin + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: { 'x-emdash-request': '1' },
  });
  const spoofedMutation = () => fetch(`${origin}/_emdash/api/content/pages/home`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://dinkuskit.com',
      host: 'dinkuskit.com',
      'x-forwarded-host': 'dinkuskit.com',
      'x-forwarded-for': '1.2.3.4',
      cookie: 'astro-session=spoofed; emdash_setup_nonce=spoofed',
      'x-emdash-request': '1',
    },
    body: JSON.stringify({ data: { title: 'spoofed' } }),
  });

  const status = unwrapApiData(ready.body, 'setup/status');
  assert.equal(typeof status.needsSetup, 'boolean', 'setup/status missing needsSetup');
  record('Initialized fixture worker answered official setup/status through D1-backed runtime');

  const deniedAnon = await fetch(`${origin}/_emdash/api/content/pages/home`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin, 'x-emdash-request': '1' },
    body: JSON.stringify({ data: { title: 'anonymous' } }),
  });
  assert.ok([401, 403].includes(deniedAnon.status), `anonymous PUT expected 401/403, got ${deniedAnon.status}`);
  record('Anonymous authenticated content mutation is denied');

  const spoofed = await spoofedMutation();
  assert.ok([401, 403, 404].includes(spoofed.status), `spoofed PUT expected deny, got ${spoofed.status}`);
  record('Spoofed Host/session gates do not authenticate a content mutation');

  let setup = await jsonOf(await request('/_emdash/api/setup', {
    method: 'POST',
    body: JSON.stringify({
      title: 'DinkusKit CMS operation fixture',
      tagline: 'Local workerd/D1 qualification',
      includeContent: true,
    }),
  }));
  for (let attempt = 0; attempt < 8 && setup.json?.data?.seedComplete === false; attempt += 1) {
    setup = await jsonOf(await request('/_emdash/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        title: 'DinkusKit CMS operation fixture',
        tagline: 'Local workerd/D1 qualification',
        includeContent: true,
      }),
    }));
  }
  assert.ok(setup.ok, `official POST /_emdash/api/setup failed: ${setup.status} ${sanitizeText(setup.text, 500)}`);
  const setupData = unwrapApiData(setup.json, 'setup');
  assert.notEqual(setupData.seedComplete, false, `setup seed incomplete: ${sanitizeText(setup.text, 500)}`);
  record('Official setup API applied seed structure/content on the D1-backed worker');

  const passkey = createSoftwarePasskey();
  const optionsRes = await jsonOf(await request('/_emdash/api/setup/admin', {
    method: 'POST',
    body: JSON.stringify(OPERATOR),
  }));
  assert.equal(optionsRes.status, 200, `setup/admin failed: ${sanitizeText(optionsRes.text, 500)}`);
  const adminData = unwrapApiData(optionsRes.json, 'setup/admin');
  const registrationOptions = adminData.options;
  assert.ok(registrationOptions?.challenge && registrationOptions?.rp?.id, 'setup/admin missing official passkey options');
  const credential = passkey.register({
    challenge: registrationOptions.challenge,
    rpId: registrationOptions.rp.id,
    origin,
  });
  const verifyRes = await jsonOf(await request('/_emdash/api/setup/admin/verify', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  }));
  assert.equal(verifyRes.status, 200, `setup/admin/verify failed: ${sanitizeText(verifyRes.text, 500)}`);
  record('Native setup accepted a synthetic software passkey registration');

  const loginOptionsRes = await jsonOf(await request('/_emdash/api/auth/passkey/options', { method: 'POST', body: '{}' }));
  assert.equal(loginOptionsRes.status, 200, `passkey/options failed: ${sanitizeText(loginOptionsRes.text, 500)}`);
  const loginData = unwrapApiData(loginOptionsRes.json, 'passkey/options');
  const loginOptions = loginData.options;
  assert.ok(loginOptions?.challenge, 'passkey/options missing official challenge');
  const assertion = passkey.assert({
    challenge: loginOptions.challenge,
    rpId: loginOptions.rp?.id ?? registrationOptions.rp.id,
    origin,
  });
  const loginRes = await jsonOf(await request('/_emdash/api/auth/passkey/verify', {
    method: 'POST',
    body: JSON.stringify({ credential: assertion }),
  }));
  assert.equal(loginRes.status, 200, `passkey/verify failed: ${sanitizeText(loginRes.text, 500)}`);
  assert.ok(cookies.names().includes('astro-session'), 'passkey verify established an Astro session');
  record('Native passkey login established an operator session from the same software authenticator');

  const current = await jsonOf(await request('/_emdash/api/content/pages/home'));
  assert.equal(current.status, 200, `authenticated GET home failed: ${sanitizeText(current.text, 500)}`);
  const { item, rev } = unwrapContentEnvelope(current.json, 'GET /_emdash/api/content/pages/home');
  const previousTitle = contentFieldData(item).title ?? 'home';
  const nextTitle = `${MARKER} ${previousTitle}`;
  const nextData = contentFieldData(item);
  if (upgrade) {
    assert.ok(Array.isArray(nextData.layout) && nextData.layout.length > 0);
    nextData.layout[0] = { ...nextData.layout[0], body: `${nextData.layout[0].body} emdash-media:cms-upgrade-media` };
  }
  const updated = await jsonOf(await request('/_emdash/api/content/pages/home', {
    method: 'PUT',
    body: JSON.stringify({
      data: { ...nextData, title: nextTitle },
      _rev: rev,
    }),
  }));
  assert.equal(updated.status, 200, `authenticated PUT home failed: ${sanitizeText(updated.text, 500)}`);
  const updatedEnvelope = unwrapContentEnvelope(updated.json, 'PUT /_emdash/api/content/pages/home');
  const published = await jsonOf(await request('/_emdash/api/content/pages/home/publish', {
    method: 'POST',
    body: JSON.stringify({ _rev: updatedEnvelope.rev }),
  }));
  assert.equal(published.status, 200, `official publish failed: ${sanitizeText(published.text, 500)}`);
  const publishedEnvelope = unwrapContentEnvelope(published.json, 'POST /_emdash/api/content/pages/home/publish');
  assert.equal(publishedEnvelope.item.status, 'published', 'publish did not return published status');
  assert.equal(contentFieldData(publishedEnvelope.item).title, nextTitle, 'published item title is not the authenticated edit');
  await writeFile(join(work, 'content-proof.json'), `${JSON.stringify({
    get: contentProof(current.json),
    put: contentProof(updated.json),
    publish: contentProof(published.json, { marker: MARKER }),
  }, null, 2)}\n`);

  const publicBeforeRestart = await publicFetch('/');
  const publicHtml = await publicBeforeRestart.text();
  await writeFile(join(work, 'public-before.json'), publicExcerpt(publicHtml));
  assert.equal(publicBeforeRestart.status, 200);
  assert.ok(publicHtml.includes(MARKER), 'Public home did not render the authenticated published edit');
  record('Authenticated official content API edit is visible on an anonymous public home read after publish');

  let baseline;
  if (upgrade) {
    const prepared = await jsonOf(await request('/__upgrade/prepare', { method: 'POST', body: '{}' }));
    assert.equal(prepared.status, 200, `legacy state preparation failed: ${sanitizeText(prepared.text, 500)}`);
    baseline = prepared.json;
    assert.ok(baseline.migrations.includes('089_auto_seed_completion'));
    assert.ok(!baseline.migrations.includes('090_redirect_enable_loop_guard') && !baseline.migrations.includes('091_redirect_artifacts'));
    assert.equal(baseline.preserved.seed_complete, 'true');
    assert.equal(baseline.preserved.organizations[0].organization_id, 'upgrade-org');
    assert.equal(baseline.preserved.grants[0].site_id, 'upgrade-site');
    assert.deepEqual(baseline.artifacts, []);
    await writeFile(join(work, 'UPGRADE-BASELINE.json'), `${JSON.stringify({ source: LEGACY_SOURCE, versions: '1.0.1', ...baseline }, null, 2)}\n`);
    record('Actual 1.0.1 runtime created content/media references, settings, plugin records and completed seed; 090/091 are pending');
  }

  await stopOwned(worker1);
  await writeSanitizedLog('wrangler-1.log', worker1.output());
  const persistBeforeRestart = persistFingerprint();
  const d1Files = d1PersistPaths(persistBeforeRestart.files.map((path) => join(persist, path)));
  if (kvOnlyPersist(persistBeforeRestart.files.map((path) => join(persist, path))) || d1Files.length === 0) {
    throw new Error(
      `D1 persist files missing after owned worker-1 stop. persist=${JSON.stringify(persistBeforeRestart.files)}`,
    );
  }
  record('Owned worker-1 stopped; persist-to contains actual D1 files, not only KV session blobs');

  const worker2 = startWorker('worker-2');
  await waitReady(origin, worker2);
  rememberOwnedTree(worker2);
  await writeSanitizedLog('wrangler-2.log', worker2.output());
  assert.ok(workerdReady(sanitizeText(worker2.output(), 8000)), 'Restarted worker missing workerd Ready line');
  record('Owned worker restarted against the same persist-to D1/R2 directory');

  const publicAfter = await publicFetch('/');
  const publicAfterHtml = await publicAfter.text();
  await writeFile(join(work, 'public-after.json'), publicExcerpt(publicAfterHtml));
  assert.equal(publicAfter.status, 200);
  assert.ok(publicAfterHtml.includes(MARKER), 'Edited public content did not persist across worker restart');
  record('Anonymous public read after restart still shows the authenticated D1-backed edit');
  if (upgrade) {
    const after = await (await request('/__upgrade/state')).json();
    assert.deepEqual(after.migrations.filter(name => !baseline.migrations.includes(name)), ['090_redirect_enable_loop_guard', '091_redirect_artifacts']);
    assert.ok(baseline.migrations.every(name => after.migrations.includes(name)));
    assert.deepEqual(after.preserved, baseline.preserved, 'CMS and merchant state must be preserved byte-for-byte');
    assert.deepEqual(after.artifacts, ['_emdash_redirect_artifacts', '_emdash_redirect_generation_artifacts', '_emdash_redirect_state']);
    const authenticatedAfter = await jsonOf(await request('/_emdash/api/content/pages/home'));
    assert.equal(authenticatedAfter.status, 200, 'original CMS session survives the actual version upgrade');
    assert.match(JSON.stringify(contentFieldData(unwrapContentEnvelope(authenticatedAfter.json, 'upgraded home').item)), /emdash-media:cms-upgrade-media/);
    await writeFile(join(work, 'UPGRADE-AFTER.json'), `${JSON.stringify({ versions: '1.2.0', ...after }, null, 2)}\n`);
    record('Actual 1.0.1 -> 1.2 upgrade applied only 090/091, preserving CMS state, media reference, original session and merchant authority rows without reseeding');
  }

  const spoofedAfter = await spoofedMutation();
  assert.ok([401, 403, 404].includes(spoofedAfter.status), `spoofed PUT after restart expected deny, got ${spoofedAfter.status}`);
  record('Spoofed Host/session gates still deny a content mutation after restart');

  const setupAgain = await jsonOf(await request('/_emdash/api/setup', {
    method: 'POST',
    body: JSON.stringify({ title: 'blocked', includeContent: true }),
  }));
  const adminAgain = await jsonOf(await request('/_emdash/api/setup/admin', {
    method: 'POST',
    body: JSON.stringify(OPERATOR),
  }));
  assert.ok([400, 409].includes(setupAgain.status), `re-setup expected blocked, got ${setupAgain.status}`);
  assert.ok([400, 409].includes(adminAgain.status), `re-admin setup expected blocked, got ${adminAgain.status}`);
  record('Initialized CMS setup is blocked after the first admin exists');

  const anonAfter = await fetch(`${origin}/_emdash/api/content/pages/home`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin, 'x-emdash-request': '1' },
    body: JSON.stringify({ data: { title: 'anonymous-after' } }),
  });
  assert.ok([401, 403].includes(anonAfter.status), `anonymous PUT after restart expected deny, got ${anonAfter.status}`);
  record('Anonymous content mutation remains denied after restart');

  await stopOwned(worker2);
  await writeSanitizedLog('wrangler-2.log', worker2.output());
  if (upgrade) {
    const worker3 = startWorker('worker-3-emdash-1.2.0');
    await waitReady(origin, worker3);
    rememberOwnedTree(worker3);
    const restarted = await (await request('/__upgrade/state')).json();
    const before = JSON.parse(readFileSync(join(work, 'UPGRADE-AFTER.json'), 'utf8'));
    assert.deepEqual(restarted.preserved, baseline.preserved);
    assert.deepEqual(restarted.migrations, before.migrations);
    const restartedHome = await publicFetch('/');
    assert.equal(restartedHome.status, 200);
    assert.ok((await restartedHome.text()).includes(MARKER));
    assert.equal((await request('/_emdash/api/content/pages/home')).status, 200);
    await stopOwned(worker3);
    await writeSanitizedLog('wrangler-3.log', worker3.output());
    record('Upgraded 1.2 runtime restarted again with unchanged CMS/merchant state and migration ledger');
  }
  const persistAfter = persistFingerprint();
  assert.ok(d1PersistPaths(persistAfter.files.map((path) => join(persist, path))).length > 0, 'D1 persist files missing after worker-2 stop');

  return {
    versions,
    origin,
    persistBeforeRestart,
    persistAfter,
    d1PersistFiles: d1PersistPaths(persistAfter.files.map((path) => join(persist, path))).map((path) => path.slice(persist.length)),
  };
}

const cleanup = [];
let result;
let failure;
try {
  result = await main();
} catch (error) {
  failure = error;
} finally {
  for (const proc of owned) {
    rememberOwnedTree(proc);
    await stopOwned(proc, { finallyBlock: true });
    cleanup.push({
      label: proc.label,
      pid: proc.pid,
      recordedPids: proc.recordedPids,
      releasedPids: proc.releasedPids,
      descendantsAtStart: proc.descendantsAtStart,
      killedTree: proc.killedTree,
      exitCode: proc.exitCode,
      signal: proc.signal,
      stoppedInFinally: proc.stoppedInFinally,
      aliveAfterStop: processAlive(proc.pid),
      recordedAliveAfterStop: leftoverOwned([proc]).map((entry) => entry.pid),
    });
  }
}

await mkdir(work, { recursive: true });
const leftover = leftoverOwned(owned);
const receipt = {
  at: new Date().toISOString(),
  versions: result?.versions ?? {
    node: process.version,
    emdash: pkgVersion('emdash'),
    '@emdash-cms/auth': pkgVersion('@emdash-cms/auth'),
    '@emdash-cms/cloudflare': pkgVersion('@emdash-cms/cloudflare'),
    '@astrojs/cloudflare': pkgVersion('@astrojs/cloudflare'),
    wrangler: pkgVersion('wrangler'),
    astro: pkgVersion('astro'),
  },
  origin: result?.origin ?? null,
  persist,
  generatedWrangler: upgrade
    ? 'file:.grilltrack/work/emdash-upgrade-20261007/dist/server/wrangler.json'
    : 'file:.grilltrack/work/cms-operation-20260930/dist/server/wrangler.json',
  upgradeBaseline: upgrade ? { source: LEGACY_SOURCE, emdash: '1.0.1', reseeded: false } : null,
  bindings: {
    database: 'd1({ binding: "DB" })',
    storage: 'r2({ binding: "MEDIA" })',
    auth: 'passkeys native default; Access not selected',
    worker: '@emdash-cms/cloudflare/worker',
  },
  d1PersistFiles: result?.d1PersistFiles ?? d1PersistPaths(persistFiles()).map((path) => path.slice(persist.length)),
  persistChanged: result ? result.persistBeforeRestart.hash !== result.persistAfter.hash : null,
  checks,
  cleanup,
  leftoverAlive: leftover.map((entry) => `${entry.label}:${entry.pid}`),
  notes: [
    'Engine/storage/auth facts are local workerd/D1/R2 + native passkeys. Hosted Access/protected hostname remains proposed and unlocked.',
    'This is not a product availability claim and not live Cloudflare account proof.',
    'Proof omits cookies, JWTs, passkey options/credentials, and raw auth response bodies.',
  ],
};

if (failure) {
  await writeFile(join(work, 'FAILURE.json'), `${JSON.stringify({
    ...receipt,
    error: { name: failure.name, message: String(failure.message ?? failure) },
  }, null, 2)}\n`);
  throw failure;
}

assert.equal(leftover.length, 0, `Owned recorded descendants still alive after finally: ${leftover.map((entry) => `${entry.label}:${entry.pid}`).join(', ')}`);
assert.ok(cleanup.every((entry) => entry.stoppedInFinally && entry.aliveAfterStop === false && entry.recordedAliveAfterStop.length === 0), 'Owned recorded descendants were not stopped in finally');
if (result?.origin) {
  const port = Number(new URL(result.origin).port);
  assert.ok(await portReleased(port), `Loopback port ${port} still bound after owned-child cleanup`);
}

await rm(join(work, 'FAILURE.json'), { force: true });
await rm(join(work, 'public-before.html'), { force: true });
await rm(join(work, 'public-after.html'), { force: true });
await writeFile(join(work, 'PROOF.json'), `${JSON.stringify(receipt, null, 2)}\n`);
await writeFile(join(work, 'results.txt'), `${checks.map((check) => `PASS ${check}`).join('\n')}\n`);
await writeFile(join(work, 'CLEANUP.json'), `${JSON.stringify({ cleanup, leftoverAlive: [] }, null, 2)}\n`);
