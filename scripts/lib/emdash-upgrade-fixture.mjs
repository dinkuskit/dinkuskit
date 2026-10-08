import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Public, same-repository 1.0.1 source, including its exact dependency lock.
export const LEGACY_SOURCE = '4629df637b2eb58393f60b74eef2b9c2b1badba5';

export async function prepareLegacyRuntime(root, work, run) {
  const legacy = join(work, 'legacy-source');
  await rm(legacy, { recursive: true, force: true });
  await mkdir(legacy, { recursive: true });
  const present = await run('legacy-object', 'git', ['cat-file', '-e', `${LEGACY_SOURCE}^{commit}`], root, false);
  if (present !== 0) {
    // A shallow CI checkout may not contain the pinned public baseline.
    await run('legacy-fetch', 'git', ['fetch', '--no-tags', '--depth=1',
      'https://github.com/dinkuskit/dinkuskit.git', LEGACY_SOURCE], root);
  }
  const archive = join(work, 'legacy-source.tar');
  await run('legacy-archive', 'git', ['archive', '--format=tar', `--output=${archive}`, LEGACY_SOURCE], root);
  await run('legacy-extract', 'tar', ['-xf', archive, '-C', legacy], root);
  const pkg = JSON.parse(await readFile(join(legacy, 'package.json'), 'utf8'));
  for (const name of ['emdash', '@emdash-cms/cloudflare', '@emdash-cms/auth']) {
    assert.equal(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name], '1.0.1');
  }
  // Only the fixture's output directory selector changes. All application
  // source and dependency bytes remain the pinned public 1.0.1 baseline.
  await copyFile(join(root, 'fixtures/cms-operation/astro.config.mjs'), join(legacy, 'fixtures/cms-operation/astro.config.mjs'));
  await run('legacy-install', 'npm', ['ci', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], legacy);
  await run('legacy-setup', 'npm', ['run', 'setup'], legacy);
  for (const name of ['emdash', '@emdash-cms/cloudflare', '@emdash-cms/auth']) {
    const installed = JSON.parse(await readFile(join(legacy, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(installed.version, '1.0.1');
  }
  await run('legacy-build', process.execPath, [join(legacy, 'node_modules/astro/bin/astro.mjs'),
    'build', '--config', 'fixtures/cms-operation/astro.config.mjs'], legacy);
  return { root: legacy, work: join(legacy, '.grilltrack/work/emdash-upgrade-20261007') };
}

export async function prepareUpgradeConfig(root, generatedPath, origin, baseline) {
  const output = dirname(generatedPath);
  const config = JSON.parse(await readFile(generatedPath, 'utf8'));
  const original = resolve(output, config.main);
  const path = relative(output, original);
  assert.ok(!path.startsWith('..') && !isAbsolute(path), 'fixture main must stay inside its owned build');
  const template = await readFile(join(root, 'tests/fixtures/emdash-upgrade-entry.mjs'), 'utf8');
  await writeFile(join(output, 'upgrade-test-entry.mjs'), template.replace(
    "'__PRODUCTION_MAIN__'", JSON.stringify(`./${path.replaceAll('\\', '/')}`),
  ));
  const upgraded = {
    ...config,
    name: 'dinkuskit-emdash-upgrade-fixture',
    main: 'upgrade-test-entry.mjs',
    no_bundle: true,
    d1_databases: [...config.d1_databases, {
      binding: 'MERCHANT_DB', database_name: 'dinkuskit-upgrade-merchant', database_id: 'local-dinkuskit-upgrade-merchant',
    }],
    vars: { ...config.vars, EMDASH_SITE_URL: origin, UPGRADE_BASELINE: baseline ? '1.0.1' : '1.2.0' },
  };
  const target = join(output, 'wrangler.upgrade.json');
  await writeFile(target, `${JSON.stringify(upgraded, null, 2)}\n`);
  return target;
}
