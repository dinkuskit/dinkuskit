import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// Package only these public pages from the existing production native renderer.
// Never copy dist/client wholesale: it also contains CMS bundles.
const pages = [['/', 'index.html', 200], ['/getting-started', 'getting-started.html', 200], ['/not-a-real-page', '404.html', 404]];
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const child = spawn(process.execPath, ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-4000); });
let exited = false;
const exit = new Promise(resolve => {
  child.once('exit', () => { exited = true; resolve(); });
  child.once('error', error => { logs += String(error); exited = true; resolve(); });
});
const request = path => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !exited; attempt++) {
    try { await request('/'); ready = true; break; } catch { await sleep(100); }
  }
  assert.ok(ready, `Production renderer did not start: ${logs}`);
  const files = new Map();
  const cssPaths = new Set();
  for (const [route, filename, status] of pages) {
    const response = await request(route);
    assert.equal(response.status, status, route);
    let html = await response.text();
    // A shared static 404 must not canonicalize every missing URL to the probe path.
    if (status === 404) html = html.replace(/<link\b[^>]*\brel="canonical"[^>]*>/gi, "");
    assert.ok(!/<script\b/i.test(html), 'Public snapshot must not include executable scripts');
    assert.ok(!html.includes('/_emdash/'), 'Public snapshot must not reference CMS runtime');
    if (status === 200) {
      assert.ok(html.includes('data-native-blocks'), 'Native CMS content must render');
      assert.ok(html.includes(`href="https://dinkuskit.com${route}"`), 'Canonical domain must match');
    }
    files.set(filename, Buffer.from(html));
    for (const match of html.matchAll(/href="(\/_astro\/[^"?#]+\.css)"/g)) {
      assert.match(match[1], /^\/_astro\/[A-Za-z0-9._-]+\.css$/);
      cssPaths.add(match[1]);
    }
  }
  for (const path of cssPaths) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    files.set(path.slice(1), Buffer.from(await response.arrayBuffer()));
  }
  assert.ok(cssPaths.size > 0, 'The approved styling must be packaged');
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: sha(bytes) }));
  const artifactSha = sha(JSON.stringify(entries));
  const output = `.grilltrack/work/public-release/${artifactSha}`;
  for (const [file, bytes] of files) {
    const target = `${output}/assets/${file}`;
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, bytes);
  }
  const config = {
    name: 'dinkuskit-public-introduction', compatibility_date: '2026-09-30',
    workers_dev: false, preview_urls: false,
    routes: [{ pattern: 'dinkuskit.com', custom_domain: true }],
    assets: { directory: './assets', html_handling: 'auto-trailing-slash', not_found_handling: '404-page' },
  };
  await writeFile(`${output}/wrangler.jsonc`, JSON.stringify(config, null, 2) + '\n');
  await writeFile(`${output}/manifest.json`, JSON.stringify({
    artifact_sha256: artifactSha,
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source_has_local_changes: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
    seed_sha256: sha(await readFile('seed/seed.json')),
    exporter_sha256: sha(await readFile('scripts/prepare-public-release.mjs')),
    kind: 'frozen public native EmDash rendering',
    files: entries,
    deployment: 'not performed',
  }, null, 2) + '\n');
  console.log(JSON.stringify({ output, artifact_sha256: artifactSha, files: entries }, null, 2));
} finally {
  if (!exited) child.kill('SIGTERM');
  await Promise.race([exit, sleep(5000)]);
  if (!exited) { child.kill('SIGKILL'); await exit; }
}
