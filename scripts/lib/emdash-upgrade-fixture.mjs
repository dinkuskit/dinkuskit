import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// Public, same-repository baseline sources, each with its exact dependency lock. 1.0.1 is the
// oldest released site; 1.4.0 is the last main before 1.5, which is what the live site runs.
export const BASELINES = Object.freeze({
  '1.0.1': Object.freeze({ source: '4629df637b2eb58393f60b74eef2b9c2b1badba5', last: '089_auto_seed_completion' }),
  '1.4.0': Object.freeze({ source: '399c352224feb6577cc587e5bcb4a194f7cabc47', last: '091_redirect_artifacts' }),
});

export async function prepareLegacyRuntime(root, work, run, version = '1.0.1') {
  const { source } = BASELINES[version];
  assert.ok(source, `no upgrade baseline for EmDash ${version}`);
  const legacy = join(work, 'legacy-source');
  await rm(legacy, { recursive: true, force: true });
  await mkdir(legacy, { recursive: true });
  const present = await run('legacy-object', 'git', ['cat-file', '-e', `${source}^{commit}`], root, false);
  if (present !== 0) {
    // A shallow CI checkout may not contain the pinned public baseline.
    await run('legacy-fetch', 'git', ['fetch', '--no-tags', '--depth=1',
      'https://github.com/dinkuskit/dinkuskit.git', source], root);
  }
  const archive = join(work, 'legacy-source.tar');
  await run('legacy-archive', 'git', ['archive', '--format=tar', `--output=${archive}`, source], root);
  await run('legacy-extract', 'tar', ['-xf', archive, '-C', legacy], root);
  const pkg = JSON.parse(await readFile(join(legacy, 'package.json'), 'utf8'));
  for (const name of ['emdash', '@emdash-cms/cloudflare', '@emdash-cms/auth']) {
    assert.equal(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name], version);
  }
  // Only the fixture's output directory selector changes. All application
  // source and dependency bytes remain the pinned public baseline.
  await copyFile(join(root, 'fixtures/cms-operation/astro.config.mjs'), join(legacy, 'fixtures/cms-operation/astro.config.mjs'));
  await run('legacy-install', 'npm', ['ci', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], legacy);
  await run('legacy-setup', 'npm', ['run', 'setup'], legacy);
  for (const name of ['emdash', '@emdash-cms/cloudflare', '@emdash-cms/auth']) {
    const installed = JSON.parse(await readFile(join(legacy, 'node_modules', name, 'package.json'), 'utf8'));
    assert.equal(installed.version, version);
  }
  await run('legacy-build', process.execPath, [join(legacy, 'node_modules/astro/bin/astro.mjs'),
    'build', '--config', 'fixtures/cms-operation/astro.config.mjs'], legacy);
  const merchantMigrations = (await readdir(join(legacy, 'migrations/merchant'))).filter(name => name.endsWith('.sql')).sort();
  return { root: legacy, work: join(legacy, '.grilltrack/work/emdash-upgrade-20261007'), version, source, merchantMigrations };
}

export async function prepareUpgradeConfig(root, generatedPath, origin, baseline) {
  // baseline: the legacy EmDash version this build runs, or null for the current build.
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
    vars: { ...config.vars, EMDASH_SITE_URL: origin, UPGRADE_BASELINE: baseline ?? '1.5.0' },
  };
  const target = join(output, 'wrangler.upgrade.json');
  await writeFile(target, `${JSON.stringify(upgraded, null, 2)}\n`);
  return target;
}
