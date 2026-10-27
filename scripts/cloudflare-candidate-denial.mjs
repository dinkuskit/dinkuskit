import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { generatePrefixedToken, Role } from '@emdash-cms/auth';
import { sanitizeText, workerdReady } from './lib/cms-operation-helpers.mjs';
import {
  leftoverOwned,
  portReleased,
  processAlive,
  rememberOwnedTree,
  reservePort,
  spawnLogged,
  stopOwned,
} from './lib/owned-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.grilltrack/work/cloudflare-candidate-20260930');
const persist = join(work, 'persist');
const owned = [];
const checks = [];
const NODE = process.execPath;
const FIXTURE_TEAM = 'example.invalid';
const FIXTURE_AUDIENCE = 'fixture-audience-not-production';
const FIXTURE_ALLOWLIST = 'owner@fixture.invalid';

function record(check) {
  checks.push(check);
  console.log(`PASS ${check}`);
}

function pkgVersion(name) {
  return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
}

function startLogged(label, command, args, options = {}) {
  return spawnLogged(owned, spawn, {
    label,
    command,
    args,
    options: { cwd: root, env: options.env ?? process.env },
  });
}

async function writeSanitizedLog(name, text) {
  await writeFile(join(work, name), `${sanitizeText(text, 20_000)}\n`);
}

async function waitHttp(base, worker, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    if (worker.child.exitCode !== null) {
      throw new Error(`Worker exited before ready: code=${worker.exitCode} log=${sanitizeText(worker.output(), 800)}`);
    }
    try {
      const response = await fetch(`${base}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      });
      last = `${response.status}`;
      if (response.status > 0) return response;
    } catch (error) {
      last = String(error);
    }
    await sleep(400);
  }
  throw new Error(`Worker was not ready on ${base}: ${last}\n${sanitizeText(worker.output(), 1200)}`);
}

async function assertDenied(label, origin, path, options = {}) {
  const response = await fetch(origin + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    ...options,
  });
  const body = await response.text();
  assert.equal(
    response.status,
    404,
    `${label}: expected 404, got ${response.status} body=${sanitizeText(body, 400)}`,
  );
  assert.equal(response.headers.get('location'), null, `${label}: no CMS redirect`);
  assert.ok(!/Create your admin|passkey registration|My Awesome Blog/i.test(body), `${label}: no setup HTML`);
  assert.ok(Buffer.byteLength(body) < 2000, `${label}: no admin bundle`);
  return response;
}

async function d1(generatedWrangler, env, command) {
  const run = startLogged('d1-execute', NODE, [
    join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'DB', '--local', '--persist-to', persist, '--config', generatedWrangler, '--json', '--command', command,
  ], { env });
  const done = await run.exit;
  assert.equal(done.code, 0, `d1 execute failed: ${sanitizeText(run.output(), 800)}`);
  return run.output();
}

async function agentFetch(origin, path, token, options = {}) {
  const response = await fetch(origin + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  return { response, body: await response.text() };
}

// Agents use EmDash's own API tokens on /_emdash/api (ledger
// website-agent-api-tokens-20261027). The guard only lets the token shape
// through; EmDash checks the token, its user and its scopes.
async function proveAgentTokens(origin, generatedWrangler, env) {
  const agent = generatePrefixedToken('ec_pat_');
  const stranger = generatePrefixedToken('ec_pat_');
  const auth = { headers: { authorization: `Bearer ${agent.raw}` } };

  await assertDenied('token before any Admin', origin, '/_emdash/api/schema/collections', auth);
  await assertDenied('token before any Admin, MCP', origin, '/_emdash/api/mcp', {
    method: 'POST',
    headers: { ...auth.headers, 'content-type': 'application/json' },
    body: '{}',
  });
  record('An EmDash token is refused on an empty site before a human Admin exists');

  await d1(generatedWrangler, env, [
    "INSERT INTO users (id, email, name, role) VALUES ('fixture-admin', 'owner@fixture.invalid', 'Fixture Owner', 50)",
    `INSERT INTO _emdash_api_tokens (id, name, token_hash, prefix, user_id, scopes) VALUES ('fixture-agent', 'Fixture agent', '${agent.hash}', '${agent.prefix}', 'fixture-admin', '["schema:read","content:read","mcp:tools"]')`,
  ].join('; '));

  const listed = await agentFetch(origin, '/_emdash/api/schema/collections', agent.raw);
  assert.equal(listed.response.status, 200, `scoped token reads the schema: ${sanitizeText(listed.body, 400)}`);
  assert.match(listed.response.headers.get('content-type') ?? '', /application\/json/);
  record('A scoped EmDash API token reads /_emdash/api through the guard');

  const mcp = await agentFetch(origin, '/_emdash/api/mcp', agent.raw, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  assert.equal(mcp.response.status, 200, `MCP tools/list: ${sanitizeText(mcp.body, 400)}`);
  assert.match(mcp.body, /content_list/, 'MCP lists EmDash content tools');
  record('The same token lists EmDash MCP tools at /_emdash/api/mcp');

  const write = await agentFetch(origin, '/_emdash/api/content/pages', agent.raw, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-emdash-request': '1' },
    body: JSON.stringify({ data: { title: 'blocked' } }),
  });
  assert.equal(write.response.status, 403, `read-only token cannot write: ${sanitizeText(write.body, 400)}`);
  assert.match(write.body, /scope/i, 'the 403 comes from the token scope check');
  record('EmDash refuses a write outside the token\'s scopes (403)');

  const unknown = await agentFetch(origin, '/_emdash/api/schema/collections', stranger.raw);
  assert.equal(unknown.response.status, 401, `unknown token: ${sanitizeText(unknown.body, 400)}`);
  record('EmDash refuses a well-formed token it never issued (401)');

  // Docs publish sends its token beside the Access service-token pair; before the
  // edge Bypass Access also adds its JWT. Either way the token decides.
  const publisher = await agentFetch(origin, '/_emdash/api/schema/collections', agent.raw, {
    headers: {
      'cf-access-client-id': 'fixture.access',
      'cf-access-client-secret': 'fixture-not-a-secret',
      'cf-access-jwt-assertion': 'edge-jwt-before-bypass',
    },
  });
  assert.equal(publisher.response.status, 200, `token beside Access headers: ${sanitizeText(publisher.body, 400)}`);
  record('A token sent beside Access service-token headers and an edge JWT still works (publisher before and after the Bypass)');

  // EmDash public routes read a saved session and skip Bearer checks: no token lane.
  await assertDenied('token on snapshot drafts', origin, '/_emdash/api/snapshot?drafts=true', auth);
  await assertDenied('token on search', origin, '/_emdash/api/search?q=a', auth);
  await assertDenied('made-up token with a stale CMS session on snapshot', origin, '/_emdash/api/snapshot?drafts=true', {
    headers: { authorization: `Bearer ${stranger.raw}`, cookie: 'astro-session=stale-operator-session' },
  });
  await assertDenied('real token with a cookie', origin, '/_emdash/api/schema/collections', {
    headers: { ...auth.headers, cookie: 'astro-session=stale-operator-session' },
  });
  record('Snapshot and search stay closed to tokens, and a token sent with any cookie needs Access, so a stale CMS session cannot ride on it');

  for (const [label, path] of [
    ['token on admin UI', '/_emdash/admin'],
    ['token on API tokens', '/_emdash/api/admin/api-tokens'],
    ['token on users', '/_emdash/api/admin/users'],
    ['token on setup', '/_emdash/api/setup/status'],
    ['token on auth', '/_emdash/api/auth/me'],
    ['token on oauth', '/_emdash/api/oauth/token'],
    ['token on encoded admin', '/_emdash/api/%61dmin/api-tokens'],
    ['token on plugins', '/_emdash/api/plugins/dinkuskit-operator/approvals'],
    ['token on settings', '/_emdash/api/settings'],
  ]) {
    await assertDenied(label, origin, path, auth);
  }
  record('Tokens stay out of the admin UI, users, token management, setup, sign-in, OAuth, plugins and settings');

  await d1(generatedWrangler, env, "DELETE FROM _emdash_api_tokens WHERE id = 'fixture-agent'");
  const revoked = await agentFetch(origin, '/_emdash/api/schema/collections', agent.raw);
  assert.equal(revoked.response.status, 401, `revoked token: ${sanitizeText(revoked.body, 400)}`);
  record('A revoked token gets 401 on its next request');
}

async function main() {
  assert.equal(process.version, 'v24.22.0', 'Node 24.22.0 required');
  assert.equal(process.execPath, NODE, 'child processes must use process.execPath');
  assert.equal(Role.EDITOR, 40);
  const versions = {
    node: process.version,
    emdash: pkgVersion('emdash'),
    '@emdash-cms/cloudflare': pkgVersion('@emdash-cms/cloudflare'),
    '@astrojs/cloudflare': pkgVersion('@astrojs/cloudflare'),
    wrangler: pkgVersion('wrangler'),
    astro: pkgVersion('astro'),
  };
  assert.equal(versions['@astrojs/cloudflare'], '14.3.3');
  assert.equal(versions['@emdash-cms/cloudflare'], '1.2.0');

  const productionConfig = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
  const candidateConfig = readFileSync(join(root, 'astro.cloudflare.config.mjs'), 'utf8');
  const productionGuard = readFileSync(join(root, 'src/emdash-namespace-guard.ts'), 'utf8');
  const accessGuard = readFileSync(join(root, 'src/access-namespace-guard.ts'), 'utf8');
  const accessAuthEntry = readFileSync(join(root, 'scripts/lib/access-auth-entry.mjs'), 'utf8');
  assert.match(productionConfig, /@astrojs\/cloudflare/);
  assert.match(productionConfig, /emdash-namespace-guard/);
  assert.doesNotMatch(productionConfig, /access\(|access-namespace-guard/);
  assert.match(productionGuard, /Not Found/);
  assert.match(candidateConfig, /@astrojs\/cloudflare/);
  assert.match(candidateConfig, /@emdash-cms\/cloudflare/);
  assert.match(candidateConfig, /access\(/);
  assert.match(candidateConfig, /audienceEnvVar: 'CF_ACCESS_AUDIENCE'/);
  assert.match(accessGuard, /access-auth-entry\.mjs/);
  assert.match(candidateConfig, /access-auth-entry\.mjs/);
  assert.match(accessAuthEntry, /@emdash-cms\/cloudflare\/auth/);
  assert.match(accessAuthEntry, /officialAuthenticate/);
  assert.match(accessGuard, /requestPathname/);
  assert.doesNotMatch(productionGuard, /requestPathname|decodeRoutingPathname/);
  record('Production worker uses Cloudflare + deny-all guard; Access-gated CMS candidate stays a separate build');

  await mkdir(work, { recursive: true });
  await rm(persist, { recursive: true, force: true });
  await rm(join(work, 'dist'), { recursive: true, force: true });
  await rm(join(work, '.astro'), { recursive: true, force: true });
  await mkdir(persist, { recursive: true });

  const generatedWrangler = join(work, 'dist/server/wrangler.json');
  const build = startLogged('astro-build', NODE, [
    join(root, 'node_modules/astro/bin/astro.mjs'),
    'build',
    '--config',
    'astro.cloudflare.config.mjs',
  ], {
    env: {
      ...process.env,
      PATH: `${dirname(NODE)}:${process.env.PATH}`,
      EMDASH_ACCESS_TEAM_DOMAIN: FIXTURE_TEAM,
      WRANGLER_SEND_METRICS: 'false',
      CI: '1',
    },
  });
  const built = await build.exit;
  await writeSanitizedLog('build.log', build.output());
  assert.equal(built.code, 0, `Cloudflare candidate build failed:\n${sanitizeText(build.output(), 4000)}`);
  assert.ok(existsSync(generatedWrangler), 'Candidate build writes dist/server/wrangler.json');

  const wranglerConfig = JSON.parse(readFileSync(generatedWrangler, 'utf8'));
  assert.equal(wranglerConfig.workers_dev, false);
  assert.equal(wranglerConfig.preview_urls, false);
  const d1Binding = (wranglerConfig.d1_databases ?? []).find((item) => item.binding === 'DB');
  const r2Binding = (wranglerConfig.r2_buckets ?? []).find((item) => item.binding === 'MEDIA');
  assert.ok(d1Binding, 'Generated wrangler config has D1 binding DB');
  assert.ok(r2Binding, 'Generated wrangler config has R2 binding MEDIA');
  assert.ok(
    d1Binding.database_id === undefined || String(d1Binding.database_id).startsWith('local-'),
    `D1 database_id must be absent or local-prefixed, got ${d1Binding.database_id}`,
  );
  record('Candidate wrangler keeps workers.dev/preview URLs disabled and uses local-prefixed D1/R2 example IDs');

  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PATH: `${dirname(NODE)}:${join(root, 'node_modules/.bin')}:${process.env.PATH}`,
    WRANGLER_SEND_METRICS: 'false',
    CI: '1',
    EMDASH_SITE_URL: origin,
  };

  const worker = startLogged('candidate-worker', NODE, [
    join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'dev',
    '--config',
    generatedWrangler,
    '--persist-to',
    persist,
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--var',
    `EMDASH_SITE_URL:${origin}`,
    '--var',
    `EMDASH_ACCESS_TEAM_DOMAIN:${FIXTURE_TEAM}`,
    '--var',
    `CF_ACCESS_AUDIENCE:${FIXTURE_AUDIENCE}`,
    '--var',
    `EMDASH_OPERATOR_ALLOWLIST:${FIXTURE_ALLOWLIST}`,
  ], { env });

  const publicReady = await waitHttp(origin, worker);
  rememberOwnedTree(worker);
  await writeSanitizedLog('wrangler.log', worker.output());
  assert.ok(workerdReady(worker.output().replace(/\x1B\[[0-9;]*m/g, '')), 'workerd Ready line missing');
  record('Candidate workerd started against the official Cloudflare adapter');

  await assertDenied('GET admin', origin, '/_emdash/admin');
  await assertDenied('GET setup', origin, '/_emdash/admin/setup');
  await assertDenied('GET login', origin, '/_emdash/api/auth/login');
  await assertDenied('GET setup status', origin, '/_emdash/api/setup/status');
  await assertDenied('POST setup', origin, '/_emdash/api/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ title: 'blocked', includeContent: true }),
  });
  await assertDenied('POST setup/admin', origin, '/_emdash/api/setup/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email: 'probe@example.test', name: 'Probe' }),
  });
  record('Anonymous /_emdash admin, setup, login, and setup POST are denied before EmDash runtime');

  await assertDenied('encoded underscore setup', origin, '/%5femdash/admin/setup');
  await assertDenied('encoded e setup', origin, '/_%65mdash/admin/setup');
  await assertDenied('encoded case underscore setup', origin, '/%5Femdash/admin/setup');
  await assertDenied('encoded slash setup', origin, '/_emdash%2fadmin/setup');
  await assertDenied('encoded status', origin, '/%5femdash/api/setup/status');
  await assertDenied('malformed encoded setup', origin, '/%5femdash/admin/setup%');
  record('Encoded and malformed /_emdash paths that previously reached setup UI are denied');

  await assertDenied('spoofed cookie/host setup', origin, '/_emdash/admin/setup', {
    headers: {
      host: 'dinkuskit.com',
      'x-forwarded-host': 'dinkuskit.com',
      cookie: 'CF_Authorization=spoofed; astro-session=spoofed',
    },
  });
  await assertDenied('spoofed JWT header setup POST', origin, '/_emdash/api/setup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'cf-access-jwt-assertion': 'not-a-jwt',
    },
    body: JSON.stringify({ title: 'blocked' }),
  });
  record('Spoofed Access cookie, Host, and JWT do not unlock the candidate /_emdash namespace');

  const publicAfter = await fetch(`${origin}/`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const publicBody = await publicAfter.text();
  assert.ok(
    [200, 503].includes(publicAfter.status)
    || (publicAfter.status === 404 && /Page not found|Content is not available/i.test(publicBody)),
    `public / unexpected ${publicAfter.status} body=${sanitizeText(publicBody, 200)}`,
  );
  assert.equal(publicAfter.headers.get('content-type')?.includes('text/plain'), false, 'public / must not be the /_emdash text/plain deny');
  const publicEncoded = await fetch(`${origin}/%67etting-started`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const publicEncodedType = publicEncoded.headers.get('content-type') ?? '';
  assert.equal(
    publicEncodedType.includes('text/plain'),
    false,
    `encoded public path must not be the /_emdash text/plain deny; got ${publicEncoded.status} ${publicEncodedType}`,
  );
  record(`Public / answered ${publicAfter.status} without the /_emdash deny; empty D1 is not a live-site claim`);
  record('Encoded public path is not rewritten into the /_emdash plain deny');

  await proveAgentTokens(origin, generatedWrangler, env);


  await stopOwned(worker);
  return { versions, origin, publicStatus: publicAfter.status };
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
    '@emdash-cms/cloudflare': pkgVersion('@emdash-cms/cloudflare'),
    '@astrojs/cloudflare': pkgVersion('@astrojs/cloudflare'),
    wrangler: pkgVersion('wrangler'),
    astro: pkgVersion('astro'),
  },
  origin: result?.origin ?? null,
  publicStatus: result?.publicStatus ?? null,
  persist,
  generatedWrangler: 'file:.grilltrack/work/cloudflare-candidate-20260930/dist/server/wrangler.json',
  bindings: {
    database: 'd1({ binding: "DB" })',
    storage: 'r2({ binding: "MEDIA" })',
    auth: 'official access() exclusive; audience runtime; team build input',
    worker: '@emdash-cms/cloudflare/worker',
    workers_dev: false,
    preview_urls: false,
  },
  checks,
  cleanup,
  leftoverAlive: leftover.map((entry) => `${entry.label}:${entry.pid}`),
  notes: [
    'Local workerd denial against the official Cloudflare adapter. Not hosted Access proof and not a deployment.',
    'Fixture team/audience/allowlist values are synthetic example.invalid / fixture-audience-not-production / owner@fixture.invalid.',
    'No Cloudflare account, Access application, D1, R2, or user was created.',
    'Proof omits cookies, JWTs, raw auth responses, and operator addresses.',
  ],
};

if (failure) {
  await writeFile(join(work, 'FAILURE.json'), `${JSON.stringify({
    ...receipt,
    error: { name: failure.name, message: String(failure.message ?? failure) },
  }, null, 2)}\n`);
  throw failure;
}

assert.equal(leftover.length, 0, `Owned recorded descendants still alive: ${leftover.map((entry) => `${entry.label}:${entry.pid}`).join(', ')}`);
assert.ok(cleanup.every((entry) => entry.stoppedInFinally && entry.recordedAliveAfterStop.length === 0), 'Owned recorded descendants were not stopped in finally');
if (result?.origin) {
  const port = Number(new URL(result.origin).port);
  assert.ok(await portReleased(port), `Loopback port ${port} still bound after owned-child cleanup`);
}

await rm(join(work, 'FAILURE.json'), { force: true });
await writeFile(join(work, 'PROOF.json'), `${JSON.stringify(receipt, null, 2)}\n`);
await writeFile(join(work, 'results.txt'), `${checks.map((check) => `PASS ${check}`).join('\n')}\n`);
await writeFile(join(work, 'CLEANUP.json'), `${JSON.stringify({ cleanup, leftoverAlive: [] }, null, 2)}\n`);
