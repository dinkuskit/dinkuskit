import assert from 'node:assert/strict';
import test from 'node:test';
import { fillEmptySiteText, reconcileFooterOrder } from '../scripts/pages-import.mjs';

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

test('places a seed link left at the end when reorder did not finish', () => {
  const existing = [
    link('start', '/start'), link('how', '/getting-started'), link('docs', '/docs'),
    link('hours', '/hours'), link('demo', seed[0].url),
  ];
  assert.deepEqual(urls(reconcileFooterOrder(existing, seed, new Map())), [
    seed[0].url, '/start', '/getting-started', '/docs', '/hours',
  ]);
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
