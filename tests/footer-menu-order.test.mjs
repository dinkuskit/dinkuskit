import assert from 'node:assert/strict';
import test from 'node:test';
import { fillEmptySiteText, missingClasses, reconcileFooterOrder } from '../scripts/pages-import.mjs';

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
