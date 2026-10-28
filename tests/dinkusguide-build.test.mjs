import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateConfiguredGuideHosts } from '../scripts/lib/dinkusguide-build-contract.mjs';
import { buildAndValidateDinkusGuidePlugin } from '../scripts/dinkusguide-plugin-build.mjs';

const authored = host => ({ capabilities: ['network:request'], allowedHosts: [host] });
const generated = host => ({ ...authored(host), declaredAccess: { network: { request: { allowedHosts: [host] } } } });

test('host contract follows the authored exact host and rejects wider or mismatched authority', () => {
  for (const host of ['guide.example.com', 'docs-assistant.example.test']) {
    assert.doesNotThrow(() => validateConfiguredGuideHosts(authored(host), generated(host)));
  }
  assert.throws(() => validateConfiguredGuideHosts(authored('docs-assistant.example.test'), generated('guide.example.com')));
  const mismatch = generated('docs-assistant.example.test');
  mismatch.declaredAccess.network.request.allowedHosts = ['other.example.test'];
  assert.throws(() => validateConfiguredGuideHosts(authored('docs-assistant.example.test'), mismatch));
  for (const host of ['*.example.test', 'https://example.test', 'example.test:443', 'example.test/ask', '-bad.example.test']) {
    assert.throws(() => validateConfiguredGuideHosts(authored(host), generated(host)));
  }
  const multiple = { ...authored('one.example.test'), allowedHosts: ['one.example.test', 'two.example.test'] };
  assert.throws(() => validateConfiguredGuideHosts(multiple, multiple));
  const unrestricted = { ...authored('one.example.test'), capabilities: ['network:request:unrestricted'] };
  assert.throws(() => validateConfiguredGuideHosts(unrestricted, generated('one.example.test')));
  assert.throws(() => validateConfiguredGuideHosts(authored('one.example.test'), unrestricted));
});

test('official build and bundle accept a non-example configured ingress', { timeout: 120000 }, async () => {
  const parent = resolve('.local/dinkusguide-build-tests');
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(resolve(parent, 'configured-'));
  try {
    for (const name of ['src', 'package.json', 'tsconfig.json', 'emdash-plugin.jsonc']) {
      await cp(resolve('packages/dinkusguide-chat', name), resolve(dir, name), { recursive: true });
    }
    const path = resolve(dir, 'emdash-plugin.jsonc');
    const source = await readFile(path, 'utf8');
    await writeFile(path, source.replace('["guide.dinkuskit.com"]', '["docs-assistant.example.test"]'));
    const summary = await buildAndValidateDinkusGuidePlugin({ dir, outDir: resolve(dir, 'bundle'), summaryFile: resolve(dir, 'summary.json') });
    assert.deepEqual(summary.allowedHosts, ['docs-assistant.example.test']);
    assert.deepEqual(summary.capabilities, ['network:request']);
    assert.ok(summary.tarballBytes > 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
