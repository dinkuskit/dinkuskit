import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { publicPageIds } from '../src/docs/catalog.ts';

async function unusedPort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => req.destroy(new Error('Documentation request timed out')));
  });
}

async function check(mode) {
  const port = await unusedPort();
  const args = mode === 'development'
    ? ['node_modules/astro/bin/astro.mjs', 'dev', '--config', 'fixtures/docs-preview/astro.config.mjs', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock']
    : ['.grilltrack/work/docs-preview/dist/server/entry.mjs'];
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ASTRO_DEV_BACKGROUND: '1', ASTRO_TELEMETRY_DISABLED: '1', HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-30_000); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-30_000); });
  const exited = once(child, 'exit');
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt++) {
      try { await request(port, '/docs'); ready = true; break; } catch { await delay(250); }
    }
    assert.ok(ready, `Documentation ${mode} renderer did not start: ${logs}`);
    for (const id of publicPageIds) {
      const response = await request(port, `/docs/${id}`);
      assert.equal(response.status, mode === 'development' ? 200 : 404, `${mode}: ${id}`);
      if (mode === 'development') {
        assert.match(response.body, /Draft for review\./);
        assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.ok(response.body.includes(`https://dinkuskit.com/docs/${id}`), 'canonical URL');
        assert.match(response.body, /aria-current="page"/);
        assert.match(response.body, /class="docs-page-actions"/);
        assert.match(response.body, /<time datetime="\d{4}-\d{2}-\d{2}">/);
        assert.ok(response.body.includes(`data-copy-markdown="/docs/markdown/${id}.md"`));
        assert.ok(response.body.includes(`href="/docs/markdown/${id}.md">View as Markdown</a>`));
        const embedded = response.body.match(/id="docs-search-data"[^>]*>([\s\S]*?)<\/script>/);
        assert.ok(embedded, `${id}: local search data`);
        assert.equal(JSON.parse(embedded[1]).length, 13);
      } else {
        assert.ok(!response.body.includes('Draft for review.'), 'no draft body');
        assert.ok(!response.body.includes('id="docs-search-data"'), 'no draft index');
      }
      const markdown = await request(port, `/docs/markdown/${id}.md`);
      assert.equal(markdown.status, mode === 'development' ? 200 : 404, 'draft Markdown is local-only');
      if (mode === 'development') {
        assert.equal(markdown.headers['content-type'], 'text/markdown; charset=utf-8');
        assert.equal(markdown.headers['x-robots-tag'], 'noindex, nofollow');
        assert.equal(markdown.headers['cache-control'], 'no-store');
        assert.match(markdown.body, /^# /);
        assert.match(markdown.body, /Last updated: \d{4}-\d{2}-\d{2}/);
        assert.ok(markdown.body.includes(`Canonical URL: https://dinkuskit.com/docs/${id}`));
      }
    }
    assert.deepEqual(JSON.parse((await request(port, '/docs/search.json')).body), []);
    assert.equal((await request(port, '/llms.txt')).status, 404);
    assert.equal((await request(port, '/docs/internal-plan')).status, 404);
    assert.equal((await request(port, '/docs/markdown/internal-plan.md')).status, 404);
    assert.equal((await request(port, '/docs/start-here?preview=1')).status, mode === 'development' ? 200 : 404);
    assert.equal((await request(port, '/docs/markdown/start-here.md?preview=1')).status, mode === 'development' ? 200 : 404);
    console.log(`PASS ${mode}: 13 article routes, local-only drafts, canonical metadata, public corpus exclusion, unknown IDs`);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

await check('development');
await check('production');
