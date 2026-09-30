import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('.', import.meta.url)));
const exporterPath = join(repoRoot, 'scripts/prepare-public-release.mjs');
const fixture = mkdtempSync(join(tmpdir(), 'dinkuskit-public-release-reuse-'));
const checks = [];

const fakeRenderer = `import { createServer } from 'node:http';
const css = '/_astro/ContentPage.test.css';
const page = path => \`<!doctype html><html><head>
<link rel="canonical" href="https://dinkuskit.com\${path}">
<link rel="stylesheet" href="\${css}">
</head><body>
<main data-native-blocks="true">Native fixture \${path}</main>
</body></html>\`;
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT);
createServer((req, res) => {
  if (req.url === css) {
    res.writeHead(200, { 'content-type': 'text/css' });
    res.end('body{color:#111}');
    return;
  }
  const routes = new Map([
    ['/', [200, page('/')]],
    ['/getting-started', [200, page('/getting-started')]],
    ['/not-a-real-page', [404, page('/not-a-real-page')]],
  ]);
  const hit = routes.get(req.url);
  if (!hit) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(hit[0], { 'content-type': 'text/html' });
  res.end(hit[1]);
}).listen(port, host);
`;

const runExporter = () => spawnSync(process.execPath, [exporterPath], {
  cwd: fixture,
  encoding: 'utf8',
  env: { ...process.env },
  timeout: 20_000,
});
const parseOk = result => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const parseReject = (result, pattern) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern);
};

try {
  mkdirSync(join(fixture, 'dist/server'), { recursive: true });
  mkdirSync(join(fixture, 'scripts'), { recursive: true });
  mkdirSync(join(fixture, 'seed'), { recursive: true });
  writeFileSync(join(fixture, 'dist/server/entry.mjs'), fakeRenderer);
  writeFileSync(join(fixture, 'seed/seed.json'), `${JSON.stringify({ fixture: true }, null, 2)}\n`);
  writeFileSync(join(fixture, 'scripts/prepare-public-release.mjs'), readFileSync(exporterPath));
  execFileSync('git', ['init'], { cwd: fixture });
  execFileSync('git', ['config', 'user.name', 'Release Fixture'], { cwd: fixture });
  execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: fixture });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: fixture });
  execFileSync('git', ['config', 'core.hooksPath', '/dev/null'], { cwd: fixture });
  execFileSync('git', ['add', '.'], { cwd: fixture });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: fixture });

  const first = parseOk(runExporter());
  assert.ok(first.artifact_sha256);
  assert.ok(first.output.startsWith('.grilltrack/work/public-release/'));
  const output = join(fixture, first.output);
  const assets = join(output, 'assets');
  const listed = new Set(first.files.map(entry => entry.file));
  assert.ok(listed.has('index.html'));
  assert.ok(existsSync(join(assets, 'index.html')));
  checks.push('first export succeeds with a digest-addressed asset tree');

  const repeat = parseOk(runExporter());
  assert.equal(repeat.artifact_sha256, first.artifact_sha256);
  assert.equal(repeat.output, first.output);
  checks.push('clean repeat succeeds with the same digest');

  const extraFile = join(assets, 'stale-extra.txt');
  const extraBytes = 'synthetic leftover';
  writeFileSync(extraFile, extraBytes);
  const extraFileResult = runExporter();
  parseReject(extraFileResult, /unexpected file/);
  assert.equal(readFileSync(extraFile, 'utf8'), extraBytes);
  assert.ok(lstatSync(extraFile).isFile());
  checks.push('unexpected extra file rejects and is left in place');
  rmSync(extraFile);

  const emptyDir = join(assets, 'stale-empty');
  mkdirSync(emptyDir);
  parseReject(runExporter(), /unexpected directory/);
  assert.ok(lstatSync(emptyDir).isDirectory());
  assert.deepEqual(readdirSync(emptyDir), []);
  checks.push('unexpected empty directory rejects and is left in place');
  rmSync(emptyDir, { recursive: true });

  const indexPath = join(assets, 'index.html');
  const indexBytes = readFileSync(indexPath);
  const probe = join(fixture, 'symlink-probe.html');
  writeFileSync(probe, 'do-not-overwrite');
  rmSync(indexPath);
  symlinkSync(probe, indexPath);
  parseReject(runExporter(), /symbolic links are not allowed/);
  assert.ok(lstatSync(indexPath).isSymbolicLink());
  assert.equal(readFileSync(probe, 'utf8'), 'do-not-overwrite');
  checks.push('expected path as symlink rejects without following or overwriting');
  rmSync(indexPath);
  writeFileSync(indexPath, indexBytes);

  const strayLink = join(assets, 'stale-link');
  symlinkSync(probe, strayLink);
  parseReject(runExporter(), /symbolic links are not allowed/);
  assert.ok(lstatSync(strayLink).isSymbolicLink());
  assert.equal(readFileSync(probe, 'utf8'), 'do-not-overwrite');
  checks.push('unexpected symlink rejects without following or overwriting');
  rmSync(strayLink);

  rmSync(indexPath);
  mkdirSync(indexPath);
  parseReject(runExporter(), /unexpected directory|expected a regular file/);
  assert.ok(lstatSync(indexPath).isDirectory());
  checks.push('expected file path as directory rejects');

  console.log(checks.map(check => `PASS ${check}`).join('\n'));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
