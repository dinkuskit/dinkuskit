import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { fillEmptySiteText, missingClasses, pullLiveSeed, reconcileFooterOrder } from '../scripts/pages-import.mjs';

const seed = [
  { label: 'Demo store', url: 'https://playground.dinkuskit.com/' },
  { label: 'Start your store', url: '/start' },
  { label: 'How it works', url: '/getting-started' },
  { label: 'Docs', url: '/docs' },
];
const link = (id, customUrl) => ({ id, parentId: null, customUrl });
const urls = items => items.map(item => item.customUrl);

test('inserts a missing link without assuming the editor kept seed order', () => {
  const existing = [link('docs', '/docs'), link('start', '/start'), link('how', '/getting-started')];
  const created = new Map([[seed[0].url, link('demo', seed[0].url)]]);
  assert.deepEqual(urls(reconcileFooterOrder(existing, seed, created)), [
    seed[0].url, '/docs', '/start', '/getting-started',
  ]);
});

test('keeps an editor link after a new link the seed puts first', () => {
  const existing = [link('hours', '/hours'), link('docs', '/docs'), link('start', '/start')];
  const created = new Map([[seed[0].url, link('demo', seed[0].url)]]);
  assert.deepEqual(urls(reconcileFooterOrder(existing, seed, created)), [
    seed[0].url, '/hours', '/docs', '/start',
  ]);
});

test('places Demo store left at the end when reorder did not finish', () => {
  const existing = [
    link('start', '/start'), link('how', '/getting-started'), link('docs', '/docs'),
    link('hours', '/hours'), link('demo', seed[0].url),
  ];
  assert.deepEqual(urls(reconcileFooterOrder(existing, seed, new Map(), { recoverDemoStore: true })), [
    seed[0].url, '/start', '/getting-started', '/docs', '/hours',
  ]);
});

test('does not recover Demo store for a menu that did not ask', () => {
  const existing = [
    link('start', '/start'), link('how', '/getting-started'), link('docs', '/docs'),
    link('hours', '/hours'), link('demo', seed[0].url),
  ];
  assert.deepEqual(urls(reconcileFooterOrder(existing, seed, new Map())), urls(existing));
});

test('keeps an edited Plugins menu in its saved order', () => {
  const plugins = [
    { label: 'Commerce', url: '/docs/reference/commerce' },
    { label: 'Payments', url: '/docs/reference/payments' },
    { label: 'Ship', url: '/docs/reference/ship' },
  ];
  const existing = [
    link('payments', plugins[1].url),
    link('commerce', plugins[0].url),
    link('ship', plugins[2].url),
  ];
  assert.deepEqual(urls(reconcileFooterOrder(existing, plugins, new Map())), urls(existing));
  assert.deepEqual(urls(reconcileFooterOrder(existing, plugins, new Map(), { recoverDemoStore: true })), urls(existing));
});

test('keeps an edited DinkusKit menu in its saved order', () => {
  const column = [
    { label: 'Account', url: '/account' },
    { label: 'Terms of Service', url: '/terms' },
    { label: 'GitHub', url: 'https://github.com/dinkuskit' },
    { label: 'Website source', url: 'https://github.com/dinkuskit/dinkuskit' },
  ];
  const existing = [
    link('terms', column[1].url),
    link('github', column[2].url),
    link('source', column[3].url),
    link('account', column[0].url),
  ];
  assert.deepEqual(urls(reconcileFooterOrder(existing, column, new Map())), urls(existing));
  assert.deepEqual(urls(reconcileFooterOrder(existing, column, new Map(), { recoverDemoStore: true })), urls(existing));
});

test('does not pull a seed link an editor moved earlier back into seed order', () => {
  const existing = [
    link('demo', seed[0].url), link('docs', '/docs'), link('start', '/start'),
    link('how', '/getting-started'), link('hours', '/hours'),
  ];
  assert.deepEqual(urls(reconcileFooterOrder(existing, seed, new Map())), urls(existing));
});

test('a settings 404 leaves title and tagline alone', async () => {
  const calls = [];
  const api = async (method, path) => {
    calls.push(`${method} ${path}`);
    return { status: 404, data: null };
  };
  await fillEmptySiteText(api, { settings: { title: 'DinkusKit', tagline: 'Built with EmDash.' } });
  assert.deepEqual(calls, ['GET /settings']);
});

test('a settings failure other than 404 still fails the import', async () => {
  const api = async () => ({ status: 500, data: null });
  await assert.rejects(
    () => fillEmptySiteText(api, { settings: { title: 'DinkusKit', tagline: 'Built with EmDash.' } }),
    /HTTP 500/,
  );
});

test('adds a seed link\'s classes to the site\'s link and keeps its own', () => {
  assert.equal(missingClasses(null, 'social-github'), 'social-github');
  assert.equal(missingClasses('', 'social-github'), 'social-github');
  assert.equal(missingClasses('wide', 'social-github'), 'wide social-github');
  assert.equal(missingClasses('social-github wide', 'social-github'), null, 'already marked');
  assert.equal(missingClasses('wide', undefined), null, 'a seed link with no classes changes nothing');
});

test('pullLiveSeed fails closed when /settings returns non-200 instead of reporting inSync', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dinkuskit-seed-test-'));
  try {
    const seedPath = join(dir, 'seed.json');
    writeFileSync(seedPath, JSON.stringify({
      content: { pages: [] },
      menus: [],
      settings: { title: 'DinkusKit', tagline: 'Built with EmDash.' },
    }, null, 2));
    for (const status of [401, 404, 500]) {
      await assert.rejects(
        () => pullLiveSeed('https://dinkuskit.example', {
          seedUrl: pathToFileURL(seedPath),
          check: true,
          api: async () => ({ status, data: null }),
        }),
        new RegExp(`Reading site settings failed: HTTP ${status}`),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pullLiveSeed captures renamed footer menu labels and deliberately cleared settings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dinkuskit-seed-test-'));
  try {
    const seedPath = join(dir, 'seed.json');
    const seedUrl = pathToFileURL(seedPath);
    writeFileSync(seedPath, `${JSON.stringify({
      content: { pages: [] },
      menus: [{
        name: 'footer-plugins',
        label: 'Plugins',
        items: [{ type: 'custom', label: 'Commerce', url: '/docs/reference/commerce' }],
      }],
      settings: { title: 'DinkusKit', tagline: 'Built with EmDash.' },
    }, null, 2)}\n`);
    const api = async (_method, path) => {
      if (path === '/menus/footer-plugins') {
        return {
          status: 200,
          data: {
            name: 'footer-plugins',
            label: 'Shop plugins',
            items: [{ type: 'custom', label: 'Commerce', customUrl: '/docs/reference/commerce', sortOrder: 0 }],
          },
        };
      }
      if (path === '/settings') {
        return { status: 200, data: { title: 'DinkusKit', tagline: '' } };
      }
      return { status: 404, data: null };
    };
    const checkResult = await pullLiveSeed('https://dinkuskit.example', { seedUrl, check: true, api });
    assert.equal(checkResult.inSync, false);
    assert.deepEqual(checkResult.changed, ['menu:footer-plugins', 'setting:tagline']);
    process.exitCode = 0;

    const pulled = await pullLiveSeed('https://dinkuskit.example', { seedUrl, api });
    assert.equal(pulled.inSync, true);
    const updated = JSON.parse(readFileSync(seedPath, 'utf8'));
    assert.equal(updated.menus[0].label, 'Shop plugins');
    assert.equal(updated.settings.tagline, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pullLiveSeed fails explicitly when a seeded page is deleted (404), unpublished, or a seeded footer menu is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dinkuskit-seed-test-'));
  try {
    const seedPath = join(dir, 'seed.json');
    const seedUrl = pathToFileURL(seedPath);
    writeFileSync(seedPath, `${JSON.stringify({
      content: {
        pages: [{
          slug: 'home',
          status: 'published',
          data: { title: 'Home', content: [] },
        }],
      },
      menus: [{
        name: 'footer-shop',
        label: 'Shop',
        items: [{ type: 'custom', label: 'Docs', url: '/docs' }],
      }],
      settings: { title: 'DinkusKit', tagline: 'Built with EmDash.' },
    }, null, 2)}\n`);

    await assert.rejects(
      () => pullLiveSeed('https://dinkuskit.example', {
        seedUrl,
        check: true,
        api: async (_method, path) => {
          if (path === '/content/pages/home') return { status: 404, data: null };
          return { status: 200, data: {} };
        },
      }),
      /Seeded page home is missing in CMS \(HTTP 404\)/,
    );

    await assert.rejects(
      () => pullLiveSeed('https://dinkuskit.example', {
        seedUrl,
        check: true,
        api: async (_method, path) => {
          if (path === '/content/pages/home') {
            return { status: 200, data: { item: { slug: 'home', status: 'draft', data: { title: 'Home', content: [] } } } };
          }
          return { status: 200, data: {} };
        },
      }),
      /Seeded page home is not published in CMS \(status: draft\)/,
    );

    await assert.rejects(
      () => pullLiveSeed('https://dinkuskit.example', {
        seedUrl,
        check: true,
        api: async (_method, path) => {
          if (path === '/content/pages/home') {
            return { status: 200, data: { item: { slug: 'home', status: 'published', data: { title: 'Home', content: [] } } } };
          }
          if (path === '/menus/footer-shop') return { status: 404, data: null };
          return { status: 200, data: {} };
        },
      }),
      /Seeded menu footer-shop is missing in CMS \(HTTP 404\)/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
